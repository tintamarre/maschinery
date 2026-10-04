import { BAR, NUM_GROUPS, PPQ, REPEAT_RATES } from './constants'
import type { AudioEngine } from './engine'
import { laneValueAt } from './pattern'
import type { NoteEvent, Pattern, Project, Settings } from './types'

const LOOKAHEAD = 0.14
const PUMP_MS = 25
const RING = 128

export interface SeqHooks {
  setGroupPattern(g: number, idx: number): void
  addEvent(g: number, pattern: number, ev: NoteEvent): void
  eraseAt(g: number, s: number, tick: number): void
  applyAuto?(g: number, target: string, value: number, time: number): void
  onSongIndex?(idx: number): void
}

interface TickLog {
  time: number
  tick: number
  pos: number[]
}

export interface HitLog {
  time: number
  g: number
  s: number
  v: number
}

interface RepeatEntry {
  g: number
  s: number
  vel: number
  note: number
}

/** warp from straight 16th grid to swung time (positions inside a 48 tick pair) */
export function swingOffset(posInPair: number, swingTicks: number): number {
  if (swingTicks === 0) return 0
  const a = 24 + swingTicks
  if (posInPair < 24) return (posInPair * a) / 24 - posInPair
  return a + ((posInPair - 24) * (24 - swingTicks)) / 24 - posInPair
}

/** inverse of the swing warp: real position -> straight grid position */
export function unswing(real: number, swingTicks: number): number {
  if (swingTicks === 0) return real
  const base = Math.floor(real / 48) * 48
  const p = real - base
  const a = 24 + swingTicks
  const t = p < a ? (p * 24) / a : 24 + ((p - a) * 24) / (24 - swingTicks)
  return base + t
}

export class Sequencer {
  readonly engine: AudioEngine
  private getProject: () => Project
  private getSettings: () => Settings
  private hooks: SeqHooks

  playing = false
  recording = false
  songMode = false
  songIdx = -1
  songBarsLeft = 0
  countInLeft = 0
  gTick = 0
  pos: number[] = new Array(NUM_GROUPS).fill(0)
  pending: (number | null)[] = new Array(NUM_GROUPS).fill(null)
  ring: TickLog[] = []
  hits: HitLog[] = []
  repeats = new Map<number, RepeatEntry>()
  eraseHeld = new Set<number>()
  stutter = 0

  private lastAuto = new Map<string, number>()
  private running = false
  private nextTime = 0
  private worker: Worker | null = null
  private timer: number | undefined
  private index = new WeakMap<Pattern, { rev: number; map: Map<number, NoteEvent[]> }>()

  constructor(engine: AudioEngine, getProject: () => Project, getSettings: () => Settings, hooks: SeqHooks) {
    this.engine = engine
    this.getProject = getProject
    this.getSettings = getSettings
    this.hooks = hooks
  }

  // ---- clock ---------------------------------------------------------------

  private startClock(): void {
    if (this.running) return
    this.running = true
    this.gTick = 0
    this.nextTime = this.engine.ctx.currentTime + 0.04
    if (typeof Worker !== 'undefined') {
      const src = `let id; onmessage = (e) => { clearInterval(id); if (e.data === 'start') id = setInterval(() => postMessage(0), ${PUMP_MS}) }`
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
      this.worker.onmessage = () => this.pump()
      this.worker.postMessage('start')
    } else {
      this.timer = window.setInterval(() => this.pump(), PUMP_MS)
    }
  }

  private stopClock(): void {
    if (!this.running) return
    this.running = false
    this.worker?.terminate()
    this.worker = null
    clearInterval(this.timer)
  }

  private maybeStopClock(): void {
    if (!this.playing && this.repeats.size === 0) this.stopClock()
  }

  private pump(): void {
    const ctx = this.engine.ctx
    const limit = ctx.currentTime + LOOKAHEAD
    while (this.nextTime < limit) {
      const sec = 60 / (this.getProject().tempo * PPQ)
      this.processTick(this.gTick, this.nextTime, sec)
      this.nextTime += sec
      this.gTick++
    }
  }

  // ---- transport -----------------------------------------------------------

  start(opts: { song?: boolean; record?: boolean } = {}): void {
    this.songMode = !!opts.song
    this.recording = !!opts.record
    this.stopClock()
    this.pos.fill(0)
    this.lastAuto.clear()
    this.ring.length = 0
    this.songIdx = -1
    this.songBarsLeft = 0
    const s = this.getSettings()
    this.countInLeft = this.recording && s.countIn > 0 ? s.countIn * BAR : 0
    this.playing = true
    this.startClock()
  }

