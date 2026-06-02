export interface VadOptions {
  threshold?: number
  silenceTimeoutMs?: number
  minSpeechDurationMs?: number
  sampleRate?: number
}

export type VadEvent = 'speech.start' | 'speech.stop'

export type VadCallback = (event: VadEvent) => void

export class VoiceActivityDetector {
  private threshold: number
  private silenceTimeoutMs: number
  private minSpeechDurationMs: number
  private sampleRate: number

  private isSpeaking = false
  private silenceStart = 0
  private speechStart = 0

  private onEvent: VadCallback | null = null

  constructor(options: VadOptions = {}) {
    this.threshold = options.threshold ?? 0.02
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 400
    this.minSpeechDurationMs = options.minSpeechDurationMs ?? 100
    this.sampleRate = options.sampleRate ?? 48000
  }

  setCallback(cb: VadCallback): void {
    this.onEvent = cb
  }

  process(samples: Float32Array): void {
    const energy = this.calculateEnergy(samples)
    const now = performance.now()

    if (energy > this.threshold) {
      if (!this.isSpeaking) {
        this.speechStart = now
        this.isSpeaking = true
        this.silenceStart = 0
      }
    } else if (this.isSpeaking) {
      if (this.silenceStart === 0) {
        this.silenceStart = now
      } else if (now - this.silenceStart > this.silenceTimeoutMs) {
        const speechDuration = this.silenceStart - this.speechStart
        if (speechDuration >= this.minSpeechDurationMs) {
          this.isSpeaking = false
          this.silenceStart = 0
          this.onEvent?.('speech.stop')
        }
      }
    }

    if (this.isSpeaking && this.silenceStart === 0) {
      const speechDuration = now - this.speechStart
      if (speechDuration >= this.minSpeechDurationMs && this.silenceStart === 0) {
        this.onEvent?.('speech.start')
      }
    }
  }

  private calculateEnergy(samples: Float32Array): number {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    return Math.sqrt(sum / samples.length)
  }

  reset(): void {
    this.isSpeaking = false
    this.silenceStart = 0
    this.speechStart = 0
  }
}
