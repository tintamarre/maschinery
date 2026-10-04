import type { EngineId, SoundParams } from './types'

export interface VoiceInput {
  ctx: BaseAudioContext
  out: AudioNode
  t: number
  vel: number // 0..1
  ratio: number // pitch ratio (sound pitch + note offset)
  p: SoundParams
  noise: AudioBuffer
  buffer: AudioBuffer | null
  /** known note length in seconds (scheduled events) or undefined when held live */
  len?: number
}

export interface Voice {
  /** end a sustained note (no-op for percussive voices) */
  release(t: number): void
  /** fast fade-out, used by choke groups */
  kill(t: number): void
  /** pitch bend in cents */
  bend(cents: number): void
}

/** per-engine loudness trim in dB, measured offline so every engine lands at a similar perceived level */
export const ENGINE_TRIM_DB: Record<EngineId, number> = {
  kick: 1.5, snare: 6, clap: 14, hat: 16, tom: 2, rim: 13, cowbell: 5, perc: 4, shaker: 10, crash: 4,
  bass: -4, lead: -3, pluck: 2, pad: -2, sample: 0,
}

export const SUSTAINED: Partial<Record<EngineId, boolean>> = { bass: true, lead: true, pad: true, sample: true }

const dscale = (d: number) => Math.pow(4, d * 2 - 1)
const hatDecay = (d: number) => 0.025 * Math.pow(8, d * 2)

interface Rig {
  ctx: BaseAudioContext
  kill: GainNode
  oscs: OscillatorNode[]
}

function rig(vi: VoiceInput): Rig {
  const kill = vi.ctx.createGain()
  kill.connect(vi.out)
  return { ctx: vi.ctx, kill, oscs: [] }
}

function voiceOf(r: Rig, release?: (t: number) => void): Voice {
  return {
    release: release ?? (() => {}),
    kill(t) {
      r.kill.gain.cancelScheduledValues(t)
      r.kill.gain.setTargetAtTime(0, t, 0.006)
    },
    bend(cents) {
      for (const o of r.oscs) o.detune.value = cents
    },
  }
}

/** percussive envelope: returns the gain node to connect sources to */
function perc(r: Rig, t: number, peak: number, attack: number, decay: number, dest?: AudioNode): GainNode {
  const g = r.ctx.createGain()
  g.connect(dest ?? r.kill)
  const a = 0.001 + attack * 0.06
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(decay, 0.01))
  return g
}

function osc(r: Rig, type: OscillatorType, f: number, t: number, stop: number, dest: AudioNode, bendable = false): OscillatorNode {
  const o = r.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.connect(dest)
  o.start(t)
  o.stop(stop)
  if (bendable) r.oscs.push(o)
  return o
}

function noiseSrc(r: Rig, vi: VoiceInput, t: number, dur: number): AudioBufferSourceNode {
  const s = r.ctx.createBufferSource()
  s.buffer = vi.noise
  s.loop = true
  s.start(t, Math.random() * 1.5)
  s.stop(t + dur)
  return s
}

function filt(r: Rig, type: BiquadFilterType, f: number, q: number, dest: AudioNode): BiquadFilterNode {
  const b = r.ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = Math.min(f, r.ctx.sampleRate / 2 - 100)
  b.Q.value = q
  b.connect(dest)
  return b
}

function kick(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const env = perc(r, t, vel, p.attack, 0.45 * sc)
  const o = osc(r, 'sine', (80 + p.tone * 240) * ratio, t, t + 0.6 * sc + 0.15, env)
  o.frequency.exponentialRampToValueAtTime(Math.max(42 * ratio, 25), t + 0.07 * sc + 0.015)
  const click = perc(r, t, vel * 0.12 * (0.2 + p.tone), 0, 0.010)
  noiseSrc(r, vi, t, 0.03).connect(filt(r, 'bandpass', 2200, 0.8, click))
  return voiceOf(r)
}

