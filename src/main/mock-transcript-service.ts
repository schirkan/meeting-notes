import { randomUUID } from 'node:crypto'
import type { TranscriptSegment, TranscriptSource } from '@shared/transcript-contract'

const MIC_PHRASES = [
  'Wir starten jetzt mit dem Weekly-Update.',
  'Bitte priorisiere das Ticket für den API-Fix.',
  'Den offenen Punkt nehmen wir ins nächste Sprint Planning.',
  'Ich fasse die Entscheidung kurz zusammen.'
]

const SPEAKER_PHRASES = [
  'Ja, das passt für mich so.',
  'Ich brauche dafür noch einen Tag Puffer.',
  'Können wir die Aufgabe aufteilen?',
  'Lass uns das als MVP 2 einplanen.'
]

export class MockTranscriptService {
  private timer: NodeJS.Timeout | null = null

  start(onSegment: (segment: TranscriptSegment) => void): void {
    if (this.timer) return

    this.timer = setInterval(() => {
      const source: TranscriptSource = Math.random() > 0.5 ? 'mic' : 'speaker'
      const speaker = source === 'mic' ? 'Du' : 'Gegenüber'
      const phrasePool = source === 'mic' ? MIC_PHRASES : SPEAKER_PHRASES
      const text = phrasePool[Math.floor(Math.random() * phrasePool.length)]

      onSegment({
        id: randomUUID(),
        source,
        speaker,
        timestampIso: new Date().toISOString(),
        text,
        state: Math.random() > 0.35 ? 'final' : 'interim',
        confidence: Number((0.75 + Math.random() * 0.24).toFixed(2))
      })
    }, 1300)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }
}
