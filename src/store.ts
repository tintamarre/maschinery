import { computed, reactive, toRaw, watch } from 'vue'
import { bounceBars, bounceToWav, renderProject } from './core/bounce'
import {
  BAR, CHORD_QUALITIES, DELAY_DIVS, GROUP_NAMES, NOTE_NAMES, NUM_GROUPS, NUM_PATTERNS, NUM_SCENES, NUM_SOUNDS,
  QUANTIZE, REPEAT_RATES, SCALES, STEP, clamp, noteName,
} from './core/constants'
import { AudioEngine } from './core/engine'
import {
  MIDI_CLOCK, MIDI_START, MIDI_STOP, initMidi, listMidiOutputs, midiSend, setMidiChannel, setMidiInput, setMidiOutput, type MidiPort,
} from './core/midi'
import {
  addEvent, clearPattern, clearSound, copyPatternInto, doublePattern, newPattern, quantizeEvents, removeEventsIn,
  removeLane, setBars, shiftEvents, toggleStep, touch, writeAutoPoint,
} from './core/pattern'
import {
  BASE_PARAMS, KITS, applyKit, cloneProject, createDemoProject, createProject, makeSound, migrate, type Kit,
} from './core/project'
import {
  MicRecorder, addSampleFromBuffer, addSampleFromData, detectOnsets, restoreSamples, sampleBuffers,
  sampleFromBase64, sampleToBase64, trimSilence,
} from './core/samples'
import { Sequencer } from './core/sequencer'
import { decodeProject, encodeProject, estimateLatency } from './core/share'
import { SUSTAINED, type Voice } from './core/voices'
import type { AutoLane, EngineId, KnobDef, NoteEvent, Project, Settings, SoundParams } from './core/types'

export type PadMode = 'pad' | 'keyboard' | 'chords' | 'step' | 'scene' | 'pattern'
export type ViewId = 'pattern' | 'sound' | 'sample' | 'mixer' | 'master' | 'scenes' | 'song' | 'browser' | 'file' | 'settings'
export type StripMode = 'pitch' | 'filter' | 'mod'

export const PAD_MODES: PadMode[] = ['pad', 'keyboard', 'chords', 'step', 'scene', 'pattern']

// ---------------------------------------------------------------------------
// persistent state
// ---------------------------------------------------------------------------

const LS_PROJECT = 'maschinery:project'
const LS_SETTINGS = 'maschinery:settings'
const LS_SLOT = 'maschinery:slot:'

const DEFAULT_SETTINGS: Settings = {
  quantize: 3, countIn: 1, metronome: false, metVolume: 0.6, repeatRate: 4, scale: 'Minor', root: 0, octave: 0,
  latency: 0, midiInput: 'all', midiChannel: 0, midiOutput: 'none', midiOutChannel: 0, midiClockOut: true, midiNoteOut: true,
  follow: true, songLoop: true,
}

function readLs<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}

function writeLs(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const project = reactive<Project>((() => {
  const saved = readLs<Project>(LS_PROJECT)
  return saved ? migrate(saved) : createDemoProject()
})())

export const settings = reactive<Settings>({ ...DEFAULT_SETTINGS, ...(readLs<Partial<Settings>>(LS_SETTINGS) ?? {}) })

export const ui = reactive({
  mode: 'pad' as PadMode,
  view: 'pattern' as ViewId,
  group: 0,
  sound: 0,
  page: 0,
  stepBar: 0,
  scene: 0,
  shift: false,
  erase: false,
  duplicate: false,
  select: false,
  solo: false,
  mute: false,
  noteRepeat: false,
  fixedVel: false,
  songMode: false,
  stripMode: 'pitch' as StripMode,
  stripValue: 0.5,
  stripActive: false,
  chordQuality: 0,
  perfFilter: null as number | null,
  stutter: 0, // 0 off, else repeat rate index + 1
  reverbThrow: false,
  delayThrow: false,
  toast: '',
  midiPorts: [] as MidiPort[],
  midiOutPorts: [] as MidiPort[],
  midiReady: false,
  micRecording: false,
  busy: '',
  muted: false,
  snapArm: false,
  autoWrite: false,
  calibrating: false,
  calibCount: 0,
  autoView: false,
  snap: new Array<number>(NUM_GROUPS).fill(-1),
})

export const playback = reactive({
  playing: false,
  recording: false,
  countIn: false,
  bar: 1,
  beat: 1,
  tick: 0,
  pos: new Array<number>(NUM_GROUPS).fill(0),
  pending: new Array<number | null>(NUM_GROUPS).fill(null),
  songIdx: -1,
  padLevel: new Array<number>(NUM_SOUNDS).fill(0),
  groupLevel: new Array<number>(NUM_GROUPS).fill(0),
  meters: new Array<number>(NUM_GROUPS).fill(0),
  master: 0,
  canUndo: false,
  canRedo: false,
})

export const hasAudio = reactive({ ready: false })

let toastTimer: number | undefined
export function toast(msg: string): void {
  ui.toast = msg
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (ui.toast = ''), 2200)
}

// ---------------------------------------------------------------------------
// audio + sequencer
// ---------------------------------------------------------------------------

let engine: AudioEngine | null = null
let seq: Sequencer | null = null

interface Snap { g: number; p: number; bars: number; events: NoteEvent[]; auto: AutoLane[] }
const undoStack: Snap[] = []
const redoStack: Snap[] = []
let lastSnapKey = ''
let lastSnapAt = 0

function takeSnap(g: number, p: number): Snap {
  const pat = project.groups[g]!.patterns[p]!
  return { g, p, bars: pat.bars, events: pat.events.map((e) => ({ ...e })), auto: pat.auto.map((l) => ({ target: l.target, points: l.points.map((pt) => ({ ...pt })) })) }
}

/** call before mutating a pattern; `coalesce` merges bursts (live recording) into one undo step */
export function snapshot(g = ui.group, p = project.groups[g]!.pattern, coalesce = 0): void {
  const now = performance.now()
  const key = g + ':' + p
  if (coalesce && key === lastSnapKey && now - lastSnapAt < coalesce) {
    lastSnapAt = now
    return
  }
  lastSnapKey = key
  lastSnapAt = now
  undoStack.push(takeSnap(g, p))
  if (undoStack.length > 60) undoStack.shift()
  redoStack.length = 0
  playback.canUndo = true
  playback.canRedo = false
}

function restore(s: Snap): void {
  const pat = project.groups[s.g]!.patterns[s.p]!
  pat.bars = s.bars
  pat.events = s.events.map((e) => ({ ...e }))
  pat.auto = s.auto.map((l) => ({ target: l.target, points: l.points.map((pt) => ({ ...pt })) }))
  touch(pat)
}

export function undo(): void {
  const s = undoStack.pop()
  if (!s) return
  redoStack.push(takeSnap(s.g, s.p))
  restore(s)
  lastSnapKey = ''
  playback.canUndo = undoStack.length > 0
  playback.canRedo = true
}

