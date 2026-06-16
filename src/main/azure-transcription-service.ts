import { randomUUID } from 'node:crypto'
import type { FixedAzureConfig, UserSettings } from '@shared/config-contract'
import type { TranscriptError, TranscriptSegment, TranscriptSource } from '@shared/transcript-contract'
import type { DecodedFrame } from './frame-protocol'

type AzureSdk = typeof import('microsoft-cognitiveservices-speech-sdk')

type StreamState = {
  pushStream: any
  recognizer: any
  mode: 'speechRecognizer' | 'conversationTranscriber'
}

type RecognitionEvent = {
  result?: {
    text?: string
    speakerId?: string
  }
}

export class AzureTranscriptionService {
  private sdk: AzureSdk | null = null
  private speechConfig: any = null
  private streams = new Map<TranscriptSource, StreamState>()
  private missingSpeakerIdLogged = new Set<TranscriptSource>()

  constructor(
    private readonly azureConfig: FixedAzureConfig,
    private readonly settings: UserSettings,
    private readonly onSegment: (segment: TranscriptSegment) => void,
    private readonly onError: (error: TranscriptError) => void,
    private readonly onDebug?: (message: string, level?: 'info' | 'warn' | 'error') => void
  ) { }

  async init(): Promise<void> {
    this.sdk = await import('microsoft-cognitiveservices-speech-sdk')

    this.speechConfig = this.sdk.SpeechConfig.fromSubscription(this.azureConfig.speechKey, this.azureConfig.region)
    this.speechConfig.speechRecognitionLanguage = this.settings.language
    this.speechConfig.setProperty('SpeechServiceConnection_Endpoint', this.azureConfig.endpoint)
    this.speechConfig.setProperty('SpeechServiceResponse_DiarizeIntermediateResults', 'true')
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
    const useConversationTranscriber =
      frame.source === 'speaker' && this.azureConfig.recognitionMode === 'conversationTranscriber'

    this.onDebug?.(
      `${useConversationTranscriber ? 'ConversationTranscriber' : 'SpeechRecognizer'} für ${frame.source} erstellt (sampleRate=${frame.sampleRate}, bits=${frame.bitsPerSample}, channels=${frame.channels}).`
    )

    if (useConversationTranscriber) {
      const recognizer = new this.sdk.ConversationTranscriber(this.speechConfig, audioConfig)

      recognizer.transcribing = (_sender: unknown, event: RecognitionEvent) => {
        const text = event.result?.text?.trim()
        if (!text || !event.result) return
        this.onSegment(this.mapConversationResult(frame.source, event.result, 'interim', 0.8))
      }

      recognizer.transcribed = (_sender: unknown, event: RecognitionEvent) => {
        const text = event.result?.text?.trim()
        if (!text || !event.result) return
        this.onSegment(this.mapConversationResult(frame.source, event.result, 'final', 0.9))
      }

      recognizer.startTranscribingAsync(() => {
        this.onDebug?.(`startTranscribingAsync gestartet für ${frame.source}.`)
      }, (err: string) => {
        const message = String(err)
        this.onDebug?.(`startTranscribingAsync Fehler für ${frame.source}: ${message}`, 'error')
      })

      const created: StreamState = {
        pushStream,
        recognizer,
        mode: 'conversationTranscriber'
      }
      this.streams.set(frame.source, created)
      return created
    }

    const recognizer = new this.sdk.SpeechRecognizer(this.speechConfig, audioConfig)

    recognizer.recognizing = (_sender: unknown, event: RecognitionEvent) => {
      this.logMissingSpeakerId(frame.source, event)

      const text = event.result?.text?.trim()
      if (!text) return
      this.onSegment(this.mapResult(frame.source, text, 'interim', 0.8))
    }

    recognizer.recognized = (_sender: unknown, event: RecognitionEvent) => {
      this.logMissingSpeakerId(frame.source, event)

      const text = event.result?.text?.trim()
      if (!text) return
      this.onSegment(this.mapResult(frame.source, text, 'final', 0.9))
    }

    recognizer.canceled = (_sender: unknown, event: { errorDetails?: string }) => {
      this.onError({
        code: event.errorDetails?.includes('authentication') ? 'AZURE_AUTH_FAILED' : 'AZURE_RECOGNIZER_FAILED',
        message: event.errorDetails || 'Azure Recognizer wurde abgebrochen.'
      })
    }

    recognizer.startContinuousRecognitionAsync(() => {
      this.onDebug?.(`startContinuousRecognitionAsync gestartet für ${frame.source}.`)
    }, (err: string) => {
      const message = String(err)
      this.onDebug?.(`startContinuousRecognitionAsync Fehler für ${frame.source}: ${message}`, 'error')
    })

    const created: StreamState = {
      pushStream,
      recognizer,
      mode: 'speechRecognizer'
    }
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
    this.missingSpeakerIdLogged.clear()
  }

  private mapConversationResult(
    source: TranscriptSource,
    result: { text?: string; speakerId?: string | undefined },
    state: TranscriptSegment['state'],
    confidence: number
  ): TranscriptSegment {
    const text = result.text?.trim() ?? ''
    const speakerId = result.speakerId?.trim()

    if (!speakerId && !this.missingSpeakerIdLogged.has(source)) {
      this.missingSpeakerIdLogged.add(source)
      this.onDebug?.(
        `ConversationTranscriber liefert für ${source} aktuell keine speakerId. Prüfe Region, Feature-Verfügbarkeit und ob diarization-fähige Events eintreffen.`,
        'warn'
      )
    }

    if (speakerId) {
      this.onDebug?.(`ConversationTranscriber Speaker-Label für ${source}: ${speakerId}`)
    }

    return {
      id: randomUUID(),
      source,
      speaker: speakerId || 'Speaker unbekannt',
      timestampIso: new Date().toISOString(),
      text,
      state,
      confidence
    }
  }

  private logMissingSpeakerId(source: TranscriptSource, event: RecognitionEvent): void {
    if (event.result?.speakerId || this.missingSpeakerIdLogged.has(source)) return

    this.missingSpeakerIdLogged.add(source)
    this.onDebug?.(
      `Azure liefert für ${source} keine speakerId. Für diesen Kanal läuft SpeechRecognizer; die Sprecherzuordnung erfolgt hier nur über die lokale Quelle.`,
      'info'
    )
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
