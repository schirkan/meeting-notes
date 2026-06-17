# T-200: C# Audio-Capture-Sidecar für Windows 11 implementieren

## Kontext
Status: review
Priorität: high
Subtasks: T-201, T-202, T-203, T-204, T-205, T-206, T-207
Abhängigkeiten: -

## Goal
C#-Sidecar bereitstellen, der Mic + Speaker per WASAPI stabil als PCM an Electron Main liefert.

## Done When
- [x] Sidecar startet/stopt zuverlässig via Prozesssteuerung.
- [x] Mic- und Loopback-Capture liefern kontinuierliche PCM-Frames.
- [x] Fehlerfälle sind robust abgefangen und signalisiert.

## Approach
- Subtasks T-201 bis T-206 sequenziell umsetzen.
- Audioformat zwischen Sidecar und Main früh fixieren.
- Health/Status-Events von Anfang an mitbauen.

## Log
- 2026-06-03: Spec detailliert ausgefüllt.
- 2026-06-06: Sidecar als C#-Projekt (`sidecar/`) implementiert inkl. WASAPI-Capture, Device-Listing, Named-Pipe-Frames und Exit-/Fehlerbehandlung.
- 2026-06-17: Runtime-Flow auf veröffentlichtes Sidecar-EXE umgestellt (framework-dependent publish, kein `dotnet run` im Laufzeitpfad).
