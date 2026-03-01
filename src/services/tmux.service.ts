import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { ERRORS } from '../domain/errors.js'
import { stripAnsiCodes } from '../domain/loop.rules.js'

const execFileAsync = promisify(execFile)

const CCF_TMP_DIR = join(tmpdir(), 'ccf')

/** コードを一時ファイルに保存する */
export async function saveCodeToTempFile(code: string, filename: string): Promise<string> {
  await mkdir(CCF_TMP_DIR, { recursive: true })
  const filePath = join(CCF_TMP_DIR, filename)
  await writeFile(filePath, code, 'utf-8')
  return filePath
}


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

/** tmux セッションを作成する（3ペイン構成: 上段=orchestrator, 下左=Claude, 下右=Codex） */
export async function createThreePaneSession(sessionName: string): Promise<Result<void>> {
  // セッション作成（pane 0: orchestrator）
  const result = await tmux('new-session', '-d', '-s', sessionName, '-x', '200', '-y', '50')
  if (!result.ok) return err(ERRORS.SESSION_CREATE_FAILED(result.error.message))

  // 上下分割（下段 pane 1）
  const vSplit = await tmux('split-window', '-v', '-t', `${sessionName}:0`)
  if (!vSplit.ok) return err(ERRORS.SESSION_CREATE_FAILED(vSplit.error.message))

  // 下段を左右分割（pane 2）
  const hSplit = await tmux('split-window', '-h', '-t', `${sessionName}:0.1`)
  if (!hSplit.ok) return err(ERRORS.SESSION_CREATE_FAILED(hSplit.error.message))

  // 上段（orchestrator）のサイズを30%に調整
  await tmux('resize-pane', '-t', `${sessionName}:0.0`, '-y', '30%')

  // ペインタイトル設定
  await tmux('select-pane', '-t', `${sessionName}:0.0`, '-T', 'orchestrator')
  await tmux('select-pane', '-t', `${sessionName}:0.1`, '-T', 'claude')
  await tmux('select-pane', '-t', `${sessionName}:0.2`, '-T', 'codex')

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

/** シェルプロンプトのパターン（zsh/bash） */
const SHELL_PROMPT_PATTERN = /[$%#]\s*$/

/** ペインのシェルが起動完了するまで待つ */
export async function waitForShellReady(
  target: string,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 500,
): Promise<Result<void>> {
  const startTime = Date.now()

  // zshrc の読み込みに時間がかかるため初回ウェイト
  await sleep(1000)

  while (Date.now() - startTime < timeoutMs) {
    const captureResult = await capturePane(target)
    if (!captureResult.ok) return err(captureResult.error)

    const output = stripAnsiCodes(captureResult.value).trimEnd()
    const lastLine = output.split('\n').pop() ?? ''

    if (SHELL_PROMPT_PATTERN.test(lastLine)) {
      return ok(undefined)
    }

    await sleep(pollIntervalMs)
  }

  return err(ERRORS.TIMEOUT(target, timeoutMs))
}

/** ペインで Claude CLI を起動する */
export async function startClaude(target: string): Promise<Result<void>> {
  // unset CLAUDECODE && claude を1コマンドで送信し、シェルプロンプトの誤検知を避ける
  const result = await tmux(
    'send-keys', '-t', target,
    'unset CLAUDECODE && claude', 'Enter',
  )
  if (!result.ok) return err(ERRORS.CLI_START_FAILED('Claude', result.error.message))
  return ok(undefined)
}

/** ペインで Codex CLI を起動する */
export async function startCodex(target: string): Promise<Result<void>> {
  // unset CLAUDECODE && codex を1コマンドで送信
  const result = await tmux(
    'send-keys', '-t', target,
    'unset CLAUDECODE && codex', 'Enter',
  )
  if (!result.ok) return err(ERRORS.CLI_START_FAILED('Codex', result.error.message))
  return ok(undefined)
}

/** ペインにプロンプトを送信する */
export async function sendPrompt(target: string, text: string): Promise<Result<void>> {
  // 改行をスペースに置換して1行にフラット化
  const flattened = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()

  // 長いテキストはチャンクに分割して送信（TUIの入力バッファ制限対策）
  const CHUNK_SIZE = 200
  const chunks = splitIntoChunks(flattened, CHUNK_SIZE)

  for (const chunk of chunks) {
    const result = await tmux('send-keys', '-t', target, '-l', chunk)
    if (!result.ok) return err(ERRORS.SEND_PROMPT_FAILED(result.error.message))
    // チャンク間に小さなディレイを入れてバッファを処理させる
    await sleep(50)
  }

  // Enter を送信してコマンド実行
  await sleep(300)
  const enterResult = await tmux('send-keys', '-t', target, 'Enter')
  if (!enterResult.ok) return err(ERRORS.SEND_PROMPT_FAILED(enterResult.error.message))

  return ok(undefined)
}

function splitIntoChunks(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

/** ペインの出力をキャプチャする（末尾空行を除去） */
export async function capturePane(target: string): Promise<Result<string>> {
  // -S - で全スクロールバック取得、-p でstdoutに出力
  const result = await tmux('capture-pane', '-t', target, '-p', '-S', '-')
  if (!result.ok) return err(ERRORS.CAPTURE_FAILED(result.error.message))
  // 末尾の空行パディングを除去
  return ok(trimTrailingEmptyLines(result.value))
}

function trimTrailingEmptyLines(text: string): string {
  return text.replace(/\n+$/, '\n')
}

/** CLI応答完了のプロンプトパターン */
const COMPLETION_PATTERNS = [
  /❯/,                 // Claude Code の入力プロンプト
  /›/,                 // Codex の入力プロンプト (U+203A)
]

/** ペインの出力が CLI の応答完了状態かどうか判定する */
export function isCompletionState(paneOutput: string): boolean {
  const cleaned = stripAnsiCodes(paneOutput).trimEnd()
  // 最後の数行だけチェック（中間出力の誤検知を防ぐ）
  const lastLines = cleaned.split('\n').slice(-5).join('\n')
  return COMPLETION_PATTERNS.some(pattern => pattern.test(lastLines))
}

/** 信頼確認ダイアログのパターン */
const TRUST_PROMPT_PATTERN = /Do you trust the contents/

/** CLI の応答完了を待つ */
export async function waitForCompletion(
  target: string,
  timeoutMs: number,
  pollIntervalMs: number,
  baselineText: string = '',
  initialDelayMs: number = 0,
  autoAcceptTrust: boolean = false,
): Promise<Result<string, DomainError>> {
  const startTime = Date.now()
  let trustAccepted = false
  let lastOutput = ''
  let stableCount = 0
  const STABLE_THRESHOLD = 2 // 2回連続で同じなら安定と判定

  // 初回ウェイト（CLI起動等に必要な待ち時間）
  const delay = initialDelayMs || Math.min(pollIntervalMs, 2000)
  await sleep(delay)

  while (Date.now() - startTime < timeoutMs) {
    const captureResult = await capturePane(target)
    if (!captureResult.ok) return captureResult

    const output = captureResult.value

    // 信頼確認ダイアログの自動応答
    if (autoAcceptTrust && !trustAccepted && TRUST_PROMPT_PATTERN.test(output)) {
      await tmux('send-keys', '-t', target, 'Enter')
      trustAccepted = true
      await sleep(pollIntervalMs)
      continue
    }

    // 安定性チェック: 出力が2回連続で同じ＋ベースラインと異なる＋完了マーカーあり
    if (output === lastOutput) {
      stableCount++
    } else {
      stableCount = 0
      lastOutput = output
    }

    if (
      stableCount >= STABLE_THRESHOLD &&
      output !== baselineText &&
      isCompletionState(output)
    ) {
      return ok(output)
    }

    await sleep(pollIntervalMs)
  }

  return err(ERRORS.TIMEOUT(target, timeoutMs))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
