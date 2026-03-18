import { describe, it, expect } from 'vitest'
import { truncateCode } from '../../ui/terminal.js'

describe('truncateCode', () => {
  it('10行以下のコードはそのまま返す', () => {
    const code = 'line1\nline2\nline3'
    expect(truncateCode(code, 10)).toBe(code)
  })

  it('10行超のコードは先頭10行 + 省略メッセージを返す', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    const code = lines.join('\n')
    const result = truncateCode(code, 10)
    expect(result).toContain('line 1')
    expect(result).toContain('line 10')
    expect(result).not.toContain('line 11')
    expect(result).toContain('...省略')
    expect(result).toContain('10行')
  })

  it('ちょうど10行のコードはそのまま返す', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    const code = lines.join('\n')
    expect(truncateCode(code, 10)).toBe(code)
  })
})
