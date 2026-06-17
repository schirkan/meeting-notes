import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserSettings } from '@shared/config-contract'
import {
  type AudioDeviceSnapshot,
  type DebugLogEntry,
  type TranscriptError,
  type TranscriptSegment,
  type TranscriptStatus
} from '@shared/transcript-contract'

const languageOptions = [
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'en-US', label: 'Englisch' },
  { value: 'fr-FR', label: 'Französisch' },
  { value: 'es-ES', label: 'Spanisch' },
  { value: 'it-IT', label: 'Italienisch' },
  { value: 'pt-BR', label: 'Portugiesisch' },
  { value: 'nl-NL', label: 'Niederländisch' },
  { value: 'pl-PL', label: 'Polnisch' },
  { value: 'tr-TR', label: 'Türkisch' },
  { value: 'ja-JP', label: 'Japanisch' }
] as const

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [speakerAliases, setSpeakerAliases] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())
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

  useEffect(() => {
    if (!status.running || !status.startedAt) return

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [status.running, status.startedAt])

  useEffect(() => {
    if (!copyHint) return

    const timer = window.setTimeout(() => {
      setCopyHint(null)
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [copyHint])

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

  const onToggleRecording = async () => {
    if (status.running) {
      await onStop()
      return
    }

    await onStart()
  }

  const finalCount = segments.filter((segment) => segment.state === 'final').length

  const latestSegment = segments.at(-1) ?? null
  const knownSpeakers = useMemo(
    () =>
      [
        ...new Set(
          segments
            .map((segment) => segment.speaker.trim())
            .filter((speaker) => speaker.length > 0 && speaker.toLowerCase() !== 'unknown')
        )
      ],
    [segments]
  )

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

  const getSpeakerLabel = (speaker: string) => {
    const alias = speakerAliases[speaker]?.trim()
    return alias && alias.length > 0 ? alias : speaker
  }

  const startedAtLabel = useMemo(() => {
    if (!status.startedAt) return '---'

    return new Date(status.startedAt).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }, [status.startedAt])

  const durationLabel = useMemo(() => {
    if (!status.startedAt) return '00:00'

    const startedAtMs = new Date(status.startedAt).getTime()

    if (Number.isNaN(startedAtMs)) return '00:00'

    const elapsedSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000))
    const hours = Math.floor(elapsedSeconds / 3600)
    const minutes = Math.floor((elapsedSeconds % 3600) / 60)
    const seconds = elapsedSeconds % 60

    if (hours > 0) {
      return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
    }

    return [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
  }, [now, status.startedAt])

  return (
    <main className="container">
      {runtimeIssue && (
        <section className="error">
          <strong>RUNTIME_BRIDGE_MISSING</strong>: {runtimeIssue}
        </section>
      )}

      {lastError && (
        <section className="error">
          <strong>{lastError.code}</strong>: {lastError.message}
        </section>
      )}

      <div className="layout-grid">
        <section className="panel transcript-panel">
          <div className="panel-header">
            <h2>Transkript</h2>
          </div>
          {segments.length === 0 ? (
            <p className="empty">Noch keine Daten. Starte den Service.</p>
          ) : (
            <ul ref={transcriptListRef} className="transcript-list">
              {segments.map((segment) => (
                <li key={segment.id} className={`segment ${segment.state}`}>
                  <span className="segment-text">{segment.text}</span>
                  <div className="segment-meta-column">
                    <span className="meta">{new Date(segment.timestampIso).toLocaleTimeString('de-DE')}</span>
                    <span className={`speaker-badge ${getSpeakerClass(segment.speaker)}`.trim()}>{getSpeakerLabel(segment.speaker)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="sidebar-stack">
          <section className="hero-status-card">
            <strong>{statusLabel}</strong>
            <span>{status.running ? 'Transkription aktiv' : 'Bereit zum Starten'}</span>
            <div className="controls hero-controls">
              <button
                className={status.running ? 'secondary-button' : 'primary-button'}
                type="button"
                onClick={onToggleRecording}
                disabled={!!runtimeIssue}
              >
                {status.running ? 'Stop' : 'Start'}
              </button>
              <button className="ghost-button" type="button" onClick={onCopyTranscript} disabled={finalCount === 0}>
                TXT kopieren
              </button>
            </div>
            <div className="hero-stats">
              <div>
                <span>Einträge</span>
                <strong>{finalCount}</strong>
              </div>
              <div>
                <span>Letzter Sprecher</span>
                <strong>{latestSegment ? getSpeakerLabel(latestSegment.speaker) : '---'}</strong>
              </div>
              <div>
                <span>Dauer</span>
                <strong>{durationLabel}</strong>
              </div>
              <div>
                <span>Startzeit</span>
                <strong>{startedAtLabel}</strong>
              </div>
            </div>
          </section>

          <section className="panel settings">
            <button
              className="panel-toggle"
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-expanded={settingsOpen}
            >
              <h2>Einstellungen</h2>
              <span className="toggle-indicator">{settingsOpen ? '−' : '+'}</span>
            </button>

            {settingsOpen && (
              <>
                {status.running && <div className="settings-inline-hint">Stop first to change settings.</div>}

                <div className="settings-block">
                  <span className="field-label">Sprache</span>
                  <div className="language-grid" role="radiogroup" aria-label="Sprache auswählen">
                    {languageOptions.map((option) => (
                      <label key={option.value} className={`language-option ${settings.language === option.value ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="language"
                          value={option.value}
                          checked={settings.language === option.value}
                          onChange={(event) => setSettings((prev) => ({ ...prev, language: event.target.value }))}
                          disabled={status.running}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
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

                <button className="primary-button settings-save-button" type="button" onClick={onSaveSettings} disabled={status.running}>
                  Einstellungen speichern
                </button>
                {settingsHint && <div className="hint">{settingsHint}</div>}
              </>
            )}
          </section>

          <section className="panel debug-log-panel">
            <button
              className="panel-toggle"
              type="button"
              onClick={() => setDebugOpen((prev) => !prev)}
              aria-expanded={debugOpen}
            >
              <h2>Debug-Log</h2>
              <span className="toggle-indicator">{debugOpen ? '−' : '+'}</span>
            </button>

            {debugOpen && (
              <>
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
              </>
            )}
          </section>

          <section className="panel speaker-mapping-panel">
            <div className="panel-header">
              <h2>Sprecherzuordnung</h2>
              <span className="subtle-pill">{knownSpeakers.length} IDs</span>
            </div>

            {knownSpeakers.length === 0 ? (
              <p className="empty">Sobald Sprecher erkannt wurden, kannst du ihnen hier Anzeigenamen zuweisen.</p>
            ) : (
              <div className="speaker-mapping-table-wrap">
                <table className="speaker-mapping-table">
                  <thead>
                    <tr>
                      <th scope="col">Speaker-ID</th>
                      <th scope="col">Anzeigename</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knownSpeakers.map((speaker) => (
                      <tr key={speaker}>
                        <td className="speaker-mapping-id">{speaker}</td>
                        <td>
                          <input
                            type="text"
                            value={speakerAliases[speaker] ?? ''}
                            onChange={(event) =>
                              setSpeakerAliases((prev) => ({
                                ...prev,
                                [speaker]: event.target.value
                              }))
                            }
                            placeholder="Anzeigename"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </aside>
      </div>

      {copyHint && <div className="toast toast-visible">{copyHint}</div>}
    </main>
  )
}
