import { describe, it, expect } from 'vitest'
import { parseCommand } from '../../repl/commands.js'

describe('parseCommand', () => {
  describe('タスクコマンド（デフォルト）', () => {
    it('通常のテキスト入力はタスクとして解釈する', () => {
      const result = parseCommand('FizzBuzzを実装して')
      expect(result).toEqual({ type: 'task', payload: 'FizzBuzzを実装して' })
    })

    it('前後の空白を除去する', () => {
      const result = parseCommand('  hello world  ')
      expect(result).toEqual({ type: 'task', payload: 'hello world' })
    })
  })

  describe('@claude コマンド', () => {
    it('@claude でClaude直接送信と解釈する', () => {
      const result = parseCommand('@claude こんにちは')
      expect(result).toEqual({ type: 'claude', payload: 'こんにちは' })
    })

    it('@claude の後のテキストが空の場合もclaude型として解釈する', () => {
      const result = parseCommand('@claude   ')
      expect(result).toEqual({ type: 'claude', payload: '' })
    })
  })

  describe('@codex コマンド', () => {
    it('@codex でCodex直接送信と解釈する', () => {
      const result = parseCommand('@codex レビューして')
      expect(result).toEqual({ type: 'codex', payload: 'レビューして' })
    })
  })

  describe('スラッシュコマンド', () => {
    it('/status でステータス表示コマンドと解釈する', () => {
      const result = parseCommand('/status')
      expect(result).toEqual({ type: 'status' })
    })

    it('/help でヘルプコマンドと解釈する', () => {
      const result = parseCommand('/help')
      expect(result).toEqual({ type: 'help' })
    })

    it('/exit で終了コマンドと解釈する', () => {
      const result = parseCommand('/exit')
      expect(result).toEqual({ type: 'exit' })
    })

    it('前後の空白があっても正しくパースする', () => {
      const result = parseCommand('  /status  ')
      expect(result).toEqual({ type: 'status' })
    })
  })

  describe('空入力', () => {
    it('空文字列はタスクとして空payloadを返す', () => {
      const result = parseCommand('')
      expect(result).toEqual({ type: 'task', payload: '' })
    })

    it('空白のみはタスクとして空payloadを返す', () => {
      const result = parseCommand('   ')
      expect(result).toEqual({ type: 'task', payload: '' })
    })
  })
})
