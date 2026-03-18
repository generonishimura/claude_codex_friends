import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CCF_TMP_DIR = join(tmpdir(), 'ccf')

/** コードを一時ファイルに保存する */
export async function saveCodeToTempFile(code: string, filename: string): Promise<string> {
  await mkdir(CCF_TMP_DIR, { recursive: true })
  const filePath = join(CCF_TMP_DIR, filename)
  await writeFile(filePath, code, 'utf-8')
  return filePath
}

/** 一時ファイルディレクトリを削除する */
export async function cleanupTempFiles(): Promise<void> {
  try {
    await rm(CCF_TMP_DIR, { recursive: true, force: true })
  } catch {
    // クリーンアップ失敗は無視（致命的ではない）
  }
}
