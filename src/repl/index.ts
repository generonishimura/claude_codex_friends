import { createInterface, type Interface } from 'node:readline'
import { writeFile } from 'node:fs/promises'
import { parseCommand } from './commands.js'
import { LoopEngine, addDraftSuffix } from '../orchestrator/loop-engine.js'
import type { LoopTargets } from '../orchestrator/loop-engine.js'
import type { UserDecision, AskUserContext } from '../domain/engine.types.js'
import {
  sendPrompt,
  capturePane,
} from '../services/tmux.service.js'
import {
  printError,
  printReplBanner,
  printReplHelp,
  printReplStatus,
  printReplHistory,
  printReplLastResult,
  printAskUser,
} from '../ui/terminal.js'
import { validateSetCommand } from '../domain/repl.rules.js'

interface ReplOptions {
  targets: LoopTargets
  maxIterations: number
  language?: string
  timeoutMs: number
  pollIntervalMs: number
}

/** 実行履歴エントリ */
interface HistoryEntry {
  task: string
  approved: boolean
  iterations: number
  finalCode: string | null
  userAccepted: boolean
}

/** ユーザーの判断を readline で取得するプロンプト */
function askUserDecision(rl: Interface, context: AskUserContext): Promise<UserDecision> {
  return new Promise((resolve) => {
    printAskUser(context)

    const ask = (): void => {
      rl.question('判断> ', (input) => {
        const cmd = parseCommand(input.trim())

        switch (cmd.type) {
          case 'continue': {
            const n = cmd.payload ?? context.maxIterations
            if (n >= 1) {
              resolve({ type: 'continue', additionalIterations: n })
              return
            }
            console.log('  /continue の引数は1以上の正の整数を指定してください')
            ask()
            return
          }
          case 'accept':
            resolve({ type: 'accept' })
            return
          case 'reject':
            resolve({ type: 'reject' })
            return
          default:
            console.log('  /continue [n], /accept, /reject のいずれかを入力してください')
            ask()
        }
      })
    }
    ask()
  })
}

/** インタラクティブREPLを起動する */
export async function startRepl(options: ReplOptions): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const history: HistoryEntry[] = []

  /** ランタイム設定（/set で変更可能） */
  const settings = {
    language: options.language,
    maxIterations: options.maxIterations,
    outputPath: undefined as string | undefined,
  }

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

          const engine = new LoopEngine(
            {
              task: command.payload,
              language: settings.language,
              outputPath: settings.outputPath,
              maxIterations: settings.maxIterations,
              timeoutMs: options.timeoutMs,
              pollIntervalMs: options.pollIntervalMs,
              onAskUser: (context) => askUserDecision(rl, context),
            },
            options.targets,
          )

          const result = await engine.run()
          if (result.ok) {
            history.push({
              task: command.payload,
              approved: result.value.approved,
              iterations: result.value.totalIterations,
              finalCode: result.value.finalCode,
              userAccepted: result.value.userAccepted,
            })
          }
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

        case 'save': {
          const lastEntry = history.length > 0 ? history[history.length - 1] : null
          if (!lastEntry?.finalCode) {
            console.log('保存するコードがありません。')
          } else {
            const path = command.payload ?? 'output.txt'
            const savePath = lastEntry.approved ? path : addDraftSuffix(path)
            try {
              await writeFile(savePath, lastEntry.finalCode, 'utf-8')
              console.log(`保存しました: ${savePath}`)
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e)
              printError(`保存に失敗: ${message}`)
            }
          }
          prompt()
          break
        }

        case 'continue':
        case 'accept':
        case 'reject': {
          console.log('ループ実行中でないため、このコマンドは使用できません。')
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

        case 'history': {
          printReplHistory(history)
          prompt()
          break
        }

        case 'last': {
          const lastEntry = history.length > 0 ? history[history.length - 1] : null
          printReplLastResult(lastEntry)
          prompt()
          break
        }

        case 'set': {
          if (command.payload === null) {
            // 現在の設定を表示
            console.log(`  language: ${settings.language ?? '(未設定)'}`)
            console.log(`  max-iterations: ${settings.maxIterations}`)
            console.log(`  output: ${settings.outputPath ?? '(未設定)'}`)
          } else {
            const validation = validateSetCommand(command.payload.key, command.payload.value)
            if (!validation.ok) {
              printError(validation.error.message)
            } else {
              const { key, value } = validation.value
              switch (key) {
                case 'language':
                  settings.language = value
                  console.log(`language を ${value} に設定しました`)
                  break
                case 'max-iterations':
                  settings.maxIterations = parseInt(value, 10)
                  console.log(`max-iterations を ${value} に設定しました`)
                  break
                case 'output':
                  settings.outputPath = value
                  console.log(`output を ${value} に設定しました`)
                  break
              }
            }
          }
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
