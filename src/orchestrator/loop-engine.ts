/**
 * LoopEngine: イベント駆動のステートマシンベースループ実行エンジン
 *
 * generate → review → judge → 分岐 のサイクルを管理し、
 * ユーザー判断が必要な場面で一時停止して判断を待つ。
 */

import { EventEmitter } from 'node:events'
import { writeFile } from 'node:fs/promises'
import type { IterationResult, CustomPrompts } from '../domain/loop.types.js'
import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { ERRORS } from '../domain/errors.js'
import type {
  EngineState,
  EnginePhase,
  EngineEvent,
  EngineResult,
  UserDecision,
  AskUserContext,
  AskReason,
} from '../domain/engine.types.js'
import { createInitialState, decideNextPhase } from '../domain/engine.rules.js'
import {
  buildInitialPrompt,
  buildFixPrompt,
  buildReviewPrompt,
  isApproved as checkApproved,
  extractCodeFromResponse,
  extractReviewFromResponse,
  resolveFileExtension,
} from '../domain/loop.rules.js'
import {
  sendPrompt,
  capturePane,
  waitForCompletion,
  saveCodeToTempFile,
  cleanupTempFiles,
  withRetry,
} from '../services/tmux.service.js'
import {
  printIteration,
  printPhase,
  printApproved,
  printMaxIterationsReached,
  printError,
  printSaved,
} from '../ui/terminal.js'

/** ペインターゲット */
export interface LoopTargets {
  claude: string
  codex: string
}

/** LoopEngine の設定 */
export interface LoopEngineConfig {
  task: string
  language?: string
  outputPath?: string
  maxIterations: number
  timeoutMs: number
  pollIntervalMs: number
  prompts?: CustomPrompts
  /** ユーザー判断を求めるコールバック。未指定時はデフォルト動作（自動終了） */
  onAskUser?: (context: AskUserContext) => Promise<UserDecision>
  /** イベントリスナー（ログ、UI更新等） */
  onEvent?: (event: EngineEvent) => void
}

export class LoopEngine extends EventEmitter {
  private state: EngineState
  private readonly config: LoopEngineConfig
  private readonly targets: LoopTargets

  constructor(config: LoopEngineConfig, targets: LoopTargets) {
    super()
    this.config = config
    this.targets = targets
    this.state = createInitialState(config.maxIterations)
  }

  /** 現在の状態を取得する */
  getState(): Readonly<EngineState> {
    return this.state
  }

  /** エンジンを実行する */
  async run(): Promise<Result<EngineResult, DomainError>> {
    this.transition('generating')

    while (this.state.phase === 'generating') {
      const iterationResult = await this.executeIteration()
      if (!iterationResult.ok) {
        this.transition('error')
        return iterationResult
      }

      // 判定フェーズ
      this.transition('judging')
      const decision = decideNextPhase(this.state)

      if (decision.phase === 'completed') {
        printApproved()
        this.transition('completed')
      } else if (decision.phase === 'ask-user') {
        const userResult = await this.handleAskUser(decision.reason!)
        if (!userResult.ok) return userResult
        // handleAskUser が state.phase を更新済み
      } else {
        // generating に戻って次のイテレーションへ
        this.transition('generating')
      }
    }

    // 最終処理
    return this.finalize()
  }

  /** 1イテレーションを実行する */
  private async executeIteration(): Promise<Result<void, DomainError>> {
    this.state.iteration++
    printIteration(this.state.iteration, this.state.maxIterations)
    this.emit('event', {
      type: 'iteration_start',
      iteration: this.state.iteration,
      maxIterations: this.state.maxIterations,
    } satisfies EngineEvent)

    // --- Claude にプロンプト送信 ---
    const isFirst = this.state.iteration === 1
    const prompt = isFirst
      ? buildInitialPrompt(this.config.task, this.config.language, this.config.prompts?.initial)
      : buildFixPrompt(
          this.config.task,
          this.state.codeFilePath,
          this.state.iterations[this.state.iterations.length - 1]?.review ?? '',
          this.config.prompts?.fix,
        )

    printPhase(isFirst ? 'generate' : 'fix')
    this.transition('generating')

    const claudeBaseline = await capturePane(this.targets.claude)
    const claudeBaselineText = claudeBaseline.ok ? claudeBaseline.value : ''

    const sendResult = await sendPrompt(this.targets.claude, prompt)
    if (!sendResult.ok) {
      printError(sendResult.error.message)
      return err(sendResult.error)
    }

    const claudeResponse = await withRetry(() =>
      waitForCompletion(this.targets.claude, this.config.timeoutMs, this.config.pollIntervalMs, claudeBaselineText),
    )
    if (!claudeResponse.ok) {
      printError(claudeResponse.error.message)
      return err(claudeResponse.error)
    }

    const extractedCode = extractCodeFromResponse(claudeResponse.value)
    if (!extractedCode) {
      printError(ERRORS.CODE_EXTRACTION_FAILED.message)
      this.state.iterations.push({ iteration: this.state.iteration, code: null, review: null, approved: false })
      return err(ERRORS.CODE_EXTRACTION_FAILED)
    }

    this.state.currentCode = extractedCode
    const ext = resolveFileExtension(this.config.language)
    this.state.codeFilePath = await saveCodeToTempFile(extractedCode, `code_iter${this.state.iteration}.${ext}`)

    this.emit('event', {
      type: 'code_generated',
      code: extractedCode,
      filePath: this.state.codeFilePath,
    } satisfies EngineEvent)

    // --- Codex にレビュー送信 ---
    printPhase('review')
    this.transition('reviewing')

    const reviewPrompt = buildReviewPrompt(this.config.task, this.state.codeFilePath, this.config.prompts?.review)

    const codexBaseline = await capturePane(this.targets.codex)
    const codexBaselineText = codexBaseline.ok ? codexBaseline.value : ''

    const sendCodexResult = await sendPrompt(this.targets.codex, reviewPrompt)
    if (!sendCodexResult.ok) {
      printError(sendCodexResult.error.message)
      return err(sendCodexResult.error)
    }

    const codexResponse = await withRetry(() =>
      waitForCompletion(this.targets.codex, this.config.timeoutMs, this.config.pollIntervalMs, codexBaselineText),
    )
    if (!codexResponse.ok) {
      printError(codexResponse.error.message)
      return err(codexResponse.error)
    }

    const reviewText = extractReviewFromResponse(codexResponse.value)
    const approved = checkApproved(reviewText)

    this.state.approved = approved
    this.state.lastReviews.push(reviewText)
    this.state.iterations.push({
      iteration: this.state.iteration,
      code: extractedCode,
      review: reviewText,
      approved,
    })

    this.emit('event', {
      type: 'review_received',
      review: reviewText,
      approved,
    } satisfies EngineEvent)

    return ok(undefined)
  }