export function redo(): void {
  const s = redoStack.pop()
  if (!s) return
  undoStack.push(takeSnap(s.g, s.p))
  restore(s)
  lastSnapKey = ''
  playback.canUndo = true
  playback.canRedo = redoStack.length > 0
}

// ---- MIDI output ---------------------------------------------------------------------------

function midiMs(audioTime: number | undefined): number | undefined {
  if (audioTime === undefined || !engine) return undefined
  const ctx = engine.ctx as AudioContext
  return performance.now() + (audioTime - ctx.currentTime + (ctx.outputLatency || 0)) * 1000
}

function midiNoteFor(g: number, s: number, note: number): { num: number; ch: number } {
  const sound = project.groups[g]!.sounds[s]!
  const num = clamp(SUSTAINED[sound.engine] ? 60 + note : 36 + s, 0, 127)
  const ch = (settings.midiOutChannel > 0 ? settings.midiOutChannel : g + 1) - 1
  return { num, ch }
}

function midiNoteOn(g: number, s: number, note: number, vel: number, audioTime?: number): void {
  if (!settings.midiNoteOut || settings.midiOutput === 'none') return
  const { num, ch } = midiNoteFor(g, s, note)
  midiSend([0x90 | ch, num, clamp(Math.round(vel), 1, 127)], midiMs(audioTime))
}

function midiNoteOff(g: number, s: number, note: number, audioTime?: number): void {
  if (!settings.midiNoteOut || settings.midiOutput === 'none') return
  const { num, ch } = midiNoteFor(g, s, note)
  midiSend([0x80 | ch, num, 0], midiMs(audioTime))
}

export function ensureAudio(): AudioEngine {
  if (engine) {
    if (engine.ctx.state === 'suspended') void (engine.ctx as AudioContext).resume()
    return engine
  }
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  engine = new AudioEngine(ctx, () => toRaw(project))
  seq = new Sequencer(engine, () => toRaw(project), () => toRaw(settings), {
    setGroupPattern: (g, idx) => { project.groups[g]!.pattern = idx },
    addEvent: (g, p, ev) => {
      snapshot(g, p, 2500)
      addEvent(project.groups[g]!.patterns[p]!, ev)
    },
    onClock: (time) => { if (settings.midiClockOut && settings.midiOutput !== 'none') midiSend([MIDI_CLOCK], midiMs(time)) },
    onTransport: (kind, time) => { if (settings.midiClockOut && settings.midiOutput !== 'none') midiSend([kind === 'start' ? MIDI_START : MIDI_STOP], midiMs(time)) },
    onNote: (g, s, note, vel, lenSec, time) => {
      midiNoteOn(g, s, note, vel, time)
      midiNoteOff(g, s, note, time + lenSec)
    },
    applyAuto: (g, target, value, time) => {
      const grp = project.groups[g]!
      if (target.startsWith('g.')) {
        ;(grp as unknown as Record<string, number>)[target.slice(2)] = value
        engine?.refreshGroup(g, time)
      } else {
        const dot = target.indexOf('.')
        const si = Number(target.slice(1, dot))
        ;(grp.sounds[si]!.params as unknown as Record<string, number>)[target.slice(dot + 1)] = value
        engine?.refreshSound(g, si, time)
      }
    },
    eraseAt: (g, s, tick) => {
      const pat = project.groups[g]!.patterns[project.groups[g]!.pattern]!
      if (pat.events.some((e) => e.s === s && e.t === tick)) {
        snapshot(g, project.groups[g]!.pattern, 2500)
        removeEventsIn(pat, s, tick, tick + 1)
      }
    },
  })
  engine.setMuted(ui.muted)
  hasAudio.ready = true
  rafLoop()
  return engine
}

/** master output mute (speakers only) */
export function setOutputMute(muted: boolean): void {
  ui.muted = muted
  engine?.setMuted(muted)
}

export function getEngine(): AudioEngine | null {
  return engine
}

// ---------------------------------------------------------------------------
// helpers / selectors
// ---------------------------------------------------------------------------

export const currentGroup = computed(() => project.groups[ui.group]!)
export const currentSound = computed(() => currentGroup.value.sounds[ui.sound]!)
export const currentPattern = computed(() => currentGroup.value.patterns[currentGroup.value.pattern]!)
export const quantTicks = computed(() => QUANTIZE[settings.quantize]!.ticks)
export const scaleIntervals = computed(() => SCALES[settings.scale] ?? SCALES.Chromatic!)

function eng(): AudioEngine {
  return ensureAudio()
}

/** semitone offset for keyboard-mode pad i (0..15) */
export function keyboardNote(i: number): number {
  const sc = scaleIntervals.value
  const oct = Math.floor(i / sc.length)
  return sc[i % sc.length]! + oct * 12 + settings.root + settings.octave * 12
}

function degreeNote(deg: number): number {
  const sc = scaleIntervals.value
  const oct = Math.floor(deg / sc.length)
  return sc[((deg % sc.length) + sc.length) % sc.length]! + oct * 12 + settings.root + settings.octave * 12
}

export function chordNotes(i: number): number[] {
  const q = CHORD_QUALITIES[ui.chordQuality]
  const base = degreeNote(i)
  if (q === 'Power') return [base, base + 7, base + 12]
  if (q === 'Sus') return [base, base + 5, base + 7]
  const notes = [base, degreeNote(i + 2), degreeNote(i + 4)]
  if (q === '7ths') notes.push(degreeNote(i + 6))
  return notes
}

export function chordName(i: number): string {
  const q = CHORD_QUALITIES[ui.chordQuality]
  const notes = chordNotes(i)
  const root = NOTE_NAMES[((notes[0]! % 12) + 12) % 12]!
  if (q === 'Power') return root + '5'
  if (q === 'Sus') return root + 'sus4'
  const third = notes[1]! - notes[0]!
  const fifth = notes[2]! - notes[0]!
  let name = root
  if (fifth === 6) name += '°'
  else if (third === 3) name += 'm'
  else if (third !== 4) name += '?'
  if (q === '7ths') name += '7'
  return name
}

// ---------------------------------------------------------------------------
// sound / group / mix actions
// ---------------------------------------------------------------------------

const lastAutoWrite = new Map<string, { tick: number; pattern: number }>()

/** while Auto Write is armed and the sequencer is running, record the move into the group's current pattern */
function writeAuto(g: number, target: string, value: number): void {
  if (!ui.autoWrite || !seq || !seq.playing || seq.countInLeft > 0) return
  const tick = seq.recordPosition(g, 0)
  if (tick === null) return
  const grp = project.groups[g]!
  const key = g + target
  const last = lastAutoWrite.get(key)
  if (last && last.pattern === grp.pattern && tick === last.tick) return
  snapshot(g, grp.pattern, 2500)
  const sameTake = last && last.pattern === grp.pattern && Math.abs(tick - last.tick) < 48
  writeAutoPoint(grp.patterns[grp.pattern]!, target, tick, value, sameTake ? last.tick : null)
  lastAutoWrite.set(key, { tick, pattern: grp.pattern })
}

