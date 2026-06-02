export class AudioPlayer {
  private context: AudioContext | null = null
  private gainNode: GainNode | null = null
  private destination: MediaStreamAudioDestinationNode | null = null

  private bufferQueue: Float32Array[] = []
  private isPlaying = false
  private playbackNode: AudioBufferSourceNode | null = null

  async init(sampleRate = 48000): Promise<void> {
    this.context = new AudioContext({ sampleRate })
    this.gainNode = this.context.createGain()
    this.gainNode.connect(this.context.destination)
  }

  play(buffer: Float32Array): void {
    if (!this.context || !this.gainNode) return
    const audioBuffer = this.context.createBuffer(1, buffer.length, this.context.sampleRate)
    audioBuffer.getChannelData(0).set(buffer)

    const source = this.context.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.gainNode)
    source.start()
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume))
    }
  }

  close(): void {
    this.playbackNode?.stop()
    this.gainNode?.disconnect()
    this.context?.close()
    this.playbackNode = null
    this.gainNode = null
    this.context = null
    this.isPlaying = false
    this.bufferQueue = []
  }
}
