#!/usr/bin/env node
import { parseMode, DEFAULTS } from './config/index.js'
import { runAgentLoop } from './orchestrator/agent-loop.js'
import { launchThreePane } from './launcher.js'
import { startRepl } from './repl/index.js'
import { waitForCompletion, destroySession, cleanupTempFiles } from './services/tmux.service.js'
import { printError } from './ui/terminal.js'

/** リソースをクリーンアップする */
async function cleanup(sessionName: string, keepSession: boolean): Promise<void> {
  await cleanupTempFiles()
  if (!keepSession) {
    await destroySession(sessionName)
  }
}

/** Graceful shutdown: Ctrl+C 時にリソースをクリーンアップする */
function setupGracefulShutdown(sessionName: string, keepSession: boolean): void {
  let shuttingDown = false
  const handler = async () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\n中断を検知しました。クリーンアップ中...')
    await cleanup(sessionName, keepSession)
    process.exit(130)
  }
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const mode = parseMode(args)

  switch (mode.mode) {
    case 'launcher': {
      await launchThreePane()
      break
    }

    case 'repl': {
      // ランチャーからの自己呼び出し: CLIの起動完了を待ってからREPL開始
      const sessionName = DEFAULTS.sessionName
      setupGracefulShutdown(sessionName, true)
      const claudeTarget = `${sessionName}:0.1`
      const codexTarget = `${sessionName}:0.2`

      console.log('Claude CLI の起動を待機中...')
      const claudeReady = await waitForCompletion(
        claudeTarget, mode.timeoutMs, mode.pollIntervalMs, '', DEFAULTS.cliStartupDelayMs,
      )
      if (!claudeReady.ok) {
        printError(`Claude CLI の起動に失敗: ${claudeReady.error.message}`)
        process.exit(1)
      }

      console.log('Codex CLI の起動を待機中...')
      const codexReady = await waitForCompletion(
        codexTarget, mode.timeoutMs, mode.pollIntervalMs, '', DEFAULTS.cliStartupDelayMs, true,
      )
      if (!codexReady.ok) {
        printError(`Codex CLI の起動に失敗: ${codexReady.error.message}`)
        process.exit(1)
      }

      await startRepl({
        targets: { claude: claudeTarget, codex: codexTarget },
        maxIterations: mode.maxIterations,
        language: mode.language,
        timeoutMs: mode.timeoutMs,
        pollIntervalMs: mode.pollIntervalMs,
      })
      break
    }

    case 'auto': {
      setupGracefulShutdown(mode.config.sessionName, mode.config.keepSession ?? false)
      const result = await runAgentLoop(mode.config)
      if (!result.ok) {
        process.exit(1)
      }
      if (result.value.approved) {
        process.exit(0)
      } else {
        // 最大イテレーション到達
        process.exit(2)
      }
      break
    }
  }
}

main().catch((e) => {
  console.error('予期しないエラー:', e)
  process.exit(1)
})
