import { writeFile } from 'node:fs/promises'
import type { LoopConfig, LoopResult, IterationResult } from '../domain/loop.types.js'
import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { ERRORS } from '../domain/errors.js'
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

/** エージェントループを実行する */
export async function runAgentLoop(
  config: LoopConfig & { sessionName: string }
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
  )
  if (!codexReady.ok) {
    printError(`Codex CLI の起動に失敗: ${codexReady.error.message}`)
    await destroySession(config.sessionName)
    return err(codexReady.error)
  }

  // メインループ
  const iterations: IterationResult[] = []
  let currentCode: string | null = null
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
    const prompt = isFirstIteration
      ? buildInitialPrompt(config.task, config.language)
      : buildFixPrompt(config.task, currentCode ?? '', iterations[iterations.length - 1]?.review ?? '')

    printPhase(isFirstIteration ? 'generate' : 'fix')

    // 送信前のベースライン取得
    const claudeBaseline = await capturePane(claudeTarget)
    const claudeBaselineLen = claudeBaseline.ok ? claudeBaseline.value.length : 0

    const sendClaudeResult = await sendPrompt(claudeTarget, prompt)
    if (!sendClaudeResult.ok) {
      printError(sendClaudeResult.error.message)
      break
    }

    // Claude の応答を待つ
    const claudeResponse = await waitForCompletion(
      claudeTarget,
      config.timeoutMs,
      config.pollIntervalMs,
      claudeBaselineLen,
    )
    if (!claudeResponse.ok) {
      printError(claudeResponse.error.message)
      break
    }

    // コードを抽出
    const newOutput = claudeResponse.value.slice(claudeBaselineLen)
    const extractedCode = extractCodeFromResponse(newOutput)
    if (!extractedCode) {
      printError(ERRORS.CODE_EXTRACTION_FAILED.message)
      iterations.push({ iteration, code: null, review: null, approved: false })
      break
    }
    currentCode = extractedCode

    // --- Codex にレビュー送信 ---
    printPhase('review')

    const reviewPrompt = buildReviewPrompt(config.task, currentCode)

    // 送信前のベースライン取得
    const codexBaseline = await capturePane(codexTarget)
    const codexBaselineLen = codexBaseline.ok ? codexBaseline.value.length : 0

    const sendCodexResult = await sendPrompt(codexTarget, reviewPrompt)
    if (!sendCodexResult.ok) {
      printError(sendCodexResult.error.message)
      break
    }

    // Codex の応答を待つ
    const codexResponse = await waitForCompletion(
      codexTarget,
      config.timeoutMs,
      config.pollIntervalMs,
      codexBaselineLen,
    )
    if (!codexResponse.ok) {
      printError(codexResponse.error.message)
      break
    }

    const reviewOutput = codexResponse.value.slice(codexBaselineLen)
    approved = checkApproved(reviewOutput)

    iterations.push({
      iteration,
      code: currentCode,
      review: reviewOutput,
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

  // 結果を返す（セッションは残す — ユーザーが確認できるように）
  console.log(`\ntmux セッション "${config.sessionName}" は残しています。`)
  console.log(`確認後、tmux kill-session -t ${config.sessionName} で削除してください。`)

  return ok({
    finalCode: currentCode,
    iterations,
    approved,
    totalIterations: iteration,
  })
}
