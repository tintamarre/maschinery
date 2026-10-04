import { DELAY_DIVS, NUM_GROUPS, clamp } from './constants'
import { reversedBuffer, sampleBuffers } from './samples'
import type { Project, Sound } from './types'
import { ENGINE_TRIM_DB, buildVoice, makeNoise, type Voice } from './voices'

interface Strip {
  input: GainNode
  hp: BiquadFilterNode
  filter: BiquadFilterNode
  shaper: WaveShaperNode
  crusher: WaveShaperNode
  gain: GainNode
  pan: StereoPannerNode
  sendRev: GainNode
  sendDel: GainNode
  analyser: AnalyserNode | null
}

interface GroupBus {
  input: GainNode
  pan: StereoPannerNode
  sendRev: GainNode
  sendDel: GainNode
  analyser: AnalyserNode
}

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024
  const curve = new Float32Array(n)
  const k = amount * 80
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = amount < 0.001 ? x : ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return curve
}

function crushCurve(amount: number): Float32Array<ArrayBuffer> | null {
  if (amount < 0.01) return null
  const bits = Math.max(2, 16 - amount * 13)
  const levels = Math.pow(2, bits - 1)
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.round(x * levels) / levels
  }
  return curve
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

/** Audio graph: voices -> sound strips -> group buses -> master (+ reverb/delay sends). Works live and offline. */
export class AudioEngine {
  readonly ctx: BaseAudioContext
  private getProject: () => Project
  private noise: AudioBuffer
  private strips = new Map<number, Strip>()
  private buses: GroupBus[] = []
  private choke = new Map<number, { voice: Voice; end: number }[]>()

  private dry: GainNode
  private gate: GainNode
  private perf: BiquadFilterNode
  private comp: DynamicsCompressorNode
  private makeup: GainNode
  private trim: GainNode
  private outMute: GainNode
  private masterGain: GainNode
  private limiter: DynamicsCompressorNode
  readonly masterAnalyser: AnalyserNode
  private scope: AnalyserNode

  private reverb: ConvolverNode
  private reverbIn: GainNode
  private reverbOut: GainNode
  private reverbThrow: GainNode
  private delay: DelayNode
  private delayIn: GainNode
  private delayFb: GainNode
  private delayTone: BiquadFilterNode
  private delayOut: GainNode
  private delayThrow: GainNode
  private irTimer: number | undefined
  private irSize = -1
  private liveBend = 0

  constructor(ctx: BaseAudioContext, getProject: () => Project) {
    this.ctx = ctx
    this.getProject = getProject
    this.noise = makeNoise(ctx)

    this.dry = ctx.createGain()
    this.gate = ctx.createGain()
    this.perf = ctx.createBiquadFilter()
    this.perf.type = 'lowpass'
    this.perf.frequency.value = ctx.sampleRate / 2 - 100
    this.comp = ctx.createDynamicsCompressor()
    this.makeup = ctx.createGain()
    this.trim = ctx.createGain()
    this.trim.gain.value = 0.5 // headroom: many voices can stack up
    this.masterGain = ctx.createGain()
    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -3
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.002
    this.limiter.release.value = 0.08
    this.outMute = ctx.createGain()
    this.masterAnalyser = ctx.createAnalyser()
    this.masterAnalyser.fftSize = 1024
    this.scope = this.masterAnalyser

    this.dry.connect(this.gate).connect(this.perf).connect(this.comp).connect(this.makeup).connect(this.trim).connect(this.masterGain)
    this.masterGain.connect(this.limiter).connect(this.masterAnalyser).connect(this.outMute).connect(ctx.destination)

    // reverb send
    this.reverbIn = ctx.createGain()
    this.reverb = ctx.createConvolver()
    this.reverbOut = ctx.createGain()
    this.reverbThrow = ctx.createGain()
    this.reverbThrow.gain.value = 0
    this.dry.connect(this.reverbThrow).connect(this.reverbIn)
    this.reverbIn.connect(this.reverb).connect(this.reverbOut).connect(this.gate)

    // delay send
    this.delayIn = ctx.createGain()
    this.delay = ctx.createDelay(4)
    this.delayFb = ctx.createGain()
    this.delayTone = ctx.createBiquadFilter()
    this.delayTone.type = 'lowpass'
    this.delayOut = ctx.createGain()
    this.delayThrow = ctx.createGain()
    this.delayThrow.gain.value = 0
    this.dry.connect(this.delayThrow).connect(this.delayIn)
    this.delayIn.connect(this.delay)
    this.delay.connect(this.delayTone)
    this.delayTone.connect(this.delayFb).connect(this.delay)
    this.delayTone.connect(this.delayOut).connect(this.gate)

    for (let g = 0; g < NUM_GROUPS; g++) {
      const input = ctx.createGain()
      const pan = ctx.createStereoPanner()
      const sendRev = ctx.createGain()
      const sendDel = ctx.createGain()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      input.connect(pan)
      pan.connect(this.dry)
      pan.connect(sendRev).connect(this.reverbIn)
      pan.connect(sendDel).connect(this.delayIn)
      pan.connect(analyser)
      this.buses.push({ input, pan, sendRev, sendDel, analyser })
    }
    this.refreshAll()
  }

