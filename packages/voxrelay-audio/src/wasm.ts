export interface WasmAudioModule {
  init(): Promise<void>
  encodeOpus(pcmData: Int16Array, sampleRate: number): Uint8Array | null
  decodeOpus(opusData: Uint8Array, sampleRate: number): Int16Array | null
  processNoiseSuppression(pcmData: Int16Array, sampleRate: number): Int16Array
  processAutoGain(pcmData: Int16Array, gainDb: number): Int16Array
  free(): void
}

let wasmModule: WasmAudioModule | null = null

export async function loadWasmAudioModule(url?: string): Promise<WasmAudioModule> {
  if (wasmModule) return wasmModule

  try {
    const response = await fetch(url ?? '/audio-processor.wasm')
    const wasmBytes = await response.arrayBuffer()
    const module = await WebAssembly.compile(wasmBytes)
    const instance = await WebAssembly.instantiate(module, {
      env: {
        memory: new WebAssembly.Memory({ initial: 256 }),
        abort: () => { throw new Error('WASM aborted') },
      },
    })

    wasmModule = {
      async init() {},
      encodeOpus(pcmData: Int16Array, _sampleRate: number): Uint8Array | null {
        if (!instance.exports.encode_opus) return null
        const ptr = (instance.exports as any).allocate(pcmData.length * 2)
        const mem = new Int16Array((instance.exports.memory as WebAssembly.Memory).buffer, ptr, pcmData.length)
        mem.set(pcmData)
        const size = (instance.exports as any).encode_opus(ptr, pcmData.length, _sampleRate)
        if (size <= 0) return null
        const out = new Uint8Array((instance.exports.memory as WebAssembly.Memory).buffer, ptr, size)
        return new Uint8Array(out)
      },
      decodeOpus(opusData: Uint8Array, _sampleRate: number): Int16Array | null {
        if (!instance.exports.decode_opus) return null
        const ptr = (instance.exports as any).allocate(opusData.length)
        const mem = new Uint8Array((instance.exports.memory as WebAssembly.Memory).buffer, ptr, opusData.length)
        mem.set(opusData)
        const size = (instance.exports as any).decode_opus(ptr, opusData.length, _sampleRate)
        if (size <= 0) return null
        const out = new Int16Array((instance.exports.memory as WebAssembly.Memory).buffer, ptr, size / 2)
        return new Int16Array(out)
      },
      processNoiseSuppression(pcmData: Int16Array, _sampleRate: number): Int16Array {
        if (!instance.exports.process_ns) return pcmData
        const ptr = (instance.exports as any).allocate(pcmData.length * 2)
        const mem = new Int16Array((instance.exports.memory as WebAssembly.Memory).buffer, ptr, pcmData.length)
        mem.set(pcmData)
        ;(instance.exports as any).process_ns(ptr, pcmData.length, _sampleRate)
        return new Int16Array(mem)
      },
      processAutoGain(pcmData: Int16Array, gainDb: number): Int16Array {
        if (!instance.exports.process_agc) return pcmData
        const ptr = (instance.exports as any).allocate(pcmData.length * 2)
        const mem = new Int16Array((instance.exports.memory as WebAssembly.Memory).buffer, ptr, pcmData.length)
        mem.set(pcmData)
        ;(instance.exports as any).process_agc(ptr, pcmData.length, gainDb)
        return new Int16Array(mem)
      },
      free() {
        if (instance.exports.free_heap) (instance.exports as any).free_heap()
      },
    }

    return wasmModule
  } catch (e) {
    console.warn('WASM audio module not available, using JS fallback:', e)
    return createJsFallback()
  }
}

function createJsFallback(): WasmAudioModule {
  return {
    async init() {},
    encodeOpus(_pcm: Int16Array, _sampleRate: number): Uint8Array | null {
      return null
    },
    decodeOpus(_opus: Uint8Array, _sampleRate: number): Int16Array | null {
      return null
    },
    processNoiseSuppression(pcm: Int16Array, _sampleRate: number): Int16Array {
      return pcm
    },
    processAutoGain(pcm: Int16Array, _gainDb: number): Int16Array {
      return pcm
    },
    free() {},
  }
}
