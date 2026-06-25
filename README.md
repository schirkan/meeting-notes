# meeting-notes

PoC zur strukturierten Erfassung von Meeting-Transkripten (Electron + React + C# Sidecar).

## Features (aktueller Stand)
- Start/Stop Recording im UI
- Live-Transkript mit Interim/Final und verbesserter Lesbarkeit
- Verbesserte Sprecherdarstellung (Speaker-Badges/Farben) inkl. Alias-Mapping
- Fehler-/Status-Events via IPC
- Sidecar/Main/IPC-Debug-Log direkt im UI (separate Öffnen/Schließen-Aktionen + Log löschen)
- Persistente Einstellungen (Sprache, Devices)
- TXT-Export (Clipboard) inkl. Header-Metadaten (Datum, Startzeit, Dauer)
- C#-Sidecar (WASAPI Mic + Loopback) mit Frame-Protokoll über Named Pipe
- Azure Speech (Mic via SpeechRecognizer, Speaker via ConversationTranscriber)
- Optionale Proxy-Konfiguration für Azure Speech (`proxy.host`/`proxy.port` + optional Auth)
- Sidecar-Resampling auf Azure-kompatibles Zielformat (16 kHz, 16-bit, mono)
- **Verbindung testen**-Button in den Azure-Einstellungen (DNS-/TCP-/HTTPS-Diagnose gegen den konfigurierten Endpoint)

## Voraussetzungen
- Node gemäß `.nvmrc` (empfohlen: 22 LTS)
- .NET SDK (nur für lokale Entwicklung/Build des Sidecar)
- .NET Runtime (win-x64) auf Zielsystemen

## Setup
```bash
nvm use
npm install
```

### Azure konfigurieren
1. Beispiel kopieren:
   - `config/azure.example.json` -> `config/azure.json`
   - `config/user-settings.example.json` -> `config/user-settings.json`
2. In `config/azure.json` den Azure Speech API-Key direkt im Feld `speechKey` eintragen
3. Optional: Proxy für Azure Speech unter `proxy` konfigurieren (`host`, `port`, optional `username`/`password`)
4. Hinweis Migration: `config/azure.fixed.json` wird nicht mehr verwendet (Legacy-Datei entfernt)

## Entwicklung
```bash
npm run dev
```

Hinweis: `npm run dev` publisht das Sidecar vor dem Start automatisch als framework-dependent Build nach `sidecar/publish/sidecar`.
Auf Zielsystemen wird das veröffentlichte Sidecar-EXE verwendet; dort ist kein .NET SDK erforderlich.

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

Der Portable-Build enthält das veröffentlichte Sidecar als zusätzliche Resource.

## Runbook (Kurz)
1. App starten (`npm run dev` oder portables Artefakt)
2. Settings prüfen: Sprache, Mic, Speaker-Loopback
3. Start klicken
4. Bei Fehlercode `LOOPBACK_*`: Audio-Output/Device prüfen, danach erneut starten
5. Finales Transkript über **TXT kopieren** exportieren

### Fehlerbild: App startet, aber keine Transcripts erscheinen
1. Debug-Log öffnen
2. Push-Frame-Statistik prüfen: zeigt sie plausible Bytes/s (~32 000 B/s pro Quelle), kommen Audio-Daten an?
3. Azure-Session-Events prüfen: gibt es `Session gestartet` / `Speech start erkannt` Events?
4. Wenn ja fehlen: **Verbindung testen**-Button in den Azure-Einstellungen klicken → siehe `TROUBLESHOOTING.md` → „Azure / Netzwerk / Proxy"
5. Finales Transkript über **TXT kopieren** exportieren

## Bekannte Einschränkungen
- Die App benötigt gültige Azure-Konfiguration inklusive direkt hinterlegtem Speech-Key
- Hardwarematrix (integriertes Mic + kabelgebundenes Headset) muss auf Zielgerät validiert werden
- Der portable Build ist PoC-haft und unsigniert
- **In restriktiven Netzwerkumgebungen mit ausgehender Firewall + erzwungenem HTTP-Proxy:** die native Azure-Speech-SDK nutzt die per `setProxy()` gesetzten Proxy-Properties nicht zuverlässig für den ausgehenden WSS-Connect. Diagnose und Workarounds siehe `TROUBLESHOOTING.md` und `specs/T-505-proxy-aware-azure-transport.md`.
