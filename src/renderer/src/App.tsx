import { useEffect, useMemo, useRef, useState } from 'react'
import type { AzureConfig, AzureConfigState, UserSettings } from '@shared/config-contract'
import {
  type AudioDeviceSnapshot,
  type DebugLogEntry,
  type TranscriptError,
  type TranscriptSegment,
  type TranscriptStatus
} from '@shared/transcript-contract'
import { ConfigPanel } from './components/ConfigPanel'
import { type ConfigDraft, draftToConfig, isConfigComplete, toConfigDraft } from './config-utils'
import { DebugLogPanel } from './components/DebugLogPanel'
import { HeroStatusCard } from './components/HeroStatusCard'
import { SettingsDialog } from './components/SettingsDialog'
import { SettingsPanel } from './components/SettingsPanel'
import { SpeakerMappingPanel } from './components/SpeakerMappingPanel'
import { TranscriptPanel } from './components/TranscriptPanel'

const initialStatus: TranscriptStatus = {
  running: false
}

type ToastState = {
  message: string
  variant: 'info' | 'error'
  persistent: boolean
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
  const [toast, setToast] = useState<ToastState | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [configState, setConfigState] = useState<AzureConfigState | null>(null)
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(() => toConfigDraft(null))
  const [speakerAliases, setSpeakerAliases] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())
  const transcriptListRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    const transcriptApi = window.transcriptApi

    if (!transcriptApi) {
      setRuntimeIssue('IPC-Bridge nicht verfügbar. Prüfe Preload/Dev-Start.')
      setToast({
        message: 'IPC-Bridge nicht verfügbar. Prüfe Preload/Dev-Start.',
        variant: 'error',
        persistent: true
      })
      return
    }

    void Promise.all([
      transcriptApi.getStatus(),
      transcriptApi.getSettings(),
      transcriptApi.getDevices(),
      transcriptApi.getDebugLog(),
      transcriptApi.getConfig()
    ])
      .then(([nextStatus, nextSettings, nextDevices, nextDebugLog, nextConfig]) => {
        setStatus(nextStatus)
        setSettings(nextSettings)
        setDevices(nextDevices)
        setDebugLog(nextDebugLog)
        setConfigState(nextConfig)
        setConfigDraft(toConfigDraft(nextConfig.config))

        if (!nextConfig.exists) {
          setConfigOpen(true)
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Initialdaten konnten nicht geladen werden.'
        setRuntimeIssue(message)
        setToast({ message, variant: 'error', persistent: true })
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
      setToast({
        message: `${error.code}: ${error.message}`,
        variant: 'error',
        persistent: true
      })
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
    if (!toast || toast.persistent) return

    const timer = window.setTimeout(() => {
      setToast(null)
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [toast])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!status.running) {
        return undefined
      }

      event.preventDefault()
      event.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [status.running])

  const statusLabel = useMemo(() => {
    if (isStarting) return 'Startet'
    if (status.running) return 'Läuft'
    if (configState && !isConfigComplete(configState.config)) return 'Konfiguration unvollständig'
    if (lastError) return 'Fehler'
    return 'Gestoppt'
  }, [configState, isStarting, lastError, status.running])

  const isConfigReady = useMemo(() => {
    if (!configState?.exists || !configState.config) {
      return false
    }

    return isConfigComplete(configState.config)
  }, [configState])

  const statusDescription = useMemo(() => {
    if (isStarting) return 'Transkription wird gestartet ...'
    if (status.running) return 'Transkription aktiv'
    if (!isConfigReady) return 'Konfiguration unvollständig'
    return 'Bereit zum Starten'
  }, [isConfigReady, isStarting, status.running])

  const onStart = async () => {
    setIsStarting(true)
    try {
      setLastError(null)
      const next = await window.transcriptApi.start()
      setStatus(next)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Start fehlgeschlagen.'
      setLastError({ code: 'UI_START_FAILED', message })
    } finally {
      setIsStarting(false)
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
      setSettingsHint(null)
      setToast({ message: 'Einstellungen gespeichert.', variant: 'info', persistent: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden.'
      setSettingsHint(message)
      setToast({ message, variant: 'error', persistent: true })
    }
  }

  const onSaveConfig = async () => {
    try {
      const payload = draftToConfig(configDraft)
      const savedState = await window.transcriptApi.saveConfig(payload)
      setConfigState(savedState)
      setConfigDraft(toConfigDraft(savedState.config))
      setToast({ message: 'Azure-Konfiguration gespeichert.', variant: 'info', persistent: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Azure-Konfiguration konnte nicht gespeichert werden.'
      setToast({ message, variant: 'error', persistent: true })
    }
  }

  const onCopyTranscript = async () => {
    try {
      await window.transcriptApi.copyTranscript(segments)
      setToast({ message: 'Finales Transkript wurde in die Zwischenablage kopiert.', variant: 'info', persistent: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kopieren fehlgeschlagen.'
      setToast({ message, variant: 'error', persistent: true })
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

    if (normalized.includes('unknown')) return 'speaker-unknown'
    if (normalized.includes('self')) return 'speaker-mic-self'

    const numberedSpeakerMatch = normalized.match(/(?:guest|speaker|participant|user)[\s:_-]?(\d{1,3})/)
    if (numberedSpeakerMatch) {
      const parsed = Number(numberedSpeakerMatch[1])
      if (Number.isFinite(parsed) && parsed >= 1) {
        const normalizedIndex = ((parsed - 1) % 30) + 1
        return `speaker-guest-${normalizedIndex}`
      }
    }

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
      {configState?.exists === false && (
        <section className="hint">
          Azure-Konfiguration fehlt. Bitte <code>config/azure.json</code> im Formular unten speichern.
        </section>
      )}

      <div className="layout-grid">
        <TranscriptPanel
          segments={segments}
          transcriptListRef={transcriptListRef}
          getSpeakerClass={getSpeakerClass}
          getSpeakerLabel={getSpeakerLabel}
        />

        <div className="sidebar-stack">
          <HeroStatusCard
            status={status}
            statusLabel={statusLabel}
            statusDescription={statusDescription}
            runtimeIssue={runtimeIssue}
            isStarting={isStarting}
            startDisabled={!isConfigReady}
            finalCount={finalCount}
            latestSegment={latestSegment}
            durationLabel={durationLabel}
            startedAtLabel={startedAtLabel}
            getSpeakerLabel={getSpeakerLabel}
            onOpenSettingsDialog={() => setSettingsDialogOpen(true)}
            onToggleRecording={onToggleRecording}
            onCopyTranscript={onCopyTranscript}
          />
        </div>

        <SpeakerMappingPanel
          knownSpeakers={knownSpeakers}
          speakerAliases={speakerAliases}
          setSpeakerAliases={setSpeakerAliases}
        />
      </div>

      <DebugLogPanel
        debugOpen={debugOpen}
        debugLog={debugLog}
        setDebugOpen={setDebugOpen}
      />

      <SettingsDialog isOpen={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)}>
        <SettingsPanel
          statusRunning={status.running}
          settings={settings}
          devices={devices}
          settingsError={settingsHint}
          setSettings={setSettings}
          onSaveSettings={onSaveSettings}
        />

        <ConfigPanel
          configState={configState}
          configDraft={configDraft}
          statusRunning={status.running}
          setConfigDraft={setConfigDraft}
          onSaveConfig={onSaveConfig}
        />
      </SettingsDialog>

      {toast && (
        toast.persistent ? (
          <div className={`toast toast-visible toast-${toast.variant} toast-persistent`.trim()} role="alert">
            <div className="toast-copyable-text">{toast.message}</div>
            <button className="toast-close-button" type="button" onClick={() => setToast(null)} aria-label="Fehlermeldung schließen">
              Schließen
            </button>
          </div>
        ) : (
          <div className={`toast toast-visible toast-${toast.variant}`.trim()} role="status">
            {toast.message}
          </div>
        )
      )}
    </main>
  )
}