export function laneLabel(g: number, target: string): string {
  if (target.startsWith('g.')) return `Group ${GROUP_NAMES[g]} · ${target.slice(2)}`
  const dot = target.indexOf('.')
  const si = Number(target.slice(1, dot))
  const key = target.slice(dot + 1) as keyof SoundParams
  return `${project.groups[g]!.sounds[si]?.name ?? si + 1} · ${PARAM_META[key]?.label ?? key}`
}

export function deleteLane(target: string): void {
  snapshot()
  removeLane(currentPattern.value, target)
}

export function setSoundParam<K extends keyof SoundParams>(g: number, s: number, key: K, value: SoundParams[K]): void {
  const snd = project.groups[g]!.sounds[s]!
  snd.params[key] = value
  engine?.refreshSound(g, s)
  writeAuto(g, `s${s}.${key}`, value as number)
}

export function setGroupParam(g: number, key: 'volume' | 'pan' | 'reverb' | 'delay', value: number): void {
  project.groups[g]![key] = value
  engine?.refreshGroup(g)
  writeAuto(g, `g.${key}`, value)
}

export function setMaster<K extends keyof Project['master']>(key: K, value: Project['master'][K]): void {
  project.master[key] = value
  engine?.refreshMaster()
}

export function setTempo(v: number): void {
  project.tempo = Math.round(clamp(v, 40, 240) * 10) / 10
  engine?.refreshMaster()
}

export function setSwing(v: number): void {
  project.swing = Math.round(clamp(v, 50, 75))
}

export function toggleMuteSound(g: number, s: number): void {
  const snd = project.groups[g]!.sounds[s]!
  snd.mute = !snd.mute
  engine?.refreshMix()
}

export function toggleSoloSound(g: number, s: number): void {
  const snd = project.groups[g]!.sounds[s]!
  snd.solo = !snd.solo
  engine?.refreshMix()
}

export function toggleMuteGroup(g: number): void {
  project.groups[g]!.mute = !project.groups[g]!.mute
  engine?.refreshMix()
}

export function toggleSoloGroup(g: number): void {
  project.groups[g]!.solo = !project.groups[g]!.solo
  engine?.refreshMix()
}

export function setEngine(g: number, s: number, id: EngineId): void {
  const snd = project.groups[g]!.sounds[s]!
  snd.engine = id
  if (id !== 'sample') snd.sampleId = null
  engine?.refreshSound(g, s)
}

export function renameSound(g: number, s: number, name: string): void {
  project.groups[g]!.sounds[s]!.name = name
}

export function copySound(g: number, from: number, to: number): void {
  if (from === to) return
  const src = project.groups[g]!.sounds[from]!
  project.groups[g]!.sounds[to] = { ...JSON.parse(JSON.stringify(src)), mute: false, solo: false }
  engine?.refreshSound(g, to)
  toast(`Copied ${src.name} to pad ${to + 1}`)
}

export function loadKit(g: number, kit: Kit): void {
  applyKit(project.groups[g]!, kit)
  engine?.refreshMix()
  toast(`${kit.name} loaded into group ${GROUP_NAMES[g]}`)
}

export function loadSoundPreset(g: number, s: number, kit: Kit, index: number): void {
  const spec = kit.sounds[index]!
  project.groups[g]!.sounds[s] = makeSound(spec[0], spec[1], spec[2])
  engine?.refreshSound(g, s)
  previewSound(g, s)
}

export function storeSnapshot(g: number, slot: number): void {
  project.groups[g]!.snapshots[slot] = project.groups[g]!.sounds.map((s) => ({ ...s.params }))
  ui.snap[g] = slot
  toast(`Snapshot ${slot + 1} stored for group ${GROUP_NAMES[g]}`)
}

export function recallSnapshot(g: number, slot: number): void {
  const snap = project.groups[g]!.snapshots[slot]
  if (!snap) { toast(`Snapshot ${slot + 1} is empty`); return }
  project.groups[g]!.sounds.forEach((s, i) => { if (snap[i]) Object.assign(s.params, snap[i]) })
  ui.snap[g] = slot
  engine?.refreshMix()
}

/** chip click: stores when armed (or when the slot is empty), recalls otherwise */
export function snapshotSlot(g: number, slot: number): void {
  if (ui.snapArm || !project.groups[g]!.snapshots[slot]) {
    storeSnapshot(g, slot)
    ui.snapArm = false
  } else {
    recallSnapshot(g, slot)
  }
}

export function previewSound(g = ui.group, s = ui.sound, vel = 110): void {
  eng().trigger(g, s, 0, vel, 0, 0.4)
}

export function selectGroup(g: number): void {
  if (ui.mute) { toggleMuteGroup(g); return }
  if (ui.solo) { toggleSoloGroup(g); return }
  if (ui.duplicate && g !== ui.group) {
    const src = project.groups[ui.group]!
    const dst = project.groups[g]!
    dst.sounds = JSON.parse(JSON.stringify(src.sounds))
    dst.patterns = src.patterns.map((p) => ({ bars: p.bars, rev: 0, events: p.events.map((e) => ({ ...e })), auto: p.auto.map((l) => ({ target: l.target, points: l.points.map((pt) => ({ ...pt })) })) }))
    engine?.refreshMix()
    toast(`Group ${GROUP_NAMES[ui.group]} duplicated to ${GROUP_NAMES[g]}`)
    ui.duplicate = false
  }
  ui.group = g
}

export function selectSound(s: number): void {
  ui.sound = s
}

// ---------------------------------------------------------------------------
// patterns, scenes, song
// ---------------------------------------------------------------------------

export function selectPattern(g: number, idx: number): void {
  ensureAudio()
  if (ui.duplicate) {
    const src = project.groups[g]!.patterns[project.groups[g]!.pattern]!
    snapshot(g, idx)
    copyPatternInto(src, project.groups[g]!.patterns[idx]!)
    toast(`Pattern copied to ${idx + 1}`)
    ui.duplicate = false
    return
  }
  if (ui.erase) {
    snapshot(g, idx)
    clearPattern(project.groups[g]!.patterns[idx]!)
    toast(`Pattern ${idx + 1} cleared`)
    ui.erase = false
    return
  }
  seq!.queuePattern(g, idx)
}

export function launchScene(i: number): void {
  ensureAudio()
  ui.scene = i
  if (ui.duplicate) {
    project.scenes[i] = project.groups.map((g) => g.pattern)
    toast(`Scene ${i + 1} captured`)
    ui.duplicate = false
    return
  }
  const scene = project.scenes[i]!
  for (let g = 0; g < NUM_GROUPS; g++) seq!.queuePattern(g, scene[g]!)
}

export function setScenePattern(scene: number, g: number, idx: number): void {
  project.scenes[scene]![g] = idx
}

export function addSongSection(scene = ui.scene, bars = 2): void {
  project.song.push({ scene, bars })
}

export function removeSongSection(i: number): void {
  project.song.splice(i, 1)
}

export function moveSongSection(i: number, dir: -1 | 1): void {
  const j = i + dir
  if (j < 0 || j >= project.song.length) return
  const [x] = project.song.splice(i, 1)
  project.song.splice(j, 0, x!)
}

