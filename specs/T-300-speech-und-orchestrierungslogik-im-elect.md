# T-300: Speech- und Orchestrierungslogik im Electron Main implementieren

## Kontext
Status: open
Priorität: high
Subtasks: T-301, T-302, T-303, T-304, T-305, T-306
Abhängigkeiten: -

## Goal
Electron Main als Orchestrator für Sidecar, Azure Speech und IPC-Eventstream umsetzen.

## Done When
- [ ] Main steuert Sidecar-Lifecycle stabil.
- [ ] PCM wird in Speech-Pipeline eingespeist.
- [ ] Transkripte/Status werden live an Renderer übertragen.

## Approach
- Subtasks T-301 bis T-306 als Kernimplementierung umsetzen.
- Eventmodell zuerst fixieren, danach Integrationen.
- Diagnostik-Logging von Anfang an aktivieren.

## Log
- 2026-06-03: Spec detailliert ausgefüllt.