function snare(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const body = perc(r, t, vel * 0.8, p.attack, 0.13 * sc)
  const o = osc(r, 'triangle', 190 * ratio, t, t + 0.3 * sc, body)
  o.frequency.exponentialRampToValueAtTime(125 * ratio, t + 0.08)
  const o2 = osc(r, 'sine', 330 * ratio, t, t + 0.2 * sc, body)
  o2.frequency.exponentialRampToValueAtTime(220 * ratio, t + 0.05)
  const nz = perc(r, t, vel * (0.3 + 0.45 * p.tone), p.attack, (0.12 + 0.12 * p.tone) * sc)
  noiseSrc(r, vi, t, 0.6 * sc).connect(filt(r, 'highpass', 700 + p.tone * 900, 0.7, filt(r, 'lowpass', 6500, 0.7, nz)))
  return voiceOf(r)
}

function clap(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const bp = filt(r, 'bandpass', (1000 + p.tone * 1200) * ratio, 1.4, r.kill)
  for (let i = 0; i < 3; i++) {
    const g = perc(r, t + i * 0.011, vel * 0.8, 0, 0.012, bp)
    noiseSrc(r, vi, t + i * 0.011, 0.05).connect(g)
  }
  const tail = perc(r, t + 0.033, vel * 0.9, p.attack, 0.16 * sc, bp)
  noiseSrc(r, vi, t + 0.033, 0.5 * sc).connect(tail)
  return voiceOf(r)
}

const METAL = [2, 3, 4.16, 5.43, 6.79, 8.21]

function metal(r: Rig, vi: VoiceInput, base: number, env: AudioNode, hp: number, stop: number) {
  const bp = filt(r, 'bandpass', 10000, 0.8, filt(r, 'highpass', hp, 0.7, env))
  for (const m of METAL) osc(r, 'square', base * m, vi.t, stop, bp)
}

function hat(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const d = hatDecay(p.decay)
  const env = perc(r, t, vel * 0.35, p.attack, d)
  metal(r, vi, 40 * ratio, env, 6000 + p.tone * 3000, t + d + 0.1)
  const nz = perc(r, t, vel * 0.18, p.attack, d * 0.7)
  noiseSrc(r, vi, t, d + 0.05).connect(filt(r, 'highpass', 8000, 0.7, nz))
  return voiceOf(r)
}

function crash(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const d = 1.3 * dscale(p.decay)
  const env = perc(r, t, vel * 0.3, p.attack, d)
  metal(r, vi, 38 * ratio, env, 4500 + p.tone * 3000, t + d + 0.1)
  const nz = perc(r, t, vel * 0.25, p.attack, d * 0.8)
  noiseSrc(r, vi, t, d + 0.05).connect(filt(r, 'highpass', 5000, 0.7, nz))
  return voiceOf(r)
}

function tom(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const env = perc(r, t, vel * 0.9, p.attack, 0.32 * sc)
  const o = osc(r, 'sine', (150 + p.tone * 60) * ratio, t, t + 0.5 * sc + 0.1, env)
  o.frequency.exponentialRampToValueAtTime(75 * ratio, t + 0.15 * sc + 0.02)
  const click = perc(r, t, vel * 0.2, 0, 0.01)
  noiseSrc(r, vi, t, 0.02).connect(filt(r, 'bandpass', 2500, 1, click))
  return voiceOf(r)
}

function rim(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const env = perc(r, t, vel * 0.4, p.attack, 0.035 * sc)
  osc(r, 'square', 1700 * ratio, t, t + 0.1, env).frequency.exponentialRampToValueAtTime(1100 * ratio, t + 0.03)
  const nz = perc(r, t, vel * 0.3 * (0.3 + p.tone), 0, 0.03 * sc)
  noiseSrc(r, vi, t, 0.08).connect(filt(r, 'bandpass', 2400, 1.1, nz))
  return voiceOf(r)
}