export function patternBars(bars: number): void {
  snapshot()
  setBars(currentPattern.value, bars)
  const g = ui.group
  if (seq) seq.pos[g] = 0
}

export function clearCurrentSound(): void {
  snapshot()
  clearSound(currentPattern.value, ui.sound)
}

export function clearCurrentPattern(): void {
  snapshot()
  clearPattern(currentPattern.value)
}

export function quantizeCurrent(all = true): void {
  if (quantTicks.value <= 0) { toast('Quantize is off'); return }
  snapshot()
  quantizeEvents(currentPattern.value, quantTicks.value, 1, all ? undefined : ui.sound)
}

export function doubleCurrent(): void {
  snapshot()
  doublePattern(currentPattern.value)
}

export function shiftCurrent(steps: number): void {
  snapshot()
  shiftEvents(currentPattern.value, steps * STEP, undefined)
}

export function toggleGridStep(s: number, step: number, vel = 100): void {
  snapshot(ui.group, currentGroup.value.pattern, 400)
  toggleStep(currentPattern.value, s, step, ui.fixedVel ? 127 : vel, 0)
}

export function setEventVelocity(e: NoteEvent, v: number): void {
  e.v = clamp(Math.round(v), 1, 127)
  touch(currentPattern.value)
}

export function newBlankPattern(): void {
  currentGroup.value.patterns[currentGroup.value.pattern] = newPattern(1)
}

// ---------------------------------------------------------------------------
// pads
// ---------------------------------------------------------------------------

interface Held {
  g: number
  s: number
  voices: Voice[]
  events: NoteEvent[]
  pattern: number
  start: number
  repeatKeys: number[]
  notes: number[]
}

const held = new Map<string, Held>()

function flash(i: number, vel: number): void {
  playback.padLevel[i] = Math.max(0.35, vel / 127)
}

function recordNow(g: number, s: number, vel: number, note: number): NoteEvent | null {
  if (!seq || !seq.recording || !seq.playing) return null
  const t = seq.recordPosition(g, quantTicks.value)
  if (t === null) return null
  const grp = project.groups[g]!
  const ev: NoteEvent = { t, s, v: vel, l: STEP, n: note }
  snapshot(g, grp.pattern, 2500)
  const pat = grp.patterns[grp.pattern]!
  addEvent(pat, ev)
  return pat.events[pat.events.length - 1]!
}

/** fire a note live, record it if armed, and track it for release */
function playLive(key: string, g: number, s: number, notes: number[], vel: number): void {
  const e = eng()
  const h: Held = { g, s, voices: [], events: [], pattern: project.groups[g]!.pattern, start: e.ctx.currentTime, repeatKeys: [], notes: [] }
  const repeat = ui.noteRepeat
  notes.forEach((note, ni) => {
    const v = e.trigger(g, s, 0, vel, note)
    if (v) { h.voices.push(v); h.notes.push(note); midiNoteOn(g, s, note, vel) }
    if (repeat && seq) {
      const rk = s * 1000 + ni * 100 + (note + 60)
      seq.startRepeat(rk, { g, s, vel, note })
      h.repeatKeys.push(rk)
    } else {
      const ev = recordNow(g, s, vel, note)
      if (ev) h.events.push(ev)
    }
  })
  const old = held.get(key)
  if (old) endHeld(old)
  held.set(key, h)
}

function endHeld(h: Held): void {
  const e = engine
  if (!e) return
  for (const v of h.voices) v.release(e.ctx.currentTime)
  for (const n of h.notes) midiNoteOff(h.g, h.s, n)
  for (const k of h.repeatKeys) seq?.stopRepeat(k)
  if (h.events.length && seq) {
    const ticks = seq.heldTicks(h.start)
    const pat = project.groups[h.g]!.patterns[h.pattern]!
    for (const ev of h.events) ev.l = Math.max(STEP, ticks)
    touch(pat)
  }
}

export function padDown(i: number, velocity = 100, src = 'ptr'): void {
  ensureAudio()
  const key = src + ':' + i
  const vel = ui.fixedVel ? 127 : clamp(Math.round(velocity), 1, 127)
  const g = ui.group

  if (ui.mode === 'scene') { flash(i, vel); launchScene(i); return }
  if (ui.mode === 'pattern') { flash(i, vel); selectPattern(g, i); return }
  if (ui.mode === 'step') {
    flash(i, vel)
    if (ui.select) { selectSound(i); return }
    const step = ui.stepBar * 16 + i
    if (step < currentPattern.value.bars * 16) toggleGridStep(ui.sound, step, vel)
    else toast('Increase pattern length to use this bar')
    return
  }

  // pad / keyboard / chords share modifiers on the *selected sound*
  if (ui.mode === 'pad') {
    if (ui.mute) { toggleMuteSound(g, i); flash(i, 90); return }
    if (ui.solo) { toggleSoloSound(g, i); flash(i, 90); return }
    if (ui.select) { selectSound(i); flash(i, 90); return }
    if (ui.duplicate) { copySound(g, ui.sound, i); ui.duplicate = false; return }
    if (ui.erase) {
      if (seq?.playing) {
        seq.eraseHeld.add(g * 16 + i)
        held.set(key, { g, s: i, voices: [], events: [], pattern: 0, start: 0, repeatKeys: [], notes: [] })
      } else {
        snapshot()
        clearSound(currentPattern.value, i)
        toast(`${currentGroup.value.sounds[i]!.name} erased from pattern`)
      }
      flash(i, 90)
      return
    }
    selectSound(i)
    flash(i, vel)
    playLive(key, g, i, [0], vel)
    return
  }

  flash(i, vel)
  const notes = ui.mode === 'keyboard' ? [keyboardNote(i)] : chordNotes(i)
  playLive(key, g, ui.sound, notes, vel)
}

export function padUp(i: number, src = 'ptr'): void {
  const key = src + ':' + i
  const h = held.get(key)
  if (!h) return
  held.delete(key)
  seq?.eraseHeld.delete(h.g * 16 + h.s)
  endHeld(h)
}

export function releaseAllPads(): void {
  for (const [k, h] of held) { endHeld(h); held.delete(k) }
  seq?.eraseHeld.clear()
}

// ---------------------------------------------------------------------------
// transport
// ---------------------------------------------------------------------------

export function play(): void {
  ensureAudio()
  if (seq!.playing) seq!.stop()
  else seq!.start({ song: ui.songMode })
}

export function stop(): void {
  ensureAudio()
  seq!.stop()
  releaseAllPads()
}

export function toggleRecord(): void {
  ensureAudio()
  if (seq!.playing) {
    seq!.recording = !seq!.recording
  } else {
    seq!.start({ record: true, song: ui.songMode })
  }
}

const taps: number[] = []
export function tapTempo(): void {
  const now = performance.now()
  if (taps.length && now - taps[taps.length - 1]! > 2000) taps.length = 0
  taps.push(now)
  if (taps.length > 5) taps.shift()
  if (taps.length >= 2) {
    const avg = (taps[taps.length - 1]! - taps[0]!) / (taps.length - 1)
    setTempo(60000 / avg)
  }
}

