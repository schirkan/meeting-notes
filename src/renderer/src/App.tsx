import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserSettings } from '@shared/config-contract'
import {
  type AudioDeviceSnapshot,
  type DebugLogEntry,
  type TranscriptError,
  type TranscriptSegment,
  type TranscriptStatus
} from '@shared/transcript-contract'

const initialStatus: TranscriptStatus = {
  running: false
}

const initialSettings: UserSettings = {
  language: 'de-DE',
  devices: {
    micId: null,
    speakerLoopbackId: null
  }
}

const initialDevices: AudioDeviceSnapshot = {
  inputs: [],
  outputs: [],
  fetchedAtIso: new Date(0).toISOString()
}

export function App() {
  const [status, setStatus] = useState<TranscriptStatus>(initialStatus)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [lastError, setLastError] = useState<TranscriptError | null>(null)
  const [runtimeIssue, setRuntimeIssue] = useState<string | null>(null)
  const [settings, setSettings] = useState<UserSettings>(initialSettings)
  const [devices, setDevices] = useState<AudioDeviceSnapshot>(initialDevices)
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([])
  const [settingsHint, setSettingsHint] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const transcriptListRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    const transcriptApi = window.transcriptApi

    if (!transcriptApi) {
      setRuntimeIssue('IPC-Bridge nicht verfügbar. Prüfe Preload/Dev-Start.')
      return
    }

    void Promise.all([transcriptApi.getStatus(), transcriptApi.getSettings(), transcriptApi.getDevices(), transcriptApi.getDebugLog()])
      .then(([nextStatus, nextSettings, nextDevices, nextDebugLog]) => {
        setStatus(nextStatus)
        setSettings(nextSettings)
        setDevices(nextDevices)
        setDebugLog(nextDebugLog)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Initialdaten konnten nicht geladen werden.'
        setRuntimeIssue(message)
      })

    const unsubSegment = transcriptApi.onSegment((segment) => {
      setSegments((prev) => {
        const sameSpeakerKey = (entry: TranscriptSegment) =>
          entry.source === segment.source && entry.speaker === segment.speaker

        const isUnknownSpeaker = (speaker: string) => {
          const normalized = speaker.trim().toLowerCase()
          return normalized === 'unknown'
        }

        const withoutInterimForSpeaker = prev.filter(
          (entry) => !(sameSpeakerKey(entry) && entry.state === 'interim')
        )

        const withoutUnknownInterimForSource = withoutInterimForSpeaker.filter(
          (entry) => !(entry.source === segment.source && entry.state === 'interim' && isUnknownSpeaker(entry.speaker))
        )

        if (segment.state === 'final') {
          const previousFinalIndex = [...withoutUnknownInterimForSource]
            .reverse()
            .findIndex((entry) => sameSpeakerKey(entry) && entry.state === 'final')

          if (previousFinalIndex >= 0) {
            const actualIndex = withoutUnknownInterimForSource.length - 1 - previousFinalIndex
            const previousFinal = withoutUnknownInterimForSource[actualIndex]

            if (actualIndex === withoutUnknownInterimForSource.length - 1) {
              const mergedFinal: TranscriptSegment = {
                ...segment,
                id: previousFinal.id,
                text: `${previousFinal.text} ${segment.text}`.trim(),
                timestampIso: segment.timestampIso
              }

              return withoutUnknownInterimForSource
                .map((entry, index) => (index === actualIndex ? mergedFinal : entry))
                .slice(-500)
            }
          }

          return [...withoutUnknownInterimForSource, segment].slice(-500)
        }

        return [...withoutUnknownInterimForSource, segment].slice(-500)
      })
    })

    const unsubError = transcriptApi.onError((error) => {
      setLastError(error)
    })

    const unsubStatus = transcriptApi.onStatus((nextStatus) => {
      setStatus(nextStatus)
    })

    const unsubDebugLog = transcriptApi.onDebugLog((entry) => {
      setDebugLog((prev) => [entry, ...prev].slice(0, 300))
    })

    return () => {
      unsubSegment()
      unsubError()
      unsubStatus()
      unsubDebugLog()
    }
  }, [])

  useEffect(() => {
    if (!transcriptListRef.current) return
    transcriptListRef.current.scrollTop = transcriptListRef.current.scrollHeight
  }, [segments])

  const statusLabel = useMemo(() => {
    if (status.running) return 'Läuft'
    if (lastError) return 'Fehler'
    return 'Gestoppt'
  }, [lastError, status.running])

  const onStart = async () => {
    try {
      setLastError(null)
      const next = await window.transcriptApi.start()
      setStatus(next)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Start fehlgeschlagen.'
      setLastError({ code: 'UI_START_FAILED', message })
    }
  }

  const onStop = async () => {
    try {
      const next = await window.transcriptApi.stop()
      setStatus(next)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stop fehlgeschlagen.'
      setLastError({ code: 'UI_STOP_FAILED', message })
    }
  }

  const onSaveSettings = async () => {
    try {
      const saved = await window.transcriptApi.saveSettings(settings)
      setSettings(saved)
      const refreshedDevices = await window.transcriptApi.getDevices()
      setDevices(refreshedDevices)
      setSettingsHint('Einstellungen gespeichert.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden.'
      setSettingsHint(message)
    }
  }

  const onCopyTranscript = async () => {
    try {
      await window.transcriptApi.copyTranscript(segments)
      setCopyHint('Finales Transkript wurde in die Zwischenablage kopiert.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kopieren fehlgeschlagen.'
      setCopyHint(message)
    }
  }

  const finalCount = segments.filter((segment) => segment.state === 'final').length

  const getSpeakerClass = (speaker: string) => {
    const normalized = speaker.toLowerCase()

    if (normalized.includes('guest-1')) return 'speaker-guest-1'
    if (normalized.includes('guest-2')) return 'speaker-guest-2'
    if (normalized.includes('guest-3')) return 'speaker-guest-3'
    if (normalized.includes('guest-4')) return 'speaker-guest-4'
    if (normalized.includes('unknown')) return 'speaker-unknown'
    if (normalized.includes('self')) return 'speaker-mic-self'
    if (normalized.includes('guest')) return 'speaker-guest-1'

    return ''
  }

  return (
    <main className="container">
      <header>
        <h1>Meeting Notes – MVP</h1>
        <p>Live-Transkript mit Sidecar + Azure, Device-Auswahl und TXT-Export.</p>
      </header>

      {runtimeIssue && (
        <section className="error">
          <strong>RUNTIME_BRIDGE_MISSING</strong>: {runtimeIssue}
        </section>
      )}

      <section className="controls">
        <button type="button" onClick={onStart} disabled={status.running || !!runtimeIssue}>
          Start
        </button>
        <button type="button" onClick={onStop} disabled={!status.running || !!runtimeIssue}>
          Stop
        </button>
        <button type="button" onClick={onCopyTranscript} disabled={finalCount === 0}>
          TXT in Clipboard
        </button>
        <div className="badge">Status: {statusLabel}</div>
      </section>

      {copyHint && <section className="hint">{copyHint}</section>}

      {lastError && (
        <section className="error">
          <strong>{lastError.code}</strong>: {lastError.message}
        </section>
      )}

      <section className="panel settings">
        <h2>Einstellungen</h2>
        <div className="row">
          <label>
            Sprache
            <input
              value={settings.language}
              onChange={(event) => setSettings((prev) => ({ ...prev, language: event.target.value }))}
              disabled={status.running}
            />
          </label>
        </div>

        <div className="row">
          <label>
            Mikrofon
            <select
              value={settings.devices.micId ?? ''}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  devices: { ...prev.devices, micId: event.target.value || null }
                }))
              }
              disabled={status.running}
            >
              <option value="">System-Default</option>
              {devices.inputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} {device.isDefault ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            Speaker Loopback
            <select
              value={settings.devices.speakerLoopbackId ?? ''}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  devices: { ...prev.devices, speakerLoopbackId: event.target.value || null }
                }))
              }
              disabled={status.running}
            >
              <option value="">System-Default</option>
              {devices.outputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} {device.isDefault ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" onClick={onSaveSettings} disabled={status.running}>
          Einstellungen speichern
        </button>
        {settingsHint && <div className="hint">{settingsHint}</div>}
      </section>

      <section className="panel">
        <h2>Live-Transkript</h2>
        {segments.length === 0 ? (
          <p className="empty">Noch keine Daten. Starte den Service.</p>
        ) : (
          <ul ref={transcriptListRef} className="transcript-list">
            {segments.map((segment) => (
              <li key={segment.id} className={`segment ${segment.source}`}>
                <span className="meta">
                  [{new Date(segment.timestampIso).toLocaleString('de-DE')}] {segment.source.toUpperCase()} · {segment.state}
                </span>
                <div className="segment-badges">
                  <span className={`speaker-badge ${segment.source} ${getSpeakerClass(segment.speaker)}`.trim()}>{segment.speaker}</span>
                </div>
                <span>{segment.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel debug-log-panel">
        <h2>Sidecar Debug-Log</h2>
        {debugLog.length === 0 ? (
          <p className="empty">Noch keine Debug-Einträge.</p>
        ) : (
          <ul className="debug-log-list">
            {debugLog.map((entry) => (
              <li key={entry.id} className={`debug-log-entry ${entry.level}`}>
                <span className="meta">
                  [{new Date(entry.timestampIso).toLocaleString('de-DE')}] {entry.source.toUpperCase()} · {entry.level}
                </span>
                <span>{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