  stop(): void {
    this.playing = false
    this.recording = false
    this.countInLeft = 0
    this.songIdx = -1
    this.pending.fill(null)
    this.pos.fill(0)
    this.setStutter(0)
    this.engine.setGate(0, true)
    this.maybeStopClock()
  }

  setStutter(ticks: number): void {
    this.stutter = ticks
    if (!ticks) this.engine.setGate(this.engine.ctx.currentTime, true)
  }

  queuePattern(g: number, idx: number): void {
    const grp = this.getProject().groups[g]!
    if (!this.playing || this.countInLeft > 0) {
      this.pending[g] = null
      if (grp.pattern !== idx) this.hooks.setGroupPattern(g, idx)
      this.pos[g] = 0
    } else {
      this.pending[g] = idx === grp.pattern ? null : idx
    }
  }

  // ---- note repeat / erase --------------------------------------------------

  startRepeat(key: number, entry: RepeatEntry): void {
    this.repeats.set(key, entry)
    if (!this.running) this.startClock()
  }

  stopRepeat(key: number): void {
    this.repeats.delete(key)
    this.maybeStopClock()
  }

  // ---- position for live recording -------------------------------------------

  /** straight-grid tick position of group g "right now" (as heard), or null when not available */
  recordPosition(g: number, quantTicks: number): number | null {
    if (!this.playing || this.countInLeft > 0 || !this.ring.length) return null
    const s = this.getSettings()
    const ctx = this.engine.ctx as AudioContext
    const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - s.latency / 1000 + 0.0
    let entry: TickLog | undefined
    for (let i = this.ring.length - 1; i >= 0; i--) {
      if (this.ring[i]!.time <= heard) { entry = this.ring[i]; break }
    }
    entry ??= this.ring[0]
    if (!entry) return null
    const proj = this.getProject()
    const sec = 60 / (proj.tempo * PPQ)
    const grp = proj.groups[g]!
    const pat = grp.patterns[grp.pattern]!
    const len = pat.bars * BAR
    const swingTicks = (proj.swing / 100) * 48 - 24
    let real = entry.pos[g]! + Math.max(0, heard - entry.time) / sec
    real = ((real % len) + len) % len
    let t = unswing(real, swingTicks)
    if (quantTicks > 0) t = Math.round(t / quantTicks) * quantTicks
    else t = Math.round(t)
    return ((t % len) + len) % len
  }

  /** tick position used to compute the length of a held recorded note */
  heldTicks(startAudioTime: number): number {
    const sec = 60 / (this.getProject().tempo * PPQ)
    return Math.max(1, Math.round((this.engine.ctx.currentTime - startAudioTime) / sec))
  }

  // ---- scheduling ------------------------------------------------------------

  private eventsAt(pat: Pattern, tick: number): NoteEvent[] | undefined {
    let ix = this.index.get(pat)
    if (!ix || ix.rev !== pat.rev) {
      const map = new Map<number, NoteEvent[]>()
      for (const e of pat.events) {
        const k = Math.round(e.t)
        const list = map.get(k)
        if (list) list.push(e)
        else map.set(k, [e])
      }
      ix = { rev: pat.rev, map }
      this.index.set(pat, ix)
    }
    return ix.map.get(tick)
  }

  private songAdvance(): void {
    const proj = this.getProject()
    if (!proj.song.length) return
    if (this.songBarsLeft <= 0) {
      this.songIdx++
      if (this.songIdx >= proj.song.length) {
        if (this.getSettings().songLoop) this.songIdx = 0
        else { this.stop(); return }
      }
      const sec = proj.song[this.songIdx]!
      this.songBarsLeft = sec.bars
      const scene = proj.scenes[sec.scene]
      if (scene) {
        for (let g = 0; g < NUM_GROUPS; g++) {
          const idx = scene[g]!
          if (proj.groups[g]!.pattern !== idx) this.hooks.setGroupPattern(g, idx)
          this.pending[g] = null
          this.pos[g] = 0
        }
      }
      this.hooks.onSongIndex?.(this.songIdx)
    }
    this.songBarsLeft--
  }

