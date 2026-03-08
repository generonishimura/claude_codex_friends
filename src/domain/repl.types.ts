/** REPLコマンドの型定義 */
export type ReplCommand =
  | { type: 'task'; payload: string }
  | { type: 'claude'; payload: string }
  | { type: 'codex'; payload: string }
  | { type: 'continue'; payload: number | undefined }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'save'; payload: string | undefined }
  | { type: 'status' }
  | { type: 'history' }
  | { type: 'last' }
  | { type: 'help' }
  | { type: 'exit' }
