import { describe, it, expect } from 'vitest'
import { validateSetCommand } from '../../domain/repl.rules.js'

describe('validateSetCommand', () => {
  it('language は有効なキー', () => {
    const result = validateSetCommand('language', 'python')
    expect(result.ok).toBe(true)
  })

  it('max-iterations は有効なキー', () => {
    const result = validateSetCommand('max-iterations', '10')
    expect(result.ok).toBe(true)
  })

  it('output は有効なキー', () => {
    const result = validateSetCommand('output', 'result.ts')
    expect(result.ok).toBe(true)
  })

  it('無効なキーはエラー', () => {
    const result = validateSetCommand('invalid-key', 'value')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('invalid-key')
    }
  })

  it('max-iterations に非数値はエラー', () => {
    const result = validateSetCommand('max-iterations', 'abc')
    expect(result.ok).toBe(false)
  })

  it('max-iterations に0はエラー', () => {
    const result = validateSetCommand('max-iterations', '0')
    expect(result.ok).toBe(false)
  })

  it('max-iterations に負数はエラー', () => {
    const result = validateSetCommand('max-iterations', '-3')
    expect(result.ok).toBe(false)
  })
})
