#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { _electron as electron } from 'playwright'

const TIMEOUT_MS = 15_000

function run(command) {
  console.log(`\n$ ${command}`)
  execSync(command, { stdio: 'inherit' })
}

async function main() {
  run('npm run build')

  const app = await electron.launch({
    args: ['out/main/index.js']
  })

  try {
    const window = await app.firstWindow()

    await window.waitForSelector('h1', { timeout: TIMEOUT_MS })
    const heading = await window.textContent('h1')

    if (!heading?.includes('Meeting Notes')) {
      throw new Error(`Unerwartete Überschrift: ${heading ?? '<leer>'}`)
    }

    const bridgeAvailable = await window.evaluate(() => typeof window.transcriptApi?.start === 'function')
    if (!bridgeAvailable) {
      throw new Error('Preload-Bridge window.transcriptApi ist nicht verfügbar.')
    }

    await window.getByRole('button', { name: 'Start' }).click()
    await window.waitForFunction(() => {
      const text = document.body.innerText
      return text.includes('Status: Läuft (')
    }, null, {
      timeout: TIMEOUT_MS
    })

    await window.waitForFunction(() => {
      const items = document.querySelectorAll('li.segment')
      return items.length > 0
    }, null, { timeout: TIMEOUT_MS })

    console.log('\n✅ Smoke-Test erfolgreich: UI geladen, Bridge aktiv, Mock-Transkript läuft.')
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`\n❌ Smoke-Test fehlgeschlagen:\n${message}`)
  process.exit(1)
})
