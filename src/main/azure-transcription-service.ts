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

type CanceledEvent = {
  reason?: string | number
  errorCode?: string | number
  errorDetails?: string
  sessionId?: string
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
  private firstFrameLogged = new Set<TranscriptSource>()

  constructor(
    private readonly azureConfig: FixedAzureConfig,
    private readonly settings: UserSettings,
    private readonly onSegment: (segment: TranscriptSegment) => void,
    private readonly onError: (error: TranscriptError) => void,
    private readonly onDebug?: (message: string, level?: 'info' | 'warn' | 'error') => void
  ) { }

  async init(): Promise<void> {
    this.onDebug?.('AzureTranscriptionService.init: SDK wird geladen.')
    this.sdk = await import('microsoft-cognitiveservices-speech-sdk')

    this.speechConfig = this.sdk.SpeechConfig.fromSubscription(this.azureConfig.speechKey, this.azureConfig.region)
    this.speechConfig.speechRecognitionLanguage = this.settings.language
    this.speechConfig.setProperty('SpeechServiceConnection_Endpoint', this.azureConfig.endpoint)
    this.speechConfig.setProperty('SpeechServiceResponse_DiarizeIntermediateResults', 'true')
    this.speechConfig.setProperty('SpeechServiceConnection_LanguageIdMode', 'Continuous')

    this.onDebug?.(
      `AzureTranscriptionService.init: Konfiguration aktiv (region=${this.azureConfig.region}, language=${this.settings.language}, diarizeInterim=true, lidMode=Continuous).`
    )

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

      this.attachCommonRecognizerDiagnostics(recognizer, frame.source, 'conversationTranscriber')

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

      recognizer.canceled = (_sender: unknown, event: CanceledEvent) => {
        this.handleRecognizerCanceled(frame.source, 'conversationTranscriber', event)
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

    this.attachCommonRecognizerDiagnostics(recognizer, frame.source, 'speechRecognizer')

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

    recognizer.canceled = (_sender: unknown, event: CanceledEvent) => {
      this.handleRecognizerCanceled(frame.source, 'speechRecognizer', event)
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
      if (!this.firstFrameLogged.has(frame.source)) {
        this.firstFrameLogged.add(frame.source)
        this.onDebug?.(
          `Erstes Audio-Frame empfangen (source=${frame.source}, sampleRate=${frame.sampleRate}, bits=${frame.bitsPerSample}, channels=${frame.channels}, bytes=${frame.payload.byteLength}).`
        )
      }

      const state = this.ensureStreamForFrame(frame)
      state.pushStream.write(frame.payload.buffer.slice(frame.payload.byteOffset, frame.payload.byteOffset + frame.payload.byteLength) as ArrayBuffer)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.onDebug?.(`pushFrame Fehler (source=${frame.source}): ${message}`, 'error')
      this.onError({ code: 'AZURE_RECOGNIZER_FAILED', message })
    }
  }

  async stop(): Promise<void> {
    this.onDebug?.(`AzureTranscriptionService.stop: ${this.streams.size} aktive Stream(s) werden beendet.`)

    const closePromises = [...this.streams.values()].map(
      (state) =>
        new Promise<void>((resolve) => {
          const finalize = () => {
            this.onDebug?.(`Recognizer gestoppt (mode=${state.mode}).`)
            state.pushStream.close()
            state.recognizer.close()
            resolve()
          }

          if (state.mode === 'conversationTranscriber') {
            state.recognizer.stopTranscribingAsync(finalize, (error: string) => {
              this.onDebug?.(`stopTranscribingAsync Fehler: ${String(error)}`, 'error')
              finalize()
            })
            return
          }

          state.recognizer.stopContinuousRecognitionAsync(finalize, (error: string) => {
            this.onDebug?.(`stopContinuousRecognitionAsync Fehler: ${String(error)}`, 'error')
            finalize()
          })
        })
    )

    await Promise.all(closePromises)
    this.streams.clear()
    this.missingSpeakerIdLogged.clear()
    this.firstFrameLogged.clear()
    this.onDebug?.('AzureTranscriptionService.stop: alle Streams geschlossen.')
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

  private attachCommonRecognizerDiagnostics(
    recognizer: any,
    source: TranscriptSource,
    mode: StreamState['mode']
  ): void {
    recognizer.sessionStarted = (_sender: unknown, event: { sessionId?: string }) => {
      this.onDebug?.(`Session gestartet (${this.formatRecognizerContext(source, mode, event.sessionId)}).`)
    }

    recognizer.sessionStopped = (_sender: unknown, event: { sessionId?: string }) => {
      this.onDebug?.(`Session gestoppt (${this.formatRecognizerContext(source, mode, event.sessionId)}).`)
    }

    recognizer.speechStartDetected = (_sender: unknown, event: { sessionId?: string; offset?: number }) => {
      this.onDebug?.(
        `Speech start erkannt (${this.formatRecognizerContext(source, mode, event.sessionId)}, offset=${event.offset ?? 'n/a'}).`
      )
    }

    recognizer.speechEndDetected = (_sender: unknown, event: { sessionId?: string; offset?: number }) => {
      this.onDebug?.(
        `Speech end erkannt (${this.formatRecognizerContext(source, mode, event.sessionId)}, offset=${event.offset ?? 'n/a'}).`
      )
    }
  }

  private handleRecognizerCanceled(
    source: TranscriptSource,
    mode: StreamState['mode'],
    event: CanceledEvent
  ): void {
    const errorDetails = event.errorDetails?.trim() || 'Azure Recognizer wurde abgebrochen.'
    const authRelated = /auth|token|key|forbidden|unauthorized|401|403/i.test(errorDetails)
    const code: TranscriptError['code'] = authRelated ? 'AZURE_AUTH_FAILED' : 'AZURE_RECOGNIZER_FAILED'

    this.onDebug?.(
      `Recognizer canceled (${this.formatRecognizerContext(source, mode, event.sessionId)}, reason=${event.reason ?? 'n/a'}, errorCode=${event.errorCode ?? 'n/a'}): ${errorDetails}`,
      'error'
    )

    this.onError({
      code,
      message: `[${source}/${mode}] ${errorDetails}`
    })
  }

  private formatRecognizerContext(source: TranscriptSource, mode: StreamState['mode'], sessionId?: string): string {
    return `source=${source}, mode=${mode}, session=${sessionId?.trim() || 'n/a'}`
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
