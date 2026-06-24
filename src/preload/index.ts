import { contextBridge, ipcRenderer } from 'electron'
import type {
  AudioDeviceSnapshot,
  DebugLogEntry,
  TranscriptApi,
  TranscriptError,
  TranscriptSegment,
  TranscriptStatus
} from '@shared/transcript-contract'
import type { AzureConfig, AzureConfigState, UserSettings } from '@shared/config-contract'

const api: TranscriptApi = {
  start: () => ipcRenderer.invoke('transcript:start'),
  stop: () => ipcRenderer.invoke('transcript:stop'),
  getStatus: () => ipcRenderer.invoke('transcript:get-status'),
  getDebugLog: () => ipcRenderer.invoke('transcript:get-debug-log') as Promise<DebugLogEntry[]>,
  clearDebugLog: () => ipcRenderer.invoke('transcript:clear-debug-log') as Promise<{ cleared: number }>,
  getDevices: () => ipcRenderer.invoke('transcript:get-devices') as Promise<AudioDeviceSnapshot>,
  getSettings: () => ipcRenderer.invoke('transcript:get-settings') as Promise<UserSettings>,
  getConfig: () => ipcRenderer.invoke('transcript:get-config') as Promise<AzureConfigState>,
  saveSettings: (settings) => ipcRenderer.invoke('transcript:save-settings', settings) as Promise<UserSettings>,
  saveConfig: (config) => ipcRenderer.invoke('transcript:save-config', config) as Promise<AzureConfigState>,
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
  },
  onDebugLog: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DebugLogEntry) => cb(payload)
    ipcRenderer.on('transcript:debug-log', listener)
    return () => ipcRenderer.removeListener('transcript:debug-log', listener)
  }
}

contextBridge.exposeInMainWorld('transcriptApi', api)
