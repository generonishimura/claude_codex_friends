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

/** レビュー指摘に基づく修正プロンプトを構築する */
export function buildFixPrompt(
  task: string,
  code: string,
  review: string,
): string {
  return [
    '以下のコードにレビュー指摘がありました。指摘を反映して修正してください。',
    'コードはマークダウンのコードブロック(```)で囲んで出力してください。',
    `\nタスク: ${task}`,
    `\n現在のコード:\n\`\`\`\n${code}\n\`\`\``,
    `\nレビュー指摘:\n${review}`,
  ].join('\n')
}

/** コードレビュープロンプトを構築する */
export function buildReviewPrompt(task: string, code: string): string {
  return [
    '以下のコードをレビューしてください。',
    `\nタスク: ${task}`,
    `\nコード:\n\`\`\`\n${code}\n\`\`\``,
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

/** レビュー結果が承認かどうか判定する */
export function isApproved(reviewText: string): boolean {
  return /approved/i.test(reviewText)
}

/** レスポンスからコードブロックを抽出する */
export function extractCodeFromResponse(rawOutput: string): string | null {
  const cleaned = stripAnsiCodes(rawOutput)
  const codeBlockRegex = /```(?:\w*)\n([\s\S]*?)```/g
  const blocks: string[] = []

  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    blocks.push(match[1].trim())
  }

  if (blocks.length === 0) return null

  // 最も長いブロックを返す
  return blocks.reduce((longest, current) =>
    current.length > longest.length ? current : longest
  )
}
