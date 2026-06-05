# Troubleshooting (Node / Electron Install)

Stand: 05.06.2026

## Symptom
Beim Start mit `npm run dev` erscheint:
- `Error: Electron uninstall`
- `Electron failed to install correctly`

## Ursache (Stand heute)
Bekannte Upstream-Problematik rund um `extract-zip` bei neueren Node-Versionen.

Relevante Issues:
- Node.js: https://github.com/nodejs/node/issues/63487
- Electron: https://github.com/electron/electron/issues/51619

## Sofortmaßnahme (empfohlen)
1. `nvm install 22`
2. `nvm use 22`
3. `npm ci` (oder `npm install`)
4. `npm run check:node`
5. `npm run dev`

## Projekt-Policy
- Standardversion via `.nvmrc`: `22`
- Harte Engine-Grenze via `engines` + `.npmrc (engine-strict=true)`
- Erlaubt:
  - `>=22.12.0 <23`
  - `>=24.0.0 <24.16.0`

## Wartung
Wenn ein korrigiertes Node-24-Release veröffentlicht ist und verifiziert wurde:
- `package.json` (`engines`) anpassen
- `scripts/check-node.mjs` anpassen
- README + dieses Dokument aktualisieren
