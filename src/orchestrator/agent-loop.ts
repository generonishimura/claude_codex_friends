import { writeFile } from 'node:fs/promises'
import type { LoopConfig, LoopResult, IterationResult, CustomPrompts } from '../domain/loop.types.js'
import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { ERRORS } from '../domain/errors.js'
import { DEFAULTS } from '../config/index.js'
import {
  buildInitialPrompt,
  buildFixPrompt,
  buildReviewPrompt,
  shouldContinueLoop,
  isApproved as checkApproved,
  extractCodeFromResponse,
} from '../domain/loop.rules.js'
import {
  checkTmuxAvailable,
  createSession,
  destroySession,
  sessionExists,
  startClaude,
  startCodex,
  sendPrompt,
  capturePane,
  waitForCompletion,
  saveCodeToTempFile,
  cleanupTempFiles,
  withRetry,
} from '../services/tmux.service.js'
import {
  printBanner,
  printConfig,
  printIteration,
  printPhase,
  printApproved,
  printMaxIterationsReached,
  printError,
  printSaved,
  printSessionInfo,
} from '../ui/terminal.js'

/** ペインターゲット */
export interface LoopTargets {
  claude: string
  codex: string
}

/** ループ実行に必要な設定（セッション管理は含まない） */
export interface RunLoopConfig {
  task: string
  language?: string
  outputPath?: string
  maxIterations: number
  timeoutMs: number
  pollIntervalMs: number
  prompts?: CustomPrompts
}

/** ループのみを実行する（セッション管理は呼び出し元に任せる） */
export async function runLoop(
  config: RunLoopConfig,
  targets: LoopTargets,
): Promise<Result<LoopResult, DomainError>> {
  const iterations: IterationResult[] = []
  let currentCode: string | null = null
  let codeFilePath = ''
  let approved = false
  let iteration = 0

  while (
    shouldContinueLoop({
      iteration,
      maxIterations: config.maxIterations,
      approved,
      hasError: false,
    })
  ) {
    iteration++
    printIteration(iteration, config.maxIterations)

    // --- Claude にプロンプト送信 ---
    const isFirstIteration = iteration === 1

    let prompt: string
    if (isFirstIteration) {
      prompt = buildInitialPrompt(config.task, config.language, config.prompts?.initial)
    } else {
      const lastReview = iterations[iterations.length - 1]?.review ?? ''
      prompt = buildFixPrompt(config.task, codeFilePath, lastReview, config.prompts?.fix)
    }

    printPhase(isFirstIteration ? 'generate' : 'fix')

    // 送信前のベースライン取得
    const claudeBaseline = await capturePane(targets.claude)
    const claudeBaselineText = claudeBaseline.ok ? claudeBaseline.value : ''

    const sendClaudeResult = await sendPrompt(targets.claude, prompt)
    if (!sendClaudeResult.ok) {
      printError(sendClaudeResult.error.message)
      break
    }

    // Claude の応答を待つ（リトライ付き）
    const claudeResponse = await withRetry(() =>
      waitForCompletion(
        targets.claude,
        config.timeoutMs,
        config.pollIntervalMs,
        claudeBaselineText,
      )
    )
    if (!claudeResponse.ok) {
      printError(claudeResponse.error.message)
      break
    }

    // コードを抽出 — capture-pane の全テキストから直接抽出
    const extractedCode = extractCodeFromResponse(claudeResponse.value)
    if (!extractedCode) {
      printError(ERRORS.CODE_EXTRACTION_FAILED.message)
      iterations.push({ iteration, code: null, review: null, approved: false })
      break
    }
    currentCode = extractedCode

    // コードを一時ファイルに保存（CLIからファイルパスで参照可能にする）
    const ext = config.language === 'python' ? 'py' : config.language === 'go' ? 'go' : 'ts'
    codeFilePath = await saveCodeToTempFile(currentCode, `code_iter${iteration}.${ext}`)

    // --- Codex にレビュー送信 ---
    printPhase('review')

    const reviewPrompt = buildReviewPrompt(config.task, codeFilePath, config.prompts?.review)

    // 送信前のベースライン取得
    const codexBaseline = await capturePane(targets.codex)
    const codexBaselineText = codexBaseline.ok ? codexBaseline.value : ''

    const sendCodexResult = await sendPrompt(targets.codex, reviewPrompt)
    if (!sendCodexResult.ok) {
      printError(sendCodexResult.error.message)
      break
    }

    // Codex の応答を待つ（リトライ付き）
    const codexResponse = await withRetry(() =>
      waitForCompletion(
        targets.codex,
        config.timeoutMs,
        config.pollIntervalMs,
        codexBaselineText,
      )
    )
    if (!codexResponse.ok) {
      printError(codexResponse.error.message)
      break
    }

    // レビュー全文から承認判定
    approved = checkApproved(codexResponse.value)

    iterations.push({
      iteration,
      code: currentCode,
      review: codexResponse.value,
      approved,
    })

    if (approved) {
      printApproved()
    }
  }

  if (!approved && iteration >= config.maxIterations) {
    printMaxIterationsReached(config.maxIterations)
  }

  // 最終コードを保存
  if (currentCode && config.outputPath) {
    try {
      await writeFile(config.outputPath, currentCode, 'utf-8')
      printSaved(config.outputPath)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      printError(`ファイル保存に失敗: ${message}`)
    }
  }

  // 一時ファイルのクリーンアップ
  await cleanupTempFiles()

  return ok({
    finalCode: currentCode,
    iterations,
    approved,
    totalIterations: iteration,
  })
}

