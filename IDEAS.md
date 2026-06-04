# Ideenphase — PoC Client-Anwendung (Node.js + Electron + React)

Stand: 02.06.2026
Status: **Ideensammlung (keine Implementierung gestartet)**

## Zielbild (PoC)
Eine einfache Desktop-Client-Anwendung, die:
- Mikrofon-Audio erfasst
- primären Speaker-Output (System-/Loopback-Audio) erfasst
- beide Signale über eine API transkribiert
- Transkripte übersichtlich im UI darstellt

Fokus: **Funktional demonstrieren**, nicht Produktionsreife.

---

## Kernideen für den PoC

## 1) Minimaler Funktionsumfang (MVP für Demo)
- Start/Stop Aufnahme
- Auswahl/Anzeige der Audioquellen:
  - Mikrofon (Default + optional manuell)
  - Speaker-Output (primäres Ausgabegerät)
- Live-Status im UI (läuft/gestoppt, Fehlerindikator)
- Transkript-Ausgabe in Echtzeit oder in kurzen Blöcken (z. B. alle 2–5s)
- Export als TXT (optional, falls schnell umsetzbar)

## 2) Einfache UI-Struktur (React)
- **Header:** App-Status + API-Verbindungsstatus
- **Control Panel:**
  - Quelle anzeigen
  - Start/Stop
  - "Aufnahme aktiv" Indikator
- **Transcript Panel:**
  - laufende Transkriptzeilen
  - Kennzeichnung nach Quelle (Mic / Speaker)
  - Zeitstempel pro Segment

## 3) Technischer Schnitt (ohne tiefe Implementierungsdetails)
- Electron als Shell (Desktop, Zugriff auf Systemressourcen)
- React für UI
- Node.js/Electron-Main für Audio-Capture-Orchestrierung
- Transkriptions-API als externer Dienst
- Segment-basierter Upload (Chunks), damit PoC responsiv bleibt

## 4) Datenmodell (leichtgewichtig)
Jedes Segment enthält mindestens:
- `source`: `mic` | `speaker`
- `startTime` / `endTime`
- `text`
- `confidence` (falls von API geliefert)

## 5) Qualitäts-/PoC-Leitplanken
- Klare Fehlermeldungen statt "silent fail"
- Keine komplexe Benutzerverwaltung
- Keine dauerhafte Datenbank nötig
- Lokale Sitzung reicht (optional Datei-Export)

---

## Risiken & Stolpersteine (früh benennen)
- **Speaker-Loopback-Capture** ist je nach OS/Hardware/Driver unterschiedlich zuverlässig
- Laut Microsoft-Quickstart ist **Mikrofon-Erkennung in Node.js nicht direkt unterstützt**; für Electron sind daher Renderer-Capture oder externe Capture-Bibliotheken als Ingest-Pfad einzuplanen
- Latenz und API-Kosten bei sehr kleinen Chunks
- Audio-Synchronität zwischen Mic und Speaker
- Berechtigungen (Mikrofon/Systemaudio)

---

## Offene Punkte für die Spezifikationsphase
1. Welches Audio-/Capture-Paket für Windows 11 (inkl. zuverlässigem Speaker-Loopback) wird verwendet?
2. Soll kombinierte Verarbeitung (falls paketseitig gut unterstützt) als optionaler Experimentpfad im PoC explizit eingeplant werden?
3. Kosten-/Nutzungsgrenzen für API-Tests (optional)

## Bereits festgelegt
- Zielplattform: Windows 11 (Laptop mit integriertem Mikrofon)
- Bluetooth-Headsets: out of Scope
- Kabelgebundene Headsets: unterstützt
- Build: unsigniert, portable
- Transkriptions-API: Azure Speech
- Verarbeitung: bevorzugt getrennte Pipelines für Mic/Speaker (parallele API-Calls); kombinierte Verarbeitung optional evaluierbar
- Darstellung: getrennt nach Quelle (Mic/Speaker); Mehrsprecher-Differenzierung ist Nice-to-have
- Modus: bevorzugt Echtzeit-Streaming, Chunking als zulässige Alternative
- Latenzziel: Anzeige neuer Segmente in < 5 Sekunden
- Spracheinstellung: persistent über Neustarts
- Zeitformat: deutsches Datums-/Zeitformat
- Loopback-Ausfall: Aufnahme blockieren
- Ausgabe: React-UI + vollständiger TXT-Clipboard-Export (Sprecher/Quelle, Uhrzeit, Text sofern verfügbar)
- Konfiguration: Azure/API über feste JSON-Datei; UI-änderbar nur Sprache und Device-Auswahl (wenn nicht Default)

---

## Vorschlag für nächste Phase (Spezifikation)
- Scope auf 1 Plattform und 1 API festziehen
- "Must-have" vs. "Nice-to-have" als priorisierte Liste
- Akzeptanzkriterien für den PoC definieren (z. B. Testablauf mit erwarteten Ergebnissen)