export function setStutter(rateIdx: number): void {
  ui.stutter = rateIdx
  ensureAudio()
  seq!.setStutter(rateIdx ? REPEAT_RATES[rateIdx - 1]!.ticks : 0)
}

export function setPerformFilter(pos: number | null): void {
  ui.perfFilter = pos
  engine?.setPerformFilter(pos)
}

export function setThrow(kind: 'reverb' | 'delay', on: boolean): void {
  ensureAudio()
  if (kind === 'reverb') ui.reverbThrow = on
  else ui.delayThrow = on
  engine!.throwSend(kind, on)
}

export function setNoteRepeat(on: boolean): void {
  ui.noteRepeat = on
  if (!on) {
    for (const h of held.values()) for (const k of h.repeatKeys) seq?.stopRepeat(k)
  }
}

export function stripInput(pos: number, active: boolean): void {
  ui.stripActive = active
  ui.stripValue = pos
  const e = ensureAudio()
  if (ui.stripMode === 'pitch') {
    e.setBend(active ? (pos * 2 - 1) * 200 : 0)
    if (!active) ui.stripValue = 0.5
  } else if (ui.stripMode === 'filter') {
    setPerformFilter(active ? pos : null)
  } else if (ui.stripMode === 'mod' && active) {
    setSoundParam(ui.group, ui.sound, 'cutoff', clamp(pos, 0.05, 1))
  }
}

// ---------------------------------------------------------------------------
// knobs
// ---------------------------------------------------------------------------

const pct = (v: number) => Math.round(v * 100) + '%'
const cutoffHz = (v: number) => {
  const f = 20 * Math.pow(1000, v)
  return f >= 1000 ? (f / 1000).toFixed(1) + 'k' : Math.round(f) + ''
}

export const PARAM_META: Record<keyof SoundParams, { label: string; min: number; max: number; step: number; fmt: (v: number) => string }> = {
  pitch: { label: 'Pitch', min: -24, max: 24, step: 1, fmt: (v) => (v > 0 ? '+' : '') + v + ' st' },
  attack: { label: 'Attack', min: 0, max: 1, step: 0.01, fmt: pct },
  decay: { label: 'Decay', min: 0, max: 1, step: 0.01, fmt: pct },
  tone: { label: 'Tone', min: 0, max: 1, step: 0.01, fmt: pct },
  drive: { label: 'Drive', min: 0, max: 1, step: 0.01, fmt: pct },
  cutoff: { label: 'Cutoff', min: 0, max: 1, step: 0.005, fmt: cutoffHz },
  reso: { label: 'Reso', min: 0, max: 1, step: 0.01, fmt: pct },
  volume: { label: 'Volume', min: 0, max: 1, step: 0.01, fmt: pct },
  pan: { label: 'Pan', min: -1, max: 1, step: 0.02, fmt: (v) => (Math.abs(v) < 0.03 ? 'C' : v < 0 ? 'L' + Math.round(-v * 100) : 'R' + Math.round(v * 100)) },
  reverb: { label: 'Reverb', min: 0, max: 1, step: 0.01, fmt: pct },
  delay: { label: 'Delay', min: 0, max: 1, step: 0.01, fmt: pct },
  start: { label: 'Start', min: 0, max: 1, step: 0.002, fmt: pct },
  end: { label: 'End', min: 0, max: 1, step: 0.002, fmt: pct },
  velSens: { label: 'Vel Sens', min: 0, max: 1, step: 0.01, fmt: pct },
  choke: { label: 'Choke', min: 0, max: 8, step: 1, fmt: (v) => (v ? GROUP_NAMES[v - 1]! : 'Off') },
  gate: { label: 'Mode', min: 0, max: 2, step: 1, fmt: (v) => ['One-shot', 'Gate', 'Loop'][Math.round(v)] ?? '' },
  hp: { label: 'Low cut', min: 0, max: 1, step: 0.005, fmt: (v) => (v < 0.01 ? 'Off' : cutoffHz(v)) },
  crush: { label: 'Crush', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.01 ? 'Off' : pct(v)) },
  reverse: { label: 'Reverse', min: 0, max: 1, step: 1, fmt: (v) => (v ? 'On' : 'Off') },
}

const SOUND_PAGES: (keyof SoundParams)[][] = [
  ['pitch', 'attack', 'decay', 'tone', 'drive', 'cutoff', 'reso', 'volume'],
  ['pan', 'reverb', 'delay', 'velSens', 'choke', 'gate', 'start', 'end'],
  ['hp', 'crush', 'reverse'],
]

function soundKnob(key: keyof SoundParams): KnobDef {
  const m = PARAM_META[key]
  const snd = currentSound.value
  const v = snd.params[key]
  return { label: m.label, value: v, min: m.min, max: m.max, step: m.step, def: BASE_PARAMS[key], text: m.fmt(v), set: (x) => setSoundParam(ui.group, ui.sound, key, x) }
}

function knob(label: string, value: number, min: number, max: number, step: number, def: number, fmt: (v: number) => string, set: (v: number) => void): KnobDef {
  return { label, value, min, max, step, def, text: fmt(value), set }
}

const EMPTY: KnobDef = { label: '', value: 0, min: 0, max: 1, step: 0.01, def: 0, text: '', set: () => {} }

export const pageCount = computed(() => (ui.view === 'sound' ? 3 : ui.view === 'mixer' || ui.view === 'master' ? 2 : 1))

