export class AudioLevelMeter {
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array | null = null
  private animationId: number | null = null
  private onLevel: ((level: number) => void) | null = null

  connect(source: AudioNode, context: AudioContext, fftSize = 256): void {
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = fftSize
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    source.connect(this.analyser)
  }

  start(onLevel: (level: number) => void): void {
    this.onLevel = onLevel
    const tick = () => {
      if (!this.analyser || !this.dataArray || !this.onLevel) return
      this.analyser.getByteTimeDomainData(this.dataArray as unknown as Uint8Array<ArrayBuffer>)

      let max = 0
      for (let i = 0; i < this.dataArray.length; i++) {
        const v = Math.abs(this.dataArray[i] - 128)
        if (v > max) max = v
      }

      const level = max / 128
      this.onLevel(level)
      this.animationId = requestAnimationFrame(tick)
    }
    tick()
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}
