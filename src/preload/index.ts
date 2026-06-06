import { contextBridge, ipcRenderer } from 'electron'
import type {
  AudioDeviceSnapshot,
  TranscriptApi,
  TranscriptError,
  TranscriptSegment,
  TranscriptStatus
} from '@shared/transcript-contract'
import type { UserSettings } from '@shared/config-contract'

const api: TranscriptApi = {
  start: () => ipcRenderer.invoke('transcript:start'),
  stop: () => ipcRenderer.invoke('transcript:stop'),
  getStatus: () => ipcRenderer.invoke('transcript:get-status'),
  getDevices: () => ipcRenderer.invoke('transcript:get-devices') as Promise<AudioDeviceSnapshot>,
  getSettings: () => ipcRenderer.invoke('transcript:get-settings') as Promise<UserSettings>,
  saveSettings: (settings) => ipcRenderer.invoke('transcript:save-settings', settings) as Promise<UserSettings>,
  copyTranscript: (segments) => ipcRenderer.invoke('transcript:copy', segments),
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
