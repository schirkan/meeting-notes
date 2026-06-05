import { useEffect, useMemo, useState } from 'react'
import type { TranscriptError, TranscriptSegment, TranscriptStatus } from '@shared/transcript-contract'

const initialStatus: TranscriptStatus = { running: false, mode: 'mock' }

export function App() {
  const [status, setStatus] = useState<TranscriptStatus>(initialStatus)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [lastError, setLastError] = useState<TranscriptError | null>(null)

  useEffect(() => {
    window.transcriptApi.getStatus().then(setStatus)

    const unsubSegment = window.transcriptApi.onSegment((segment) => {
      setSegments((prev) => [segment, ...prev].slice(0, 120))
    })

    const unsubError = window.transcriptApi.onError((error) => {
      setLastError(error)
    })

    const unsubStatus = window.transcriptApi.onStatus((nextStatus) => {
      setStatus(nextStatus)
    })

    return () => {
      unsubSegment()
      unsubError()
      unsubStatus()
    }
  }, [])

  const statusLabel = useMemo(() => {
    if (status.running) return 'Läuft (Mock-Service aktiv)'
    return 'Gestoppt'
  }, [status.running])

  const onStart = async () => {
    setLastError(null)
    const next = await window.transcriptApi.start()
    setStatus(next)
  }

  const onStop = async () => {
    const next = await window.transcriptApi.stop()
    setStatus(next)
  }

  return (
    <main className="container">
      <header>
        <h1>Meeting Notes – MVP 1</h1>
        <p>IPC ist verbunden, Transkripte kommen aktuell aus einem Mock-Backend.</p>
      </header>

      <section className="controls">
        <button type="button" onClick={onStart} disabled={status.running}>
          Start
        </button>
        <button type="button" onClick={onStop} disabled={!status.running}>
          Stop
        </button>
        <div className="badge">Status: {statusLabel}</div>
      </section>

      {lastError && (
        <section className="error">
          <strong>{lastError.code}</strong>: {lastError.message}
        </section>
      )}

      <section className="panel">
        <h2>Live-Transkript</h2>
        {segments.length === 0 ? (
          <p className="empty">Noch keine Daten. Starte den Mock-Service.</p>
        ) : (
          <ul>
            {segments.map((segment) => (
              <li key={segment.id} className={`segment ${segment.source}`}>
                <span className="meta">
                  [{new Date(segment.timestampIso).toLocaleTimeString('de-DE')}] {segment.source.toUpperCase()} · {segment.speaker} · {segment.state}
                </span>
                <span>{segment.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
