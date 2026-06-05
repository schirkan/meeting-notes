# meeting-notes

Projekt zur strukturierten Erfassung und Nachverfolgung von Meeting-Notizen.

## Ziel
- Notizen aus Meetings sammeln
- To-dos und Entscheidungen festhalten
- Offene Punkte nachverfolgen

## Aktueller Stand
Der aktuelle Fokus liegt auf einem PoC für eine Desktop-Client-Anwendung (Node.js + Electron + React) mit Audio-Transkription.

Wichtige Dokumente im Repository:
- `PROJECT.md` – Projektstatus und Session-Log
- `SPEC-v0.1.md` – fachlich/technischer Spezifikationsstand
- `DECISIONS.md` – dokumentierte Architektur-/Projektentscheidungen
- `tasks.json` – Aufgabenübersicht
- `specs/` – Spezifikationen pro Task
- `context/` – Hintergrundrecherche (z. B. Azure Speech SDK)

## MVP-Aufteilung
- **MVP 1 (aktuell in Umsetzung):** Electron-App startbar, IPC mit Mock-Backend, React-UI mit Live-Anzeige.
- **MVP 2:** C#-Sidecar + Azure Speech SDK anbinden und Mock ersetzen.

Details: `MVP-PLAN.md`

## Node-Version (robustes Setup)
- Standard: `.nvmrc` = `22` (LTS-Linie, empfohlen)
- Erlaubte Versionen (`engines` + `.npmrc engine-strict=true`):
  - `>=22.12.0 <23`
  - `>=24.0.0 <24.16.0`

Warum: Für `24.16.0+` gibt es aktuell ein bekanntes Problem beim Electron-Binary-Install (unvollständige Extraction).

Statuscheck (05.06.2026):
- Node v24.16.0 ist der neueste verfügbare 24er-Release (laut GitHub Releases)
- Es liegt noch kein bestätigter Fix-Release in 24.x vor
- Bis dahin bleibt Node 22 LTS der empfohlene Standard

Details und Downgrade-Schritte: `TROUBLESHOOTING.md`

## Lokaler Start (MVP 1)
- `nvm use`
- `npm install`
- `npm run dev`

Checks:
- `npm run check:node`
- `npm run typecheck`
- `npm run build`

## Hinweise
- Dieses Repository enthält primär Planung, Spezifikation und Kontextmaterial.
- Implementierungsartefakte der PoC-App werden schrittweise ergänzt.