  // ---- parameters ----------------------------------------------------------

  refreshAll(): void {
    this.refreshMaster()
    for (let g = 0; g < NUM_GROUPS; g++) this.refreshGroup(g)
    for (const key of this.strips.keys()) this.refreshSound(Math.floor(key / 16), key % 16)
  }

  refreshMaster(): void {
    const p = this.getProject()
    const m = p.master
    const t = this.ctx.currentTime
    this.masterGain.gain.setTargetAtTime(m.volume, t, 0.01)
    this.comp.threshold.setTargetAtTime(-4 - m.comp * 26, t, 0.01)
    this.comp.ratio.setTargetAtTime(1.5 + m.comp * 10, t, 0.01)
    this.comp.attack.value = 0.01
    this.comp.release.value = 0.2
    this.makeup.gain.setTargetAtTime(1 + m.comp * 1.2, t, 0.01)
    this.reverbOut.gain.setTargetAtTime(m.reverbLevel, t, 0.01)
    this.delayOut.gain.setTargetAtTime(m.delayLevel, t, 0.01)
    this.delayFb.gain.setTargetAtTime(clamp(m.delayFeedback, 0, 0.92), t, 0.01)
    this.delayTone.frequency.setTargetAtTime(400 * Math.pow(40, m.delayTone), t, 0.01)
    this.delay.delayTime.setTargetAtTime(this.delaySeconds(), t, 0.02)
    const size = Math.round(m.reverbSize * 20)
    if (size !== this.irSize) {
      this.irSize = size
      clearTimeout(this.irTimer)
      const build = () => { this.reverb.buffer = makeImpulse(this.ctx, 0.3 + m.reverbSize * 3.2, 2.2) }
      if (this.reverb.buffer) this.irTimer = window.setTimeout(build, 150)
      else build()
    }
  }

  private delaySeconds(): number {
    const p = this.getProject()
    const div = DELAY_DIVS[p.master.delayDiv] ?? DELAY_DIVS[1]!
    return clamp((60 / p.tempo) * div.beats, 0.01, 3.9)
  }

  refreshGroup(g: number): void {
    const grp = this.getProject().groups[g]!
    const bus = this.buses[g]!
    const t = this.ctx.currentTime
    bus.input.gain.setTargetAtTime(this.groupAudible(g) ? grp.volume : 0, t, 0.01)
    bus.pan.pan.setTargetAtTime(grp.pan, t, 0.01)
    bus.sendRev.gain.setTargetAtTime(grp.reverb, t, 0.01)
    bus.sendDel.gain.setTargetAtTime(grp.delay, t, 0.01)
  }

