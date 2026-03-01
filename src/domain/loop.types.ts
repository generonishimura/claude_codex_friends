/** ループの状態 */
export interface LoopState {
  /** 現在のイテレーション番号 (1始まり) */
  iteration: number
  /** 最大イテレーション数 */
  maxIterations: number
  /** 直近のレビュー結果が承認かどうか */
  approved: boolean
  /** 直近のエラー有無 */
  hasError: boolean
}

/** ループ設定 */
export interface LoopConfig {
  /** タスクの説明 */
  task: string
  /** プログラミング言語 */
  language?: string
  /** 出力ファイルパス */
  outputPath?: string
  /** 最大イテレーション数 */
  maxIterations: number
  /** 完了検知のタイムアウト (ms) */
  timeoutMs: number
  /** ポーリング間隔 (ms) */
  pollIntervalMs: number
}

/** 1イテレーションの結果 */
export interface IterationResult {
  /** イテレーション番号 */
  iteration: number
  /** Claude が生成したコード */
  code: string | null
  /** Codex のレビューコメント */
  review: string | null
  /** レビューが承認されたか */
  approved: boolean
}

/** エージェントループ全体の結果 */
export interface LoopResult {
  /** 最終的なコード */
  finalCode: string | null
  /** 全イテレーションの履歴 */
  iterations: IterationResult[]
  /** 承認されて終了したか */
  approved: boolean
  /** 合計イテレーション数 */
  totalIterations: number
}
