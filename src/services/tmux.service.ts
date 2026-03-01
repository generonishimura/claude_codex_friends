import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { ERRORS } from '../domain/errors.js'
import { stripAnsiCodes } from '../domain/loop.rules.js'

const execFileAsync = promisify(execFile)

const CCF_TMP_DIR = join(tmpdir(), 'ccf')

/** tmux コマンドを実行する */
async function tmux(...args: string[]): Promise<Result<string>> {
  try {
    const { stdout } = await execFileAsync('tmux', args)
    return ok(stdout)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err({ code: 'TMUX_COMMAND_FAILED', message })
  }
}

/** tmux が利用可能か確認する */
export async function checkTmuxAvailable(): Promise<Result<void>> {
  try {
    await execFileAsync('tmux', ['-V'])
    return ok(undefined)
  } catch {
    return err(ERRORS.TMUX_NOT_FOUND)
  }
}

/** tmux セッションを作成する（2ペイン構成） */
export async function createSession(sessionName: string): Promise<Result<void>> {
  const result = await tmux('new-session', '-d', '-s', sessionName, '-x', '200', '-y', '50')
  if (!result.ok) return err(ERRORS.SESSION_CREATE_FAILED(result.error.message))

  // 右ペインを作成（水平分割）
  const splitResult = await tmux('split-window', '-h', '-t', `${sessionName}:0`)
  if (!splitResult.ok) return err(ERRORS.SESSION_CREATE_FAILED(splitResult.error.message))

  // 左ペインに名称設定
  await tmux('select-pane', '-t', `${sessionName}:0.0`, '-T', 'claude')
  // 右ペインに名称設定
  await tmux('select-pane', '-t', `${sessionName}:0.1`, '-T', 'codex')

  return ok(undefined)
}

/** tmux セッションを破棄する */
export async function destroySession(sessionName: string): Promise<Result<void>> {
  const result = await tmux('kill-session', '-t', sessionName)
  if (!result.ok) return err(ERRORS.SESSION_NOT_FOUND(sessionName))
  return ok(undefined)
}

/** セッションが存在するか確認する */
export async function sessionExists(sessionName: string): Promise<boolean> {
  const result = await tmux('has-session', '-t', sessionName)
  return result.ok
}

/** ペインで Claude CLI を起動する */
export async function startClaude(target: string): Promise<Result<void>> {
  const result = await tmux('send-keys', '-t', target, 'claude', 'Enter')
  if (!result.ok) return err(ERRORS.CLI_START_FAILED('Claude', result.error.message))
  return ok(undefined)
}

/** ペインで Codex CLI を起動する */
export async function startCodex(target: string): Promise<Result<void>> {
  const result = await tmux('send-keys', '-t', target, 'codex', 'Enter')
  if (!result.ok) return err(ERRORS.CLI_START_FAILED('Codex', result.error.message))
  return ok(undefined)
}

/** ペインにプロンプトを送信する */
export async function sendPrompt(target: string, text: string): Promise<Result<void>> {
  // 長いプロンプトは一時ファイル経由で送信
  const DIRECT_SEND_LIMIT = 200

  if (text.length <= DIRECT_SEND_LIMIT && !text.includes('\n')) {
    const result = await tmux('send-keys', '-t', target, text, 'Enter')
    if (!result.ok) return err(ERRORS.SEND_PROMPT_FAILED(result.error.message))
    return ok(undefined)
  }

  // load-buffer + paste-buffer パターン
  try {
    await mkdir(CCF_TMP_DIR, { recursive: true })
    const tmpFile = join(CCF_TMP_DIR, `prompt-${Date.now()}.txt`)
    await writeFile(tmpFile, text, 'utf-8')

    const loadResult = await tmux('load-buffer', tmpFile)
    if (!loadResult.ok) return err(ERRORS.SEND_PROMPT_FAILED(loadResult.error.message))

    const pasteResult = await tmux('paste-buffer', '-t', target)
    if (!pasteResult.ok) return err(ERRORS.SEND_PROMPT_FAILED(pasteResult.error.message))

    // Enter を送信
    const enterResult = await tmux('send-keys', '-t', target, 'Enter')
    if (!enterResult.ok) return err(ERRORS.SEND_PROMPT_FAILED(enterResult.error.message))

    // 一時ファイルをクリーンアップ
    await unlink(tmpFile).catch(() => {})
    return ok(undefined)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(ERRORS.SEND_PROMPT_FAILED(message))
  }
}

/** ペインの出力をキャプチャする */
export async function capturePane(target: string): Promise<Result<string>> {
  // -S - で全スクロールバック取得、-p でstdoutに出力
  const result = await tmux('capture-pane', '-t', target, '-p', '-S', '-')
  if (!result.ok) return err(ERRORS.CAPTURE_FAILED(result.error.message))
  return ok(result.value)
}

/** CLI完了プロンプトのパターン */
const COMPLETION_PATTERNS = [
  /[❯>]\s*$/m,       // Claude Code / Codex のプロンプト
  /\$\s*$/m,          // シェルプロンプト（フォールバック）
]

/** ペインの出力が完了状態かどうか判定する */
export function isCompletionState(paneOutput: string): boolean {
  const cleaned = stripAnsiCodes(paneOutput).trimEnd()
  return COMPLETION_PATTERNS.some(pattern => pattern.test(cleaned))
}

/** CLI の応答完了を待つ */
export async function waitForCompletion(
  target: string,
  timeoutMs: number,
  pollIntervalMs: number,
  baselineLength: number = 0,
): Promise<Result<string, DomainError>> {
  const startTime = Date.now()

  // 最初の少し待ち（CLIが処理を開始するまで）
  await sleep(Math.min(pollIntervalMs, 2000))

  while (Date.now() - startTime < timeoutMs) {
    const captureResult = await capturePane(target)
    if (!captureResult.ok) return captureResult

    const output = captureResult.value
    // ベースラインより出力が増えており、かつ完了状態なら終了
    if (output.length > baselineLength && isCompletionState(output)) {
      return ok(output)
    }

    await sleep(pollIntervalMs)
  }

  return err(ERRORS.TIMEOUT(target, timeoutMs))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
