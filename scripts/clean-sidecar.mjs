#!/usr/bin/env node

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SIDECAR_ROOT = join(process.cwd(), 'sidecar')

// Targets, die laut csproj nicht mehr aktiv sind und nur Legacy-Artefakte
// hinterlassen (z. B. nach einem Downgrade oder Target-Framework-Wechsel).
const STALE_TARGETS = ['net10.0-windows']

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function cleanStaleTargets() {
  for (const sub of ['bin', 'obj']) {
    const root = join(SIDECAR_ROOT, sub)
    if (!isDirectory(root)) continue

    for (const config of readdirSync(root)) {
      const configPath = join(root, config)
      if (!isDirectory(configPath)) continue

      for (const target of readdirSync(configPath)) {
        if (!STALE_TARGETS.includes(target)) continue

        const targetPath = join(configPath, target)
        rmSync(targetPath, { recursive: true, force: true })
        console.log(`entfernt: ${targetPath}`)
      }
    }
  }
}

if (!existsSync(SIDECAR_ROOT)) {
  console.error(`Sidecar-Verzeichnis nicht gefunden: ${SIDECAR_ROOT}`)
  process.exit(1)
}

cleanStaleTargets()
console.log('Sidecar-Cleanup abgeschlossen.')