/** REPL コマンドの補完リスト */
const COMMANDS = [
  '/status',
  '/history',
  '/last',
  '/help',
  '/exit',
  '/accept',
  '/reject',
  '/continue',
  '/save',
]

const AT_COMMANDS = [
  '@claude',
  '@codex',
]

/** readline 用の補完関数 */
export function completer(line: string): [string[], string] {
  if (line.startsWith('/')) {
    const hits = COMMANDS.filter(cmd => cmd.startsWith(line))
    return [hits, line]
  }

  if (line.startsWith('@')) {
    const hits = AT_COMMANDS.filter(cmd => cmd.startsWith(line))
    return [hits, line]
  }

  return [[], line]
}
