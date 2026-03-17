import { describe, it, expect } from 'vitest'
import {
  buildInitialPrompt,
  buildFixPrompt,
  buildReviewPrompt,
  shouldContinueLoop,
  isApproved,
  extractCodeFromResponse,
  extractReviewFromResponse,
  stripAnsiCodes,
  isCompletionState,
  resolveFileExtension,
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

  it('カスタムテンプレートが指定された場合はプレースホルダを置換して返す', () => {
    const template = 'Generate code for: {{task}} in {{language}}'
    const result = buildInitialPrompt('Sort array', 'python', template)
    expect(result).toBe('Generate code for: Sort array in python')
  })

  it('カスタムテンプレートで言語未指定の場合は空文字に置換する', () => {
    const template = 'Task: {{task}}, Lang: {{language}}'
    const result = buildInitialPrompt('Sort array', undefined, template)
    expect(result).toBe('Task: Sort array, Lang: ')
  })
})

describe('buildFixPrompt', () => {
  it('タスク、コードファイルパス、レビューを含むプロンプトを生成する', () => {
    const result = buildFixPrompt(
      'FizzBuzzを実装して',
      '/tmp/ccf/code.ts',
      'エッジケースの処理が不足しています'
    )
    expect(result).toContain('FizzBuzz')
    expect(result).toContain('/tmp/ccf/code.ts')
    expect(result).toContain('エッジケースの処理が不足しています')
  })

  it('カスタムテンプレートが指定された場合はプレースホルダを置換して返す', () => {
    const template = 'Fix {{codeFilePath}} based on: {{review}} for task {{task}}'
    const result = buildFixPrompt('Sort', '/tmp/code.ts', 'add tests', template)
    expect(result).toBe('Fix /tmp/code.ts based on: add tests for task Sort')
  })
})

