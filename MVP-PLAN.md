# MVP-Plan (manuelle Zwischenprüfungen)

Stand: 05.06.2026

## MVP 1 — App-Start, IPC mit Mock, React-UI

### Ziel
Früh ein lauffähiges Ende-zu-Ende-Skelett bereitstellen (Electron Main ↔ IPC ↔ React Renderer), ohne C# und ohne Azure Speech.

### Reihenfolge
1. Basics: Electron-App startet lokal
2. IPC-Schnittstelle im Main bereitstellen
3. Mock-Backend erzeugt zufällige Dummy-Transkriptsegmente
4. React-UI bindet IPC an und zeigt Live-Daten

### Manuelle Zwischenprüfungen
- Checkpoint 1: `npm run dev` startet Fenster ohne Fehler.
- Checkpoint 2: Start/Stop im UI steuert den Mock-Service über IPC.
- Checkpoint 3: Live-Liste zeigt zufällige Mic/Speaker-Segmente mit Zeitstempel.
- Checkpoint 4: Fehlerkanal kann im UI dargestellt werden.

### IPC-Vertrag (MVP-1)

#### Commands (Renderer -> Main)
- `transcript:start` (invoke) → `TranscriptStatus`
- `transcript:stop` (invoke) → `TranscriptStatus`
- `transcript:get-status` (invoke) → `TranscriptStatus`

#### Events (Main -> Renderer)
- `transcript:segment` → `TranscriptSegment`
- `transcript:status` → `TranscriptStatus`
- `transcript:error` → `TranscriptError`

### Mock-Daten
- Quelle: `mic` oder `speaker`
- Zustand: `interim` oder `final`
- Sprecher: einfache Dummy-Werte (`Du`, `Gegenüber`)
- Zeit: ISO intern, Darstellung im UI als `de-DE`

---

## MVP 2 — Echte Audio-/Speech-Anbindung

### Ziel
Mock austauschen gegen echte Pipeline:
- C# Sidecar für Audio-Capture
- Azure Speech SDK im Electron Main
- bestehendes IPC/Eventmodell bleibt stabil

### Geplante Schritte
1. Sidecar-Lifecycle und PCM-Protokoll integrieren
2. Speech-Recognizer anbinden (interim/final)
3. Loopback-Blocker-Regel hart durchsetzen
4. UI auf reale Events/Fehlercodes finalisieren
