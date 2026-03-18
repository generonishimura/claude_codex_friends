/** ターミナルUI表示ユーティリティ */

import type { AskUserContext } from '../domain/engine.types.js'

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
} as const

export function printBanner(): void {
  console.log(`
${COLORS.cyan}${COLORS.bold}=== Claude x Codex Friends ===${COLORS.reset}
${COLORS.dim}AI対話型コード生成・レビューツール${COLORS.reset}
`)
}

export function printConfig(task: string, language?: string, maxIterations?: number): void {
  console.log(`${COLORS.blue}タスク:${COLORS.reset} ${task}`)
  if (language) console.log(`${COLORS.blue}言語:${COLORS.reset} ${language}`)
  if (maxIterations) console.log(`${COLORS.blue}最大イテレーション:${COLORS.reset} ${maxIterations}`)
  console.log()
}

export function printIteration(iteration: number, maxIterations: number): void {
  console.log(`${COLORS.magenta}${COLORS.bold}--- イテレーション ${iteration}/${maxIterations} ---${COLORS.reset}`)
}

export function printPhase(phase: 'generate' | 'review' | 'fix'): void {
  const labels = {
    generate: `${COLORS.green}[Claude] コード生成中...${COLORS.reset}`,
    review: `${COLORS.yellow}[Codex] レビュー中...${COLORS.reset}`,
    fix: `${COLORS.green}[Claude] 修正中...${COLORS.reset}`,
  }
  console.log(labels[phase])
}

export function printApproved(): void {
  console.log(`\n${COLORS.green}${COLORS.bold}APPROVED! レビューが承認されました。${COLORS.reset}\n`)
}

export function printMaxIterationsReached(max: number): void {
  console.log(`\n${COLORS.yellow}最大イテレーション数 (${max}) に到達しました。${COLORS.reset}\n`)
}

export function printError(message: string): void {
  console.error(`${COLORS.red}エラー: ${message}${COLORS.reset}`)
}

export function printSaved(path: string): void {
  console.log(`${COLORS.green}コードを保存しました: ${path}${COLORS.reset}`)
}

export function printSessionInfo(sessionName: string): void {
  console.log(`${COLORS.dim}tmux セッション: ${sessionName}`)
  console.log(`別ターミナルから監視: tmux attach-session -t ${sessionName}${COLORS.reset}\n`)
}

export function printReplBanner(): void {
  console.log(`
${COLORS.cyan}${COLORS.bold}=== Claude x Codex Friends — Interactive Mode ===${COLORS.reset}
${COLORS.dim}タスクを入力すると Claude→Codex の自動レビューループが開始されます${COLORS.reset}
${COLORS.dim}/help でコマンド一覧を表示${COLORS.reset}
`)
}

export function printReplHelp(): void {
  console.log(`
${COLORS.cyan}コマンド一覧:${COLORS.reset}
  ${COLORS.bold}<テキスト>${COLORS.reset}         タスクとしてClaude→Codexの自動ループを開始
  ${COLORS.bold}@claude <msg>${COLORS.reset}     Claudeペインに直接テキスト送信
  ${COLORS.bold}@codex <msg>${COLORS.reset}      Codexペインに直接テキスト送信

${COLORS.cyan}ループ制御（ループ一時停止中に使用）:${COLORS.reset}
  ${COLORS.bold}/continue [n]${COLORS.reset}     ループを追加 n 回継続（デフォルト: 現在の最大回数）
  ${COLORS.bold}/accept${COLORS.reset}            現在のコードをそのまま承認して終了
  ${COLORS.bold}/reject${COLORS.reset}            コードを破棄して終了

${COLORS.cyan}設定:${COLORS.reset}
  ${COLORS.bold}/set${COLORS.reset}                現在の設定を表示
  ${COLORS.bold}/set <key> <value>${COLORS.reset}  設定を変更 (language, max-iterations, output)

${COLORS.cyan}情報・管理:${COLORS.reset}
  ${COLORS.bold}/save [path]${COLORS.reset}       前回の結果をファイルに保存
  ${COLORS.bold}/status${COLORS.reset}            両ペインの現在状態を表示
  ${COLORS.bold}/history${COLORS.reset}           実行履歴を表示
  ${COLORS.bold}/last [--full]${COLORS.reset}      前回の実行結果を表示（--full で全文）
  ${COLORS.bold}/help${COLORS.reset}              このヘルプを表示
  ${COLORS.bold}/exit${COLORS.reset}              セッション終了
`)
}

