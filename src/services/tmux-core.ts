import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Result } from '../domain/types.js'
import { ok, err } from '../domain/types.js'

const execFileAsync = promisify(execFile)

/** tmux コマンドを実行する */
export async function tmux(...args: string[]): Promise<Result<string>> {
  try {
    const { stdout } = await execFileAsync('tmux', args)
    return ok(stdout)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err({ code: 'TMUX_COMMAND_FAILED', message })
  }
}

/** 指定ミリ秒待機する */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
