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

### Re-Evaluate-Zyklus
- **Nächste geplante Prüfung:** 2026-09-25 (Quartalsweise)
- **Verantwortlich:** Maintainer (siehe `package.json` maintainers, falls vorhanden)
- **Prüfschritte:**
  1. Upstream-Issues (`nodejs/node#63487`, `electron/electron#51619`) auf Closed-Status prüfen
  2. Aktuelle Node-24-Patch-Releases auf Release-Notes zu `extract-zip` / `tar`-Pfad durchsehen
  3. `npm install` + `npm run dev` mit der aktuellsten 24.x-Version reproduzieren
  4. Bei Erfolg: `engines` + `check-node.mjs` lockern, README + TROUBLESHOOTING aktualisieren, Doku-Eintrag mit Datum ergänzen
- **Letzter Prüflauf (bestätigt, dass 24.16+ weiterhin blockiert ist):** 2026-06-25 (Heuristik: keine Commits in den genannten Issues, die `extract-zip`-Regression vollständig addressieren)
