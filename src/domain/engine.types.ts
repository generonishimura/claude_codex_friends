/** LoopEngine のステートマシン型定義 */

import type { IterationResult } from './loop.types.js'

/** エンジンのフェーズ */
export type EnginePhase =
  | 'idle'        // 初期状態
  | 'generating'  // Claude がコード生成中
  | 'reviewing'   // Codex がレビュー中
  | 'judging'     // レビュー結果を判定中
  | 'ask-user'    // ユーザーの判断を待機中
  | 'completed'   // 正常完了（approved）
  | 'aborted'     // ユーザーが破棄
  | 'error'       // エラーで停止

/** ユーザー判断が必要になった理由 */
export type AskReason =
  | 'iteration_limit'  // 最大イテレーション到達
  | 'stuck'            // 同じ指摘の堂々巡り検出
  | 'error_recovery'   // エラーからの復帰判断

/** ユーザーの回答 */
export type UserDecision =
  | { type: 'continue'; additionalIterations: number }
  | { type: 'intervene' }  // 手動介入モードに移行
  | { type: 'accept' }     // 現在のコードをそのまま承認
  | { type: 'reject' }     // 破棄して終了

/** エンジンの状態 */
export interface EngineState {
  phase: EnginePhase
  iteration: number
  maxIterations: number
  iterations: IterationResult[]
  currentCode: string | null
  codeFilePath: string
  approved: boolean
  /** ユーザー判断待ちの理由（phase が ask-user の時のみ） */
  askReason: AskReason | null
  /** 直近のレビューテキスト（stuck 検出用） */
  lastReviews: string[]
}

/** エンジンが発行するイベント */
export type EngineEvent =
  | { type: 'phase_changed'; phase: EnginePhase; reason?: string }
  | { type: 'iteration_start'; iteration: number; maxIterations: number }
  | { type: 'code_generated'; code: string; filePath: string }
  | { type: 'review_received'; review: string; approved: boolean }
  | { type: 'ask_user'; reason: AskReason; context: AskUserContext }
  | { type: 'completed'; result: EngineResult }

/** ask-user イベントで渡すコンテキスト */
export interface AskUserContext {
  reason: AskReason
  iteration: number
  maxIterations: number
  lastReview: string | null
  currentCode: string | null
}

/** エンジンの最終結果 */
export interface EngineResult {
  finalCode: string | null
  iterations: IterationResult[]
  approved: boolean
  totalIterations: number
  /** ユーザーが accept で終了したか */
  userAccepted: boolean
}