export const knobs = computed<KnobDef[]>(() => {
  const m = project.master
  const page = Math.min(ui.page, pageCount.value - 1)
  const g = ui.group
  const tempoKnob = knob('Tempo', project.tempo, 40, 240, 0.5, 100, (v) => v.toFixed(1), setTempo)
  const swingKnob = knob('Swing', project.swing, 50, 75, 1, 50, (v) => v + '%', setSwing)

  if (ui.view === 'sound') {
    const ks = SOUND_PAGES[page]!.map(soundKnob)
    while (ks.length < 8) ks.push(EMPTY)
    return ks
  }

  if (ui.view === 'sample') {
    return (['start', 'end', 'pitch', 'attack', 'decay', 'gate', 'reverse', 'volume'] as (keyof SoundParams)[]).map(soundKnob)
  }

  if (ui.view === 'mixer') {
    return project.groups.map((grp, i) =>
      page === 0
        ? knob(`Vol ${grp.name}`, grp.volume, 0, 1, 0.01, 0.85, pct, (v) => setGroupParam(i, 'volume', v))
        : knob(`Pan ${grp.name}`, grp.pan, -1, 1, 0.02, 0, PARAM_META.pan.fmt, (v) => setGroupParam(i, 'pan', v)),
    )
  }

  if (ui.view === 'master') {
    if (page === 0) {
      return [
        tempoKnob, swingKnob,
        knob('Master', m.volume, 0, 1, 0.01, 0.85, pct, (v) => setMaster('volume', v)),
        knob('Comp', m.comp, 0, 1, 0.01, 0.25, pct, (v) => setMaster('comp', v)),
        knob('Rev Size', m.reverbSize, 0, 1, 0.01, 0.45, pct, (v) => setMaster('reverbSize', v)),
        knob('Rev Level', m.reverbLevel, 0, 1.5, 0.01, 0.8, pct, (v) => setMaster('reverbLevel', v)),
        knob('Dly Time', m.delayDiv, 0, DELAY_DIVS.length - 1, 1, 2, (v) => DELAY_DIVS[v]!.label, (v) => setMaster('delayDiv', Math.round(v))),
        knob('Dly Fdbk', m.delayFeedback, 0, 0.92, 0.01, 0.4, pct, (v) => setMaster('delayFeedback', v)),
      ]
    }
    return [
      knob('Dly Level', m.delayLevel, 0, 1.5, 0.01, 0.8, pct, (v) => setMaster('delayLevel', v)),
      knob('Dly Tone', m.delayTone, 0, 1, 0.01, 0.55, pct, (v) => setMaster('delayTone', v)),
      knob('Metro', settings.metVolume, 0, 1, 0.01, 0.6, pct, (v) => (settings.metVolume = v)),
      knob('Repeat', settings.repeatRate, 0, REPEAT_RATES.length - 1, 1, 4, (v) => REPEAT_RATES[v]!.label, (v) => (settings.repeatRate = Math.round(v))),
      knob('Quantize', settings.quantize, 0, QUANTIZE.length - 1, 1, 3, (v) => QUANTIZE[v]!.label, (v) => (settings.quantize = Math.round(v))),
      knob('Count-in', settings.countIn, 0, 4, 1, 1, (v) => (v ? v + ' bar' : 'Off'), (v) => (settings.countIn = Math.round(v))),
      knob('Latency', settings.latency, -50, 150, 1, 0, (v) => v + ' ms', (v) => (settings.latency = Math.round(v))),
      EMPTY,
    ]
  }

  // pattern / scenes / song / browser / file / settings: live performance knobs
  const grp = project.groups[g]!
  return [
    tempoKnob, swingKnob,
    knob('Master', m.volume, 0, 1, 0.01, 0.85, pct, (v) => setMaster('volume', v)),
    knob(`Group ${grp.name}`, grp.volume, 0, 1, 0.01, 0.85, pct, (v) => setGroupParam(g, 'volume', v)),
    soundKnob('volume'), soundKnob('pitch'), soundKnob('decay'), soundKnob('cutoff'),
  ].map((k, i) => (i === 4 ? { ...k, label: 'Sound Vol' } : k))
})

export const knobTitle = computed(() => {
  const page = Math.min(ui.page, pageCount.value - 1)
  switch (ui.view) {
    case 'sound': return `Sound ${ui.sound + 1} · ${currentSound.value.name} · ${['tone & filter', 'mix & sends', 'low cut & crush'][page]}`
    case 'sample': return `Sampler · ${currentSound.value.name}`
    case 'mixer': return page === 0 ? 'Mixer · group volumes' : 'Mixer · group pans'
    case 'master': return page === 0 ? 'Master · timing & effects' : 'Master · echo & setup'
    default: return `Perform · group ${currentGroup.value.name}`
  }
})

/** MIDI CC 70-77 (and 16-23) map to the 8 knobs */
function midiCc(num: number, value: number): void {
  if (num === 1) { stripInput(value / 127, true); return }
  const idx = num >= 70 && num <= 77 ? num - 70 : num >= 16 && num <= 23 ? num - 16 : -1
  if (idx < 0) return
  const k = knobs.value[idx]
  if (!k || !k.label) return
  const raw = k.min + (value / 127) * (k.max - k.min)
  k.set(Math.round(raw / k.step) * k.step)
}

// ---------------------------------------------------------------------------
// samples
// ---------------------------------------------------------------------------

function baseName(n: string): string {
  return n.replace(/\.[^.]+$/, '').slice(0, 24)
}

export async function assignSampleFile(g: number, s: number, file: File): Promise<void> {
  ui.busy = 'Decoding sample…'
  try {
    const id = await addSampleFromData(await file.arrayBuffer())
    const snd = project.groups[g]!.sounds[s]!
    snd.engine = 'sample'
    snd.sampleId = id
    snd.name = baseName(file.name)
    snd.params.start = 0
    snd.params.end = 1
    ensureAudio()
    engine!.refreshSound(g, s)
    ui.group = g
    ui.sound = s
    previewSound(g, s)
    toast(`Loaded ${snd.name}`)
  } catch {
    toast('Could not decode that file')
  } finally {
    ui.busy = ''
  }
}

/** drop or pick several files: they fill consecutive pads starting at `start` */
export async function assignSampleFiles(g: number, start: number, files: File[]): Promise<void> {
  const list = files.slice(0, 16 - start)
  for (let i = 0; i < list.length; i++) await assignSampleFile(g, start + i, list[i]!)
  if (files.length > list.length) toast(`Only ${list.length} pads left in this group, ${files.length - list.length} file(s) skipped`)
  else if (list.length > 1) toast(`Loaded ${list.length} samples from pad ${start + 1}`)
}

/** render the group's current pattern (with effects) into the selected pad as a new sample */
export async function resampleGroupToPad(): Promise<void> {
  ui.busy = 'Resampling…'
  try {
    ensureAudio()
    const buf = await renderProject(toRaw(project), toRaw(settings), { song: false, loops: 1, onlyGroup: ui.group })
    const id = await addSampleFromBuffer(trimSilence(buf, 0.003))
    const snd = currentSound.value
    snd.engine = 'sample'
    snd.sampleId = id
    snd.name = `Resample ${currentGroup.value.name}${currentGroup.value.pattern + 1}`
    Object.assign(snd.params, { start: 0, end: 1, gate: 0, reverse: 0, pitch: 0 })
    engine!.refreshSound(ui.group, ui.sound)
    toast(`Resampled to pad ${ui.sound + 1}`)
  } catch {
    toast('Resample failed')
  } finally {
    ui.busy = ''
  }
}

// ---- kit packs: public/kits/index.json lists packs of audio files ----------------------------

export interface KitPack {
  name: string
  files: { name: string; url: string }[]
}

export async function fetchKitPacks(): Promise<KitPack[]> {
  try {
    const base = import.meta.env.BASE_URL
    const res = await fetch(`${base}kits/index.json`, { cache: 'no-cache' })
    if (!res.ok) return []
    const json = (await res.json()) as { kits?: KitPack[] }
    return (json.kits ?? []).map((k) => ({ name: k.name, files: k.files.map((f) => ({ name: f.name, url: /^https?:/.test(f.url) ? f.url : `${base}kits/${f.url}` })) }))
  } catch {
    return []
  }
}

export async function loadKitPack(g: number, pack: KitPack): Promise<void> {
  ui.busy = `Loading ${pack.name}…`
  try {
    ensureAudio()
    const files = pack.files.slice(0, 16)
    for (let i = 0; i < files.length; i++) {
      const res = await fetch(files[i]!.url)
      const id = await addSampleFromData(await res.arrayBuffer())
      const snd = makeSound(files[i]!.name, 'sample')
      snd.sampleId = id
      project.groups[g]!.sounds[i] = snd
    }
    engine!.refreshMix()
    toast(`${pack.name} loaded into group ${GROUP_NAMES[g]}`)
  } catch {
    toast('Could not load that pack')
  } finally {
    ui.busy = ''
  }
}

