import { describe, it, expect } from 'vitest'
import type { EngineResult, EngineState } from '../../domain/engine.types.js'

describe('EngineResult', () => {
  it('errorMessage フィールドを持てる', () => {
    const result: EngineResult = {
      finalCode: null,
      iterations: [],
      approved: false,
      totalIterations: 0,
      userAccepted: false,
      errorMessage: 'タイムアウトしました',
    }
    expect(result.errorMessage).toBe('タイムアウトしました')
  })

  it('errorMessage は省略可能', () => {
    const result: EngineResult = {
      finalCode: 'code',
      iterations: [],
      approved: true,
      totalIterations: 1,
      userAccepted: false,
    }
    expect(result.errorMessage).toBeUndefined()
  })
})

describe('EngineState', () => {
  it('lastError フィールドを持てる', () => {
    const state: EngineState = {
      phase: 'error',
      iteration: 1,
      maxIterations: 3,
      iterations: [],
      currentCode: null,
      codeFilePath: '',
      approved: false,
      askReason: null,
      lastReviews: [],
      lastError: 'タイムアウトしました',
    }
    expect(state.lastError).toBe('タイムアウトしました')
  })

  it('lastError が null の場合', () => {
    const state: EngineState = {
      phase: 'idle',
      iteration: 0,
      maxIterations: 3,
      iterations: [],
      currentCode: null,
      codeFilePath: '',
      approved: false,
      askReason: null,
      lastReviews: [],
      lastError: null,
    }
    expect(state.lastError).toBeNull()
  })
})
