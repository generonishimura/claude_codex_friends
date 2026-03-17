import { describe, it, expect } from 'vitest'
import { parseMode, DEFAULTS } from '../../config/index.js'

describe('parseMode', () => {
  describe('ランチャーモード', () => {
    it('引数なしでランチャーモードになる', () => {
      const result = parseMode([])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.value.mode).toBe('launcher')
    })

    it('オプションのみでタスク未指定の場合もランチャーモードになる', () => {
      const result = parseMode(['-l', 'typescript'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.value.mode).toBe('launcher')
    })
  })

  describe('REPLモード', () => {
    it('--repl でREPLモードになる', () => {
      const result = parseMode(['--repl'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.value.mode).toBe('repl')
    })

    it('--repl でデフォルト値が設定される', () => {
      const result = parseMode(['--repl'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'repl') throw new Error('expected repl mode')
      expect(mode.maxIterations).toBe(DEFAULTS.maxIterations)
      expect(mode.timeoutMs).toBe(DEFAULTS.timeoutMs)
      expect(mode.pollIntervalMs).toBe(DEFAULTS.pollIntervalMs)
      expect(mode.language).toBeUndefined()
    })

    it('--repl と -l で言語が設定される', () => {
      const result = parseMode(['--repl', '-l', 'python'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'repl') throw new Error('expected repl mode')
      expect(mode.language).toBe('python')
    })
  })

  describe('自動ループモード', () => {
    it('タスク指定で自動ループモードになる', () => {
      const result = parseMode(['FizzBuzzを実装して'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.value.mode).toBe('auto')
    })

    it('タスクとオプションが正しくパースされる', () => {
      const result = parseMode([
        'Sort array', '-l', 'typescript', '-o', 'sort.ts', '-m', '3',
      ])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'auto') throw new Error('expected auto mode')
      expect(mode.config.task).toBe('Sort array')
      expect(mode.config.language).toBe('typescript')
      expect(mode.config.outputPath).toBe('sort.ts')
      expect(mode.config.maxIterations).toBe(3)
    })

    it('-t でタイムアウトが秒→ミリ秒に変換される', () => {
      const result = parseMode(['task', '-t', '120'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'auto') throw new Error('expected auto mode')
      expect(mode.config.timeoutMs).toBe(120000)
    })

    it('--poll-interval でポーリング間隔が設定される', () => {
      const result = parseMode(['task', '--poll-interval', '5000'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'auto') throw new Error('expected auto mode')
      expect(mode.config.pollIntervalMs).toBe(5000)
    })

    it('--keep-session フラグが反映される', () => {
      const result = parseMode(['task', '--keep-session'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'auto') throw new Error('expected auto mode')
      expect(mode.config.keepSession).toBe(true)
    })

    it('--log でログパスが設定される', () => {
      const result = parseMode(['task', '--log', '/tmp/log.json'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'auto') throw new Error('expected auto mode')
      expect(mode.config.logPath).toBe('/tmp/log.json')
    })

    it('デフォルト値が正しく設定される', () => {
      const result = parseMode(['task'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'auto') throw new Error('expected auto mode')
      expect(mode.config.maxIterations).toBe(DEFAULTS.maxIterations)
      expect(mode.config.timeoutMs).toBe(DEFAULTS.timeoutMs)
      expect(mode.config.pollIntervalMs).toBe(DEFAULTS.pollIntervalMs)
      expect(mode.config.sessionName).toBe(DEFAULTS.sessionName)
      expect(mode.config.keepSession).toBe(false)
    })

    it('複数の位置引数がスペース結合でタスクになる', () => {
      const result = parseMode(['Quick', 'sort', 'in', 'Python'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      const mode = result.value
      if (mode.mode !== 'auto') throw new Error('expected auto mode')
      expect(mode.config.task).toBe('Quick sort in Python')
    })

    it('不明なオプションフラグは無視される', () => {
      const result = parseMode(['task', '--unknown-flag'])
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.value.mode).toBe('auto')
    })
  })

  describe('バリデーションエラー', () => {
    it('-m 0 でエラーを返す', () => {
      const result = parseMode(['task', '-m', '0'])
      expect(result.ok).toBe(false)
    })
    it('-m abc でエラーを返す (NaN)', () => {
      const result = parseMode(['task', '-m', 'abc'])
      expect(result.ok).toBe(false)
    })
    it('-t -1 でエラーを返す', () => {
      const result = parseMode(['task', '-t', '-1'])
      expect(result.ok).toBe(false)
    })
    it('--poll-interval 0 でエラーを返す', () => {
      const result = parseMode(['task', '--poll-interval', '0'])
      expect(result.ok).toBe(false)
    })
  })
})
