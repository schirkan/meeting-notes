# Troubleshooting (Node / Electron Install)

Stand: 05.06.2026

## Symptom
Beim Start mit `npm run dev` erscheint:
- `Error: Electron uninstall`
- `Electron failed to install correctly`

## Ursache (Stand heute)
Bekannte Upstream-Problematik rund um `extract-zip` bei neueren Node-Versionen.

Relevante Issues:
- Node.js: https://github.com/nodejs/node/issues/63487
- Electron: https://github.com/electron/electron/issues/51619

## Sofortmaßnahme (empfohlen)
1. `nvm install 22`
2. `nvm use 22`
3. `npm ci` (oder `npm install`)
4. `npm run check:node`
5. `npm run dev`

## Projekt-Policy
- Standardversion via `.nvmrc`: `22`
- Harte Engine-Grenze via `engines` + `.npmrc (engine-strict=true)`
- Erlaubt:
  - `>=22.12.0 <23`
  - `>=24.0.0 <24.16.0`

## Wartung
Wenn ein korrigiertes Node-24-Release veröffentlicht ist und verifiziert wurde:
- `package.json` (`engines`) anpassen
- `scripts/check-node.mjs` anpassen
- README + dieses Dokument aktualisieren

### Re-Evaluate-Zyklus
- **Nächste geplante Prüfung:** 2026-09-25 (Quartalsweise)
- **Verantwortlich:** Maintainer (siehe `package.json` maintainers, falls vorhanden)
- **Prüfschritte:**
  1. Upstream-Issues (`nodejs/node#63487`, `electron/electron#51619`) auf Closed-Status prüfen
  2. Aktuelle Node-24-Patch-Releases auf Release-Notes zu `extract-zip` / `tar`-Pfad durchsehen
  3. `npm install` + `npm run dev` mit der aktuellsten 24.x-Version reproduzieren
  4. Bei Erfolg: `engines` + `check-node.mjs` lockern, README + TROUBLESHOOTING aktualisieren, Doku-Eintrag mit Datum ergänzen
- **Letzter Prüflauf (bestätigt, dass 24.16+ weiterhin blockiert ist):** 2026-06-25 (Heuristik: keine Commits in den genannten Issues, die `extract-zip`-Regression vollständig addressieren)

---

# Troubleshooting (Azure / Netzwerk / Proxy)

Stand: 25.06.2026

## Symptom
App startet fehlerfrei, Sidecar liefert Audio-Frames (sichtbar im Debug-Log als `pushFrame-Statistik ...`), beide Recognizer starten ohne Fehler (`startTranscribingAsync gestartet`, `startContinuousRecognitionAsync gestartet`), aber es erscheinen **keine Transcripts im UI**. Kein Azure-Auth-Fehler, kein `Recognizer canceled`, kein `transcript:error`.

## Diagnose-Werkzeug
Im UI: **Settings → Azure-Konfiguration → „Verbindung testen"** klicken. Die Diagnose (`src/main/azure-connectivity.ts`) führt 4 Schritte aus und zeigt alle Ergebnisse:

1. **DNS-System-Resolver** — kann der lokale DNS den Endpoint-Host auflösen?
2. **DNS-Fallback-Resolver** — Vergleichswert, oft `8.8.8.8` o. ä. Deckt auf, ob ein Corporate-DNS Custom-Domains filtert.
3. **TCP-Connect auf Port 443** — Firewalls/Proxies, die nur ICMP durchlassen, schlagen hier mit `EACCES`/`ECONNREFUSED` fehl.
4. **HTTPS-HEAD-Probe** — unterscheidet Netzwerkfehler von HTTP-Fehlern (z. B. 401/403/404).

## Bekannte Befund-Muster und ihre Ursachen

### Muster A: DNS OK + TCP 443 EACCES + HTTPS `fetch failed`
**Ursache:** Ausgehende Windows-Firewall (oder Endpoint-Security) blockt TCP 443 zu Azure-IPs.
**Lösung:** Verbindung muss über einen konkreten Proxy laufen (siehe unten).

### Muster B: DNS OK + TCP 443 OK + HTTPS `401 Unauthorized`
**Ursache:** Endpoint erreichbar, aber `speechKey` ungültig oder für diese Region nicht autorisiert. Custom-Domain-Endpoints (`*.cognitiveservices.azure.com`) müssen zur gleichen Region gehören wie der Key.
**Lösung:** Im Azure-Portal prüfen: Resource-Region == Key-Region == Endpoint-Region.

### Muster C: DNS NXDOMAIN + TCP-Test übersprungen
**Ursache:** Corporate-DNS filtert die Custom-Domain (häufig bei `*.cognitiveservices.azure.com` in fremden Tenants).
**Lösung:** px-Proxy muss DNS-Anfragen für die Domain an einen externen Resolver (8.8.8.8 / 1.1.1.1) weiterleiten. Oder im px-Proxy DNS-Bypass-Regel für die Domain anlegen.

### Muster D: Alle Schritte OK, App zeigt trotzdem keine Transcripts
**Ursache:** Sehr wahrscheinlich Problem auf der Azure-SDK-Seite, nicht im Netzwerk.
**Lösung:** Debug-Log auf `Recognizer canceled`-Events prüfen; ggf. `speechKey` neu generieren.

## Workaround für „native Azure-SDK nutzt den Proxy nicht"

Bestätigt auf einem konkreten Zielsystem (Stand 25.06.2026): Die native Azure-Speech-SDK (`microsoft-cognitiveservices-speech-sdk` 1.44.x) nutzt die per `setProxy()` gesetzten Proxy-Properties nicht für den ausgehenden WSS-Connect — selbst wenn der Proxy selbst funktioniert (per `curl -x ...` verifiziert) und die App-Code-Konfiguration korrekt ist.

**Bisher verfügbare Workarounds:**

### A) System-Proxy global setzen (1 Minute, Admin-rechtig)
```powershell
# Proxy global für alle ausgehenden HTTP/HTTPS-Verbindungen setzen
netsh winhttp set proxy 127.0.0.1:3128

# App starten
# Nach Beendigung zurücksetzen
netsh winhttp reset proxy
```
**Wirkung:** Native SDK und alle anderen Windows-Komponenten gehen durch den Proxy. Wirkt sofort, kein App-Code nötig.

### B) DNS-Forwarding im px-Proxy konfigurieren (Empfehlung für Corp-Setups)
Im px-Proxy DNS-Anfragen für `*.cognitiveservices.azure.com` an externe Resolver (z. B. 8.8.8.8) weiterleiten statt über den internen DNS. Dann funktioniert die DNS-Auflösung, und die native SDK kann die IP per `connect()` erreichen — vorausgesetzt, die Firewall lässt 443 zu Azure durch.

### C) App-Code-Workaround (geplant, offen)
Siehe `specs/T-505-proxy-aware-azure-transport.md` für die geplante Variante. Nicht implementiert; Entscheidung über Variante 1–4 ausstehend.

## Wartung
- Bei Änderungen am Verhalten der Azure-SDK bitte Befundmuster aktualisieren.
- Bei neuem Proxy-Support in der SDK (Tracking: Azure-Speech-SDK GitHub Issues) Workaround-Block entsprechend abspecken.
