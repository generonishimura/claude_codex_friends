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
    const isPositiveInteger = /^[1-9]\d*$/.test(arg)
    return { type: 'continue', payload: isPositiveInteger ? Number(arg) : undefined }
  }

  if (trimmed.startsWith('/save')) {
    const arg = trimmed.slice('/save'.length).trim()
    return { type: 'save', payload: arg || undefined }
  }

  if (trimmed === '/set' || trimmed.startsWith('/set ')) {
    const parts = trimmed.slice('/set'.length).trim().split(/\s+/)
    if (parts.length >= 2 && parts[0]) {
      return { type: 'set', payload: { key: parts[0], value: parts.slice(1).join(' ') } }
    }
    return { type: 'set', payload: null }
  }

  return { type: 'task', payload: trimmed }
}
