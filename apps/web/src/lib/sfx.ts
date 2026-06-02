let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const len = Math.floor(durationSec * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function mechanicalClick(startAt: number, volume: number) {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Sharp transient click — white noise burst with exponential decay shaped like a switch
  const dur = 0.008;
  const buf = createNoiseBuffer(ctx, dur);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Shape the noise so it has a sharp attack and fast decay (like a real mechanical switch)
  const clickData = buf.getChannelData(0);
  for (let i = 0; i < clickData.length; i++) {
    const t = i / clickData.length;
    clickData[i] *= Math.exp(-t * 12) * (1 - Math.exp(-t * 200));
  }

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  hp.Q.value = 0.7;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 8000;
  lp.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  src.start(startAt);
  src.stop(startAt + dur + 0.001);
}

function bodyThump(startAt: number, volume: number) {
  // Low-frequency resonant thud that gives the click physical weight
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, startAt);
  osc.frequency.exponentialRampToValueAtTime(50, startAt + 0.025);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.03);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + 0.035);
}

function squelchNoise(startAt: number, durationSec: number, volume: number, filterFreq: number, filterQ: number) {
  // Radio static — filtered white noise with attack/decay envelope
  const ctx = getAudioContext();
  if (!ctx) return;

  const buf = createNoiseBuffer(ctx, durationSec);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Shape: sharp attack, sustain, then fade
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    let env: number;
    if (t < 0.05) {
      env = t / 0.05;
    } else if (t < 0.3) {
      env = 1.0;
    } else {
      env = Math.exp(-(t - 0.3) * 6);
    }
    data[i] *= env;
  }

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filterFreq;
  bp.Q.value = filterQ;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 400;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, startAt);

  src.connect(bp);
  bp.connect(hp);
  hp.connect(gain);
  gain.connect(ctx.destination);
  src.start(startAt);
  src.stop(startAt + durationSec + 0.001);
}

function transientBurst(startAt: number, durationSec: number, volume: number, freq: number) {
  // Short percussive burst like a squelch tail opening
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, startAt);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.001);
}

// PTT press — realistic walkie-talkie "kerchunk"
// Sounds like pressing the PTT button on a real radio:
// 1. Mechanical click of the switch
// 2. Brief static burst as the squelch opens
// 3. Low thump giving it physical weight
// 4. Short settling tone as the transmitter locks on
export function playPttDownTone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  // 1. Sharp mechanical click
  mechanicalClick(t, 0.25);

  // 2. Body resonance thump
  bodyThump(t, 0.12);

  // 3. Squelch opening static — mid-frequency radio noise
  squelchNoise(t + 0.003, 0.07, 0.09, 2800, 0.6);

  // 4. Settling transient — brief high tone that drops off
  transientBurst(t + 0.005, 0.025, 0.035, 1600);
}

// PTT release — realistic radio unkey sound
// Sounds like releasing the PTT button:
// 1. Brief squelch tail static
// 2. Mechanical click
// 3. Quick settling silence
export function playPttUpTone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  // 1. Squelch tail — brief static that fades out (like squelch closing)
  squelchNoise(t, 0.055, 0.07, 2200, 0.5);

  // 2. Mechanical click (slightly softer than the press)
  mechanicalClick(t + 0.01, 0.18);

  // 3. Lighter thump
  bodyThump(t + 0.01, 0.06);

  // 4. Brief descending tail
  transientBurst(t + 0.015, 0.02, 0.025, 1100);
}

export function playUserJoinedTone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(740, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.04, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.065);

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(988, t + 0.045);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.001, t + 0.045);
  g2.gain.linearRampToValueAtTime(0.03, t + 0.05);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.125);
  osc2.connect(g2);
  g2.connect(ctx.destination);
  osc2.start(t + 0.045);
  osc2.stop(t + 0.13);
}

export function playUserLeftTone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.075);
}