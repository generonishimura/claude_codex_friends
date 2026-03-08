import { describe, it, expect } from 'vitest'
import { addDraftSuffix } from '../../orchestrator/loop-engine.js'

describe('addDraftSuffix', () => {
  it('拡張子がある場合、拡張子の前に .draft を挿入する', () => {
    expect(addDraftSuffix('output.ts')).toBe('output.draft.ts')
  })

  it('パスに複数のドットがある場合、最後のドットの前に .draft を挿入する', () => {
    expect(addDraftSuffix('src/output.test.ts')).toBe('src/output.test.draft.ts')
  })

  it('拡張子がない場合、末尾に .draft を付与する', () => {
    expect(addDraftSuffix('output')).toBe('output.draft')
  })
})