describe('buildReviewPrompt', () => {
  it('タスクとコードファイルパスを含むレビュープロンプトを生成する', () => {
    const result = buildReviewPrompt(
      'FizzBuzzを実装して',
      '/tmp/ccf/code.ts'
    )
    expect(result).toContain('FizzBuzz')
    expect(result).toContain('/tmp/ccf/code.ts')
    expect(result).toContain('APPROVED')
  })

  it('カスタムテンプレートが指定された場合はプレースホルダを置換して返す', () => {
    const template = 'Review {{codeFilePath}} for {{task}}'
    const result = buildReviewPrompt('Sort', '/tmp/code.ts', template)
    expect(result).toBe('Review /tmp/code.ts for Sort')
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

  it('「APPROVEDではありません」は否定なので未承認と判定する', () => {
    expect(isApproved('APPROVED ではありません。修正が必要です。')).toBe(false)
  })

  it('「APPROVEDではない」は否定なので未承認と判定する', () => {
    expect(isApproved('APPROVEDではない。改善が必要。')).toBe(false)
  })

  it('「not approved」は否定なので未承認と判定する', () => {
    expect(isApproved('This is not approved. Please fix the issues.')).toBe(false)
  })

  it('「NOT APPROVED」は否定なので未承認と判定する', () => {
    expect(isApproved('NOT APPROVED - needs refactoring')).toBe(false)
  })

  it('否定文脈でない単独のAPPROVEDは承認と判定する', () => {
    expect(isApproved('判定\nAPPROVED\n問題ありません。')).toBe(true)
  })

  it('LGTMは承認と判定する', () => {
    expect(isApproved('LGTM! Great implementation.')).toBe(true)
    expect(isApproved('lgtm')).toBe(true)
  })

  it('Looks good / looks good to meは承認と判定する', () => {
    expect(isApproved('Looks good to me!')).toBe(true)
    expect(isApproved('This looks good. Ship it.')).toBe(true)
  })

  it('Approved with suggestionsは承認と判定する（軽微な指摘付き承認）', () => {
    expect(isApproved('Approved with minor suggestions: add a comment.')).toBe(true)
  })

  it('「承認」（日本語）は承認と判定する', () => {
    expect(isApproved('承認します。問題ありません。')).toBe(true)
    expect(isApproved('コードを承認します')).toBe(true)
  })

  it('「問題ありません」は承認と判定する', () => {
    expect(isApproved('コードに問題ありません。')).toBe(true)
  })

  it('「cannot approve」は否定なので未承認と判定する', () => {
    expect(isApproved('I cannot approve this code yet.')).toBe(false)
  })

  it('「承認できません」は否定なので未承認と判定する', () => {
    expect(isApproved('この状態では承認できません。')).toBe(false)
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

  it('複数のコードブロックがある場合は最後のものを返す', () => {
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

  it('説明文中の短いコード例より最後の完全なコードブロックを優先する', () => {
    const response = `
まず基本的な書き方:

\`\`\`typescript
console.log("example")
// これは長い説明文の中のコード例です
// たくさんの行があるように見えますが説明です
// もっと行を追加して長く見せます
// さらにもう一行
\`\`\`

最終的なコード:

\`\`\`typescript
function solve() {
  return 42
}
\`\`\`
`
    const code = extractCodeFromResponse(response)
    expect(code).toContain('function solve')
    expect(code).not.toContain('example')
  })

  it('Claude Codeの⏺マーカーからコードを抽出できる', () => {
    const response = `⏺ for (let i = 1; i <= 20; i++) {
    if (i % 15 === 0) console.log("FizzBuzz");
    else if (i % 3 === 0) console.log("Fizz");
    else if (i % 5 === 0) console.log("Buzz");
    else console.log(i);
  }
────────────────────`
    const code = extractCodeFromResponse(response)
    expect(code).toContain('for (let i = 1')
    expect(code).toContain('FizzBuzz')
    expect(code).not.toContain('─')
  })

  it('プロンプトや装飾行のみの場合はnullを返す', () => {
    const response = `❯
────────────────────
  ? for shortcuts`
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

  it('⏺マーカー後の説明文を含めない', () => {
    const response = `⏺ 以下が追加すべきバリデーションコードです。

  if (isNaN(maxIterations) || maxIterations <= 0) {
    console.error('エラー')
    process.exit(1)
  }

  ポイント:
  - isNaN() で NaN を検出
  - <= 0 で負数をチェック`
    const code = extractCodeFromResponse(response)
    expect(code).not.toContain('ポイント')
    expect(code).not.toContain('isNaN() で NaN')
    expect(code).toContain('isNaN(maxIterations)')
  })
})

describe('extractReviewFromResponse', () => {
  it('Codex TUIの枠線文字を除去する', () => {
    const raw = `╭──────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.111.0)                          │
│                                                       │
│ model: gpt-5.3-codex medium /model to change         │
│ directory: ~/workspace/util_lib/claude_codex_friends  │
╰──────────────────────────────────────────────────────╯
コードに問題があります。エラーハンドリングを追加してください。`
    const review = extractReviewFromResponse(raw)
    expect(review).not.toContain('╭')
    expect(review).not.toContain('│')
    expect(review).not.toContain('╰')
    expect(review).not.toContain('OpenAI Codex')
    expect(review).not.toContain('model:')
    expect(review).toContain('エラーハンドリングを追加してください')
  })

  it('Codex のプログレスマーカー行を除去する', () => {
    const raw = `• 依頼内容を確認しました。まず指定ファイルを確認します。
• Explored
└ Read code_iter1.ts, index.ts
コードのバリデーションが不足しています。`
    const review = extractReviewFromResponse(raw)
    expect(review).not.toContain('依頼内容を確認しました')
    expect(review).not.toContain('Explored')
    expect(review).not.toContain('└ Read')
    expect(review).toContain('バリデーションが不足しています')
  })

  it('shell コマンドエコー行を除去する', () => {
    const raw = `unset CLAUDECODE && codex
i-nishimura :util_lib/claude_codex_friends (main *)$ unset CLAUDECODE && codex
APPROVED - コードは問題ありません。`
    const review = extractReviewFromResponse(raw)
    expect(review).not.toContain('unset CLAUDECODE')
    expect(review).not.toContain('i-nishimura')
    expect(review).toContain('APPROVED')
  })

  it('Tip/プロモーション行を除去する', () => {
    const raw = `Tip: New Try the Codex App with 2x rate limits until April 2nd. Run 'codex app'
バリデーションを追加してください。`
    const review = extractReviewFromResponse(raw)
    expect(review).not.toContain('Tip:')
    expect(review).not.toContain('Codex App')
    expect(review).toContain('バリデーションを追加してください')
  })

  it('メタデータ行を除去する', () => {
    const raw = `model: gpt-5.3-codex medium /model to change
directory: ~/workspace/util_lib/claude_codex_friends
APPROVED`
    const review = extractReviewFromResponse(raw)
    expect(review).not.toContain('model:')
    expect(review).not.toContain('directory:')
    expect(review).toContain('APPROVED')
  })

  it('既存のノイズパターン（プロンプト記号、ヒント行）も引き続き除去する', () => {
    const raw = `❯
› codex
  ? for shortcuts
Welcome to Codex CLI v0.111.0
レビュー結果: 問題ありません`
    const review = extractReviewFromResponse(raw)
    expect(review).toContain('レビュー結果: 問題ありません')
    expect(review).not.toContain('Welcome')
    expect(review).not.toContain('for shortcuts')
  })
})

describe('isCompletionState', () => {
  it('Claude Code の ❯ プロンプトを完了状態と判定する', () => {
    const output = 'コードを生成しました。\n\n❯ '
    expect(isCompletionState(output)).toBe(true)
  })

  it('Codex の › プロンプトを完了状態と判定する', () => {
    const output = 'レビュー完了\n› '
    expect(isCompletionState(output)).toBe(true)
  })

  it('一般的な > プロンプトを完了状態と判定する', () => {
    const output = 'some output\n> '
    expect(isCompletionState(output)).toBe(true)
  })

  it('シェルの $ プロンプトを完了状態と判定する', () => {
    const output = 'command done\n$ '
    expect(isCompletionState(output)).toBe(true)
  })

  it('Claude Code の "? for shortcuts" ヒントを完了状態と判定する', () => {
    const output = 'some output\n? for shortcuts'
    expect(isCompletionState(output)).toBe(true)
  })

  it('生成途中の出力は完了状態ではないと判定する', () => {
    const output = 'function fizzbuzz(n: number) {\n  if (n % 3 === 0) return "Fizz"\n'
    expect(isCompletionState(output)).toBe(false)
  })

  it('空文字列は完了状態ではないと判定する', () => {
    expect(isCompletionState('')).toBe(false)
  })

  it('ANSIコードが含まれていても正しく判定する', () => {
    const output = '\x1b[32mDone\x1b[0m\n❯ '
    expect(isCompletionState(output)).toBe(true)
  })

  it('中間行にプロンプト文字があっても最後の5行で判定する', () => {
    const lines = [
      '❯ previous command',
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      'line 5',
      'still generating...',
    ]
    expect(isCompletionState(lines.join('\n'))).toBe(false)
  })
})

describe('resolveFileExtension', () => {
  it('typescriptはtsを返す', () => {
    expect(resolveFileExtension('typescript')).toBe('ts')
  })

  it('pythonはpyを返す', () => {
    expect(resolveFileExtension('python')).toBe('py')
  })

  it('goはgoを返す', () => {
    expect(resolveFileExtension('go')).toBe('go')
  })

  it('大文字小文字を区別しない', () => {
    expect(resolveFileExtension('TypeScript')).toBe('ts')
    expect(resolveFileExtension('PYTHON')).toBe('py')
  })

  it('未知の言語はtxtを返す', () => {
    expect(resolveFileExtension('brainfuck')).toBe('txt')
  })

  it('undefinedはtxtを返す', () => {
    expect(resolveFileExtension(undefined)).toBe('txt')
  })
})
