export type TranscriptSource = 'mic' | 'speaker'
export type TranscriptState = 'interim' | 'final'

export interface TranscriptSegment {
  id: string
  source: TranscriptSource
  speaker: string
  timestampIso: string
  text: string
  state: TranscriptState
  confidence?: number
}

export interface TranscriptStatus {
  running: boolean
  mode: 'mock' | 'real'
  startedAt?: string
}

export interface TranscriptError {
  code: string
  message: string
}

export interface TranscriptApi {
  start: () => Promise<TranscriptStatus>
  stop: () => Promise<TranscriptStatus>
  getStatus: () => Promise<TranscriptStatus>
  onSegment: (cb: (segment: TranscriptSegment) => void) => () => void
  onError: (cb: (error: TranscriptError) => void) => () => void
  onStatus: (cb: (status: TranscriptStatus) => void) => () => void
}