  processTick(tick: number, time: number, sec: number): void {
    const proj = this.getProject()
    const settings = this.getSettings()

    if (!this.playing) {
      // idle clock: only note repeat runs
      this.runRepeats(tick, time, sec, proj, false)
      return
    }

    if (this.countInLeft > 0) {
      if (this.countInLeft % PPQ === 0) {
        this.engine.click(time, this.countInLeft % BAR === 0, settings.metVolume)
      }
      this.countInLeft--
      if (this.countInLeft === 0) this.gTick = -1 // next processed tick becomes tick 0
      return
    }

    if (this.songMode && tick % BAR === 0) {
      this.songAdvance()
      if (!this.playing) return
    }

    if (settings.metronome && tick % PPQ === 0) this.engine.click(time, tick % BAR === 0, settings.metVolume)

    const swingTicks = (proj.swing / 100) * 48 - 24
    this.ring.push({ time, tick, pos: this.pos.slice() })
    if (this.ring.length > RING) this.ring.shift()

    if (this.stutter > 0 && tick % this.stutter === 0) {
      this.engine.setGate(time, true)
      this.engine.setGate(time + this.stutter * sec * 0.5, false)
    }

    for (let g = 0; g < NUM_GROUPS; g++) {
      const grp = proj.groups[g]!
      let pat = grp.patterns[grp.pattern]!
      let len = pat.bars * BAR
      if (this.pos[g]! >= len) this.pos[g] = 0
      if (this.pos[g] === 0 && this.pending[g] !== null) {
        const next = this.pending[g]!
        this.pending[g] = null
        if (next !== grp.pattern) this.hooks.setGroupPattern(g, next)
        pat = grp.patterns[next]!
        len = pat.bars * BAR
      }
      const pos = this.pos[g]!

      for (const s of this.eraseHeld) {
        if (Math.floor(s / 16) === g) this.hooks.eraseAt(g, s % 16, pos)
      }

      if (pos % 4 === 0 && pat.auto?.length && this.hooks.applyAuto) {
        for (const lane of pat.auto) {
          const v = laneValueAt(lane, pos, len)
          const key = g + lane.target
          if (v !== null && this.lastAuto.get(key) !== v) {
            this.lastAuto.set(key, v)
            this.hooks.applyAuto(g, lane.target, v, time)
          }
        }
      }

      const evs = this.eventsAt(pat, pos)
      if (evs) {
        const off = swingOffset(pos % 48, swingTicks) * sec
        for (const e of evs) {
          if (this.eraseHeld.has(g * 16 + e.s)) continue
          const t = time + Math.max(0, off)
          this.engine.trigger(g, e.s, t, e.v, e.n, e.l * sec)
          this.hits.push({ time: t, g, s: e.s, v: e.v })
        }
      }
      this.pos[g] = pos + 1
    }

    this.runRepeats(tick, time, sec, proj, this.recording)
    if (this.hits.length > 400) this.hits.splice(0, this.hits.length - 200)
  }

  private runRepeats(tick: number, time: number, sec: number, proj: Project, record: boolean): void {
    if (!this.repeats.size) return
    const rate = REPEAT_RATES[this.getSettings().repeatRate]!.ticks
    if (tick % rate !== 0) return
    for (const r of this.repeats.values()) {
      this.engine.trigger(r.g, r.s, time, r.vel, r.note, rate * sec * 0.9)
      this.hits.push({ time, g: r.g, s: r.s, v: r.vel })
      if (record && this.playing) {
        const grp = proj.groups[r.g]!
        const len = grp.patterns[grp.pattern]!.bars * BAR
        const at = (this.pos[r.g]! - 1 + len) % len
        this.hooks.addEvent(r.g, grp.pattern, { t: at, s: r.s, v: r.vel, l: Math.round(rate * 0.9), n: r.note })
      }
    }
  }

  /** deterministic offline run used for bouncing: schedules `ticks` ticks starting at audio time 0 */
  runOffline(ticks: number, song: boolean): void {
    this.playing = true
    this.recording = false
    this.songMode = song
    this.countInLeft = 0
    this.songIdx = -1
    this.songBarsLeft = 0
    this.pos.fill(0)
    const sec = 60 / (this.getProject().tempo * PPQ)
    for (let t = 0; t < ticks; t++) {
      this.processTick(t, t * sec, sec)
      if (!this.playing) break
    }
    this.playing = false
  }
}
