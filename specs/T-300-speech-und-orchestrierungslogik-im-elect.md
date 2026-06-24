# T-300: Speech- und Orchestrierungslogik im Electron Main implementieren

## Kontext
Status: review
Priorität: high
Subtasks: T-301, T-302, T-303, T-304, T-305, T-306
Abhängigkeiten: -

## Goal
Electron Main als Orchestrator für Sidecar, Azure Speech und IPC-Eventstream umsetzen.

## Done When
- [x] Main steuert Sidecar-Lifecycle stabil.
- [x] PCM wird in Speech-Pipeline eingespeist.
- [x] Transkripte/Status werden live an Renderer übertragen.

## Approach
- Subtasks T-301 bis T-306 als Kernimplementierung umsetzen.
- Eventmodell zuerst fixieren, danach Integrationen.
- Diagnostik-Logging von Anfang an aktivieren.

## Log
- 2026-06-03: Spec detailliert ausgefüllt.
- 2026-06-06: Main-Orchestrierung umgesetzt (`src/main/*`): Sidecar-Start/Stop + Pipe-Frame-Parsing + optionale Azure-Speech-Pipeline + IPC-Status/Fehler/Segment-Streaming.
- 2026-06-24: Diagnostik im Main erweitert: detaillierte Startpfad-Logs (aufgelöste Device-Auswahl, Azure-Konfig-Metadaten ohne Secret-Leak, Sidecar-Startparameter) sowie zusätzliche Startfehler-Details (Stacktrace) im Debug-Log.
- 2026-06-24: Azure-Recognizer-Startfehler (`startContinuousRecognitionAsync`/`startTranscribingAsync`) werden explizit als `AZURE_RECOGNIZER_FAILED` in den UI-Fehlerkanal emittiert (nicht nur Debug-Log).
