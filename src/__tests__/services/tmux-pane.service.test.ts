import { describe, it, expect, vi } from 'vitest'
import type { Result, DomainError } from '../../domain/types.js'
import { ok, err } from '../../domain/types.js'
import { withRetry } from '../../services/tmux-pane.service.js'

describe('withRetry', () => {
  it('最初の呼び出しが成功したらリトライしない', async () => {
    const fn = vi.fn<() => Promise<Result<string, DomainError>>>()
      .mockResolvedValueOnce(ok('success'))

    const result = await withRetry(fn, 3, 0)

    expect(result).toEqual(ok('success'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('失敗後にリトライして成功する', async () => {
    const fn = vi.fn<() => Promise<Result<string, DomainError>>>()
      .mockResolvedValueOnce(err({ code: 'FAIL', message: 'first' }))
      .mockResolvedValueOnce(ok('recovered'))

    const result = await withRetry(fn, 2, 0)

    expect(result).toEqual(ok('recovered'))
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('最大リトライ回数を超えたら最後のエラーを返す', async () => {
    const error: DomainError = { code: 'FAIL', message: 'persistent' }
    const fn = vi.fn<() => Promise<Result<string, DomainError>>>()
      .mockResolvedValue(err(error))

    const result = await withRetry(fn, 2, 0)

    expect(result).toEqual(err(error))
    // 初回 + リトライ2回 = 3回
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('リトライ0回の場合は1回だけ実行する', async () => {
    const error: DomainError = { code: 'FAIL', message: 'once' }
    const fn = vi.fn<() => Promise<Result<string, DomainError>>>()
      .mockResolvedValue(err(error))

    const result = await withRetry(fn, 0, 0)

    expect(result).toEqual(err(error))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('最後のリトライで成功する', async () => {
    const fn = vi.fn<() => Promise<Result<string, DomainError>>>()
      .mockResolvedValueOnce(err({ code: 'FAIL', message: '1' }))
      .mockResolvedValueOnce(err({ code: 'FAIL', message: '2' }))
      .mockResolvedValueOnce(ok('last-chance'))

    const result = await withRetry(fn, 2, 0)

    expect(result).toEqual(ok('last-chance'))
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
