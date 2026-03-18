import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { saveCodeToTempFile, cleanupTempFiles } from '../../services/file.service.js'

const CCF_TMP_DIR = join(tmpdir(), 'ccf')

describe('saveCodeToTempFile', () => {
  afterEach(async () => {
    await cleanupTempFiles()
  })

  it('指定したファイル名で一時ファイルを作成しパスを返す', async () => {
    const code = 'console.log("hello")'
    const filePath = await saveCodeToTempFile(code, 'test_output.ts')

    expect(filePath).toBe(join(CCF_TMP_DIR, 'test_output.ts'))
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe(code)
  })

  it('同名ファイルが存在する場合は上書きする', async () => {
    await saveCodeToTempFile('first', 'overwrite.ts')
    const filePath = await saveCodeToTempFile('second', 'overwrite.ts')

    expect(readFileSync(filePath, 'utf-8')).toBe('second')
  })

  it('日本語を含むコードも正しく保存する', async () => {
    const code = '// こんにちは世界\nconsole.log("テスト")'
    const filePath = await saveCodeToTempFile(code, 'japanese.ts')

    expect(readFileSync(filePath, 'utf-8')).toBe(code)
  })

  it('空文字列のコードも保存できる', async () => {
    const filePath = await saveCodeToTempFile('', 'empty.ts')

    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe('')
  })
})

describe('cleanupTempFiles', () => {
  it('一時ディレクトリを削除する', async () => {
    await saveCodeToTempFile('temp', 'cleanup_test.ts')
    expect(existsSync(CCF_TMP_DIR)).toBe(true)

    await cleanupTempFiles()
    expect(existsSync(CCF_TMP_DIR)).toBe(false)
  })

  it('ディレクトリが存在しなくてもエラーにならない', async () => {
    await cleanupTempFiles() // 事前に削除
    await expect(cleanupTempFiles()).resolves.not.toThrow()
  })
})