  /** ユーザー判断を求める */
  private async handleAskUser(reason: AskReason): Promise<Result<void, DomainError>> {
    this.state.askReason = reason
    this.transition('ask-user')

    if (reason === 'iteration_limit') {
      printMaxIterationsReached(this.state.maxIterations)
    }

    const context: AskUserContext = {
      reason,
      iteration: this.state.iteration,
      maxIterations: this.state.maxIterations,
      lastReview: this.state.iterations[this.state.iterations.length - 1]?.review ?? null,
      currentCode: this.state.currentCode,
    }

    this.emit('event', { type: 'ask_user', reason, context } satisfies EngineEvent)

    // onAskUser コールバックがなければ自動終了（auto モード互換）
    if (!this.config.onAskUser) {
      this.transition('completed')
      return ok(undefined)
    }

    const decision = await this.config.onAskUser(context)

    switch (decision.type) {
      case 'continue':
        this.state.maxIterations += decision.additionalIterations
        this.state.askReason = null
        this.state.lastReviews = [] // stuck 状態をリセット
        this.transition('generating')
        return ok(undefined)

      case 'intervene':
        // 手動介入: ループを一時停止し、ユーザーが @claude/@codex で直接操作できるようにする
        // REPL に制御を返す。再開は /continue で行う
        this.state.askReason = null
        this.transition('completed') // 一旦完了扱い（REPL側で再利用可能）
        return ok(undefined)

      case 'accept':
        this.state.approved = true
        this.state.askReason = null
        this.transition('completed')
        return ok(undefined)

      case 'reject':
        this.state.askReason = null
        this.transition('aborted')
        return ok(undefined)
    }
  }

  /** 最終結果を組み立てる */
  private async finalize(): Promise<Result<EngineResult, DomainError>> {
    const isAborted = this.state.phase === 'aborted'
    const userAccepted = this.state.approved && this.state.phase === 'completed' && !this.state.iterations.some(i => i.approved)

    // コード保存（aborted 時は保存しない）
    if (!isAborted && this.state.currentCode && this.config.outputPath) {
      const savePath = this.state.approved
        ? this.config.outputPath
        : addDraftSuffix(this.config.outputPath)
      try {
        await writeFile(savePath, this.state.currentCode, 'utf-8')
        printSaved(savePath)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        printError(`ファイル保存に失敗: ${message}`)
      }
    }

    await cleanupTempFiles()

    const result: EngineResult = {
      finalCode: isAborted ? null : this.state.currentCode,
      iterations: this.state.iterations,
      approved: this.state.approved,
      totalIterations: this.state.iteration,
      userAccepted,
    }

    this.emit('event', { type: 'completed', result } satisfies EngineEvent)

    return ok(result)
  }

  /** フェーズ遷移 */
  private transition(phase: EnginePhase): void {
    const prev = this.state.phase
    this.state.phase = phase
    this.emit('event', { type: 'phase_changed', phase, reason: `${prev} → ${phase}` } satisfies EngineEvent)
    this.config.onEvent?.({ type: 'phase_changed', phase, reason: `${prev} → ${phase}` })
  }
}

/** ファイルパスに .draft サフィックスを追加する */
export function addDraftSuffix(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return `${filePath}.draft`
  return `${filePath.slice(0, lastDot)}.draft${filePath.slice(lastDot)}`
}