/** エージェントループを実行する（セッション作成 → CLI起動 → ループ → 結果返却） */
export async function runAgentLoop(
  config: LoopConfig & { sessionName: string; keepSession?: boolean; logPath?: string }
): Promise<Result<LoopResult, DomainError>> {
  printBanner()
  printConfig(config.task, config.language, config.maxIterations)

  // tmux の存在確認
  const tmuxCheck = await checkTmuxAvailable()
  if (!tmuxCheck.ok) {
    printError(tmuxCheck.error.message)
    return err(tmuxCheck.error)
  }

  // 既存セッションがあれば破棄
  if (await sessionExists(config.sessionName)) {
    await destroySession(config.sessionName)
  }

  // セッション作成
  const sessionResult = await createSession(config.sessionName)
  if (!sessionResult.ok) {
    printError(sessionResult.error.message)
    return err(sessionResult.error)
  }

  printSessionInfo(config.sessionName)

  const claudeTarget = `${config.sessionName}:0.0`
  const codexTarget = `${config.sessionName}:0.1`

  // Claude CLI を起動
  const claudeStart = await startClaude(claudeTarget)
  if (!claudeStart.ok) {
    printError(claudeStart.error.message)
    await destroySession(config.sessionName)
    return err(claudeStart.error)
  }

  // Codex CLI を起動
  const codexStart = await startCodex(codexTarget)
  if (!codexStart.ok) {
    printError(codexStart.error.message)
    await destroySession(config.sessionName)
    return err(codexStart.error)
  }

  // CLIの起動完了を待つ
  console.log('Claude CLI の起動を待機中...')
  const claudeReady = await waitForCompletion(
    claudeTarget,
    config.timeoutMs,
    config.pollIntervalMs,
    '',
    DEFAULTS.cliStartupDelayMs,
  )
  if (!claudeReady.ok) {
    printError(`Claude CLI の起動に失敗: ${claudeReady.error.message}`)
    await destroySession(config.sessionName)
    return err(claudeReady.error)
  }

  console.log('Codex CLI の起動を待機中...')
  const codexReady = await waitForCompletion(
    codexTarget,
    config.timeoutMs,
    config.pollIntervalMs,
    '',
    DEFAULTS.cliStartupDelayMs,
    true, // autoAcceptTrust
  )
  if (!codexReady.ok) {
    printError(`Codex CLI の起動に失敗: ${codexReady.error.message}`)
    await destroySession(config.sessionName)
    return err(codexReady.error)
  }

  // ループ実行
  const result = await runLoop(config, { claude: claudeTarget, codex: codexTarget })

  // イテレーション履歴をログファイルに保存
  if (config.logPath && result.ok) {
    try {
      const logData = {
        task: config.task,
        language: config.language,
        timestamp: new Date().toISOString(),
        ...result.value,
      }
      await writeFile(config.logPath, JSON.stringify(logData, null, 2), 'utf-8')
      console.log(`ログを保存しました: ${config.logPath}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      printError(`ログ保存に失敗: ${message}`)
    }
  }

  // セッション管理
  if (config.keepSession) {
    console.log(`\ntmux セッション "${config.sessionName}" は残しています。`)
    console.log(`確認後、tmux kill-session -t ${config.sessionName} で削除してください。`)
  } else {
    await destroySession(config.sessionName)
    console.log(`\ntmux セッション "${config.sessionName}" を削除しました。`)
  }

  return result
}
