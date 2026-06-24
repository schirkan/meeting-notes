# T-400: WebUI (React) für Live-Transkript und Steuerung umsetzen

## Kontext
Status: review
Priorität: medium
Subtasks: T-401, T-402, T-403, T-404
Abhängigkeiten: -

## Goal
React-WebUI für Bedienung und Live-Transkript des PoC bereitstellen.

## Done When
- [x] Aufnahme steuerbar und Status klar sichtbar.
- [x] Transkripte live nach Quelle dargestellt.
- [x] Sprache/Devices konfigurierbar, TXT-Clipboard möglich.

## Approach
- Subtasks T-401 bis T-404 umsetzen.
- UI strikt über IPC-Contract anbinden.
- Fehlerzustände sichtbar und verständlich halten.

## Log
- 2026-06-03: Spec detailliert ausgefüllt.
- 2026-06-06: UI erweitert um Settings (Modus/Sprache/Devices), Fehler-/Statusanzeige und Clipboard-Export (`src/renderer/src/App.tsx`).
- 2026-06-18: UI umfassend modernisiert (Sidebar/Hero-Statuskarte, Start/Stop-Primary-Aktion, einklappbare Settings/Debug-Log-Panels, Laufzeit-/Daueranzeige, Speaker-Alias-Mapping, Toast-Hinweise, überarbeitetes Responsive-Layout).
- 2026-06-24: Debug-Panel-UX nachgeschärft: separater Floating-Button nur zum Öffnen, eigener Schließen-Button im Panel, zusätzlicher „Log löschen“-Button inkl. Toast-Rückmeldung; störende Toggle-Transition in CSS bereinigt.
