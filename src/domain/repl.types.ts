/** REPLコマンドの型定義 */
export type ReplCommand =
  | { type: 'task'; payload: string }
  | { type: 'claude'; payload: string }
  | { type: 'codex'; payload: string }
  | { type: 'status' }
  | { type: 'help' }
  | { type: 'exit' }
