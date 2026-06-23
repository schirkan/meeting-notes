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

    await window.waitForSelector('main.container', { timeout: TIMEOUT_MS })
    const transcriptHeaderCount = await window.locator('h2', { hasText: 'Transkript' }).count()

    if (transcriptHeaderCount === 0) {
      throw new Error('UI geladen, aber erwarteter Bereich "Transkript" fehlt.')
    }

    const bridgeAvailable = await window.evaluate(() => typeof window.transcriptApi?.start === 'function')
    if (!bridgeAvailable) {
      throw new Error('Preload-Bridge window.transcriptApi ist nicht verfügbar.')
    }

    const startResult = await window.evaluate(async () => {
      try {
        const status = await window.transcriptApi.start()
        return { ok: true, running: status.running }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, message }
      }
    })

    const bodyText = await window.textContent('body')
    if (startResult.ok) {
      if (!bodyText?.includes('Läuft')) {
        throw new Error(`Unerwarteter Status nach erfolgreichem Start: ${bodyText ?? '<leer>'}`)
      }
    } else {
      if (!bodyText?.includes('Fehler')) {
        throw new Error(`Unerwarteter Status nach fehlgeschlagenem Start: ${bodyText ?? '<leer>'}`)
      }

      if (!bodyText.includes('Fehler') && !bodyText.includes('fehlgeschlagen') && !bodyText.includes('nicht gesetzt') && !bodyText.includes('fehlt')) {
        throw new Error(`Kein erwartbarer Fehlerhinweis nach Startversuch sichtbar: ${bodyText}`)
      }
    }

    console.log('\n✅ Smoke-Test erfolgreich: UI geladen, Bridge aktiv, Startpfad reagiert erwartbar.')
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`\n❌ Smoke-Test fehlgeschlagen:\n${message}`)
  process.exit(1)
})
