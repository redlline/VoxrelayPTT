export interface AudioCaptureOptions {
  sampleRate?: number
  channelCount?: number
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

export type AudioDataCallback = (buffer: Float32Array, sampleRate: number) => void

export class AudioCapture {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: AudioWorkletNode | ScriptProcessorNode | null = null
  private context: AudioContext | null = null
  private onAudioData: AudioDataCallback | null = null
  private isCapturing = false

  async start(options: AudioCaptureOptions = {}): Promise<void> {
    if (this.isCapturing) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: options.sampleRate ?? 48000,
        channelCount: options.channelCount ?? 1,
        echoCancellation: options.echoCancellation ?? true,
        noiseSuppression: options.noiseSuppression ?? true,
        autoGainControl: options.autoGainControl ?? true,
      },
    })

    this.context = new AudioContext({ sampleRate: options.sampleRate ?? 48000 })
    this.source = this.context.createMediaStreamSource(this.stream)

    this.processor = this.context.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (e) => {
      if (!this.onAudioData) return
      const input = e.inputBuffer.getChannelData(0)
      this.onAudioData(new Float32Array(input), this.context!.sampleRate)
    }

    this.source.connect(this.processor)
    this.processor.connect(this.context.destination)
    this.isCapturing = true
  }

  stop(): void {
    if (!this.isCapturing) return
    this.processor?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach(t => t.stop())
    this.context?.close()
    this.processor = null
    this.source = null
    this.stream = null
    this.context = null
    this.isCapturing = false
  }

  setAudioCallback(cb: AudioDataCallback): void {
    this.onAudioData = cb
  }

  get isActive(): boolean {
    return this.isCapturing
  }
}
