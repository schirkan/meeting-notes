import { randomUUID } from 'node:crypto'
import type { FixedAzureConfig, UserSettings } from '@shared/config-contract'
import type { TranscriptError, TranscriptSegment, TranscriptSource } from '@shared/transcript-contract'
import type { DecodedFrame } from './frame-protocol'

type AzureSdk = typeof import('microsoft-cognitiveservices-speech-sdk')

type StreamState = {
  pushStream: any
  recognizer: any
}

export class AzureTranscriptionService {
  private sdk: AzureSdk | null = null
  private speechConfig: any = null
  private streams = new Map<TranscriptSource, StreamState>()

  constructor(
    private readonly azureConfig: FixedAzureConfig,
    private readonly settings: UserSettings,
    private readonly onSegment: (segment: TranscriptSegment) => void,
    private readonly onError: (error: TranscriptError) => void
  ) {}

  async init(): Promise<void> {
    this.sdk = await import('microsoft-cognitiveservices-speech-sdk')

    const key = process.env[this.azureConfig.speechKeyEnvVar]
    if (!key) {
      throw new Error(`Environment-Variable ${this.azureConfig.speechKeyEnvVar} ist nicht gesetzt.`)
    }

    this.speechConfig = this.sdk.SpeechConfig.fromSubscription(key, this.azureConfig.region)
    this.speechConfig.speechRecognitionLanguage = this.settings.language
    this.speechConfig.setProperty('SpeechServiceConnection_Endpoint', this.azureConfig.endpoint)
  }

  private ensureStreamForFrame(frame: DecodedFrame): StreamState {
    if (!this.sdk || !this.speechConfig) {
      throw new Error('AzureTranscriptionService nicht initialisiert.')
    }

    const existing = this.streams.get(frame.source)
    if (existing) return existing

    const format = this.sdk.AudioStreamFormat.getWaveFormatPCM(
      frame.sampleRate,
      frame.bitsPerSample,
      frame.channels
    )

    const pushStream = this.sdk.AudioInputStream.createPushStream(format)
    const audioConfig = this.sdk.AudioConfig.fromStreamInput(pushStream)
    const recognizer = new this.sdk.SpeechRecognizer(this.speechConfig, audioConfig)

    recognizer.recognizing = (_sender, event) => {
      const text = event.result?.text?.trim()
      if (!text) return
      this.onSegment(this.mapResult(frame.source, text, 'interim', 0.8))
    }

    recognizer.recognized = (_sender, event) => {
      const text = event.result?.text?.trim()
      if (!text) return
      this.onSegment(this.mapResult(frame.source, text, 'final', 0.9))
    }

    recognizer.canceled = (_sender, event) => {
      this.onError({
        code: event.errorDetails?.includes('authentication') ? 'AZURE_AUTH_FAILED' : 'AZURE_RECOGNIZER_FAILED',
        message: event.errorDetails || 'Azure Recognizer wurde abgebrochen.'
      })
    }

    recognizer.startContinuousRecognitionAsync()

    const created: StreamState = { pushStream, recognizer }
    this.streams.set(frame.source, created)
    return created
  }

  pushFrame(frame: DecodedFrame): void {
    try {
      const state = this.ensureStreamForFrame(frame)
      state.pushStream.write(frame.payload.buffer.slice(frame.payload.byteOffset, frame.payload.byteOffset + frame.payload.byteLength) as ArrayBuffer)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.onError({ code: 'AZURE_RECOGNIZER_FAILED', message })
    }
  }

  async stop(): Promise<void> {
    const closePromises = [...this.streams.values()].map(
      (state) =>
        new Promise<void>((resolve) => {
          state.recognizer.stopContinuousRecognitionAsync(
            () => {
              state.pushStream.close()
              state.recognizer.close()
              resolve()
            },
            () => {
              state.pushStream.close()
              state.recognizer.close()
              resolve()
            }
          )
        })
    )

    await Promise.all(closePromises)
    this.streams.clear()
  }

  private mapResult(
    source: TranscriptSource,
    text: string,
    state: TranscriptSegment['state'],
    confidence: number
  ): TranscriptSegment {
    return {
      id: randomUUID(),
      source,
      speaker: source === 'mic' ? 'Du' : 'Gegenüber',
      timestampIso: new Date().toISOString(),
      text,
      state,
      confidence
    }
  }
}
