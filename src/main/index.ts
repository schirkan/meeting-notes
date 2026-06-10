import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  type AudioDeviceSnapshot,
  type TranscriptError,
  type TranscriptSegment,
  type TranscriptStatus
} from '@shared/transcript-contract'
import { type DecodedFrame } from './frame-protocol'
import { SidecarSession, listSidecarDevices } from './sidecar-manager'
import { AzureTranscriptionService } from './azure-transcription-service'
import { loadFixedAzureConfig, loadUserSettings, saveUserSettings } from './settings-store'

const sidecarSession = new SidecarSession()

let mainWindow: BrowserWindow | null = null
let azureService: AzureTranscriptionService | null = null
let devicesCache: AudioDeviceSnapshot = { inputs: [], outputs: [], fetchedAtIso: new Date(0).toISOString() }
let userSettings = await loadUserSettings()

const status: TranscriptStatus = {
  running: false
}

function broadcast(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function emitError(error: TranscriptError): void {
  broadcast('transcript:error', error)
}

async function refreshDevices(): Promise<AudioDeviceSnapshot> {
  try {
    devicesCache = await listSidecarDevices()
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  attachRendererDiagnostics(mainWindow)

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

function pushFrameToAzure(frame: DecodedFrame): void {
  if (azureService) {
    azureService.pushFrame(frame)
  }
}

async function stopRecording(): Promise<TranscriptStatus> {
  try {
    await sidecarSession.stop()
    if (azureService) {
      await azureService.stop()
      azureService = null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitError({ code: 'TRANSCRIPTION_STOP_FAILED', message })
  }

  status.running = false
  delete status.startedAt
  broadcast('transcript:status', status)
  return status
}

async function startReal(): Promise<void> {
  const devices = await refreshDevices()

  if (devices.outputs.length === 0) {
    throw new Error('Kein Speaker-Loopback-Device verfügbar.')
  }

  const fixedAzure = await loadFixedAzureConfig()
  if (!fixedAzure) {
    throw new Error('Azure Fixed Config fehlt oder ist ungültig (config/azure.fixed.json).')
  }

  azureService = new AzureTranscriptionService(fixedAzure, userSettings, (segment) => {
    broadcast('transcript:segment', segment)
  }, emitError)

  await azureService.init()

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
    emitError
  )
}

function registerIpc(): void {
  ipcMain.handle('transcript:start', async () => {
    try {
      if (status.running) return status

      status.running = true
      status.startedAt = new Date().toISOString()

      await startReal()

      broadcast('transcript:status', status)
      return status
    } catch (error) {
      status.running = false
      delete status.startedAt
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Start.'

      const code = message.includes('Loopback')
        ? 'LOOPBACK_REQUIRED'
        : message.includes('Azure')
          ? 'AZURE_AUTH_FAILED'
          : 'SIDECAR_START_FAILED'

      emitError({ code, message })
      throw error
    }
  })

  ipcMain.handle('transcript:stop', async () => stopRecording())

  ipcMain.handle('transcript:get-status', async () => status)

  ipcMain.handle('transcript:get-devices', async () => refreshDevices())

  ipcMain.handle('transcript:get-settings', async () => userSettings)

  ipcMain.handle('transcript:save-settings', async (_event, payload) => {
    try {
      userSettings = await saveUserSettings(payload)
      return userSettings
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emitError({ code: 'SETTINGS_PERSIST_FAILED', message })
      throw error
    }
  })

  ipcMain.handle('transcript:copy', async (_event, segments: TranscriptSegment[]) => {
    const finalSegments = segments.filter((segment) => segment.state === 'final')
    const content = finalSegments
      .map((segment) => `[${asGermanClock(segment.timestampIso)}] ${segment.source.toUpperCase()} | ${segment.speaker}: ${segment.text}`)
      .join('\n')

    clipboard.writeText(content)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  void stopRecording()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
