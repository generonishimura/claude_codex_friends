import { writeFile } from 'node:fs/promises'
import type { LoopConfig, LoopResult, CustomPrompts } from '../domain/loop.types.js'
import type { Result, DomainError } from '../domain/types.js'
import { ok, err } from '../domain/types.js'
import { DEFAULTS } from '../config/index.js'
import type { EngineResult, UserDecision, AskUserContext } from '../domain/engine.types.js'
import { LoopEngine } from './loop-engine.js'
import type { LoopTargets, LoopEngineConfig } from './loop-engine.js'
import {
  checkTmuxAvailable,
  createSession,
  destroySession,
  sessionExists,
  startClaude,
  startCodex,
  waitForCompletion,
} from '../services/tmux.service.js'
import {
  printBanner,
  printConfig,
  printError,
  printSessionInfo,
} from '../ui/terminal.js'

export type { LoopTargets }

/** ループ実行に必要な設定（セッション管理は含まない） */
export interface RunLoopConfig {
  task: string
  language?: string
  outputPath?: string
  maxIterations: number
  timeoutMs: number
  pollIntervalMs: number
  prompts?: CustomPrompts
  /** ユーザー判断コールバック（対話モード用） */
  onAskUser?: (context: AskUserContext) => Promise<UserDecision>
}

/** EngineResult を既存の LoopResult に変換する */
function toLoopResult(result: EngineResult): LoopResult {
  return {
    finalCode: result.finalCode,
    iterations: result.iterations,
    approved: result.approved,
    totalIterations: result.totalIterations,
  }
}

/** ループのみを実行する（セッション管理は呼び出し元に任せる） */
export async function runLoop(
  config: RunLoopConfig,
  targets: LoopTargets,
): Promise<Result<LoopResult, DomainError>> {
  const engineConfig: LoopEngineConfig = {
    task: config.task,
    language: config.language,
    outputPath: config.outputPath,
    maxIterations: config.maxIterations,
    timeoutMs: config.timeoutMs,
    pollIntervalMs: config.pollIntervalMs,
    prompts: config.prompts,
    onAskUser: config.onAskUser,
  }

  const engine = new LoopEngine(engineConfig, targets)
  const result = await engine.run()

  if (!result.ok) return result

  return ok(toLoopResult(result.value))
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

  // ループ実行（autoモードは onAskUser なし → 自動終了）
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
