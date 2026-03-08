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
  if (trimmed === '/history') return { type: 'history' }
  if (trimmed === '/last') return { type: 'last' }
  if (trimmed === '/help') return { type: 'help' }
  if (trimmed === '/exit') return { type: 'exit' }
  if (trimmed === '/accept') return { type: 'accept' }
  if (trimmed === '/reject') return { type: 'reject' }

  if (trimmed.startsWith('/continue')) {
    const arg = trimmed.slice('/continue'.length).trim()
    const n = parseInt(arg, 10)
    return { type: 'continue', payload: Number.isNaN(n) ? undefined : n }
  }

  if (trimmed.startsWith('/save')) {
    const arg = trimmed.slice('/save'.length).trim()
    return { type: 'save', payload: arg || undefined }
  }

  return { type: 'task', payload: trimmed }
}
