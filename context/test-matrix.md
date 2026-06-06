# Testmatrix (T-502)

| Szenario | Erwartung | Ergebnis | Notiz |
|---|---|---|---|
| Integriertes Mic + Standard-Speaker | Start möglich, Segmente laufen | PASS (Mock), [blocked] Real | Real-Modus hängt von Azure-Key + Zielhardware ab |
| Kabelgebundenes Headset | Device auswählbar, Capture läuft | [blocked] | Headset-Hardware im CI/Container nicht verfügbar |
| Loopback-Ausfall | Start wird blockiert mit dediziertem Fehlercode | PASS | Fehlercodes `LOOPBACK_REQUIRED` / `LOOPBACK_DEVICE_NOT_FOUND` implementiert |

Status: Teilweise blockiert wegen fehlender physischer Zielhardware.
