# Spezifikation v0.1 — Audio-Transkriptions-PoC (Windows 11)

Stand: 18.06.2026
Status: Entwurf (auf Basis der bisher bestätigten Entscheidungen)

## 1. Ziel
Ein portabler, unsignierter Desktop-PoC (Node.js + Electron + React), der parallel Mikrofon- und primären Speaker-Output erfasst, per Azure Speech transkribiert und Transkripte in der UI anzeigt.

## 2. Scope
- Plattform: ausschließlich Windows 11
- Testumgebung: Laptop mit integriertem Mikrofon
- Headsets:
  - Bluetooth: out of Scope
  - kabelgebunden: unterstützt

## 3. Audio-Erfassung
- Zwei getrennte Erfassungspfade (bevorzugt):
  - Pipeline A: Mikrofon
  - Pipeline B: primärer Speaker-Output (Loopback)
- Loopback ist Pflichtanforderung.
- Wenn Loopback nicht verfügbar/fehlerhaft ist: Aufnahme wird blockiert (kein Mic-only-Fallback).
- Eine kombinierte Verarbeitung darf optional untersucht werden, falls das gewählte Paket klare Vorteile bietet.

## 3.1 Technische Architektur (Variante B, konkretisiert)
- Ein **C# Capture-Service** wird als **Sidecar-Prozess** durch den Electron **Main Process** gestartet und gesteuert.
- Der C#-Teil kann intern als DLL/Assemblies organisiert sein; die Integration in Electron erfolgt über den Sidecar-Prozess (nicht direkt im Renderer).
- Laufzeitstart erfolgt über ein veröffentlichtes Sidecar-EXE; im Produktionspfad wird kein `dotnet run` verwendet.
- Der Sidecar liefert Audio-Frames (PCM) an den Main Process; direkte Audio-Streaming-Wege vom C#-Teil in den Renderer sind nicht vorgesehen.
- Das **Azure Speech SDK (JavaScript)** läuft im Electron **Main Process**.
- Der Main Process sendet erkannte/interim/finale Transkriptsegmente per **IPC** an das WebUI (Renderer) für Live-Anzeige.

## 4. Transkription
- API: Azure Speech
- Mehrsprecher-Differenzierung (Diarization): Nice-to-have (Best Effort)
- Recognizer-Strategie (Implementierungsstand):
  - Mic-Kanal: `SpeechRecognizer`
  - Speaker-Kanal: `ConversationTranscriber` (fest, kein separater `recognitionMode`-Schalter mehr)
- Der Stop-Pfad muss je nach Recognizer-Typ korrekt erfolgen (z. B. `stopContinuousRecognitionAsync` vs. `stopTranscribingAsync`).
- Betriebsmodus:
  - bevorzugt: Echtzeit-Streaming
  - zulässig: Chunking-Alternative
- Latenzziel: neue Transkriptsegmente erscheinen innerhalb von < 5 Sekunden in der UI.

## 5. UI (React)
- Anzeige der Transkripte in der Weboberfläche
- Darstellung mit Sprecher/Quelle, Zeitstempel, Text (sofern verfügbar)
- Verbesserte Sprecherdarstellung über visuelle Speaker-Badges/Farben
- Sprecher-Alias-Mapping im UI (manuelle Anzeigenamen pro erkannter Speaker-ID)
- Diagnostikbereich mit laufendem Debug-Log (Main/Sidecar/IPC)
- Nutzer kann in der UI ändern:
  - Sprache
  - Audio-Devices (wenn nicht Default)
- Spracheinstellung wird über Neustarts hinweg persistiert.

## 6. Konfiguration
- API-Konfiguration (z. B. Azure-Parameter) über fest verdrahtete JSON-Datei
- Azure-Konfiguration liegt in `config/azure.json`; der Azure-Key wird dort direkt im Feld `speechKey` hinterlegt
- Optionaler Azure-Proxy über `proxy.host`, `proxy.port` sowie optional `proxy.username`/`proxy.password`
- Kein vollwertiger Konfigurationseditor in der UI für den PoC
- Legacy-Datei `config/azure.fixed.json` ist obsolet und nicht mehr Teil des Laufzeitpfads

## 6.1 Audioformat für Azure-Ingest (Implementierungsstand)
- Sidecar resampelt Mic- und Speaker-Frames auf ein einheitliches Zielformat:
  - 16 kHz
  - 16-bit PCM
  - mono
- Ziel: kompatibler, stabiler Ingest-Pfad für Azure Speech bei heterogenen Geräteformaten.

## 7. Export
- Kein Dateiexport im PoC vorgesehen
- Vollständiges Transkript per Copy-to-Clipboard als TXT
- Exportinhalt: YAML-ähnlicher Header (`datum`, `startzeit`, `dauer`) plus Segmentliste mit Sprecher/Uhrzeit/Text
- Zeitformat: deutsches Datums-/Zeitformat

## 8. Entwicklungsumgebung (Stabilitätsvorgabe)
- Standard für lokale Entwicklung: Node 22 LTS (`.nvmrc`)
- Zulässige Node-Versionen im Projekt:
  - `>=22.12.0 <23`
  - `>=24.0.0 <24.16.0`
- Hintergrund: Bekannter Electron-Installfehler unter Node 24.16.0+ (unvollständige Binary-Extraction); bis bestätigtem Upstream-Fix kein Einsatz von 24.16.0+

## 8.1 Sidecar-Deployment (Runtime-Anforderung)
- Lokale Entwicklung/Build: .NET SDK erforderlich, um das Sidecar zu veröffentlichen.
- Zielsystem: .NET Runtime (win-x64) ausreichend; SDK ist dort nicht erforderlich.
- Build-/Start-Flow:
  - Dev: Sidecar wird nach `sidecar/publish/sidecar` veröffentlicht und von dort gestartet.
  - Portable: veröffentlichte Sidecar-Dateien werden als Resource mit dem App-Artefakt ausgeliefert.

## 9. Nicht-Ziele (PoC)
- Code-Signing
- Plattformübergreifende Unterstützung (macOS/Linux)
- Bluetooth-Audio-Support
- Produktionsreife Betriebs-/Monitoring-Features

## 10. MVP-Rollout (festgelegt am 05.06.2026)
### MVP 1
- Electron-Anwendung startet lokal (Main + Renderer)
- IPC-Vertrag steht und ist in Main/Preload/Renderer verdrahtet
- Simulierter Transkriptservice liefert zufällige Dummy-Transkriptsegmente
- React-UI zeigt Status + Live-Transkript über IPC
- Manuelle Zwischenprüfungen sind Bestandteil des Flows

### MVP 2
- C#-Capture-Sidecar anbinden
- Azure Speech SDK im Main auf reale Audioquellen schalten
- Loopback-Blocker-Regel mit realen Fehlercodes finalisieren
- UI/Export auf reale Daten und finale Fehlerpfade härten

## 11. Offene Entscheidungen für v0.2
1. Konkretes Windows-11-Audio-/Capture-Paket für robustes Loopback
2. Optional: expliziter Experimentpfad "kombinierte Verarbeitung"
3. Optional: Kosten-/Nutzungsgrenzen für API-Tests
