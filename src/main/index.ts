import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { MockTranscriptService } from './mock-transcript-service'
import {
  TRANSCRIPT_CONTRACT_VERSION,
  type TranscriptError,
  type TranscriptStatus
} from '@shared/transcript-contract'

const mockService = new MockTranscriptService()
let mainWindow: BrowserWindow | null = null

const status: TranscriptStatus = {
  running: false,
  mode: 'mock',
  contractVersion: TRANSCRIPT_CONTRACT_VERSION
}

function broadcast(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function attachRendererDiagnostics(win: BrowserWindow): void {
  if (!process.env.ELECTRON_RENDERER_URL) return

  const wc = win.webContents

  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3')
    }

    wc.debugger.on('message', (_event, method, params) => {
      if (method === 'Runtime.consoleAPICalled') {
        const level = params?.type ?? 'log'
        const values = (params?.args ?? [])
          .map((arg: { value?: unknown; description?: string }) => {
            if (arg?.value !== undefined) return String(arg.value)
            if (arg?.description) return arg.description
            return '[unserializable]'
          })
          .join(' ')

        console.log(`[renderer:${level}] ${values}`)
      }

      if (method === 'Runtime.exceptionThrown') {
        const text = params?.exceptionDetails?.text ?? 'Unbekannte Exception'
        const line = params?.exceptionDetails?.lineNumber
        const column = params?.exceptionDetails?.columnNumber
        console.error(`[renderer:exception] ${text} @ ${line}:${column}`)
      }

      if (method === 'Log.entryAdded') {
        const entry = params?.entry
        if (!entry) return
        const level = entry.level ?? 'info'
        const text = entry.text ?? ''
        console.log(`[renderer:log:${level}] ${text}`)
      }
    })

    void wc.debugger.sendCommand('Runtime.enable')
    void wc.debugger.sendCommand('Log.enable')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[diagnostics] Debugger-Bridge nicht aktiv: ${message}`)
  }

  wc.on('did-fail-load', (_event, code, description, validatedUrl) => {
    console.error(`[renderer:did-fail-load] code=${code} url=${validatedUrl} msg=${description}`)
  })

  wc.on('render-process-gone', (_event, details) => {
    console.error(`[renderer:gone] reason=${details.reason} exitCode=${details.exitCode}`)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  attachRendererDiagnostics(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function emitError(error: TranscriptError): void {
  broadcast('transcript:error', error)
}

function registerIpc(): void {
  ipcMain.handle('transcript:start', async () => {
    try {
      if (!status.running) {
        status.running = true
        status.startedAt = new Date().toISOString()

        mockService.start((segment) => {
          broadcast('transcript:segment', segment)
        })

        broadcast('transcript:status', status)
      }
      return status
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unbekannter Fehler beim Start.'
      emitError({ code: 'MOCK_START_FAILED', message })
      throw cause
    }
  })

  ipcMain.handle('transcript:stop', async () => {
    mockService.stop()
    status.running = false
    delete status.startedAt
    broadcast('transcript:status', status)
    return status
  })

  ipcMain.handle('transcript:get-status', async () => status)
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  mockService.stop()
  if (process.platform !== 'darwin') app.quit()
})
