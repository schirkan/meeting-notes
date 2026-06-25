import type { TranscriptSource } from '@shared/transcript-contract'

const MAGIC = 0x4d4e5043 // "MNPC"
const HEADER_SIZE = 36

export interface DecodedFrame {
  source: TranscriptSource
  timestampIso: string
  sequence: bigint
  sampleRate: number
  channels: number
  bitsPerSample: number
  payload: Buffer
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i]
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

export type ProtocolErrorKind = 'crc_mismatch' | 'unknown_source' | 'invalid_header' | 'magic_mismatch'

export type ProtocolErrorListener = (kind: ProtocolErrorKind, detail: string, sourceHint?: TranscriptSource) => void

export function decodeFrame(chunk: Buffer, onError?: ProtocolErrorListener): DecodedFrame | null {
  if (chunk.length < HEADER_SIZE) return null

  const magic = chunk.readUInt32LE(0)
  if (magic !== MAGIC) return null

  const sourceByte = chunk.readUInt8(5)
  const channels = chunk.readUInt8(6)
  const bitsPerSample = chunk.readUInt8(7)
  const sampleRate = chunk.readInt32LE(8)
  const payloadLength = chunk.readInt32LE(12)
  const timestampMs = chunk.readBigInt64LE(16)
  const sequence = chunk.readBigInt64LE(24)
  const expectedCrc = chunk.readUInt32LE(32)

  if (payloadLength < 0 || chunk.length < HEADER_SIZE + payloadLength) {
    onError?.('invalid_header', `payloadLength=${payloadLength}, available=${chunk.length - HEADER_SIZE}`)
    return null
  }

  const payload = chunk.subarray(HEADER_SIZE, HEADER_SIZE + payloadLength)
  const actualCrc = crc32(payload)
  if (actualCrc !== expectedCrc) {
    onError?.('crc_mismatch', `expected=${expectedCrc.toString(16)}, actual=${actualCrc.toString(16)}, payloadLength=${payloadLength}`)
    return null
  }

  const source: TranscriptSource = sourceByte === 1 ? 'mic' : 'speaker'
  if (sourceByte !== 1 && sourceByte !== 2) {
    onError?.('unknown_source', `sourceByte=${sourceByte}, fallback='${source}'`)
  }

  return {
    source,
    timestampIso: new Date(Number(timestampMs)).toISOString(),
    sequence,
    sampleRate,
    channels,
    bitsPerSample,
    payload
  }
}

export function splitFrames(
  buffer: Buffer,
  onError?: ProtocolErrorListener
): { frames: DecodedFrame[]; rest: Buffer } {
  const frames: DecodedFrame[] = []
  let offset = 0

  while (offset + HEADER_SIZE <= buffer.length) {
    const magic = buffer.readUInt32LE(offset)
    if (magic !== MAGIC) {
      onError?.('magic_mismatch', `magic=0x${magic.toString(16)}, offset=${offset}`)
      break
    }

    const payloadLength = buffer.readInt32LE(offset + 12)
    const frameTotal = HEADER_SIZE + payloadLength
    if (payloadLength < 0 || offset + frameTotal > buffer.length) {
      onError?.('invalid_header', `payloadLength=${payloadLength}, remaining=${buffer.length - offset - HEADER_SIZE}, offset=${offset}`)
      break
    }

    const frameBuffer = buffer.subarray(offset, offset + frameTotal)
    const frame = decodeFrame(frameBuffer, onError)
    if (!frame) break

    frames.push(frame)
    offset += frameTotal
  }

  return { frames, rest: buffer.subarray(offset) }
}

