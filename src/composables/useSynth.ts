import { shallowRef } from 'vue'

export type PadDef = {
  id: number
  name: string
  key: string
  color: string
  play: (ctx: AudioContext, out: AudioNode, t: number, velocity: number) => void
}

function noiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function tone(
  ctx: AudioContext, out: AudioNode, t: number,
  type: OscillatorType, f0: number, f1: number, decay: number, gain: number,
) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + decay)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + decay)
  osc.connect(g).connect(out)
  osc.start(t)
  osc.stop(t + decay + 0.02)
}

function noise(
  ctx: AudioContext, out: AudioNode, t: number,
  filterType: BiquadFilterType, freq: number, decay: number, gain: number, q = 1,
) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, decay + 0.05)
  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = freq
  filter.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + decay)
  src.connect(filter).connect(g).connect(out)
  src.start(t)
}

const tom = (f: number) => (c: AudioContext, o: AudioNode, t: number, v: number) =>
  tone(c, o, t, 'sine', f, f * 0.5, 0.3, v)

// Maschine-like 4x4 layout, bottom row = pads 1-4 (kick, snare, ...)
export const PADS: PadDef[] = [
  { id: 12, name: 'Clap', key: '1', color: '#e9c46a', play: (c, o, t, v) => { for (let i = 0; i < 3; i++) noise(c, o, t + i * 0.012, 'bandpass', 1500, 0.08, v * 0.7, 2); noise(c, o, t + 0.036, 'bandpass', 1500, 0.2, v * 0.8, 2) } },
  { id: 13, name: 'Rim', key: '2', color: '#f4a261', play: (c, o, t, v) => { tone(c, o, t, 'square', 1700, 1200, 0.03, v * 0.4); noise(c, o, t, 'highpass', 3000, 0.03, v * 0.4) } },
  { id: 14, name: 'Cowbell', key: '3', color: '#e76f51', play: (c, o, t, v) => { tone(c, o, t, 'square', 800, 790, 0.25, v * 0.25); tone(c, o, t, 'square', 540, 530, 0.25, v * 0.25) } },
  { id: 15, name: 'Crash', key: '4', color: '#e63946', play: (c, o, t, v) => noise(c, o, t, 'highpass', 6000, 1.2, v * 0.5) },
  { id: 8, name: 'Tom Hi', key: 'q', color: '#2a9d8f', play: tom(260) },
  { id: 9, name: 'Tom Mid', key: 'w', color: '#2a9d8f', play: tom(180) },
  { id: 10, name: 'Tom Lo', key: 'e', color: '#2a9d8f', play: tom(120) },
  { id: 11, name: 'Ride', key: 'r', color: '#48cae4', play: (c, o, t, v) => { noise(c, o, t, 'highpass', 7000, 0.6, v * 0.3); tone(c, o, t, 'square', 5000, 4900, 0.4, v * 0.1) } },
  { id: 4, name: 'Hat Cl', key: 'a', color: '#a8dadc', play: (c, o, t, v) => noise(c, o, t, 'highpass', 8000, 0.05, v * 0.5) },
  { id: 5, name: 'Hat Op', key: 's', color: '#a8dadc', play: (c, o, t, v) => noise(c, o, t, 'highpass', 8000, 0.35, v * 0.5) },
  { id: 6, name: 'Perc', key: 'd', color: '#9b5de5', play: (c, o, t, v) => tone(c, o, t, 'triangle', 900, 400, 0.12, v * 0.7) },
  { id: 7, name: 'Shaker', key: 'f', color: '#9b5de5', play: (c, o, t, v) => noise(c, o, t, 'bandpass', 6000, 0.08, v * 0.4, 0.8) },
  { id: 0, name: 'Kick', key: 'z', color: '#f15bb5', play: (c, o, t, v) => { tone(c, o, t, 'sine', 160, 45, 0.35, v); noise(c, o, t, 'lowpass', 800, 0.02, v * 0.3) } },
  { id: 1, name: 'Snare', key: 'x', color: '#f15bb5', play: (c, o, t, v) => { tone(c, o, t, 'triangle', 220, 150, 0.12, v * 0.5); noise(c, o, t, 'highpass', 1800, 0.18, v * 0.6) } },
  { id: 2, name: 'Bass', key: 'c', color: '#00bbf9', play: (c, o, t, v) => tone(c, o, t, 'sawtooth', 55, 50, 0.5, v * 0.5) },
  { id: 3, name: 'Zap', key: 'v', color: '#00f5d4', play: (c, o, t, v) => tone(c, o, t, 'sawtooth', 2000, 80, 0.2, v * 0.4) },
]

export function useSynth() {
  const ctx = shallowRef<AudioContext | null>(null)
  const master = shallowRef<GainNode | null>(null)

  function ensureContext(): AudioContext {
    if (!ctx.value) {
      const c = new AudioContext({ latencyHint: 'interactive' })
      const compressor = c.createDynamicsCompressor()
      const gain = c.createGain()
      gain.gain.value = 0.8
      gain.connect(compressor).connect(c.destination)
      ctx.value = c
      master.value = gain
    }
    if (ctx.value.state === 'suspended') void ctx.value.resume()
    return ctx.value
  }

  function trigger(pad: PadDef, velocity = 0.9) {
    const c = ensureContext()
    pad.play(c, master.value!, c.currentTime, velocity)
  }

  function setVolume(v: number) {
    ensureContext()
    master.value!.gain.value = v
  }

  return { trigger, setVolume }
}
