# T-505: Proxy-aware Azure-Transport (Workaround für native SDK Proxy-Limit)

## Kontext
Status: draft
Priorität: high
Parent Task: T-300
Abhängigkeiten: T-303, T-304, T-306

## Goal
Auf Zielsystemen mit restriktiver ausgehender Firewall (z. B. Corporate-Netze mit px-Proxy `127.0.0.1:3128`) soll die Azure-Transkription trotzdem funktionieren, auch wenn die native Azure-Speech-SDK die per `setProxy()` gesetzten Properties nicht für den ausgehenden WSS-Connect nutzt.

## Symptom (bekannt seit 25.06.2026)
- Sidecar liefert Audio-Frames korrekt (60 ms, 16 kHz mono PCM, PushStream-Diagnose OK).
- Beide Recognizer starten ohne Fehler (`startTranscribingAsync`, `startContinuousRecognitionAsync` resolved).
- Es kommen keine `Session gestartet`-, `Speech start erkannt`-, `transcript:segment`-Events.
- `azureConnectivity.diagnoseEndpointReachability()` zeigt `TCP 443 EACCES` auf die aufgelöste Azure-IP.
- `curl -x http://127.0.0.1:3128 -I https://<endpoint>/` liefert `HTTP/1.1 200 Service Operational` → Proxy selbst funktioniert.
- Auf einem anderen System ohne Proxy funktioniert die identische Konfiguration.

## Root Cause (bestätigt)
Die native Azure-Speech-SDK in Node.js (`microsoft-cognitiveservices-speech-sdk` 1.44.x) ruft die per `SpeechConfig.setProxy()` gesetzten Proxy-Properties im Node-Pfad nicht zuverlässig ab. Stattdessen geht sie mit der nativen HTTP/WSS-Implementierung direkt auf TCP 443 — was von einer ausgehenden Windows-Firewall oder Endpoint-Security blockiert wird (`EACCES`). Der `setProxy()`-Aufruf selbst ist korrekt und wirft keinen Fehler, hat aber **keinen sichtbaren Effekt** auf den tatsächlichen Connect.

Sekundäres Symptom: Der interne Corporate-DNS-Server filtert Custom-Domain-Einträge (`*.cognitiveservices.azure.com` zeigt NXDOMAIN für Custom-Resources aus fremden Tenants). Das ist aber nicht der Hauptgrund — die Default-Region-URL `swedencentral.stt.speech.microsoft.com` zeigt das gleiche Verhalten.

## Done When
- App-seitige Implementierung eines Workarounds, der die Transkription auch in restriktiven Netzwerkumgebungen ermöglicht.
- Diagnose-Hilfsmittel sind dokumentiert und über den Verbindung-testen-Button erreichbar.
- Bei Auswahl „Eigenbau" (Variante 3): die App arbeitet mit dem px-Proxy; Diarization-Feature ist möglicherweise eingeschränkt, das ist dokumentiert.

## Approach (zur Auswahl)

### Variante 1: System-Proxy via `netsh` (außerhalb der App)
- `netsh winhttp set proxy 127.0.0.1:3128` als Installationsschritt / Runbook.
- **Vorteil:** 1 Minute, kein Code.
- **Nachteil:** Beeinflusst alle Windows-Apps auf dem System, muss Admin sein, muss später wieder zurückgesetzt werden. Nicht reproduzierbar mit einer Installer-Story.

### Variante 2: Env-Var-Konfiguration vor SDK-Init (Quick-Fix)
- Im Main-Prozess vor `import('microsoft-cognitiveservices-speech-sdk')` setzen:
  - `process.env.HTTPS_PROXY = 'http://127.0.0.1:3128'`
  - `process.env.NODE_EXTRA_CA_CERTS = '<pfad>'` (falls TLS-Interception)
  - `dns.setServers(['8.8.8.8', '1.1.1.1'])` (DNS-Bypass)
- **Vorteil:** Schnell, ~30 Min Code-Änderung.
- **Nachteil:** Native Module respektieren diese Env-Vars oft nicht; Verhalten versionsabhängig.

### Variante 3: Eigenbau eines Azure-Speech-WSS-Clients (robuste Lösung)
- Node-`ws`/`https-proxy-agent` für Proxy-fähigen WSS-Connect zum Azure-Speech-Dienst.
- Implementierung des Azure-Speech-Protokolls über die Public-Doku (Connect-Message, Speech-Audio-Binary-Frames, Result-Events).
- Audio vom Sidecar direkt reinschickt, Transcripts an den Renderer.
- **Vorteil:** Funktioniert garantiert mit dem px-Proxy, keine nativen Bugs.
- **Nachteil:** Wir verlieren Features wie Diarization, Continuous LID, evtl. AutoDetect-Source-Language. Aufwand ~3–4 Std., größeres Refactoring (azure-transcription-service.ts wird deutlich kleiner, dafür neuer azure-wss-client.ts).

### Variante 4: App-Hinweis statt Workaround
- Im Verbindung-testen-Result klar kommunizieren, dass das System einen Proxy braucht.
- Runbook-Hinweis auf `netsh winhttp set proxy` und DNS-Forwarding im px-Proxy.
- **Vorteil:** Null App-Code-Aufwand.
- **Nachteil:** Kein App-Selbstheilungs-Pfad, Nutzer muss manuell handeln.

## Decision (offen)
Nutzerentscheidung zwischen Variante 2 (Quick-Fix), Variante 3 (robust) oder Variante 4 (kein App-Code). Stand 25.06.2026: zurückgestellt.

## Log
- 2026-06-25: Befund dokumentiert; Diagnose-Werkzeug implementiert (Commit `5d90c63`, `79d2b11`, `b08c115`); Variante-Entscheidung steht aus.