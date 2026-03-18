import { describe, it, expect } from 'vitest'
import { validateNumericOptions } from '../../domain/config.rules.js'

describe('validateNumericOptions', () => {
  describe('maxIterations', () => {
    it('0は無効', () => {
      const result = validateNumericOptions({ maxIterations: 0, timeoutMs: 5000, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
    it('NaNは無効', () => {
      const result = validateNumericOptions({ maxIterations: NaN, timeoutMs: 5000, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
    it('負数は無効', () => {
      const result = validateNumericOptions({ maxIterations: -3, timeoutMs: 5000, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
    it('小数(0.5)は無効', () => {
      const result = validateNumericOptions({ maxIterations: 0.5, timeoutMs: 5000, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
    it('小数(2.5)は無効', () => {
      const result = validateNumericOptions({ maxIterations: 2.5, timeoutMs: 5000, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
  })

  describe('timeoutMs', () => {
    it('0は無効', () => {
      const result = validateNumericOptions({ maxIterations: 5, timeoutMs: 0, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
    it('NaNは無効', () => {
      const result = validateNumericOptions({ maxIterations: 5, timeoutMs: NaN, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
    it('負数は無効', () => {
      const result = validateNumericOptions({ maxIterations: 5, timeoutMs: -1000, pollIntervalMs: 3000 })
      expect(result.ok).toBe(false)
    })
  })

  describe('pollIntervalMs', () => {
    it('0は無効', () => {
      const result = validateNumericOptions({ maxIterations: 5, timeoutMs: 5000, pollIntervalMs: 0 })
      expect(result.ok).toBe(false)
    })
    it('NaNは無効', () => {
      const result = validateNumericOptions({ maxIterations: 5, timeoutMs: 5000, pollIntervalMs: NaN })
      expect(result.ok).toBe(false)
    })
    it('負数は無効', () => {
      const result = validateNumericOptions({ maxIterations: 5, timeoutMs: 5000, pollIntervalMs: -100 })
      expect(result.ok).toBe(false)
    })
  })

  describe('正常値', () => {
    it('全て正の整数ならok', () => {
      const result = validateNumericOptions({ maxIterations: 5, timeoutMs: 300000, pollIntervalMs: 3000 })
      expect(result.ok).toBe(true)
    })
    it('1は最小の有効値', () => {
      const result = validateNumericOptions({ maxIterations: 1, timeoutMs: 1, pollIntervalMs: 1 })
      expect(result.ok).toBe(true)
    })
  })
})
