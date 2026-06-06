#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { _electron as electron } from 'playwright'

const RUNS = 5
const results = []

function run(command) {
  console.log(`$ ${command}`)
  execSync(command, { stdio: 'inherit' })
}

async function singleRun(index) {
  const app = await electron.launch({ args: ['out/main/index.js'] })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Start' }).click()

    const t0 = Date.now()
    await page.waitForFunction(() => document.querySelectorAll('li.segment').length > 0, null, { timeout: 8_000 })
    const latency = Date.now() - t0
    results.push(latency)
    console.log(`Run ${index + 1}: ${latency} ms`)
  } finally {
    await app.close()
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

async function main() {
  run('npm run build')

  for (let i = 0; i < RUNS; i += 1) {
    await singleRun(i)
  }

  const median = percentile(results, 50)
  const p95 = percentile(results, 95)

  const report = `# Latenzreport\n\n- Messzeitpunkt (UTC): ${new Date().toISOString()}\n- Runs: ${RUNS}\n- Einzelwerte (ms): ${results.join(', ')}\n- Median: ${median} ms\n- P95: ${p95} ms\n- Ziel < 5000 ms: ${p95 < 5000 ? 'erreicht ✅' : 'verfehlt ❌'}\n`

  await mkdir(join(process.cwd(), 'context'), { recursive: true })
  await writeFile(join(process.cwd(), 'context', 'latency-report.md'), report, 'utf8')
  console.log('\n' + report)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
