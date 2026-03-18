import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import {
  checkTmuxAvailable,
  checkCliAvailable,
  createThreePaneSession,
  destroySession,
  sessionExists,
  startClaude,
  startCodex,
  waitForShellReady,
} from './services/tmux.service.js'
import { printError, printProgress } from './ui/terminal.js'
import { DEFAULTS } from './config/index.js'

const execFileAsync = promisify(execFile)

/**
 * REPL起動コマンドを構築する
 * process.argv から実行中のランタイムとエントリースクリプトを取得し、
 * 同じ方法で --repl モードを起動するコマンドを返す
 */
function buildReplCommand(): string {
  // process.argv[1] は実行中のエントリースクリプトの絶対パス
  // 例: /path/to/project/src/index.ts (tsx経由)
  //     /path/to/project/dist/index.js (node経由・npm link)
  const entryScript = process.argv[1]

  // tsx 経由かどうかで実行コマンドを分岐
  if (entryScript.endsWith('.ts')) {
    return `npx tsx ${entryScript} --repl`
  }
  return `node ${entryScript} --repl`
}

/** 3ペインtmuxセッションを作成し、各CLIを起動してattachする */
export async function launchThreePane(): Promise<void> {
  // tmux の存在確認
  const tmuxCheck = await checkTmuxAvailable()
  if (!tmuxCheck.ok) {
    printError(tmuxCheck.error.message)
    process.exit(1)
  }

  // claude / codex CLI の存在確認
  for (const cli of ['claude', 'codex'] as const) {
    const cliCheck = await checkCliAvailable(cli)
    if (!cliCheck.ok) {
      printError(cliCheck.error.message)
      process.exit(1)
    }
  }

  // 既存セッションがあれば破棄
  if (await sessionExists(DEFAULTS.sessionName)) {
    await destroySession(DEFAULTS.sessionName)
  }

  // 3ペインセッション作成
  const sessionResult = await createThreePaneSession(DEFAULTS.sessionName)
  if (!sessionResult.ok) {
    printError(sessionResult.error.message)
    process.exit(1)
  }

  const orchestratorTarget = `${DEFAULTS.sessionName}:0.0`
  const claudeTarget = `${DEFAULTS.sessionName}:0.1`
  const codexTarget = `${DEFAULTS.sessionName}:0.2`

  // 全ペインのシェル起動完了を待つ
  const shellProgress = printProgress('シェルの起動を待機中')
  const shellResults = await Promise.all([
    waitForShellReady(orchestratorTarget),
    waitForShellReady(claudeTarget),
    waitForShellReady(codexTarget),
  ])
  const shellFailed = shellResults.find(r => !r.ok)
  shellProgress.stop(!shellFailed)
  if (shellFailed && !shellFailed.ok) {
    printError(`シェルの起動に失敗: ${shellFailed.error.message}`)
    await destroySession(DEFAULTS.sessionName)
    process.exit(1)
  }

  // Claude ペイン (pane 1) で claude CLI を起動
  const claudeProgress = printProgress('Claude CLI を起動中')
  const claudeStart = await startClaude(claudeTarget)
  claudeProgress.stop(claudeStart.ok)
  if (!claudeStart.ok) {
    printError(claudeStart.error.message)
    await destroySession(DEFAULTS.sessionName)
    process.exit(1)
  }

  // Codex ペイン (pane 2) で codex CLI を起動
  const codexProgress = printProgress('Codex CLI を起動中')
  const codexStart = await startCodex(codexTarget)
  codexProgress.stop(codexStart.ok)
  if (!codexStart.ok) {
    printError(codexStart.error.message)
    await destroySession(DEFAULTS.sessionName)
    process.exit(1)
  }

  // Orchestrator ペイン (pane 0) で REPL モードを起動
  const replCommand = buildReplCommand()
  try {
    await execFileAsync('tmux', [
      'send-keys', '-t', orchestratorTarget,
      replCommand, 'Enter',
    ])
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    printError(`REPLの起動に失敗: ${message}`)
    await destroySession(DEFAULTS.sessionName)
    process.exit(1)
  }

  // tmux セッションにアタッチ（同期実行でターミナルを引き渡す）
  const { status } = spawnSync(
    'tmux', ['attach-session', '-t', DEFAULTS.sessionName],
    { stdio: 'inherit' },
  )
  process.exit(status ?? 0)
}