const mic = new MicRecorder()

export async function toggleMic(): Promise<void> {
  if (!ui.micRecording) {
    try {
      await mic.start()
      ui.micRecording = true
    } catch {
      toast('Microphone not available')
    }
    return
  }
  ui.micRecording = false
  try {
    const data = await mic.stop()
    ensureAudio()
    const decoded = await new AudioContext().decodeAudioData(data)
    const id = await addSampleFromBuffer(trimSilence(decoded))
    const snd = currentSound.value
    snd.engine = 'sample'
    snd.sampleId = id
    snd.name = 'Rec ' + new Date().toLocaleTimeString().slice(0, 5)
    snd.params.start = 0
    snd.params.end = 1
    engine!.refreshSound(ui.group, ui.sound)
    previewSound()
  } catch {
    toast('Recording failed')
  }
}

export function chopSample(mode: 'equal' | 'transients'): void {
  const src = currentSound.value
  const buf = src.sampleId ? sampleBuffers.get(src.sampleId) : null
  if (!src.sampleId || !buf) { toast('Load a sample first'); return }
  const points = mode === 'equal' ? Array.from({ length: 16 }, (_, i) => i / 16) : detectOnsets(buf, 16)
  const grp = currentGroup.value
  points.forEach((start, i) => {
    const end = points[i + 1] ?? 1
    const snd = makeSound(`Slice ${i + 1}`, 'sample', { start, end, gate: 0 })
    snd.sampleId = src.sampleId
    grp.sounds[i] = snd
  })
  for (let i = points.length; i < 16; i++) {
    if (grp.sounds[i]!.engine === 'sample' && grp.sounds[i]!.sampleId === src.sampleId) {
      grp.sounds[i] = makeSound(`Sample ${i + 1}`, 'sample')
    }
  }
  engine?.refreshMix()
  toast(`Chopped into ${points.length} slices`)
}

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

function usedSampleIds(p: Project): string[] {
  const ids = new Set<string>()
  for (const g of p.groups) for (const s of g.sounds) if (s.sampleId) ids.add(s.sampleId)
  return [...ids]
}

export function replaceProject(next: Project): void {
  seq?.stop()
  releaseAllPads()
  Object.assign(project, next)
  ui.group = 0
  ui.sound = 0
  ui.stepBar = 0
  undoStack.length = 0
  redoStack.length = 0
  playback.canUndo = playback.canRedo = false
  engine?.refreshAll()
  void restoreSamples(usedSampleIds(next)).then(() => engine?.refreshAll())
}

export function newProject(): void {
  replaceProject(createProject())
  project.name = 'Untitled'
  toast('New project')
}

export function loadDemo(id = 'boombap'): void {
  replaceProject(createDemoProject(id))
  toast(`${project.name} loaded`)
}

export function listSlots(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(LS_SLOT)) out.push(k.slice(LS_SLOT.length))
    }
  } catch { /* storage blocked */ }
  return out.sort()
}

export function saveSlot(name: string): void {
  const n = name.trim() || project.name
  project.name = n
  if (writeLs(LS_SLOT + n, cloneProject(project))) toast(`Saved "${n}"`)
  else toast('Could not save (storage full?)')
}

export function loadSlot(name: string): void {
  const p = readLs<Project>(LS_SLOT + name)
  if (p) { replaceProject(migrate(p)); toast(`Loaded "${name}"`) }
}

export function deleteSlot(name: string): void {
  try { localStorage.removeItem(LS_SLOT + name) } catch { /* ignore */ }
}

function download(blob: Blob, filename: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export async function exportProject(): Promise<void> {
  ui.busy = 'Exporting project…'
  const samples: Record<string, string> = {}
  for (const id of usedSampleIds(project)) {
    const b64 = await sampleToBase64(id)
    if (b64) samples[id] = b64
  }
  const data = { ...cloneProject(project), samples }
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${project.name || 'project'}.maschinery.json`)
  ui.busy = ''
}

export async function importProject(file: File): Promise<void> {
  ui.busy = 'Importing project…'
  try {
    const raw = JSON.parse(await file.text()) as Project & { samples?: Record<string, string> }
    if (raw.samples) for (const [id, b64] of Object.entries(raw.samples)) await sampleFromBase64(id, b64)
    replaceProject(migrate(raw))
    toast(`Imported ${project.name}`)
  } catch {
    toast('Not a valid project file')
  } finally {
    ui.busy = ''
  }
}

export async function bounce(songMode: boolean, loops: number): Promise<void> {
  ui.busy = 'Rendering audio…'
  try {
    ensureAudio()
    const blob = await bounceToWav(toRaw(project), toRaw(settings), { song: songMode, loops })
    download(blob, `${project.name || 'bounce'}.wav`)
    toast(`Bounced ${bounceBars(project, { song: songMode, loops })} bars`)
  } catch {
    toast('Bounce failed')
  } finally {
    ui.busy = ''
  }
}

// ---------------------------------------------------------------------------
// share links
// ---------------------------------------------------------------------------

export async function copyShareLink(): Promise<void> {
  try {
    const code = await encodeProject(toRaw(project))
    const url = `${location.origin}${location.pathname}#p=${code}`
    await navigator.clipboard.writeText(url)
    const hasSamples = usedSampleIds(project).length > 0
    toast(`Link copied (${(url.length / 1000).toFixed(1)}k chars)${hasSamples ? ' · samples are not included' : ''}${url.length > 60000 ? ' · very long, may not paste everywhere' : ''}`)
  } catch {
    toast('Could not copy the link')
  }
}

/** open a project from `#p=...` (used on startup and when the hash changes) */
export async function loadFromHash(): Promise<boolean> {
  const m = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash)
  if (!m) return false
  try {
    const raw = await decodeProject(m[1]!)
    replaceProject(migrate(raw))
    toast(`Opened shared project “${project.name}”`)
    history.replaceState(null, '', location.pathname + location.search)
    return true
  } catch {
    toast('That share link is not valid')
    return false
  }
}

// ---------------------------------------------------------------------------
// latency calibration: tap along with a click track
// ---------------------------------------------------------------------------

let calibTaps: number[] = []
let calibClicks: number[] = []
let calibHandler: ((e: Event) => void) | null = null

export function startCalibration(): void {
  if (ui.calibrating) return
  const e = ensureAudio()
  const ctx = e.ctx as AudioContext
  calibTaps = []
  calibClicks = []
  ui.calibCount = 0
  ui.calibrating = true
  releaseAllPads()
  const t0 = ctx.currentTime + 0.6
  for (let i = 0; i < 16; i++) {
    const t = t0 + i * 0.5
    e.click(t, i % 4 === 0, 0.9)
    if (i >= 4) calibClicks.push(t)
  }
  calibHandler = (ev: Event) => {
    ev.preventDefault()
    ev.stopPropagation()
    const ts = ctx.getOutputTimestamp()
    const now = (ts.contextTime ?? ctx.currentTime) + (performance.now() - (ts.performanceTime ?? performance.now())) / 1000
    calibTaps.push(now)
    ui.calibCount = calibTaps.length
  }
  window.addEventListener('pointerdown', calibHandler, true)
  window.addEventListener('keydown', calibHandler, true)
  setTimeout(() => finishCalibration(ctx), 0.6 * 1000 + 16 * 500 + 600)
}

