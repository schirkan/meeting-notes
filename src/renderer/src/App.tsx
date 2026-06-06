import { useEffect, useMemo, useState } from 'react'
import type { UserSettings } from '@shared/config-contract'
import {
  TRANSCRIPT_CONTRACT_VERSION,
  type AudioDeviceSnapshot,
  type TranscriptError,
  type TranscriptSegment,
  type TranscriptStatus
} from '@shared/transcript-contract'

const initialStatus: TranscriptStatus = {
  running: false,
  mode: 'mock',
  contractVersion: TRANSCRIPT_CONTRACT_VERSION
}

const initialSettings: UserSettings = {
  language: 'de-DE',
  runtimeMode: 'mock',
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
  const [settingsHint, setSettingsHint] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  useEffect(() => {
    const transcriptApi = window.transcriptApi

    if (!transcriptApi) {
      setRuntimeIssue('IPC-Bridge nicht verfügbar. Prüfe Preload/Dev-Start.')
      return
    }

    void Promise.all([transcriptApi.getStatus(), transcriptApi.getSettings(), transcriptApi.getDevices()])
      .then(([nextStatus, nextSettings, nextDevices]) => {
        setStatus(nextStatus)
        setSettings(nextSettings)
        setDevices(nextDevices)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Initialdaten konnten nicht geladen werden.'
        setRuntimeIssue(message)
      })

    const unsubSegment = transcriptApi.onSegment((segment) => {
      setSegments((prev) => [segment, ...prev].slice(0, 500))
    })

    const unsubError = transcriptApi.onError((error) => {
      setLastError(error)
    })

    const unsubStatus = transcriptApi.onStatus((nextStatus) => {
      setStatus(nextStatus)
    })

    return () => {
      unsubSegment()
      unsubError()
      unsubStatus()
    }
  }, [])

  const statusLabel = useMemo(() => {
    if (status.running) return `Läuft (${status.mode === 'real' ? 'Sidecar + Azure' : 'Mock-Service'})`
    if (lastError) return 'Fehler'
    return 'Gestoppt'
  }, [lastError, status.mode, status.running])

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

  return (
    <main className="container">
      <header>
        <h1>Meeting Notes – MVP</h1>
        <p>Live-Transkript mit Mock/Real-Modus, Device-Auswahl und TXT-Export.</p>
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
        <div className="badge">Contract: {status.contractVersion}</div>
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
            Modus
            <select
              value={settings.runtimeMode}
              onChange={(event) => setSettings((prev) => ({ ...prev, runtimeMode: event.target.value as UserSettings['runtimeMode'] }))}
              disabled={status.running}
            >
              <option value="mock">Mock</option>
              <option value="real">Real (Sidecar + Azure)</option>
            </select>
          </label>

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
          <ul>
            {segments.map((segment) => (
              <li key={segment.id} className={`segment ${segment.source}`}>
                <span className="meta">
                  [{new Date(segment.timestampIso).toLocaleString('de-DE')}] {segment.source.toUpperCase()} · {segment.speaker} · {segment.state}
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
