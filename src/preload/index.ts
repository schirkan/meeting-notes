import { contextBridge, ipcRenderer } from 'electron'
import type { TranscriptApi, TranscriptError, TranscriptSegment, TranscriptStatus } from '@shared/transcript-contract'

const api: TranscriptApi = {
  start: () => ipcRenderer.invoke('transcript:start'),
  stop: () => ipcRenderer.invoke('transcript:stop'),
  getStatus: () => ipcRenderer.invoke('transcript:get-status'),
  onSegment: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TranscriptSegment) => cb(payload)
    ipcRenderer.on('transcript:segment', listener)
    return () => ipcRenderer.removeListener('transcript:segment', listener)
  },
  onError: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TranscriptError) => cb(payload)
    ipcRenderer.on('transcript:error', listener)
    return () => ipcRenderer.removeListener('transcript:error', listener)
  },
  onStatus: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TranscriptStatus) => cb(payload)
    ipcRenderer.on('transcript:status', listener)
    return () => ipcRenderer.removeListener('transcript:status', listener)
  }
}

contextBridge.exposeInMainWorld('transcriptApi', api)
