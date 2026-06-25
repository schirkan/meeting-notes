import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  type AudioDeviceSnapshot,
  type DebugLogEntry,
  type TranscriptError,
  type TranscriptSegment,
  type TranscriptStatus
} from '@shared/transcript-contract'
import { type DecodedFrame } from './frame-protocol'
import { SidecarSession, listSidecarDevices } from './sidecar-manager'
import { AzureTranscriptionService } from './azure-transcription-service'
import {
  getAzureConfigState,
  loadAzureConfig,
  loadUserSettings,
  saveAzureConfig,
  saveUserSettings
} from './settings-store'
import { validateUserSettings } from '@shared/config-contract'

const sidecarSession = new SidecarSession()

let mainWindow: BrowserWindow | null = null
let azureService: AzureTranscriptionService | null = null
let devicesCache: AudioDeviceSnapshot = { inputs: [], outputs: [], fetchedAtIso: new Date(0).toISOString() }
let userSettings = await loadUserSettings()
const debugLog: DebugLogEntry[] = []

const status: TranscriptStatus = {
  running: false
}

function broadcast(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function appendDebugLog(
  source: DebugLogEntry['source'],
  message: string,
  level: DebugLogEntry['level'] = 'info'
): void {
  const entry: DebugLogEntry = {
    id: randomUUID(),
    timestampIso: new Date().toISOString(),
    source,
    level,
    message
  }

  debugLog.unshift(entry)
  if (debugLog.length > 300) debugLog.length = 300
  broadcast('transcript:debug-log', entry)
}

function emitError(error: TranscriptError): void {
  appendDebugLog('main', `${error.code}: ${error.message}`, 'error')
  broadcast('transcript:error', error)
}

async function refreshDevices(): Promise<AudioDeviceSnapshot> {
  try {
    appendDebugLog('ipc', 'Device-Liste wird vom Sidecar angefordert.')
    devicesCache = await listSidecarDevices()
    appendDebugLog('sidecar', `Device-Liste aktualisiert (${devicesCache.inputs.length} Inputs, ${devicesCache.outputs.length} Outputs).`)
    return devicesCache
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitError({ code: 'SIDECAR_UNAVAILABLE', message })
    return devicesCache
  }
}

function attachRendererDiagnostics(win: BrowserWindow): void {
  if (!process.env.ELECTRON_RENDERER_URL) return

  const wc = win.webContents

  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    void wc.debugger.sendCommand('Runtime.enable')
    void wc.debugger.sendCommand('Log.enable')
  } catch {
    // ignore diagnostics errors in dev
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  attachRendererDiagnostics(mainWindow)
  mainWindow.setMenuBarVisibility(false)

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    if (input.key === 'F5') {
      event.preventDefault()
      void mainWindow?.webContents.reload()
      return
    }

    if (input.key !== 'F12') return

    event.preventDefault()

    if (mainWindow?.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools()
      return
    }

    mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function asGermanClock(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function asGermanDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function asGermanTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatDuration(startedAtIso: string, endedAtIso: string): string {
  const startedAtMs = new Date(startedAtIso).getTime()
  const endedAtMs = new Date(endedAtIso).getTime()

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs) || endedAtMs < startedAtMs) {
    return '00:00'
  }

  const elapsedSeconds = Math.floor((endedAtMs - startedAtMs) / 1000)
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
  }

  return [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function pushFrameToAzure(frame: DecodedFrame): void {
  if (azureService) {
    azureService.pushFrame(frame)
  }
}

function resolveDeviceName(
  devices: AudioDeviceSnapshot,
  flow: 'input' | 'output',
  id: string | null
): string {
  const list = flow === 'input' ? devices.inputs : devices.outputs

  if (!id) {
    const defaultDevice = list.find((device) => device.isDefault)
    return defaultDevice ? `${defaultDevice.name} (Default)` : 'Default (nicht gefunden)'
  }

  const selected = list.find((device) => device.id === id)
  return selected ? selected.name : `unbekannt (${id})`
}

function broadcastStatus(): void {
  appendDebugLog('status', `Status geändert: ${status.running ? 'running' : 'stopped'}.`)
  broadcast('transcript:status', status)
}

async function stopRecording(): Promise<TranscriptStatus> {
  try {
    appendDebugLog('ipc', 'transcript:stop aufgerufen.')
    await sidecarSession.stop()
    if (azureService) {
      appendDebugLog('main', 'AzureTranscriptionService.stop aufgerufen.')
      await azureService.stop()
      azureService = null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitError({ code: 'TRANSCRIPTION_STOP_FAILED', message })
  }

  status.running = false
  delete status.startedAt
  broadcastStatus()
  return status
}

async function startReal(): Promise<void> {
  appendDebugLog('main', 'startReal aufgerufen.')
  const devices = await refreshDevices()

  appendDebugLog(
    'main',
    `Aktive Geräteauswahl: mic=${resolveDeviceName(devices, 'input', userSettings.devices.micId)} | speakerLoopback=${resolveDeviceName(devices, 'output', userSettings.devices.speakerLoopbackId)}.`
  )

  if (devices.outputs.length === 0) {
    throw new Error('Kein Speaker-Loopback-Device verfügbar.')
  }

  const azureConfig = await loadAzureConfig()
  if (!azureConfig) {
    throw new Error('Azure-Konfiguration fehlt oder ist ungültig (config/azure.json).')
  }

  appendDebugLog(
    'main',
    `Azure-Config geladen: endpoint=${azureConfig.endpoint}, region=${azureConfig.region}, speechKeyLength=${azureConfig.speechKey.length}, proxy=${azureConfig.proxy ? `${azureConfig.proxy.host}:${azureConfig.proxy.port}` : 'aus'}.`
  )

  azureService = new AzureTranscriptionService(azureConfig, userSettings, (segment) => {
    broadcast('transcript:segment', segment)
  }, emitError, (message, level) => appendDebugLog('main', message, level))

  appendDebugLog('main', 'AzureTranscriptionService.init aufgerufen.')
  await azureService.init()

  // Azure-Recognizer explizit starten, damit Start-Fehler (z. B. AZURE_AUTH_FAILED)
  // als Fehler propagiert werden und der Status nicht fälschlich auf "running" bleibt.
  const azureAudioFormat = { sampleRate: 16000, bitsPerSample: 16, channels: 1 }
  appendDebugLog('main', 'AzureTranscriptionService.start aufgerufen.')
  await azureService.start(azureAudioFormat)

  appendDebugLog(
    'main',
    `Sidecar-Start vorbereitet: sampleRate=${azureAudioFormat.sampleRate}, language=${userSettings.language}, micId=${userSettings.devices.micId ?? 'default'}, speakerId=${userSettings.devices.speakerLoopbackId ?? 'default'}.`
  )

  await sidecarSession.start(
    {
      micId: userSettings.devices.micId,
      speakerId: userSettings.devices.speakerLoopbackId,
      language: userSettings.language,
      sampleRate: 16000
    },
    (frame) => {
      pushFrameToAzure(frame)
    },
    emitError,
    (message, level) => appendDebugLog('sidecar', message, level)
  )
}

function registerIpc(): void {
  ipcMain.handle('transcript:start', async () => {
    appendDebugLog('ipc', 'transcript:start aufgerufen.')
    try {
      if (status.running) return status

      status.running = true
      status.startedAt = new Date().toISOString()

      await startReal()

      broadcastStatus()
      return status
    } catch (error) {
      status.running = false
      delete status.startedAt
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Start.'
      const detail = error instanceof Error && error.stack ? error.stack : String(error)

      appendDebugLog('main', `Startfehler Details: ${detail}`, 'error')

      const code = message.includes('Loopback')
        ? 'LOOPBACK_REQUIRED'
        : message.includes('Azure')
          ? 'AZURE_AUTH_FAILED'
          : 'SIDECAR_START_FAILED'

      emitError({ code, message })
      throw error
    } finally {
      // Wenn startReal fehlgeschlagen ist, bereits teilweise initialisierte
      // Ressourcen sauber wieder abbauen (Azure-Service, Sidecar).
      const stillRunning = status.running
      if (!stillRunning) {
        try {
          if (azureService) {
            await azureService.stop()
          }
        } catch (cleanupError) {
          appendDebugLog(
            'main',
            `Azure-Cleanup nach Fehler fehlgeschlagen: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
            'error'
          )
        } finally {
          azureService = null
        }

        try {
          await sidecarSession.stop()
        } catch (cleanupError) {
          appendDebugLog(
            'main',
            `Sidecar-Cleanup nach Fehler fehlgeschlagen: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
            'error'
          )
        }
      }
    }
  })

  ipcMain.handle('transcript:stop', async () => stopRecording())

  ipcMain.handle('transcript:get-status', async () => {
    appendDebugLog('ipc', 'transcript:get-status aufgerufen.')
    return status
  })

  ipcMain.handle('transcript:get-debug-log', async () => {
    appendDebugLog('ipc', 'transcript:get-debug-log aufgerufen.')
    return debugLog
  })

  ipcMain.handle('transcript:clear-debug-log', async () => {
    const cleared = debugLog.length
    debugLog.length = 0
    return { cleared }
  })

  ipcMain.handle('transcript:get-devices', async () => refreshDevices())

  ipcMain.handle('transcript:get-settings', async () => {
    appendDebugLog('ipc', 'transcript:get-settings aufgerufen.')
    return userSettings
  })

  ipcMain.handle('transcript:get-config', async () => {
    appendDebugLog('ipc', 'transcript:get-config aufgerufen.')
    return getAzureConfigState()
  })

  ipcMain.handle('transcript:save-config', async (_event, payload) => {
    appendDebugLog('ipc', 'transcript:save-config aufgerufen.')

    try {
      const saved = await saveAzureConfig(payload)
      appendDebugLog('main', 'Azure-Konfiguration gespeichert.')
      return {
        exists: true,
        path: (await getAzureConfigState()).path,
        config: saved
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emitError({ code: 'SETTINGS_PERSIST_FAILED', message })
      throw error
    }
  })

  ipcMain.handle('transcript:save-settings', async (_event, payload) => {
    appendDebugLog('ipc', 'transcript:save-settings aufgerufen.')
    try {
      userSettings = await saveUserSettings(payload)
      appendDebugLog('main', 'User-Settings gespeichert.')

      // Sichtbares Feedback, falls Eingaben auf Defaults korrigiert wurden
      const validation = validateUserSettings(userSettings)
      for (const warning of validation.warnings) {
        appendDebugLog('main', warning, 'warn')
      }

      return userSettings
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emitError({ code: 'SETTINGS_PERSIST_FAILED', message })
      throw error
    }
  })

  ipcMain.handle('transcript:copy', async (_event, segments: TranscriptSegment[]) => {
    appendDebugLog('ipc', `transcript:copy aufgerufen (${segments.length} Segmente).`)
    const finalSegments = segments.filter((segment) => segment.state === 'final')
    const exportEndedAtIso = finalSegments.at(-1)?.timestampIso ?? new Date().toISOString()
    const exportStartedAtIso = status.startedAt ?? exportEndedAtIso
    const metadata = [
      '---',
      `datum: ${asGermanDate(exportStartedAtIso)}`,
      `startzeit: ${asGermanTime(exportStartedAtIso)}`,
      `dauer: ${formatDuration(exportStartedAtIso, exportEndedAtIso)}`,
      '---'
    ].join('\n')

    const body = finalSegments
      .map((segment) => {
        const languageSuffix = segment.language ? ` (${segment.language})` : ''
        return `- [${asGermanClock(segment.timestampIso)}] ${segment.speaker}${languageSuffix}: ${segment.text}`
      })
      .join('\n')

    const content = [metadata, body].filter((part) => part.length > 0).join('\n\n')

    clipboard.writeText(content)
  })
}

app.whenReady().then(() => {
  appendDebugLog('main', 'App ist bereit, IPC und BrowserWindow werden initialisiert.')
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  appendDebugLog('main', 'before-quit empfangen.')
  void stopRecording()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
