import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { MockTranscriptService } from './mock-transcript-service'
import type { TranscriptError, TranscriptStatus } from '@shared/transcript-contract'

const mockService = new MockTranscriptService()
let mainWindow: BrowserWindow | null = null

const status: TranscriptStatus = {
  running: false,
  mode: 'mock'
}

function broadcast(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

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
