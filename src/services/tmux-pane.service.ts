import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { ERRORS } from '../domain/errors.js'
import { isCompletionState } from '../domain/loop.rules.js'
import { DEFAULTS } from '../config/index.js'
import { tmux, sleep } from './tmux-core.js'

/** ペインにプロンプトを送信する */
export async function sendPrompt(target: string, text: string): Promise<Result<void>> {
  // 改行をスペースに置換して1行にフラット化
  const flattened = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()

  // 長いテキストはチャンクに分割して送信（TUIの入力バッファ制限対策）
  const chunks = splitIntoChunks(flattened, DEFAULTS.chunkSize)

  for (const chunk of chunks) {
    const result = await tmux('send-keys', '-t', target, '-l', chunk)
    if (!result.ok) return err(ERRORS.SEND_PROMPT_FAILED(result.error.message))
    // チャンク間に小さなディレイを入れてバッファを処理させる
    await sleep(DEFAULTS.chunkDelayMs)
  }

  // Enter を送信してコマンド実行
  await sleep(DEFAULTS.enterDelayMs)
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
      stableCount >= DEFAULTS.stableThreshold &&
      output !== baselineText &&
      isCompletionState(output)
    ) {
      return ok(output)
    }

    await sleep(pollIntervalMs)
  }

  // タイムアウト時にデバッグ情報として最後のキャプチャ末尾を含める
  const lastLines = lastOutput.split('\n').slice(-3).join('\n').trim()
  const debugInfo = lastLines ? ` 最後の出力: "${lastLines}"` : ''
  return err({
    code: 'TIMEOUT',
    message: `${target} の応答がタイムアウトしました (${timeoutMs}ms)。${debugInfo}`,
  })
}

/** Result を返す非同期関数をリトライ付きで実行する */
export async function withRetry<T>(
  fn: () => Promise<Result<T, DomainError>>,
  maxRetries: number = DEFAULTS.maxRetries,
  delayMs: number = DEFAULTS.retryDelayMs,
): Promise<Result<T, DomainError>> {
  let lastResult: Result<T, DomainError> | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await fn()
    if (lastResult.ok) return lastResult
    if (attempt < maxRetries) {
      await sleep(delayMs)
    }
  }
  return lastResult!
}
