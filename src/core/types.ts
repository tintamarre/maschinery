export type EngineId =
  | 'kick' | 'snare' | 'clap' | 'hat' | 'tom' | 'rim' | 'cowbell' | 'perc' | 'shaker' | 'crash'
  | 'bass' | 'lead' | 'pluck' | 'pad' | 'sample'

export interface SoundParams {
  pitch: number // semitones, -24..24
  attack: number // 0..1
  decay: number // 0..1 (0.5 = neutral)
  tone: number // 0..1
  drive: number // 0..1
  cutoff: number // 0..1 (1 = open)
  reso: number // 0..1
  volume: number // 0..1
  pan: number // -1..1
  reverb: number // send 0..1
  delay: number // send 0..1
  start: number // sample start 0..1
  end: number // sample end 0..1
  velSens: number // 0..1
  choke: number // 0 = none, 1..8 = choke group
  gate: number // 0 = one-shot, 1 = gate (sustain while held)
}

export interface Sound {
  name: string
  engine: EngineId
  params: SoundParams
  mute: boolean
  solo: boolean
  sampleId: string | null
}

/** A note event. Times are in ticks (96 PPQ, 24 ticks = one 16th). */
export interface NoteEvent {
  t: number // start tick inside the pattern
  s: number // sound index 0..15
  v: number // velocity 1..127
  l: number // length in ticks
  n: number // semitone offset (keyboard / chords mode)
}

export interface Pattern {
  bars: number // 1..4
  events: NoteEvent[]
  rev: number // bumped on every edit, used by the sequencer index cache
}

export interface Group {
  name: string
  color: string
  volume: number
  pan: number
  reverb: number
  delay: number
  mute: boolean
  solo: boolean
  sounds: Sound[]
  patterns: Pattern[]
  pattern: number // currently playing / edited pattern
}

export interface SongSection {
  scene: number
  bars: number
}

export interface MasterParams {
  volume: number
  comp: number
  reverbSize: number
  reverbLevel: number
  delayDiv: number // index into DELAY_DIVS
  delayFeedback: number
  delayLevel: number
  delayTone: number
}

export interface Project {
  version: 1
  name: string
  tempo: number
  swing: number // 50 = straight .. 75
  groups: Group[]
  scenes: number[][] // scenes[scene][group] = pattern index
  song: SongSection[]
  master: MasterParams
}

export interface Settings {
  quantize: number // index into QUANTIZE
  countIn: number // bars
  metronome: boolean
  metVolume: number
  repeatRate: number // index into REPEAT_RATES
  scale: string
  root: number // 0..11
  octave: number // -3..3
  latency: number // ms, compensation when recording
  midiInput: string // 'all' | 'none' | port id
  midiChannel: number // 0 = omni
  follow: boolean
  songLoop: boolean
}

export interface KnobDef {
  label: string
  value: number
  min: number
  max: number
  step: number
  def: number
  text: string
  set: (v: number) => void
}
