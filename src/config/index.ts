import type { LoopConfig } from '../domain/loop.types.js'

/** デフォルト設定値 */
const DEFAULTS = {
  maxIterations: 5,
  timeoutMs: 5 * 60 * 1000,     // 5分
  pollIntervalMs: 3000,           // 3秒
  sessionName: 'ccf',
} as const

/** CLI引数をパースして LoopConfig を構築する */
export function parseArgs(args: string[]): LoopConfig & { sessionName: string } {
  const positional: string[] = []
  let language: string | undefined
  let outputPath: string | undefined
  let maxIterations: number = DEFAULTS.maxIterations
  let timeoutMs: number = DEFAULTS.timeoutMs
  let pollIntervalMs: number = DEFAULTS.pollIntervalMs
  const sessionName = DEFAULTS.sessionName

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-l':
      case '--language':
        language = args[++i]
        break
      case '-o':
      case '--output':
        outputPath = args[++i]
        break
      case '-m':
      case '--max-iterations':
        maxIterations = parseInt(args[++i], 10)
        break
      case '-t':
      case '--timeout':
        timeoutMs = parseInt(args[++i], 10) * 1000
        break
      case '--poll-interval':
        pollIntervalMs = parseInt(args[++i], 10)
        break
      case '-h':
      case '--help':
        printHelp()
        process.exit(0)
      default:
        if (!arg.startsWith('-')) {
          positional.push(arg)
        }
        break
    }
  }

  const task = positional.join(' ')
  if (!task) {
    console.error('エラー: タスクの説明を指定してください。')
    printHelp()
    process.exit(1)
  }

  return {
    task,
    language,
    outputPath,
    maxIterations,
    timeoutMs,
    pollIntervalMs,
    sessionName,
  }
}

function printHelp(): void {
  console.log(`
Claude x Codex Friends — AI対話型コード生成・レビューツール

使い方:
  npx tsx src/index.ts "タスクの説明" [オプション]

オプション:
  -l, --language <lang>       プログラミング言語を指定
  -o, --output <path>         出力ファイルパス
  -m, --max-iterations <n>    最大イテレーション数 (デフォルト: ${DEFAULTS.maxIterations})
  -t, --timeout <seconds>     タイムアウト秒数 (デフォルト: ${DEFAULTS.timeoutMs / 1000})
  --poll-interval <ms>        ポーリング間隔 ms (デフォルト: ${DEFAULTS.pollIntervalMs})
  -h, --help                  ヘルプを表示

例:
  npx tsx src/index.ts "FizzBuzzを実装して" -l typescript -o fizzbuzz.ts
  npx tsx src/index.ts "Quick sort in Python" -m 3 -o sort.py
`.trim())
}