function cowbell(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const env = perc(r, t, vel * 0.3, p.attack, 0.28 * sc)
  const bp = filt(r, 'bandpass', 800 * ratio, 2 + p.tone * 3, env)
  osc(r, 'square', 540 * ratio, t, t + 0.5 * sc, bp)
  osc(r, 'square', 800 * ratio, t, t + 0.5 * sc, bp)
  return voiceOf(r)
}

function perc2(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const env = perc(r, t, vel * 0.7, p.attack, 0.16 * sc)
  const car = osc(r, 'sine', 900 * ratio, t, t + 0.4 * sc, env)
  car.frequency.exponentialRampToValueAtTime(450 * ratio, t + 0.12 * sc)
  const mod = r.ctx.createOscillator()
  const mg = r.ctx.createGain()
  mg.gain.value = p.tone * 900
  mod.frequency.value = 1350 * ratio
  mod.connect(mg).connect(car.frequency)
  mod.start(t)
  mod.stop(t + 0.4 * sc)
  return voiceOf(r)
}

function shaker(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const env = r.ctx.createGain()
  env.connect(r.kill)
  const a = 0.008 + p.attack * 0.05
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(vel * 0.45, t + a)
  env.gain.exponentialRampToValueAtTime(0.0001, t + a + 0.08 * sc)
  noiseSrc(r, vi, t, 0.4 * sc).connect(filt(r, 'bandpass', (4500 + p.tone * 3000) * ratio, 0.9, env))
  return voiceOf(r)
}

/** sustained ADSR-like gain: attack, hold while the note is held, release on release() */
function sustainEnv(r: Rig, vi: VoiceInput, peak: number, attack: number, release: number, dest?: AudioNode) {
  const g = r.ctx.createGain()
  g.connect(dest ?? r.kill)
  g.gain.setValueAtTime(0.0001, vi.t)
  g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), vi.t + Math.max(attack, 0.003))
  let released = false
  const rel = (t: number) => {
    if (released) return
    released = true
    g.gain.cancelScheduledValues(t)
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t)
    g.gain.setTargetAtTime(0, t, release / 4)
  }
  return { g, rel, release }
}

function stopOscsAt(oscs: OscillatorNode[], t: number) {
  for (const o of oscs) {
    try { o.stop(t) } catch { /* already stopped */ }
  }
}

function bass(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const rel = 0.08 + p.decay * 0.7
  const env = sustainEnv(r, vi, vel * 0.7, p.attack * 0.2, rel)
  const lp = filt(r, 'lowpass', 150, 3 + p.reso * 8, env.g)
  const f = 32.7 * 2 * ratio
  lp.frequency.setValueAtTime(150 + p.tone * 500, t)
  lp.frequency.linearRampToValueAtTime(300 + p.tone * 4000, t + 0.01)
  lp.frequency.exponentialRampToValueAtTime(100 + p.tone * 700, t + 0.25)
  const a = osc(r, 'sawtooth', f, t, t + 60, lp, true)
  const b = osc(r, 'sine', f / 2, t, t + 60, env.g, true)
  const release = (rt: number) => { env.rel(rt); stopOscsAt([a, b], rt + rel + 0.1) }
  if (vi.len !== undefined) release(t + vi.len)
  return voiceOf(r, release)
}

function lead(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const rel = 0.05 + p.decay * 0.8
  const env = sustainEnv(r, vi, vel * 0.35, p.attack * 0.5, rel)
  const lp = filt(r, 'lowpass', 1000, 1 + p.reso * 10, env.g)
  const top = 1200 + p.tone * 9000
  lp.frequency.setValueAtTime(top * 0.2, t)
  lp.frequency.exponentialRampToValueAtTime(top, t + 0.05 + p.attack * 0.4)
  const f = 261.63 * ratio
  const o1 = osc(r, 'sawtooth', f, t, t + 60, lp, true)
  const o2 = osc(r, 'sawtooth', f, t, t + 60, lp, true)
  const o3 = osc(r, 'square', f * 0.5, t, t + 60, lp, true)
  o1.detune.value = -8
  o2.detune.value = 8
  const release = (rt: number) => { env.rel(rt); stopOscsAt([o1, o2, o3], rt + rel + 0.1) }
  if (vi.len !== undefined) release(t + vi.len)
  return voiceOf(r, release)
}

