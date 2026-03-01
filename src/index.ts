#!/usr/bin/env node
import { parseArgs } from './config/index.js'
import { runAgentLoop } from './orchestrator/agent-loop.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const config = parseArgs(args)
  const result = await runAgentLoop(config)

  if (!result.ok) {
    process.exit(1)
  }

  if (result.value.approved) {
    process.exit(0)
  } else {
    // 最大イテレーション到達
    process.exit(2)
  }
}

main().catch((e) => {
  console.error('予期しないエラー:', e)
  process.exit(1)
})
