import type { Result, DomainError } from './types.js'
import { ok, err } from './types.js'

export const VALID_SET_KEYS = ['language', 'max-iterations', 'output', 'prompt-initial', 'prompt-review', 'prompt-fix'] as const
export type SetKey = (typeof VALID_SET_KEYS)[number]

/** /set コマンドのキーと値をバリデーションする */
export function validateSetCommand(
  key: string,
  value: string,
): Result<{ key: SetKey; value: string }, DomainError> {
  if (!VALID_SET_KEYS.includes(key as SetKey)) {
    return err({
      code: 'INVALID_SET_KEY',
      message: `無効な設定キー: ${key} (有効: ${VALID_SET_KEYS.join(', ')})`,
    })
  }

  if (key === 'max-iterations') {
    const n = parseInt(value, 10)
    if (isNaN(n) || n <= 0) {
      return err({
        code: 'INVALID_SET_VALUE',
        message: `max-iterations は1以上の正の整数を指定してください (現在値: ${value})`,
      })
    }
  }

  return ok({ key: key as SetKey, value })
}
