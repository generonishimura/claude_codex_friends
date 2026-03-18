import type { DomainError } from './types.js'

/** エラー定義（日本語） */
export const ERRORS = {
  TMUX_NOT_FOUND: {
    code: 'TMUX_NOT_FOUND',
    message: 'tmux がインストールされていません。brew install tmux でインストールしてください。',
  } satisfies DomainError,

  SESSION_CREATE_FAILED: (detail: string): DomainError => ({
    code: 'SESSION_CREATE_FAILED',
    message: `tmux セッションの作成に失敗しました: ${detail}`,
  }),

  SESSION_NOT_FOUND: (name: string): DomainError => ({
    code: 'SESSION_NOT_FOUND',
    message: `tmux セッション "${name}" が見つかりません。`,
  }),

  CLI_NOT_FOUND: (cli: string): DomainError => ({
    code: 'CLI_NOT_FOUND',
    message: `${cli} コマンドが見つかりません。which ${cli} で確認してください。`,
  }),

  CLI_START_FAILED: (cli: string, detail: string): DomainError => ({
    code: 'CLI_START_FAILED',
    message: `${cli} CLI の起動に失敗しました: ${detail}`,
  }),

  SEND_PROMPT_FAILED: (detail: string): DomainError => ({
    code: 'SEND_PROMPT_FAILED',
    message: `プロンプトの送信に失敗しました: ${detail}`,
  }),

  CAPTURE_FAILED: (detail: string): DomainError => ({
    code: 'CAPTURE_FAILED',
    message: `ペイン出力の取得に失敗しました: ${detail}`,
  }),

  TIMEOUT: (target: string, timeoutMs: number): DomainError => ({
    code: 'TIMEOUT',
    message: `${target} の応答がタイムアウトしました (${timeoutMs}ms)。`,
  }),

  CODE_EXTRACTION_FAILED: {
    code: 'CODE_EXTRACTION_FAILED',
    message: 'レスポンスからコードを抽出できませんでした。',
  } satisfies DomainError,

  INVALID_CONFIG: (detail: string): DomainError => ({
    code: 'INVALID_CONFIG',
    message: `設定が不正です: ${detail}`,
  }),
} as const
