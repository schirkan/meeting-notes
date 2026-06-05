# Project: Meeting Notes

## Current Status
- Aktiviert am 01.06.2026.
- Fokus: Strukturierte Erfassung und Nachverfolgung von Meeting-Notizen.
- 02.06.2026: Ideenphase für eine PoC-Client-Anwendung (Node.js + Electron + React) dokumentiert.
- Keine Implementierung gestartet; Spezifikation folgt nach Ideenabstimmung.
- 02.06.2026: Technische Paketanalyse für Azure Speech SDK (JS/NPM) inkl. PoC-relevanter Methoden und Codebeispiele dokumentiert.
- 03.06.2026: Variante-B-Architektur konkretisiert und dokumentiert (C#-Capture-Sidecar am Main Process, Speech SDK im Main, IPC-Streaming der Transkripte ins WebUI).
- 03.06.2026: Specs für alle PoC-Tasks im Ordner `specs/` detailliert ausgefüllt und mit Tasks verknüpft.
- 05.06.2026: Umsetzung in MVP 1 (Electron + IPC + Mock + UI) und MVP 2 (C# Sidecar + Azure Speech) aufgeteilt und dokumentiert.
- 05.06.2026: MVP-1-Implementierung gestartet; Grundgerüst (Electron-Vite), IPC-Kanäle, Mock-Transkriptservice und erste React-Anbindung umgesetzt.
- 05.06.2026: Node-Setup gehärtet (LTS-Default via `.nvmrc`, Engine-Range + `engine-strict`, Version-Check-Skript) aufgrund reproduziertem Electron-Installproblem unter Node 24.16.x.

## Scope
- Notizen aus Meetings sammeln
- To-dos und Entscheidungen festhalten
- Nachverfolgung offener Punkte

## Session Log
- 01.06.2026: Projekt erstellt und aktiviert.
- 01.06.2026, 21:54 UTC: Projekt beendet. Zusammenfassung: Struktur und Basisdateien angelegt, Projekt aktiviert, keine weiteren Aufgaben umgesetzt.
- 02.06.2026, 09:50 UTC: Ideen für PoC-Audio-Transkriptions-Client dokumentiert (Mic + primärer Speaker-Output, API-Transkription, simple UI), ohne Implementierungsstart.
- 02.06.2026, 09:57 UTC: Rahmen für Spezifikationspunkt Zielplattform konkretisiert (Windows 11 only, Laptop mit integriertem Mikrofon, Bluetooth out of Scope, kabelgebundene Headsets unterstützt, Sprache einstellbar, unsigniert + portable).
- 02.06.2026, 10:02 UTC: Entscheidung dokumentiert, dass Speaker-Loopback verpflichtend bleibt, die konkrete technische Realisierung aber bis zur Paket-/API-Auswahl offen ist; offene Klärungsfragen in IDEAS.md ergänzt.
- 02.06.2026, 10:08 UTC: Spezifikationsentscheidungen ergänzt: Azure Speech als API, getrennte Darstellung inkl. Diarization-Ziel, Loopback-Ausfall blockiert Aufnahme, Ausgabe in React-UI mit TXT-Clipboard-Export.
- 02.06.2026, 10:13 UTC: Weitere Spezifikation konkretisiert: getrennte Mic/Speaker-Pipelines bevorzugt (kombinierte Verarbeitung optional evaluierbar), Diarization als Nice-to-have, Streaming bevorzugt mit Chunking-Alternative, persistente Spracheinstellung, Voll-Export als TXT inkl. Sprecher/Quelle, Uhrzeit und Text.
- 02.06.2026, 10:16 UTC: Latenzziel (<5s), deutsches Zeitformat sowie JSON-basierte API-Festkonfiguration (UI-änderbar nur Sprache/Devices) festgelegt; Spezifikationsentwurf als SPEC-v0.1.md erstellt.
- 02.06.2026, 12:32 UTC: Tiefenanalyse des Pakets `microsoft-cognitiveservices-speech-sdk` durchgeführt; Übersicht PoC-relevanter Methoden, Komplexitätsbewertung und Codebeispiele unter `context/azure-speech-sdk-js-poc-methoden.md` abgelegt.
- 02.06.2026, 14:27 UTC: Doku präzisiert: `fromDefaultMicrophoneInput()` ist Input, `fromDefaultSpeakerOutput()` ist Output/Playback (kein Loopback-Capture); daraus abgeleitete Architekturhinweise ergänzt.
- 02.06.2026, 16:05 UTC: Nachforschung zu `fromDefaultSpeakerOutput()` vertieft (SDK-Implementierung, API-Referenz, Diarization-Quickstart, externe Fundstellen). Ergebnis: Nutzung primär im TTS/Playback-Kontext; Browser-/Node-Capture-Fähigkeiten für Speaker-Output separat eingeordnet.
- 02.06.2026, 18:44 UTC: Zusatzanalyse zur MAS-V2-Doku (model-based echo cancellation): C#/C++-Support bestätigt; fehlende JS-API-Exponierung im npm-Paket dokumentiert; alternative JS-Wege für Speaker-Capture vorbereitet.
- 03.06.2026, 17:08 UTC: Spezifikation ergänzt und Entscheidung festgehalten: C#-Capture als Sidecar am Electron Main Process, Azure Speech SDK im Main Process, Transkript-Streaming per IPC ins WebUI.
- 03.06.2026, 17:13 UTC: Umsetzungs-Backlog für den PoC erstellt (27 Tasks inkl. Parent-/Subtask-Struktur) und in `tasks.json` hinterlegt.
- 03.06.2026, 20:16 UTC: Spezifikationsdokumente für alle 27 Tasks im Ordner `specs/` ausgearbeitet (Goal, Done-When, Approach, Abhängigkeiten) und `specFile`-Referenzen in `tasks.json` ergänzt.
- 05.06.2026, 09:10 UTC: MVP-Aufteilung gemäß Nutzerpriorität dokumentiert (erst Basics + IPC mit Mock + React-UI, danach C#/Speech in MVP 2) und in DECISIONS/SPEC ergänzt.
- 05.06.2026, 09:10 UTC: Implementierung von MVP 1 begonnen: Electron/React-Projektstruktur angelegt, IPC-Vertrag als Shared-Type eingeführt, Mock-Transcript-Service eingebaut, UI-Start/Stop + Live-Liste verdrahtet, Build/Typecheck erfolgreich.
- 05.06.2026, 11:19 UTC: Root-Cause-Check mit frischem Hello-World-Electron-Vite-Projekt durchgeführt (gleicher Fehler reproduziert), anschließend Node-Version-Guardrails im Projekt ergänzt (`.nvmrc`, `.npmrc`, `engines`, `scripts/check-node.mjs`, README-Update).
