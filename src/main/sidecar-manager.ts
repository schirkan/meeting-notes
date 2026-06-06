import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import net from 'node:net'
import { join } from 'node:path'
import { splitFrames, type DecodedFrame } from './frame-protocol'
import type { AudioDeviceSnapshot, TranscriptError } from '@shared/transcript-contract'

export interface SidecarStartOptions {
  micId: string | null
  speakerId: string | null
  language: string
  sampleRate: number
}

function sidecarArgs(extra: string[] = []): string[] {
  const projectPath = join(process.cwd(), 'sidecar', 'MeetingNotes.Sidecar.csproj')
  return ['run', '--project', projectPath, '--', ...extra]
}

export async function listSidecarDevices(): Promise<AudioDeviceSnapshot> {
  return new Promise((resolve, reject) => {
    const child = spawn('dotnet', sidecarArgs(['--list-devices']), {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Device-Listing fehlgeschlagen (${code}): ${stderr || stdout}`))
        return
      }

      try {
        const parsed = JSON.parse(stdout) as AudioDeviceSnapshot
        resolve(parsed)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reject(new Error(`Ungültige Device-JSON vom Sidecar: ${message}`))
      }
    })
  })
}

export class SidecarSession {
  private child: ChildProcessWithoutNullStreams | null = null
  private pipe: net.Socket | null = null
  private remainder = Buffer.alloc(0)
  private readonly pipeName = `meeting-notes-${randomUUID()}`

  async start(
    options: SidecarStartOptions,
    onFrame: (frame: DecodedFrame) => void,
    onError: (error: TranscriptError) => void
  ): Promise<void> {
    if (this.child) return

    const args = [
      '--pipe-name',
      this.pipeName,
      '--sample-rate',
      String(options.sampleRate),
      '--language',
      options.language
    ]

    if (options.micId) args.push('--mic-device-id', options.micId)
    if (options.speakerId) args.push('--speaker-device-id', options.speakerId)

    this.child = spawn('dotnet', sidecarArgs(args), {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.child.stdout.on('data', (chunk) => {
      const lines = chunk
        .toString('utf8')
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean)

      for (const line of lines) {
        try {
          const json = JSON.parse(line) as { type?: string; code?: string; message?: string }
          if (json.type === 'error') {
            onError({
              code: (json.code as TranscriptError['code']) ?? 'SIDECAR_UNAVAILABLE',
              message: json.message ?? 'Sidecar meldet einen Fehler.'
            })
          }
        } catch {
          // ignore unstructured output
        }
      }
    })

    this.child.stderr.on('data', (chunk) => {
      const line = chunk.toString('utf8').trim()
      if (!line) return
      onError({ code: 'SIDECAR_UNAVAILABLE', message: line })
    })

    this.child.on('exit', (code) => {
      if (code && code !== 0) {
        onError({ code: 'SIDECAR_UNAVAILABLE', message: `Sidecar beendet mit Exit-Code ${code}.` })
      }
      this.child = null
      this.pipe?.destroy()
      this.pipe = null
      this.remainder = Buffer.alloc(0)
    })

    await this.connectPipe(onFrame)
  }

  private async connectPipe(onFrame: (frame: DecodedFrame) => void): Promise<void> {
    const pipePath = `\\\\.\\pipe\\${this.pipeName}`
    const startedAt = Date.now()

    await new Promise<void>((resolve, reject) => {
      const tryConnect = () => {
        const socket = net.createConnection(pipePath)

        socket.once('connect', () => {
          this.pipe = socket
          socket.on('data', (chunk) => {
            const merged = Buffer.concat([Buffer.from(this.remainder), Buffer.from(chunk)])
            const { frames, rest } = splitFrames(merged)
            this.remainder = Buffer.from(rest)
            for (const frame of frames) onFrame(frame)
          })
          socket.on('error', () => undefined)
          resolve()
        })

        socket.once('error', () => {
          socket.destroy()
          if (Date.now() - startedAt > 15_000) {
            reject(new Error('Pipe-Verbindung zum Sidecar konnte nicht aufgebaut werden (Timeout).'))
            return
          }
          setTimeout(tryConnect, 250)
        })
      }

      tryConnect()
    })
  }

  async stop(): Promise<void> {
    this.pipe?.destroy()
    this.pipe = null
    this.remainder = Buffer.alloc(0)

    if (!this.child) return

    const child = this.child
    this.child = null

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve())
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
        resolve()
      }, 2_000)
    })
  }
}