export function printAskUser(context: AskUserContext): void {
  const reasonLabels: Record<string, string> = {
    iteration_limit: `最大イテレーション (${context.maxIterations}回) に到達しました`,
    stuck: '同じ指摘が繰り返されています（堂々巡り検出）',
    error_recovery: 'エラーが発生しました',
  }

  console.log(`
${COLORS.yellow}${COLORS.bold}--- ループ一時停止 ---${COLORS.reset}
${COLORS.yellow}理由: ${reasonLabels[context.reason] ?? context.reason}${COLORS.reset}
${COLORS.dim}現在 ${context.iteration}/${context.maxIterations} イテレーション完了${COLORS.reset}
`)

  if (context.lastReview) {
    const preview = context.lastReview.length > 200
      ? context.lastReview.slice(0, 200) + '...'
      : context.lastReview
    console.log(`${COLORS.dim}直近のレビュー:${COLORS.reset}`)
    console.log(`${COLORS.dim}${preview}${COLORS.reset}\n`)
  }

  console.log(`${COLORS.cyan}選択肢:${COLORS.reset}
  ${COLORS.bold}/continue [n]${COLORS.reset}  ループを n 回追加して継続
  ${COLORS.bold}/accept${COLORS.reset}         現在のコードで完了
  ${COLORS.bold}/reject${COLORS.reset}         破棄して終了
`)
}

export function printReplHistory(entries: Array<{ task: string; approved: boolean; iterations: number }>): void {
  if (entries.length === 0) {
    console.log(`${COLORS.dim}実行履歴がありません。${COLORS.reset}`)
    return
  }
  console.log(`\n${COLORS.cyan}${COLORS.bold}実行履歴:${COLORS.reset}`)
  entries.forEach((entry, i) => {
    const status = entry.approved
      ? `${COLORS.green}APPROVED${COLORS.reset}`
      : `${COLORS.yellow}未承認${COLORS.reset}`
    console.log(`  ${i + 1}. ${entry.task} [${status}] (${entry.iterations}回)`)
  })
  console.log()
}

/** コードを指定行数で省略する */
export function truncateCode(code: string, maxLines: number): string {
  const lines = code.split('\n')
  if (lines.length <= maxLines) return code
  const truncated = lines.slice(0, maxLines).join('\n')
  const remaining = lines.length - maxLines
  return `${truncated}\n${COLORS.dim}...省略 (残り${remaining}行。/last --full で全文表示)${COLORS.reset}`
}

export function printReplLastResult(
  result: { task: string; approved: boolean; iterations: number; finalCode: string | null } | null,
  fullMode: boolean = false,
): void {
  if (!result) {
    console.log(`${COLORS.dim}前回の実行結果がありません。${COLORS.reset}`)
    return
  }
  const status = result.approved
    ? `${COLORS.green}APPROVED${COLORS.reset}`
    : `${COLORS.yellow}未承認${COLORS.reset}`
  console.log(`
${COLORS.cyan}${COLORS.bold}前回の実行結果:${COLORS.reset}
  タスク: ${result.task}
  ステータス: ${status}
  イテレーション: ${result.iterations}回
`)
  if (result.finalCode) {
    console.log(`${COLORS.dim}--- コード ---${COLORS.reset}`)
    console.log(fullMode ? result.finalCode : truncateCode(result.finalCode, 10))
    console.log(`${COLORS.dim}--- ここまで ---${COLORS.reset}\n`)
  }
}

export function printReplStatus(claudeOutput: string, codexOutput: string): void {
  const lastLines = (text: string, n: number): string =>
    text.split('\n').slice(-n).join('\n')

  console.log(`
${COLORS.green}${COLORS.bold}[Claude] 最新出力:${COLORS.reset}
${COLORS.dim}${lastLines(claudeOutput, 5)}${COLORS.reset}

${COLORS.yellow}${COLORS.bold}[Codex] 最新出力:${COLORS.reset}
${COLORS.dim}${lastLines(codexOutput, 5)}${COLORS.reset}
`)
}
