import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Result, DomainError } from '../../domain/types.js'

// execFileAsync をモックする
const mockExecFileAsync = vi.fn()
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFileAsync(...args),
}))
vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
}))

// モック設定後にインポート
const { checkCliAvailable } = await import('../../services/tmux-session.service.js')

describe('checkCliAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('コマンドが存在する場合は ok を返す', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/claude\n' })

    const result = await checkCliAvailable('claude')

    expect(result.ok).toBe(true)
  })

  it('コマンドが存在しない場合は修正方法を含むエラーを返す', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('not found'))

    const result = await checkCliAvailable('claude')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CLI_NOT_FOUND')
      expect(result.error.message).toContain('claude')
      expect(result.error.message).toContain('which claude')
    }
  })

  it('codex が存在しない場合も修正方法を含むエラーを返す', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('not found'))

    const result = await checkCliAvailable('codex')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CLI_NOT_FOUND')
      expect(result.error.message).toContain('codex')
    }
  })
})
