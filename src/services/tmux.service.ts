/**
 * 後方互換性のための barrel re-export
 *
 * 各モジュールの実装は以下に分離済み:
 * - file.service.ts: ファイル管理（一時ファイル保存・削除）
 * - tmux-core.ts: tmux 共有ユーティリティ（コマンド実行・sleep）
 * - tmux-pane.service.ts: ペイン操作（プロンプト送信・キャプチャ・完了待機）
 * - tmux-session.service.ts: セッション管理（作成・破棄・CLI起動）
 */

export { saveCodeToTempFile, cleanupTempFiles } from './file.service.js'
export { sendPrompt, capturePane, waitForCompletion, withRetry } from './tmux-pane.service.js'
export {
  checkTmuxAvailable,
  createSession,
  createThreePaneSession,
  destroySession,
  sessionExists,
  waitForShellReady,
  startClaude,
  startCodex,
} from './tmux-session.service.js'
