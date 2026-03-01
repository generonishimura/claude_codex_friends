import { createInterface } from 'node:readline'
import { parseCommand } from './commands.js'
import { runLoop } from '../orchestrator/agent-loop.js'
import type { RunLoopConfig, LoopTargets } from '../orchestrator/agent-loop.js'
import {
  sendPrompt,
  capturePane,
  waitForCompletion,
} from '../services/tmux.service.js'
import {
  printError,
  printReplBanner,
  printReplHelp,
  printReplStatus,
} from '../ui/terminal.js'

interface ReplOptions {
  targets: LoopTargets
  maxIterations: number
  language?: string
  timeoutMs: number
  pollIntervalMs: number
}

/** インタラクティブREPLを起動する */
export async function startRepl(options: ReplOptions): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  printReplBanner()

  const prompt = (): void => {
    rl.question('ccf> ', async (input) => {
      const command = parseCommand(input)

      switch (command.type) {
        case 'task': {
          if (!command.payload) {
            prompt()
            return
          }
          const config: RunLoopConfig = {
            task: command.payload,
            language: options.language,
            maxIterations: options.maxIterations,
            timeoutMs: options.timeoutMs,
            pollIntervalMs: options.pollIntervalMs,
          }
          await runLoop(config, options.targets)
          prompt()
          break
        }

        case 'claude': {
          if (command.payload) {
            const result = await sendPrompt(options.targets.claude, command.payload)
            if (!result.ok) printError(result.error.message)
          }
          prompt()
          break
        }

        case 'codex': {
          if (command.payload) {
            const result = await sendPrompt(options.targets.codex, command.payload)
            if (!result.ok) printError(result.error.message)
          }
          prompt()
          break
        }

        case 'status': {
          const claudeCapture = await capturePane(options.targets.claude)
          const codexCapture = await capturePane(options.targets.codex)
          printReplStatus(
            claudeCapture.ok ? claudeCapture.value : 'キャプチャ失敗',
            codexCapture.ok ? codexCapture.value : 'キャプチャ失敗',
          )
          prompt()
          break
        }

        case 'help': {
          printReplHelp()
          prompt()
          break
        }

        case 'exit': {
          console.log('セッションを終了します。')
          rl.close()
          process.exit(0)
        }
      }
    })
  }

  prompt()
}
