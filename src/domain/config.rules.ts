import type { Result, DomainError } from './types.js'
import { ok, err } from './types.js'
import { ERRORS } from './errors.js'

interface NumericOptions {
  maxIterations: number
  timeoutMs: number
  pollIntervalMs: number
}

/** 数値オプションをバリデーションする */
export function validateNumericOptions(options: NumericOptions): Result<void, DomainError> {
  const checks: Array<[string, number]> = [
    ['maxIterations', options.maxIterations],
    ['timeoutMs', options.timeoutMs],
    ['pollIntervalMs', options.pollIntervalMs],
  ]

  for (const [name, value] of checks) {
    if (!Number.isInteger(value) || value < 1) {
      return err(ERRORS.INVALID_CONFIG(`${name} は1以上の正の整数を指定してください (現在値: ${value})`))
    }
  }

  return ok(undefined)
}
