import type { ReplCommand } from '../domain/repl.types.js'

/** ユーザー入力をREPLコマンドにパースする */
export function parseCommand(input: string): ReplCommand {
  const trimmed = input.trim()

  if (trimmed.startsWith('@claude')) {
    return { type: 'claude', payload: trimmed.slice('@claude'.length).trim() }
  }

  if (trimmed.startsWith('@codex')) {
    return { type: 'codex', payload: trimmed.slice('@codex'.length).trim() }
  }

  if (trimmed === '/status') return { type: 'status' }
  if (trimmed === '/help') return { type: 'help' }
  if (trimmed === '/exit') return { type: 'exit' }

  return { type: 'task', payload: trimmed }
}
