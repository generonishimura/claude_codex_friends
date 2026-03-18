import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ok, err } from '../../domain/types.js'
import type { EngineResult, UserDecision, AskUserContext } from '../../domain/engine.types.js'
import { LoopEngine, addDraftSuffix } from '../../orchestrator/loop-engine.js'
import type { LoopEngineConfig, LoopTargets } from '../../orchestrator/loop-engine.js'

// tmux サービスのモック
vi.mock('../../services/tmux.service.js', () => ({
  sendPrompt: vi.fn().mockResolvedValue(ok(undefined)),
  capturePane: vi.fn().mockResolvedValue(ok('')),
  waitForCompletion: vi.fn().mockResolvedValue(ok('```typescript\nconsole.log("hello")\n```\n❯')),
  saveCodeToTempFile: vi.fn().mockResolvedValue('/tmp/ccf/code_iter1.ts'),
  cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}))

// UI のモック（console 出力を抑制）
vi.mock('../../ui/terminal.js', () => ({
  printIteration: vi.fn(),
  printPhase: vi.fn(),
  printApproved: vi.fn(),
  printMaxIterationsReached: vi.fn(),
  printError: vi.fn(),
  printSaved: vi.fn(),
}))

const { waitForCompletion } = await import('../../services/tmux.service.js')
const mockedWaitForCompletion = vi.mocked(waitForCompletion)

const defaultTargets: LoopTargets = {
  claude: 'ccf:0.0',
  codex: 'ccf:0.1',
}

function createConfig(overrides: Partial<LoopEngineConfig> = {}): LoopEngineConfig {
  return {
    task: 'FizzBuzzを実装して',
    language: 'typescript',
    maxIterations: 3,
    timeoutMs: 5000,
    pollIntervalMs: 100,
    ...overrides,
  }
}

describe('LoopEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('初期状態', () => {
    it('idle フェーズで始まる', () => {
      const engine = new LoopEngine(createConfig(), defaultTargets)
      const state = engine.getState()

      expect(state.phase).toBe('idle')
      expect(state.iteration).toBe(0)
      expect(state.approved).toBe(false)
      expect(state.currentCode).toBeNull()
    })
  })

  describe('approved で完了', () => {
    it('Codex が APPROVED を返したら completed フェーズで終了する', async () => {
      // Claude の応答: コードブロック付き
      mockedWaitForCompletion
        .mockResolvedValueOnce(ok('```typescript\nfunction fizzbuzz() {}\n```\n❯'))
        // Codex の応答: APPROVED
        .mockResolvedValueOnce(ok('APPROVED\n❯'))

      const engine = new LoopEngine(createConfig({ maxIterations: 5 }), defaultTargets)
      const result = await engine.run()

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.approved).toBe(true)
      expect(result.value.totalIterations).toBe(1)
      expect(result.value.finalCode).toBe('function fizzbuzz() {}')
    })
  })

  describe('iteration_limit で ask-user', () => {
    it('最大イテレーション到達時、onAskUser 未指定なら自動完了', async () => {
      // 毎回「未承認」のレビューを返す
      mockedWaitForCompletion.mockResolvedValue(ok('```typescript\ncode\n```\n❯'))

      const engine = new LoopEngine(
        createConfig({ maxIterations: 1 }),
        defaultTargets,
      )
      const result = await engine.run()

      expect(result.ok).toBe(true)
      if (!result.ok) return

      // APPROVED パターンなし → approved: false
      expect(result.value.approved).toBe(false)
      expect(result.value.totalIterations).toBe(1)
    })

    it('onAskUser で continue を選択するとループが追加される', async () => {
      mockedWaitForCompletion.mockResolvedValue(ok('```typescript\ncode\n```\n❯'))

      let askCount = 0
      const onAskUser = vi.fn(async (_context: AskUserContext): Promise<UserDecision> => {
        askCount++
        if (askCount === 1) {
          return { type: 'continue', additionalIterations: 1 }
        }
        return { type: 'accept' }
      })

      const engine = new LoopEngine(
        createConfig({ maxIterations: 1, onAskUser }),
        defaultTargets,
      )
      const result = await engine.run()

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.approved).toBe(true) // accept で approved
      expect(result.value.totalIterations).toBe(2)
      expect(result.value.userAccepted).toBe(true)
      expect(onAskUser).toHaveBeenCalledTimes(2)
    })

    it('onAskUser で accept を選択するとコードを承認して終了', async () => {
      mockedWaitForCompletion.mockResolvedValue(ok('```typescript\nfinal_code\n```\n❯'))

      const onAskUser = vi.fn(async (): Promise<UserDecision> => {
        return { type: 'accept' }
      })

      const engine = new LoopEngine(
        createConfig({ maxIterations: 1, onAskUser }),
        defaultTargets,
      )
      const result = await engine.run()

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.approved).toBe(true)
      expect(result.value.userAccepted).toBe(true)
      expect(result.value.finalCode).toBe('final_code')
    })

    it('onAskUser で reject を選択するとコードを破棄して終了', async () => {
      mockedWaitForCompletion.mockResolvedValue(ok('```typescript\ncode\n```\n❯'))

      const onAskUser = vi.fn(async (): Promise<UserDecision> => {
        return { type: 'reject' }
      })

      const engine = new LoopEngine(
        createConfig({ maxIterations: 1, onAskUser }),
        defaultTargets,
      )
      const result = await engine.run()

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.approved).toBe(false)
      expect(result.value.finalCode).toBeNull() // aborted なので null
    })

    it('onAskUser で intervene を選択するとループ停止して完了扱い', async () => {
      mockedWaitForCompletion.mockResolvedValue(ok('```typescript\ncode\n```\n❯'))

      const onAskUser = vi.fn(async (): Promise<UserDecision> => {
        return { type: 'intervene' }
      })

      const engine = new LoopEngine(
        createConfig({ maxIterations: 1, onAskUser }),
        defaultTargets,
      )
      const result = await engine.run()

      expect(result.ok).toBe(true)
      if (!result.ok) return

      // intervene は completed 扱い、コードは保持
      expect(result.value.finalCode).not.toBeNull()
    })
  })

  describe('エラー遷移', () => {
    it('コード抽出失敗時はエラーを返す', async () => {
      // コードブロックなしの応答
      mockedWaitForCompletion.mockResolvedValue(ok('何かテキストだけ\n❯'))

      const engine = new LoopEngine(createConfig(), defaultTargets)
      const result = await engine.run()

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error.code).toBe('CODE_EXTRACTION_FAILED')
    })

    it('エラー時は finalCode が null', async () => {
      mockedWaitForCompletion.mockResolvedValue(ok('テキストのみ\n❯'))

      const engine = new LoopEngine(createConfig(), defaultTargets)
      const result = await engine.run()

      expect(result.ok).toBe(false)
    })
  })

  describe('イベント発行', () => {
    it('phase_changed イベントが発行される', async () => {
      mockedWaitForCompletion
        .mockResolvedValueOnce(ok('```typescript\ncode\n```\n❯'))
        .mockResolvedValueOnce(ok('APPROVED\n❯'))

      const events: string[] = []
      const engine = new LoopEngine(
        createConfig({
          onEvent: (event) => {
            if (event.type === 'phase_changed') {
              events.push(event.phase)
            }
          },
        }),
        defaultTargets,
      )

      await engine.run()

      expect(events).toContain('generating')
      expect(events).toContain('reviewing')
      expect(events).toContain('judging')
      expect(events).toContain('completed')
    })
  })
})
