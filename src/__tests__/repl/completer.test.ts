import { describe, it, expect } from 'vitest'
import { completer } from '../../repl/completer.js'

describe('completer', () => {
  it('/st で /status を補完する', () => {
    const [completions, line] = completer('/st')
    expect(completions).toEqual(['/status'])
    expect(line).toBe('/st')
  })

  it('/ で全コマンドリストを返す', () => {
    const [completions, line] = completer('/')
    expect(completions).toContain('/status')
    expect(completions).toContain('/help')
    expect(completions).toContain('/exit')
    expect(completions).toContain('/history')
    expect(completions).toContain('/last')
    expect(completions).toContain('/accept')
    expect(completions).toContain('/reject')
    expect(completions).toContain('/continue')
    expect(completions).toContain('/save')
    // /set は /set コマンド実装時に追加する
    expect(line).toBe('/')
  })

  it('コマンドでないテキストは空の補完を返す', () => {
    const [completions, line] = completer('hello')
    expect(completions).toEqual([])
    expect(line).toBe('hello')
  })

  it('/he で /help を補完する', () => {
    const [completions, line] = completer('/he')
    expect(completions).toEqual(['/help'])
    expect(line).toBe('/he')
  })

  it('/co で /continue を補完する', () => {
    const [completions, line] = completer('/co')
    expect(completions).toEqual(['/continue'])
    expect(line).toBe('/co')
  })

  it('@ で @claude と @codex を補完する', () => {
    const [completions, line] = completer('@')
    expect(completions).toContain('@claude')
    expect(completions).toContain('@codex')
    expect(line).toBe('@')
  })

  it('@cl で @claude を補完する', () => {
    const [completions, line] = completer('@cl')
    expect(completions).toEqual(['@claude'])
    expect(line).toBe('@cl')
  })

  it('空文字列は空の補完を返す', () => {
    const [completions, line] = completer('')
    expect(completions).toEqual([])
    expect(line).toBe('')
  })

  it('/sa で /save を補完する', () => {
    const [completions, line] = completer('/sa')
    expect(completions).toEqual(['/save'])
    expect(line).toBe('/sa')
  })

  it('完全一致のコマンドはそのまま返す', () => {
    const [completions, line] = completer('/status')
    expect(completions).toEqual(['/status'])
    expect(line).toBe('/status')
  })
})
