/** ターミナルUI表示ユーティリティ */

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
