import { describe, it, expect } from 'vitest'
import {
  buildInitialPrompt,
  buildFixPrompt,
  buildReviewPrompt,
  shouldContinueLoop,
  isApproved,
  extractCodeFromResponse,
  stripAnsiCodes,
} from '../../domain/loop.rules.js'
import type { LoopState } from '../../domain/loop.types.js'

describe('stripAnsiCodes', () => {
  it('ANSIエスケープコードを除去する', () => {
    const input = '\x1b[32mHello\x1b[0m \x1b[1;34mWorld\x1b[0m'
    expect(stripAnsiCodes(input)).toBe('Hello World')
  })

  it('ANSIコードがない文字列はそのまま返す', () => {
    expect(stripAnsiCodes('plain text')).toBe('plain text')
  })

  it('空文字列を処理できる', () => {
    expect(stripAnsiCodes('')).toBe('')
  })

  it('カーソル移動等のエスケープシーケンスも除去する', () => {
    const input = '\x1b[2J\x1b[H\x1b[?25lContent\x1b[?25h'
    expect(stripAnsiCodes(input)).toBe('Content')
  })
})

describe('buildInitialPrompt', () => {
  it('タスクのみ指定した場合のプロンプトを生成する', () => {
    const result = buildInitialPrompt('FizzBuzzを実装して')
    expect(result).toContain('FizzBuzz')
    expect(result).toContain('コード')
  })

  it('言語を指定した場合はプロンプトに含まれる', () => {
    const result = buildInitialPrompt('FizzBuzzを実装して', 'typescript')
    expect(result).toContain('typescript')
    expect(result).toContain('FizzBuzz')
  })
})

describe('buildFixPrompt', () => {
  it('タスク、コード、レビューを含むプロンプトを生成する', () => {
    const result = buildFixPrompt(
      'FizzBuzzを実装して',
      'function fizzbuzz() {}',
      'エッジケースの処理が不足しています'
    )
    expect(result).toContain('FizzBuzz')
    expect(result).toContain('function fizzbuzz() {}')
    expect(result).toContain('エッジケースの処理が不足しています')
  })
})

describe('buildReviewPrompt', () => {
  it('タスクとコードを含むレビュープロンプトを生成する', () => {
    const result = buildReviewPrompt(
      'FizzBuzzを実装して',
      'function fizzbuzz() { return 1 }'
    )
    expect(result).toContain('FizzBuzz')
    expect(result).toContain('function fizzbuzz() { return 1 }')
    expect(result).toContain('APPROVED')
  })
})

describe('shouldContinueLoop', () => {
  it('まだ承認されていない & 最大回数未満ならtrueを返す', () => {
    const state: LoopState = {
      iteration: 1,
      maxIterations: 5,
      approved: false,
      hasError: false,
    }
    expect(shouldContinueLoop(state)).toBe(true)
  })

  it('承認されていればfalseを返す', () => {
    const state: LoopState = {
      iteration: 1,
      maxIterations: 5,
      approved: true,
      hasError: false,
    }
    expect(shouldContinueLoop(state)).toBe(false)
  })

  it('最大回数に達していればfalseを返す', () => {
    const state: LoopState = {
      iteration: 5,
      maxIterations: 5,
      approved: false,
      hasError: false,
    }
    expect(shouldContinueLoop(state)).toBe(false)
  })

  it('エラーが発生していればfalseを返す', () => {
    const state: LoopState = {
      iteration: 1,
      maxIterations: 5,
      approved: false,
      hasError: true,
    }
    expect(shouldContinueLoop(state)).toBe(false)
  })
})

describe('isApproved', () => {
  it('APPROVEDを含むレビューは承認と判定する', () => {
    expect(isApproved('コードは正しいです。APPROVED')).toBe(true)
  })

  it('大文字小文字を区別しない', () => {
    expect(isApproved('Approved - looks good')).toBe(true)
    expect(isApproved('approved')).toBe(true)
  })

  it('APPROVEDを含まないレビューは未承認と判定する', () => {
    expect(isApproved('修正が必要です。エラーハンドリングを追加してください。')).toBe(false)
  })

  it('空文字列は未承認と判定する', () => {
    expect(isApproved('')).toBe(false)
  })
})

describe('extractCodeFromResponse', () => {
  it('マークダウンのコードブロックからコードを抽出する', () => {
    const response = `
以下がコードです:

\`\`\`typescript
function fizzbuzz(n: number): string {
  if (n % 15 === 0) return 'FizzBuzz'
  if (n % 3 === 0) return 'Fizz'
  if (n % 5 === 0) return 'Buzz'
  return String(n)
}
\`\`\`

上記のコードは...
`
    const code = extractCodeFromResponse(response)
    expect(code).toContain('function fizzbuzz')
    expect(code).toContain("return 'FizzBuzz'")
    expect(code).not.toContain('```')
  })

  it('言語指定なしのコードブロックも抽出できる', () => {
    const response = `
\`\`\`
print("hello")
\`\`\`
`
    const code = extractCodeFromResponse(response)
    expect(code).toBe('print("hello")')
  })

  it('複数のコードブロックがある場合は最も長いものを返す', () => {
    const response = `
\`\`\`typescript
const a = 1
\`\`\`

\`\`\`typescript
function longFunction() {
  const a = 1
  const b = 2
  return a + b
}
\`\`\`
`
    const code = extractCodeFromResponse(response)
    expect(code).toContain('function longFunction')
  })

  it('コードブロックがない場合はnullを返す', () => {
    const response = 'コードブロックがないテキストです。'
    expect(extractCodeFromResponse(response)).toBeNull()
  })

  it('ANSIコードが混在していても抽出できる', () => {
    const response = `
\x1b[32m\`\`\`typescript\x1b[0m
const x = 42
\x1b[32m\`\`\`\x1b[0m
`
    const code = extractCodeFromResponse(response)
    expect(code).toBe('const x = 42')
  })
})