  refreshMix(): void {
    for (let g = 0; g < NUM_GROUPS; g++) this.refreshGroup(g)
    for (const key of this.strips.keys()) this.refreshSound(Math.floor(key / 16), key % 16)
  }

  groupAudible(g: number): boolean {
    const groups = this.getProject().groups
    const anySolo = groups.some((x) => x.solo)
    const grp = groups[g]!
    return !grp.mute && (!anySolo || grp.solo)
  }

  soundAudible(g: number, s: number): boolean {
    const grp = this.getProject().groups[g]!
    const anySolo = grp.sounds.some((x) => x.solo)
    const snd = grp.sounds[s]!
    return this.groupAudible(g) && !snd.mute && (!anySolo || snd.solo)
  }

  refreshSound(g: number, s: number): void {
    const strip = this.strips.get(g * 16 + s)
    if (!strip) return
    const p = this.getProject().groups[g]!.sounds[s]!.params
    const t = this.ctx.currentTime
    strip.filter.frequency.setTargetAtTime(Math.min(20 * Math.pow(1000, p.cutoff), this.ctx.sampleRate / 2 - 100), t, 0.01)
    strip.filter.Q.setTargetAtTime(0.5 + p.reso * 14, t, 0.01)
    strip.shaper.curve = driveCurve(p.drive)
    strip.crusher.curve = crushCurve(p.crush)
    strip.hp.frequency.setTargetAtTime(20 * Math.pow(150, p.hp), t, 0.01)
    strip.gain.gain.setTargetAtTime(this.soundAudible(g, s) ? p.volume : 0, t, 0.01)
    strip.pan.pan.setTargetAtTime(p.pan, t, 0.01)
    strip.sendRev.gain.setTargetAtTime(p.reverb, t, 0.01)
    strip.sendDel.gain.setTargetAtTime(p.delay, t, 0.01)
  }

  private strip(g: number, s: number): Strip {
    const key = g * 16 + s
    let st = this.strips.get(key)
    if (st) return st
    const ctx = this.ctx
    const bus = this.buses[g]!
    st = {
      input: ctx.createGain(),
      hp: ctx.createBiquadFilter(),
      filter: ctx.createBiquadFilter(),
      shaper: ctx.createWaveShaper(),
      crusher: ctx.createWaveShaper(),
      gain: ctx.createGain(),
      pan: ctx.createStereoPanner(),
      sendRev: ctx.createGain(),
      sendDel: ctx.createGain(),
      analyser: null,
    }
    st.hp.type = 'highpass'
    st.hp.frequency.value = 20
    st.hp.Q.value = 0.7
    st.filter.type = 'lowpass'
    st.shaper.oversample = '2x'
    st.input.connect(st.hp).connect(st.filter).connect(st.shaper).connect(st.crusher).connect(st.gain).connect(st.pan).connect(bus.input)
    st.pan.connect(st.sendRev).connect(this.reverbIn)
    st.pan.connect(st.sendDel).connect(this.delayIn)
    this.strips.set(key, st)
    this.refreshSound(g, s)
    return st
  }

  // ---- playback ------------------------------------------------------------

  /** Start a sound. `len` (seconds) is known for scheduled events; omit for live held pads. */
  trigger(g: number, s: number, time: number, vel127: number, note = 0, len?: number): Voice | null {
    const proj = this.getProject()
    const snd: Sound = proj.groups[g]!.sounds[s]!
    if (!this.soundAudible(g, s)) return null
    const p = snd.params
    const t = Math.max(time, this.ctx.currentTime)
    const vel01 = clamp(vel127 / 127, 0, 1)
    const level = ((1 - p.velSens) + p.velSens * vel01) * Math.pow(10, ENGINE_TRIM_DB[snd.engine] / 20)
    const strip = this.strip(g, s)

    if (p.choke > 0) {
      const key = g * 10 + p.choke
      const list = (this.choke.get(key) ?? []).filter((e) => e.end > t)
      for (const e of list) e.voice.kill(t)
      list.length = 0
      this.choke.set(key, list)
    }

    const voice = buildVoice(snd.engine, {
      ctx: this.ctx,
      out: strip.input,
      t,
      vel: level,
      ratio: Math.pow(2, (p.pitch + note) / 12),
      p,
      noise: this.noise,
      buffer: this.sampleFor(snd),
      len,
    })
    if (this.liveBend) voice.bend(this.liveBend)
    if (p.choke > 0) {
      const key = g * 10 + p.choke
      this.choke.get(key)!.push({ voice, end: t + (len ?? 8) + 4 })
    }
    return voice
  }

