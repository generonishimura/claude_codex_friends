import type { LoopState } from './loop.types.js'

/** ANSIエスケープコードを除去する */
export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

/** 初回コード生成プロンプトを構築する */
export function buildInitialPrompt(task: string, language?: string): string {
  const langPart = language ? `\n言語: ${language}` : ''
  return [
    '以下のタスクに対してコードを生成してください。',
    'コードはマークダウンのコードブロック(```)で囲んで出力してください。',
    `\nタスク: ${task}`,
    langPart,
  ].join('\n')
}

/** レビュー指摘に基づく修正プロンプト(ファイル参照版)を構築する */
export function buildFixPrompt(
  task: string,
  codeFilePath: string,
  review: string,
): string {
  const cleanReview = review.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${codeFilePath} のコードにレビュー指摘がありました。指摘を反映して修正し、ファイルを更新してください。タスク: ${task} レビュー指摘: ${cleanReview}`
}

/** コードレビュープロンプト(ファイル参照版)を構築する */
export function buildReviewPrompt(task: string, codeFilePath: string): string {
  return `${codeFilePath} のコードをレビューしてください。タスク: ${task} 問題がなければ "APPROVED" と記載してください。修正が必要な場合は具体的な改善点を記載してください。`
}

/** コードレビュープロンプト(インライン版)を構築する */
export function buildReviewPromptInline(task: string, code: string): string {
  return [
    '以下のコードをレビューしてください。',
    `\nタスク: ${task}`,
    `\n--- CODE START ---\n${code}\n--- CODE END ---`,
    '\n問題がなければ "APPROVED" と記載してください。',
    '修正が必要な場合は具体的な改善点を記載してください。',
  ].join('\n')
}

/** ループを継続すべきか判定する */
export function shouldContinueLoop(state: LoopState): boolean {
  if (state.approved) return false
  if (state.hasError) return false
  if (state.iteration >= state.maxIterations) return false
  return true
}

/** 否定文脈のパターン */
const NEGATION_PATTERNS = [
  /not\s+approved/i,       // "not approved", "NOT APPROVED"
  /approved\s*ではありません/i,  // "APPROVED ではありません"
  /approved\s*ではない/i,       // "APPROVEDではない"
  /approved\s*できません/i,     // "APPROVEDできません"
  /未\s*承認/,                  // "未承認"
]

/** レビュー結果が承認かどうか判定する */
export function isApproved(reviewText: string): boolean {
  // 否定文脈を先にチェック
  if (NEGATION_PATTERNS.some(pattern => pattern.test(reviewText))) {
    return false
  }
  return /approved/i.test(reviewText)
}

/** レスポンスからコードブロックを抽出する */
export function extractCodeFromResponse(rawOutput: string): string | null {
  const cleaned = stripAnsiCodes(rawOutput)

  // 1. マークダウンコードブロックから抽出を試みる
  const codeBlockRegex = /```(?:\w*)\n([\s\S]*?)```/g
  const blocks: string[] = []

  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    blocks.push(match[1].trim())
  }

  if (blocks.length > 0) {
    return blocks.reduce((longest, current) =>
      current.length > longest.length ? current : longest
    )
  }

  // 2. フォールバック: Claude Code の ⏺ マーカー以降のコードを抽出
  const markerMatch = cleaned.match(/⏺\s*([\s\S]+?)(?:\n─|$)/)
  if (markerMatch) {
    const code = markerMatch[1].trim()
    if (code.length > 0) return code
  }

  // 3. フォールバック: プロンプトと空行を除いた残りのテキストをコードとして扱う
  const lines = cleaned.split('\n')
  const codeLines = lines.filter(line => {
    const trimmed = line.trim()
    // 空行、プロンプト行、装飾行を除外
    if (!trimmed) return false
    if (/^[❯›>$]\s*/.test(trimmed)) return false
    if (/^[─═╭╰│┌└├┤┬┴┼╮╯┐┘]+$/.test(trimmed)) return false
    if (/^\?\s+for shortcuts/.test(trimmed)) return false
    return true
  })

  if (codeLines.length > 0) {
    return codeLines.join('\n').trim()
  }

  return null
}
