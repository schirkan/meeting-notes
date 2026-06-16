# meeting-notes

PoC zur strukturierten Erfassung von Meeting-Transkripten (Electron + React + C# Sidecar).

## Features (aktueller Stand)
- Start/Stop Recording im UI
- Live-Transkript mit Mic/Speaker-Markierung + Interim/Final
- Fehler-/Status-Events via IPC
- Persistente Einstellungen (Sprache, Devices)
- TXT-Export (Clipboard)
- C#-Sidecar (WASAPI Mic + Loopback) mit Frame-Protokoll über Named Pipe
- Azure Speech Recognizer (Sidecar + Azure)

## Voraussetzungen
- Node gemäß `.nvmrc` (empfohlen: 22 LTS)
- .NET SDK (für Sidecar-Build)

## Setup
```bash
nvm use
npm install
```

### Azure konfigurieren
1. Beispiel kopieren:
   - `config/azure.fixed.example.json` -> `config/azure.fixed.json`
   - `config/user-settings.example.json` -> `config/user-settings.json`
2. In `config/azure.fixed.json` den Azure Speech API-Key direkt im Feld `speechKey` eintragen

## Entwicklung
```bash
npm run dev
```

## Checks
```bash
npm run typecheck
npm run build
npm run test:smoke
npm run measure:latency
npm run build:sidecar
```

## Portable Build (unsigniert)
```bash
npm run dist:portable
```
Artefakte: `dist/portable/`

## Runbook (Kurz)
1. App starten (`npm run dev` oder portables Artefakt)
2. Settings prüfen: Sprache, Mic, Speaker-Loopback
3. Start klicken
4. Bei Fehlercode `LOOPBACK_*`: Audio-Output/Device prüfen, danach erneut starten
5. Finales Transkript über **TXT in Clipboard** exportieren

## Bekannte Einschränkungen
- Die App benötigt gültige Azure-Konfiguration inklusive direkt hinterlegtem Speech-Key
- Hardwarematrix (integriertes Mic + kabelgebundenes Headset) muss auf Zielgerät validiert werden
- Der portable Build ist PoC-haft und unsigniert
