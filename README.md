# meeting-notes

PoC zur strukturierten Erfassung von Meeting-Transkripten (Electron + React + C# Sidecar).

## Features (aktueller Stand)
- Start/Stop Recording im UI
- Live-Transkript mit Mic/Speaker-Markierung + Interim/Final
- Fehler-/Status-Events via IPC
- Persistente Einstellungen (Sprache, Devices, Modus mock/real)
- TXT-Export (Clipboard)
- C#-Sidecar (WASAPI Mic + Loopback) mit Frame-Protokoll über Named Pipe
- Optional Azure Speech Recognizer (real mode)

## Voraussetzungen
- Node gemäß `.nvmrc` (empfohlen: 22 LTS)
- .NET SDK (für Sidecar-Build)

## Setup
```bash
nvm use
npm install
```

### Optional: Azure aktivieren (real mode)
1. Beispiel kopieren:
   - `config/azure.fixed.example.json` -> `config/azure.fixed.json`
   - `config/user-settings.example.json` -> `config/user-settings.json`
2. `AZURE_SPEECH_KEY` als Umgebungsvariable setzen (oder die in `speechKeyEnvVar` konfigurierte Variable)
3. Im UI Modus auf **Real (Sidecar + Azure)** umstellen

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
2. Settings prüfen: Sprache, Mic, Speaker-Loopback, Modus
3. Start klicken
4. Bei Fehlercode `LOOPBACK_*`: Audio-Output/Device prüfen, danach erneut starten
5. Finales Transkript über **TXT in Clipboard** exportieren

## Bekannte Einschränkungen
- Real-Modus benötigt gültige Azure-Konfiguration und Schlüssel
- Hardwarematrix (integriertes Mic + kabelgebundenes Headset) muss auf Zielgerät validiert werden
- Der portable Build ist PoC-haft und unsigniert
