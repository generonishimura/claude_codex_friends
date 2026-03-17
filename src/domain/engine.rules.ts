/** LoopEngine のドメインルール（純粋関数） */

import type { EngineState, AskReason } from './engine.types.js'

/** 初期状態を生成する */
export function createInitialState(maxIterations: number): EngineState {
  return {
    phase: 'idle',
    iteration: 0,
    maxIterations,
    iterations: [],
    currentCode: null,
    codeFilePath: '',
    approved: false,
    askReason: null,
    lastReviews: [],
    lastError: null,
  }
}

/** レビューテキストを正規化する（比較用） */
function normalizeReview(review: string): string {
  return review.replace(/\s+/g, ' ').trim()
}

/** 直近のレビューが堂々巡りかどうか検出する */
export function detectStuck(reviews: string[]): boolean {
  if (reviews.length < 2) return false

  const normalized = reviews.map(normalizeReview)
  const last = normalized[normalized.length - 1]

  // 直近2件以上が同一なら stuck
  return normalized.slice(-2).every(r => r === last)
}

/** 判定フェーズでの次のフェーズを決定する */
export function decideNextPhase(state: EngineState): { phase: EngineState['phase']; reason?: AskReason } {
  // approved は最優先
  if (state.approved) {
    return { phase: 'completed' }
  }

  // 最大イテレーション到達
  if (state.iteration >= state.maxIterations) {
    return { phase: 'ask-user', reason: 'iteration_limit' }
  }

  // 堂々巡り検出
  if (detectStuck(state.lastReviews)) {
    return { phase: 'ask-user', reason: 'stuck' }
  }

  // 通常: 次のイテレーションへ
  return { phase: 'generating' }
}