function finishCalibration(ctx: AudioContext): void {
  if (calibHandler) {
    window.removeEventListener('pointerdown', calibHandler, true)
    window.removeEventListener('keydown', calibHandler, true)
    calibHandler = null
  }
  ui.calibrating = false
  const est = estimateLatency(calibTaps, calibClicks, ctx.outputLatency || ctx.baseLatency || 0)
  if (est === null) toast('Not enough taps: tap along with the 12 clicks and try again')
  else {
    settings.latency = Math.max(-50, Math.min(150, est))
    toast(`Latency compensation set to ${settings.latency} ms`)
  }
}

// ---------------------------------------------------------------------------
// MIDI
// ---------------------------------------------------------------------------

export async function enableMidi(): Promise<void> {
  try {
    ui.midiPorts = await initMidi({
      noteOn: (pad, vel) => padDown(pad, vel, 'midi'),
      noteOff: (pad) => padUp(pad, 'midi'),
      cc: midiCc,
      bend: (v) => { ensureAudio().setBend(v * 200) },
      transport: (k) => {
        ensureAudio()
        if (k === 'stop') stop()
        else if (!seq!.playing) play()
      },
    })
    setMidiInput(settings.midiInput)
    setMidiChannel(settings.midiChannel)
    ui.midiOutPorts = listMidiOutputs()
    setMidiOutput(settings.midiOutput)
    ui.midiReady = true
  } catch {
    toast('MIDI access denied')
  }
}

export function chooseMidiInput(id: string): void {
  settings.midiInput = id
  setMidiInput(id)
}

export function chooseMidiOutput(id: string): void {
  settings.midiOutput = id
  setMidiOutput(id)
}

export function chooseMidiChannel(c: number): void {
  settings.midiChannel = c
  setMidiChannel(c)
}

// ---------------------------------------------------------------------------
// frame loop: playhead, pad LEDs, meters
// ---------------------------------------------------------------------------

let wakeLock: { release(): Promise<void> } | null = null

async function setWakeLock(on: boolean): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
    if (on && nav.wakeLock && !wakeLock) wakeLock = await nav.wakeLock.request('screen')
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null }
  } catch {
    wakeLock = null
  }
}

/** iOS and Safari only start audio from a real gesture and may suspend it later: resume on every gesture */
export function installAudioUnlock(): void {
  const resume = () => {
    const e = ensureAudio()
    const ctx = e.ctx as AudioContext
    if (ctx.state !== 'running') void ctx.resume()
  }
  for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, resume, { passive: true })
  document.addEventListener('visibilitychange', () => { if (!document.hidden && engine && engine.ctx.state !== 'running') void (engine.ctx as AudioContext).resume() })
}

function rafLoop(): void {
  const step = () => {
    if (engine && seq) {
      const now = engine.ctx.currentTime
      // hits whose audio time has arrived
      const hits = seq.hits
      let n = 0
      while (n < hits.length && hits[n]!.time <= now) {
        const h = hits[n]!
        playback.groupLevel[h.g] = Math.max(playback.groupLevel[h.g]!, h.v / 127)
        if (h.g === ui.group && ui.mode === 'pad') playback.padLevel[h.s] = Math.max(playback.padLevel[h.s]!, 0.35 + (0.65 * h.v) / 127)
        n++
      }
      if (n) hits.splice(0, n)

      if (playback.playing !== seq.playing) { playback.playing = seq.playing; void setWakeLock(seq.playing) }
      if (playback.recording !== seq.recording) playback.recording = seq.recording
      const ci = seq.countInLeft > 0
      if (playback.countIn !== ci) playback.countIn = ci

      if (seq.playing && !ci) {
        let entry = seq.ring[0]
        for (let i = seq.ring.length - 1; i >= 0; i--) {
          if (seq.ring[i]!.time <= now) { entry = seq.ring[i]; break }
        }
        if (entry) {
          for (let g = 0; g < NUM_GROUPS; g++) if (playback.pos[g] !== entry.pos[g]) playback.pos[g] = entry.pos[g]!
          if (playback.tick !== entry.tick) {
            playback.tick = entry.tick
            playback.bar = Math.floor(entry.tick / BAR) + 1
            playback.beat = Math.floor((entry.tick % BAR) / 96) + 1
          }
        }
      } else if (!seq.playing) {
        for (let g = 0; g < NUM_GROUPS; g++) if (playback.pos[g] !== 0) playback.pos[g] = 0
        if (playback.tick !== 0) { playback.tick = 0; playback.bar = 1; playback.beat = 1 }
      }
      for (let g = 0; g < NUM_GROUPS; g++) {
        if (playback.pending[g] !== seq.pending[g]) playback.pending[g] = seq.pending[g]!
      }
      if (playback.songIdx !== seq.songIdx) playback.songIdx = seq.songIdx

      for (let g = 0; g < NUM_GROUPS; g++) {
        const peak = engine.groupPeak(g)
        const prev = playback.meters[g]!
        const v = peak > prev ? peak : prev * 0.88
        playback.meters[g] = v < 0.002 ? 0 : v
      }
      const mp = engine.masterPeak()
      playback.master = mp > playback.master ? mp : playback.master * 0.9
    }
    for (let i = 0; i < NUM_SOUNDS; i++) {
      const v = playback.padLevel[i]!
      if (v > 0.001) playback.padLevel[i] = v * 0.86
      else if (v !== 0) playback.padLevel[i] = 0
    }
    for (let g = 0; g < NUM_GROUPS; g++) {
      const v = playback.groupLevel[g]!
      if (v > 0.001) playback.groupLevel[g] = v * 0.88
      else if (v !== 0) playback.groupLevel[g] = 0
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

let saveTimer: number | undefined
watch(
  project,
  () => {
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => writeLs(LS_PROJECT, cloneProject(project)), 700)
  },
  { deep: true },
)
watch(settings, () => writeLs(LS_SETTINGS, settings), { deep: true })

void restoreSamples(usedSampleIds(project))

// ---------------------------------------------------------------------------
// misc selectors used by the views
// ---------------------------------------------------------------------------

export function setView(v: ViewId): void {
  ui.view = v
  ui.page = 0
}

export function setMode(m: PadMode): void {
  ui.mode = m
  releaseAllPads()
}

export function cycleMode(): void {
  setMode(PAD_MODES[(PAD_MODES.indexOf(ui.mode) + 1) % PAD_MODES.length]!)
}

export function sceneCount(): number { return NUM_SCENES }
export function patternCount(): number { return NUM_PATTERNS }
export function noteLabel(i: number): string { return noteName(keyboardNote(i)) }
export { KITS }
