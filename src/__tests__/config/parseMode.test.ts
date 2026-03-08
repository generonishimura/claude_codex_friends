import { describe, it, expect } from 'vitest'
import { parseMode, DEFAULTS } from '../../config/index.js'

describe('parseMode', () => {
  describe('ランチャーモード', () => {
    it('引数なしでランチャーモードになる', () => {
      const result = parseMode([])
      expect(result.mode).toBe('launcher')
    })

    it('オプションのみでタスク未指定の場合もランチャーモードになる', () => {
      const result = parseMode(['-l', 'typescript'])
      expect(result.mode).toBe('launcher')
    })
  })

  describe('REPLモード', () => {
    it('--repl でREPLモードになる', () => {
      const result = parseMode(['--repl'])
      expect(result.mode).toBe('repl')
    })

    it('--repl でデフォルト値が設定される', () => {
      const result = parseMode(['--repl'])
      if (result.mode !== 'repl') throw new Error('expected repl mode')
      expect(result.maxIterations).toBe(DEFAULTS.maxIterations)
      expect(result.timeoutMs).toBe(DEFAULTS.timeoutMs)
      expect(result.pollIntervalMs).toBe(DEFAULTS.pollIntervalMs)
      expect(result.language).toBeUndefined()
    })

    it('--repl と -l で言語が設定される', () => {
      const result = parseMode(['--repl', '-l', 'python'])
      if (result.mode !== 'repl') throw new Error('expected repl mode')
      expect(result.language).toBe('python')
    })
  })

  describe('自動ループモード', () => {
    it('タスク指定で自動ループモードになる', () => {
      const result = parseMode(['FizzBuzzを実装して'])
      expect(result.mode).toBe('auto')
    })

    it('タスクとオプションが正しくパースされる', () => {
      const result = parseMode([
        'Sort array', '-l', 'typescript', '-o', 'sort.ts', '-m', '3',
      ])
      if (result.mode !== 'auto') throw new Error('expected auto mode')
      expect(result.config.task).toBe('Sort array')
      expect(result.config.language).toBe('typescript')
      expect(result.config.outputPath).toBe('sort.ts')
      expect(result.config.maxIterations).toBe(3)
    })

    it('-t でタイムアウトが秒→ミリ秒に変換される', () => {
      const result = parseMode(['task', '-t', '120'])
      if (result.mode !== 'auto') throw new Error('expected auto mode')
      expect(result.config.timeoutMs).toBe(120000)
    })

    it('--poll-interval でポーリング間隔が設定される', () => {
      const result = parseMode(['task', '--poll-interval', '5000'])
      if (result.mode !== 'auto') throw new Error('expected auto mode')
      expect(result.config.pollIntervalMs).toBe(5000)
    })

    it('--keep-session フラグが反映される', () => {
      const result = parseMode(['task', '--keep-session'])
      if (result.mode !== 'auto') throw new Error('expected auto mode')
      expect(result.config.keepSession).toBe(true)
    })

    it('--log でログパスが設定される', () => {
      const result = parseMode(['task', '--log', '/tmp/log.json'])
      if (result.mode !== 'auto') throw new Error('expected auto mode')
      expect(result.config.logPath).toBe('/tmp/log.json')
    })

    it('デフォルト値が正しく設定される', () => {
      const result = parseMode(['task'])
      if (result.mode !== 'auto') throw new Error('expected auto mode')
      expect(result.config.maxIterations).toBe(DEFAULTS.maxIterations)
      expect(result.config.timeoutMs).toBe(DEFAULTS.timeoutMs)
      expect(result.config.pollIntervalMs).toBe(DEFAULTS.pollIntervalMs)
      expect(result.config.sessionName).toBe(DEFAULTS.sessionName)
      expect(result.config.keepSession).toBe(false)
    })

    it('複数の位置引数がスペース結合でタスクになる', () => {
      const result = parseMode(['Quick', 'sort', 'in', 'Python'])
      if (result.mode !== 'auto') throw new Error('expected auto mode')
      expect(result.config.task).toBe('Quick sort in Python')
    })

    it('不明なオプションフラグは無視される', () => {
      const result = parseMode(['task', '--unknown-flag'])
      expect(result.mode).toBe('auto')
    })
  })
})
