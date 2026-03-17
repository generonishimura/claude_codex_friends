import type { LoopState } from './loop.types.js'

/** 言語名からファイル拡張子を解決する */
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  python: 'py',
  go: 'go',
  rust: 'rs',
  java: 'java',
  ruby: 'rb',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  swift: 'swift',
  kotlin: 'kt',
  php: 'php',
  shell: 'sh',
  bash: 'sh',
}

export function resolveFileExtension(language?: string): string {
  if (!language) return 'txt'
  return LANGUAGE_EXTENSIONS[language.toLowerCase()] ?? 'txt'
}

/** ANSIエスケープコードを除去する */
export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

/** プレースホルダを値で置換する */
function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

/** 初回コード生成プロンプトを構築する */
export function buildInitialPrompt(task: string, language?: string, customTemplate?: string): string {
  if (customTemplate) {
    return applyTemplate(customTemplate, { task, language: language ?? '' })
  }
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
  customTemplate?: string,
): string {
  const cleanReview = review.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  if (customTemplate) {
    return applyTemplate(customTemplate, { task, codeFilePath, review: cleanReview })
  }
  return `${codeFilePath} のコードにレビュー指摘がありました。指摘を反映して修正し、ファイルを更新してください。タスク: ${task} レビュー指摘: ${cleanReview}`
}

/** コードレビュープロンプト(ファイル参照版)を構築する */
export function buildReviewPrompt(task: string, codeFilePath: string, customTemplate?: string): string {
  if (customTemplate) {
    return applyTemplate(customTemplate, { task, codeFilePath })
  }
  return `${codeFilePath} のコードをレビューしてください。タスク: ${task} 問題がなければ "APPROVED" と記載してください。修正が必要な場合は具体的な改善点を記載してください。`
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
  /not\s+approved/i,             // "not approved", "NOT APPROVED"
  /cannot\s+approve/i,           // "cannot approve"
  /can't\s+approve/i,            // "can't approve"
  /approved\s*ではありません/i,  // "APPROVED ではありません"
  /approved\s*ではない/i,        // "APPROVEDではない"
  /approved\s*できません/i,      // "APPROVEDできません"
  /承認できません/,               // "承認できません"
  /未\s*承認/,                    // "未承認"
]

/** 承認を示すパターン */
const APPROVAL_PATTERNS = [
  /approved/i,                   // "APPROVED", "Approved"
  /\blgtm\b/i,                   // "LGTM"
  /looks\s+good/i,               // "Looks good", "looks good to me"
  /承認/,                         // "承認します"
  /問題ありません/,               // "問題ありません"
]

/** レビュー結果が承認かどうか判定する */
export function isApproved(reviewText: string): boolean {
  // 否定文脈を先にチェック
  if (NEGATION_PATTERNS.some(pattern => pattern.test(reviewText))) {
    return false
  }
  return APPROVAL_PATTERNS.some(pattern => pattern.test(reviewText))
}

/** CLI応答完了のプロンプトパターン */
const COMPLETION_PATTERNS = [
  /❯/,                  // Claude Code の入力プロンプト
  /›/,                  // Codex の入力プロンプト (U+203A)
  />\s*$/,              // 一般的なCLI入力プロンプト
  /\$\s*$/,             // シェルプロンプトフォールバック
  /\?\s+for shortcuts/, // Claude Code のヘルプヒント
]

/** ペインの出力が CLI の応答完了状態かどうか判定する */
export function isCompletionState(paneOutput: string): boolean {
  const cleaned = stripAnsiCodes(paneOutput).trimEnd()
  // 最後の数行だけチェック（中間出力の誤検知を防ぐ）
  const lastLines = cleaned.split('\n').slice(-5).join('\n')
  return COMPLETION_PATTERNS.some(pattern => pattern.test(lastLines))
}

/** CLIのプロンプト行やアーティファクト行のパターン（レビュー抽出時に除去する） */
const CLI_NOISE_PATTERNS = [
  /^[❯›>$%#]\s*$/,                  // プロンプト記号のみの行
  /^[❯›]\s+\S/,                     // › or ❯ に続くユーザー入力行（送信プロンプト）
  /^\s*\?\s+for\s+shortcuts/,       // Claude Code のヒント行
  /Welcome to .* CLI/i,             // CLI起動メッセージ
  /^[❯›>]\s*(codex|claude)\s*$/i,   // CLI名のみの行
]

/** capture-pane の生出力からレビュー本文を抽出する */
export function extractReviewFromResponse(rawOutput: string): string {
  const cleaned = stripAnsiCodes(rawOutput)
  const lines = cleaned.split('\n')

  const filteredLines = lines.filter(line => {
    return !CLI_NOISE_PATTERNS.some(pattern => pattern.test(line))
  })

  return filteredLines.join('\n').trim()
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
    // 最後のコードブロックを採用（LLMは最終回答を末尾に出す傾向がある）
    return blocks[blocks.length - 1]
  }

  // 2. フォールバック: Claude Code の ⏺ マーカー以降のコードを抽出
  const markerMatch = cleaned.match(/⏺\s*([\s\S]+?)(?:\n─|$)/)
  if (markerMatch) {
    const code = markerMatch[1].trim()
    if (code.length > 0) return code
  }

  return null
}
