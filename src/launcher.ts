import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import {
  checkTmuxAvailable,
  createThreePaneSession,
  destroySession,
  sessionExists,
  startClaude,
  startCodex,
  waitForShellReady,
} from './services/tmux.service.js'
import { printError } from './ui/terminal.js'

const execFileAsync = promisify(execFile)

const SESSION_NAME = 'ccf'

/** 3ペインtmuxセッションを作成し、各CLIを起動してattachする */
export async function launchThreePane(): Promise<void> {
  // tmux の存在確認
  const tmuxCheck = await checkTmuxAvailable()
  if (!tmuxCheck.ok) {
    printError(tmuxCheck.error.message)
    process.exit(1)
  }

  // 既存セッションがあれば破棄
  if (await sessionExists(SESSION_NAME)) {
    await destroySession(SESSION_NAME)
  }

  // 3ペインセッション作成
  const sessionResult = await createThreePaneSession(SESSION_NAME)
  if (!sessionResult.ok) {
    printError(sessionResult.error.message)
    process.exit(1)
  }

  const orchestratorTarget = `${SESSION_NAME}:0.0`
  const claudeTarget = `${SESSION_NAME}:0.1`
  const codexTarget = `${SESSION_NAME}:0.2`

  // 全ペインのシェル起動完了を待つ
  console.log('シェルの起動を待機中...')
  const shellResults = await Promise.all([
    waitForShellReady(orchestratorTarget),
    waitForShellReady(claudeTarget),
    waitForShellReady(codexTarget),
  ])
  for (const result of shellResults) {
    if (!result.ok) {
      printError(`シェルの起動に失敗: ${result.error.message}`)
      await destroySession(SESSION_NAME)
      process.exit(1)
    }
  }

  // Claude ペイン (pane 1) で claude CLI を起動
  const claudeStart = await startClaude(claudeTarget)
  if (!claudeStart.ok) {
    printError(claudeStart.error.message)
    await destroySession(SESSION_NAME)
    process.exit(1)
  }

  // Codex ペイン (pane 2) で codex CLI を起動
  const codexStart = await startCodex(codexTarget)
  if (!codexStart.ok) {
    printError(codexStart.error.message)
    await destroySession(SESSION_NAME)
    process.exit(1)
  }

  // Orchestrator ペイン (pane 0) で REPL モードを起動
  try {
    await execFileAsync('tmux', [
      'send-keys', '-t', orchestratorTarget,
      'npx tsx src/index.ts --repl', 'Enter',
    ])
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    printError(`REPLの起動に失敗: ${message}`)
    await destroySession(SESSION_NAME)
    process.exit(1)
  }

  // tmux セッションにアタッチ（同期実行でターミナルを引き渡す）
  const { status } = spawnSync(
    'tmux', ['attach-session', '-t', SESSION_NAME],
    { stdio: 'inherit' },
  )
  process.exit(status ?? 0)
}
