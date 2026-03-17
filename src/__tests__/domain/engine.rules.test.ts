import { describe, it, expect } from 'vitest'
import {
  detectStuck,
  decideNextPhase,
  createInitialState,
} from '../../domain/engine.rules.js'
import type { EngineState } from '../../domain/engine.types.js'

describe('createInitialState', () => {
  it('指定した maxIterations で初期状態を生成する', () => {
    const state = createInitialState(5)

    expect(state.phase).toBe('idle')
    expect(state.iteration).toBe(0)
    expect(state.maxIterations).toBe(5)
    expect(state.iterations).toEqual([])
    expect(state.currentCode).toBeNull()
    expect(state.codeFilePath).toBe('')
    expect(state.approved).toBe(false)
    expect(state.askReason).toBeNull()
    expect(state.lastReviews).toEqual([])
  })
})

describe('detectStuck', () => {
  it('レビューが2件未満なら stuck ではない', () => {
    expect(detectStuck(['修正してください'])).toBe(false)
  })

  it('レビューが2件未満（空配列）なら stuck ではない', () => {
    expect(detectStuck([])).toBe(false)
  })

  it('直近3件のレビューが類似していれば stuck と判定する', () => {
    const reviews = [
      'エラーハンドリングが不足しています。try-catchを追加してください。',
      'エラーハンドリングが不足しています。try-catchを追加してください。',
      'エラーハンドリングが不足しています。try-catchを追加してください。',
    ]
    expect(detectStuck(reviews)).toBe(true)
  })

  it('直近2件が同一でも stuck と判定する', () => {
    const reviews = [
      '型定義を追加してください',
      '型定義を追加してください',
    ]
    expect(detectStuck(reviews)).toBe(true)
  })

  it('異なるレビュー内容なら stuck ではない', () => {
    const reviews = [
      'エラーハンドリングを追加してください',
      '変数名を改善してください',
      'テストを追加してください',
    ]
    expect(detectStuck(reviews)).toBe(false)
  })

  it('部分的に類似していても全体が異なれば stuck ではない', () => {
    const reviews = [
      'エラーハンドリングを追加してください',
      'エラーハンドリングとバリデーションを追加してください',
      'バリデーションを追加してください',
    ]
    expect(detectStuck(reviews)).toBe(false)
  })

  it('空白の違いを正規化して比較する', () => {
    const reviews = [
      '  エラーハンドリング が不足  ',
      'エラーハンドリング が不足',
    ]
    expect(detectStuck(reviews)).toBe(true)
  })
})

describe('decideNextPhase', () => {
  const baseState: EngineState = {
    phase: 'judging',
    iteration: 1,
    maxIterations: 5,
    iterations: [],
    currentCode: 'const x = 1',
    codeFilePath: '/tmp/code.ts',
    approved: false,
    askReason: null,
    lastReviews: [],
  }

  it('approved なら completed に遷移する', () => {
    const state: EngineState = { ...baseState, approved: true }
    const result = decideNextPhase(state)
    expect(result.phase).toBe('completed')
  })

  it('最大イテレーション到達で未承認なら ask-user に遷移する', () => {
    const state: EngineState = { ...baseState, iteration: 5, maxIterations: 5 }
    const result = decideNextPhase(state)
    expect(result.phase).toBe('ask-user')
    expect(result.reason).toBe('iteration_limit')
  })

  it('stuck 検出時は ask-user に遷移する', () => {
    const state: EngineState = {
      ...baseState,
      iteration: 3,
      lastReviews: [
        '同じ指摘',
        '同じ指摘',
      ],
    }
    const result = decideNextPhase(state)
    expect(result.phase).toBe('ask-user')
    expect(result.reason).toBe('stuck')
  })

  it('通常の未承認なら generating に遷移して次のイテレーションへ', () => {
    const state: EngineState = { ...baseState, iteration: 2 }
    const result = decideNextPhase(state)
    expect(result.phase).toBe('generating')
  })

  it('iteration_limit が stuck より優先される', () => {
    const state: EngineState = {
      ...baseState,
      iteration: 5,
      maxIterations: 5,
      lastReviews: ['同じ指摘', '同じ指摘'],
    }
    const result = decideNextPhase(state)
    expect(result.phase).toBe('ask-user')
    expect(result.reason).toBe('iteration_limit')
  })

  it('approved は他の条件より常に優先される', () => {
    const state: EngineState = {
      ...baseState,
      approved: true,
      iteration: 5,
      maxIterations: 5,
      lastReviews: ['同じ指摘', '同じ指摘'],
    }
    const result = decideNextPhase(state)
    expect(result.phase).toBe('completed')
  })
})
