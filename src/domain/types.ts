/** 汎用 Result 型 */
export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

/** ドメインエラー */
export interface DomainError {
  code: string
  message: string
}
