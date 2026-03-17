import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Result } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { ERRORS } from '../domain/errors.js'
import { stripAnsiCodes } from '../domain/loop.rules.js'
import { tmux, sleep } from './tmux-core.js'

// 後方互換: file.service.ts から re-export
export { saveCodeToTempFile, cleanupTempFiles } from './file.service.js'

// 後方互換: tmux-pane.service.ts から re-export
export { sendPrompt, capturePane, waitForCompletion, withRetry } from './tmux-pane.service.js'

import { capturePane as capturePaneImpl } from './tmux-pane.service.js'

const execFileAsync = promisify(execFile)

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

/** シェルプロンプトのパターン（zsh/bash/fish等） */
const SHELL_PROMPT_PATTERN = /[$%#>❯›]\s*$/

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
    const captureResult = await capturePaneImpl(target)
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