  /** silence the speakers without touching the mix (meters and bounces are unaffected) */
  setMuted(muted: boolean): void {
    this.outMute.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01)
  }

  private sampleFor(snd: Sound): AudioBuffer | null {
    const b = snd.sampleId ? (sampleBuffers.get(snd.sampleId) ?? null) : null
    return b && snd.params.reverse >= 0.5 ? reversedBuffer(b) : b
  }

  /** pitch wheel / touch strip bend in cents for new and sustained voices */
  setBend(cents: number): void {
    this.liveBend = cents
  }

  click(time: number, accent: boolean, volume: number): void {
    const t = Math.max(time, this.ctx.currentTime)
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'square'
    o.frequency.value = accent ? 1760 : 1180
    g.gain.setValueAtTime(volume * 0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
    o.connect(g).connect(this.outMute)
    o.start(t)
    o.stop(t + 0.05)
  }

  // ---- perform FX ----------------------------------------------------------

  /** pos 0..1: 0.5 = neutral, <0.5 low-pass sweep, >0.5 high-pass sweep, null = off */
  setPerformFilter(pos: number | null): void {
    const t = this.ctx.currentTime
    if (pos === null || Math.abs(pos - 0.5) < 0.02) {
      this.perf.type = 'lowpass'
      this.perf.frequency.setTargetAtTime(this.ctx.sampleRate / 2 - 100, t, 0.02)
      this.perf.Q.value = 0.7
      return
    }
    this.perf.Q.value = 4
    if (pos < 0.5) {
      this.perf.type = 'lowpass'
      this.perf.frequency.setTargetAtTime(60 * Math.pow(300, pos * 2), t, 0.02)
    } else {
      this.perf.type = 'highpass'
      this.perf.frequency.setTargetAtTime(20 * Math.pow(300, (pos - 0.5) * 2), t, 0.02)
    }
  }

  setGate(time: number, open: boolean): void {
    const t = Math.max(time, this.ctx.currentTime)
    this.gate.gain.setValueAtTime(open ? 1 : 0, t)
  }

  throwSend(kind: 'reverb' | 'delay', on: boolean): void {
    const node = kind === 'reverb' ? this.reverbThrow : this.delayThrow
    node.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02)
  }

  // ---- metering ------------------------------------------------------------

  private peakOf(an: AnalyserNode): number {
    const buf = new Float32Array(an.fftSize)
    an.getFloatTimeDomainData(buf)
    let peak = 0
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!))
    return peak
  }

  groupPeak(g: number): number {
    return this.peakOf(this.buses[g]!.analyser)
  }

  masterPeak(): number {
    return this.peakOf(this.masterAnalyser)
  }

  soundPeak(g: number, s: number): number {
    const st = this.strip(g, s)
    if (!st.analyser) {
      st.analyser = this.ctx.createAnalyser()
      st.analyser.fftSize = 256
      st.pan.connect(st.analyser)
    }
    return this.peakOf(st.analyser)
  }

  getWaveform(out: Float32Array<ArrayBuffer>): void {
    this.scope.getFloatTimeDomainData(out)
  }

  get scopeSize(): number {
    return this.scope.fftSize
  }
}
