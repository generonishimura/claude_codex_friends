import type { LoopConfig } from '../domain/loop.types.js'
import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { validateNumericOptions } from '../domain/config.rules.js'

/** デフォルト設定値 */
export const DEFAULTS = {
  maxIterations: 5,
  timeoutMs: 5 * 60 * 1000,     // 5分
  pollIntervalMs: 3000,           // 3秒
  sessionName: 'ccf',
  /** CLI起動待機の初回ウェイト (ms) — 最低限の起動猶予後にポーリング開始 */
  cliStartupDelayMs: 2000,
  /** プロンプト送信時のチャンクサイズ (文字数) — TUIバッファ制限対策 */
  chunkSize: 200,
  /** チャンク間ディレイ (ms) */
  chunkDelayMs: 50,
  /** Enter送信前ディレイ (ms) */
  enterDelayMs: 300,
  /** 完了判定の安定性閾値 — 連続同一出力の回数 */
  stableThreshold: 2,
  /** リトライ最大回数 */
  maxRetries: 2,
  /** リトライ間隔 (ms) */
  retryDelayMs: 2000,
} as const

/** 実行モード */
export type RunMode =
  | { mode: 'launcher' }
  | { mode: 'repl'; language?: string; maxIterations: number; timeoutMs: number; pollIntervalMs: number }
  | { mode: 'auto'; config: LoopConfig & { sessionName: string; keepSession: boolean; logPath?: string } }

/** CLI引数をパースして実行モードを判定する */
export function parseMode(args: string[]): Result<RunMode, DomainError> {
  const positional: string[] = []
  let language: string | undefined
  let outputPath: string | undefined
  let maxIterations: number = DEFAULTS.maxIterations
  let timeoutMs: number = DEFAULTS.timeoutMs
  let pollIntervalMs: number = DEFAULTS.pollIntervalMs
  let replMode = false
  let keepSession = false
  let logPath: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--repl':
        replMode = true
        break
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
      case '--keep-session':
        keepSession = true
        break
      case '--log':
        logPath = args[++i]
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

  // 数値オプションのバリデーション
  const validation = validateNumericOptions({ maxIterations, timeoutMs, pollIntervalMs })
  if (!validation.ok) {
    return err(validation.error)
  }

  // --repl フラグ: REPLモード（ランチャーからの自己呼び出し）
  if (replMode) {
    return ok({ mode: 'repl', language, maxIterations, timeoutMs, pollIntervalMs })
  }

  const task = positional.join(' ')

  // タスク指定なし: ランチャーモード（3ペイン起動）
  if (!task) {
    return ok({ mode: 'launcher' })
  }

  // タスク指定あり: 自動ループモード（既存動作）
  return ok({
    mode: 'auto',
    config: {
      task,
      language,
      outputPath,
      maxIterations,
      timeoutMs,
      pollIntervalMs,
      sessionName: DEFAULTS.sessionName,
      keepSession,
      logPath,
    },
  })
}

function printHelp(): void {
  console.log(`
Claude x Codex Friends — AI対話型コード生成・レビューツール

使い方:
  ccf                              インタラクティブモード（3ペイン起動）
  ccf "タスクの説明" [オプション]    自動ループモード

オプション:
  -l, --language <lang>       プログラミング言語を指定
  -o, --output <path>         出力ファイルパス
  -m, --max-iterations <n>    最大イテレーション数 (デフォルト: ${DEFAULTS.maxIterations})
  -t, --timeout <seconds>     タイムアウト秒数 (デフォルト: ${DEFAULTS.timeoutMs / 1000})
  --poll-interval <ms>        ポーリング間隔 ms (デフォルト: ${DEFAULTS.pollIntervalMs})
  --keep-session              終了後もtmuxセッションを残す
  --log <path>                イテレーション履歴をJSONファイルに保存
  -h, --help                  ヘルプを表示

例:
  ccf                                              # 3ペインREPLモード
  ccf "FizzBuzzを実装して" -l typescript -o fizzbuzz.ts
  ccf "Quick sort in Python" -m 3 -o sort.py
`.trim())
}
