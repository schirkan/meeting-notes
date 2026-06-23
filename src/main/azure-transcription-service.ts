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
  result?: any
}

const CONTINUOUS_LID_CANDIDATES = [
  'de-DE',
  'en-US',
  'fr-FR',
  'es-ES',
  'it-IT',
  'pt-BR',
  'nl-NL',
  'pl-PL',
  'tr-TR',
  'ja-JP'
]

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
    this.speechConfig.setProperty('SpeechServiceConnection_LanguageIdMode', 'Continuous')

    if (this.azureConfig.proxy) {
      this.speechConfig.setProxy(
        this.azureConfig.proxy.host,
        this.azureConfig.proxy.port,
        this.azureConfig.proxy.username ?? '',
        this.azureConfig.proxy.password ?? ''
      )
      this.onDebug?.(`Azure Speech Proxy konfiguriert (${this.azureConfig.proxy.host}:${this.azureConfig.proxy.port}).`)
    }
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
    const useConversationTranscriber = frame.source === 'speaker'
    const autoDetectSourceLanguageConfig = this.sdk.AutoDetectSourceLanguageConfig.fromLanguages(this.getLidCandidates())

    this.onDebug?.(
      `${useConversationTranscriber ? 'ConversationTranscriber' : 'SpeechRecognizer'} für ${frame.source} erstellt (sampleRate=${frame.sampleRate}, bits=${frame.bitsPerSample}, channels=${frame.channels}).`
    )

    if (useConversationTranscriber) {
      const recognizer = this.sdk.ConversationTranscriber.FromConfig(
        this.speechConfig,
        autoDetectSourceLanguageConfig,
        audioConfig
      )

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

    const recognizer = this.sdk.SpeechRecognizer.FromConfig(
      this.speechConfig,
      autoDetectSourceLanguageConfig,
      audioConfig
    )

    recognizer.recognizing = (_sender: unknown, event: RecognitionEvent) => {
      this.logMissingSpeakerId(frame.source, event)

      const text = event.result?.text?.trim()
      if (!text) return
      const language = this.extractDetectedLanguageFromSpeechResult(event.result)
      this.onSegment(this.mapResult(frame.source, text, 'interim', 0.8, language))
    }

    recognizer.recognized = (_sender: unknown, event: RecognitionEvent) => {
      this.logMissingSpeakerId(frame.source, event)

      const text = event.result?.text?.trim()
      if (!text) return
      const language = this.extractDetectedLanguageFromSpeechResult(event.result)
      this.onSegment(this.mapResult(frame.source, text, 'final', 0.9, language))
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
          const finalize = () => {
            state.pushStream.close()
            state.recognizer.close()
            resolve()
          }

          if (state.mode === 'conversationTranscriber') {
            state.recognizer.stopTranscribingAsync(finalize, finalize)
            return
          }

          state.recognizer.stopContinuousRecognitionAsync(finalize, finalize)
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

    const language = this.extractDetectedLanguageFromConversationResult(result)
    if (language) {
      this.onDebug?.(`ConversationTranscriber Sprache für ${source}: ${language}`)
    }

    return {
      id: randomUUID(),
      source,
      speaker: speakerId || 'unknown',
      language,
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
    confidence: number,
    language?: string
  ): TranscriptSegment {
    return {
      id: randomUUID(),
      source,
      speaker: source === 'mic' ? 'self' : 'guest',
      language,
      timestampIso: new Date().toISOString(),
      text,
      state,
      confidence
    }
  }

  private getLidCandidates(): string[] {
    const preferred = this.settings.language.trim()
    return [...new Set([preferred, ...CONTINUOUS_LID_CANDIDATES])]
  }

  private extractDetectedLanguageFromSpeechResult(result: RecognitionEvent['result']): string | undefined {
    if (!result || !this.sdk) return undefined

    try {
      const detected = this.sdk.AutoDetectSourceLanguageResult.fromResult(result as any)
      const language = detected?.language?.trim()
      return language && language.length > 0 ? language : undefined
    } catch {
      return undefined
    }
  }

  private extractDetectedLanguageFromConversationResult(result: RecognitionEvent['result']): string | undefined {
    if (!result || !this.sdk) return undefined

    try {
      const detected = this.sdk.AutoDetectSourceLanguageResult.fromConversationTranscriptionResult(result as any)
      const language = detected?.language?.trim()
      return language && language.length > 0 ? language : undefined
    } catch {
      return undefined
    }
  }
}
