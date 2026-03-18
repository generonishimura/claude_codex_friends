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
  '/set',
  '/export',
]

const SET_KEYS = [
  'language',
  'max-iterations',
  'output',
  'prompt-initial',
  'prompt-review',
  'prompt-fix',
]

const AT_COMMANDS = [
  '@claude',
  '@codex',
]

/** readline 用の補完関数 */
export function completer(line: string): [string[], string] {
  // /set <key> の補完
  if (line.startsWith('/set ')) {
    const partial = line.slice('/set '.length)
    const hits = SET_KEYS.filter(key => key.startsWith(partial)).map(key => `/set ${key}`)
    return [hits, line]
  }

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