function pluck(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const sc = dscale(p.decay)
  const env = perc(r, t, vel * 0.5, p.attack, 0.5 * sc)
  const lp = filt(r, 'lowpass', 800, 1 + p.reso * 6, env)
  const top = 800 + p.tone * 8000
  lp.frequency.setValueAtTime(top, t)
  lp.frequency.exponentialRampToValueAtTime(Math.max(top * 0.08, 120), t + 0.35 * sc)
  const f = 261.63 * ratio
  osc(r, 'sawtooth', f, t, t + 0.7 * sc + 0.1, lp, true)
  osc(r, 'triangle', f * 2, t, t + 0.7 * sc + 0.1, lp, true)
  return voiceOf(r)
}

function padVoice(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio } = vi
  const rel = 0.3 + p.decay * 2.5
  const env = sustainEnv(r, vi, vel * 0.25, 0.04 + p.attack * 1.5, rel)
  const lp = filt(r, 'lowpass', 500 + p.tone * 6000, 0.7 + p.reso * 6, env.g)
  const f = 130.81 * ratio
  const oscs = [-12, 0, 12].map((d) => {
    const o = osc(r, 'sawtooth', f, t, t + 120, lp, true)
    o.detune.value = d
    return o
  })
  const release = (rt: number) => { env.rel(rt); stopOscsAt(oscs, rt + rel + 0.2) }
  if (vi.len !== undefined) release(t + vi.len)
  return voiceOf(r, release)
}

function sample(vi: VoiceInput): Voice {
  const r = rig(vi)
  const { t, vel, p, ratio, buffer } = vi
  if (!buffer) return voiceOf(r)
  const src = vi.ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = ratio
  // reversed buffers mirror the start/end markers so the same region plays backwards
  const rev = p.reverse >= 0.5
  const a0 = rev ? 1 - p.end : p.start
  const a1 = rev ? 1 - p.start : p.end
  const start = Math.min(a0, a1 - 0.001) * buffer.duration
  const dur = Math.max(0.005, (a1 - a0) * buffer.duration)
  const mode = Math.round(p.gate)
  const rel = 0.01 + p.decay * 0.4
  const env = sustainEnv(r, vi, vel, p.attack * 0.3, rel)
  src.connect(env.g)
  if (mode === 2) {
    src.loop = true
    src.loopStart = start
    src.loopEnd = start + dur
    src.start(t, start)
  } else {
    src.start(t, start, dur)
  }
  const sustained = mode >= 1
  if (!sustained) {
    // one-shot: play to the end with a short tail fade
    const natural = t + dur / ratio
    env.g.gain.setValueAtTime(Math.max(vel, 0.0002), Math.max(t + 0.002, natural - 0.005))
    env.g.gain.linearRampToValueAtTime(0.0001, natural)
  }
  const release = (rt: number) => {
    if (!sustained) return
    env.rel(rt)
    try { src.stop(rt + rel + 0.1) } catch { /* already stopped */ }
  }
  if (sustained && vi.len !== undefined) release(t + vi.len)
  const v = voiceOf(r, release)
  v.bend = (cents) => { src.detune.value = cents }
  return v
}

const BUILDERS: Record<EngineId, (vi: VoiceInput) => Voice> = {
  kick, snare, clap, hat, tom, rim, cowbell, perc: perc2, shaker, crash,
  bass, lead, pluck, pad: padVoice, sample,
}

export function buildVoice(engine: EngineId, vi: VoiceInput): Voice {
  return BUILDERS[engine](vi)
}

export function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}
