import { GROUP_COLORS, GROUP_NAMES, NUM_GROUPS, NUM_PATTERNS, NUM_SCENES, NUM_SOUNDS, STEP } from './constants'
import { newPattern, touch } from './pattern'
import type { EngineId, Group, MasterParams, Project, Sound, SoundParams } from './types'

export const BASE_PARAMS: SoundParams = {
  pitch: 0, attack: 0, decay: 0.5, tone: 0.5, drive: 0, cutoff: 1, reso: 0.1, volume: 0.8, pan: 0,
  reverb: 0, delay: 0, start: 0, end: 1, velSens: 0.7, choke: 0, gate: 0, hp: 0, crush: 0, reverse: 0,
}

export const ENGINE_LABELS: Record<EngineId, string> = {
  kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Hi-Hat', tom: 'Tom', rim: 'Rim', cowbell: 'Cowbell',
  perc: 'Perc (FM)', shaker: 'Shaker', crash: 'Crash', bass: 'Bass', lead: 'Lead', pluck: 'Pluck', pad: 'Pad',
  sample: 'Sample',
}

export const ENGINES = Object.keys(ENGINE_LABELS) as EngineId[]

export function makeSound(name: string, engine: EngineId, over: Partial<SoundParams> = {}): Sound {
  return { name, engine, params: { ...BASE_PARAMS, ...over }, mute: false, solo: false, sampleId: null }
}

export const DEFAULT_MASTER: MasterParams = {
  volume: 0.85, comp: 0.25, reverbSize: 0.45, reverbLevel: 0.8, delayDiv: 2, delayFeedback: 0.4, delayLevel: 0.8, delayTone: 0.55,
}

// ---- kits -------------------------------------------------------------------

type SoundSpec = [name: string, engine: EngineId, over?: Partial<SoundParams>]

export interface Kit {
  name: string
  sounds: SoundSpec[]
}

const drumKit = (name: string, tweak: (s: SoundSpec, i: number) => SoundSpec): Kit => ({
  name,
  sounds: ([
    ['Kick', 'kick'], ['Snare', 'snare'], ['Clap', 'clap'], ['Rim', 'rim'],
    ['Hat Closed', 'hat', { decay: 0.12, choke: 1 }], ['Hat Open', 'hat', { decay: 0.55, choke: 1 }], ['Tom Low', 'tom', { pitch: -5 }], ['Tom High', 'tom', { pitch: 2 }],
    ['Crash', 'crash'], ['Cowbell', 'cowbell'], ['Shaker', 'shaker'], ['Perc', 'perc'],
    ['Kick Alt', 'kick', { decay: 0.7, pitch: -3 }], ['Snare Alt', 'snare', { tone: 0.8 }], ['Zap', 'perc', { pitch: 12, tone: 0.9 }], ['Click', 'rim', { pitch: 7 }],
  ] as SoundSpec[]).map(tweak),
})

export const KITS: Kit[] = [
  drumKit('Classic 808', (s) => s),
  drumKit('Hard 909', (s, i) => {
    const o = { ...s[2] }
    if (i === 0) Object.assign(o, { tone: 0.65, decay: 0.4, drive: 0.25 })
    if (i === 1) Object.assign(o, { tone: 0.75, drive: 0.15 })
    if (i === 4 || i === 5) Object.assign(o, { tone: 0.8 })
    return [s[0], s[1], o]
  }),
  drumKit('Lo-Fi Dust', (s, i) => {
    const o = { ...s[2], cutoff: 0.62, drive: 0.3, pitch: (s[2]?.pitch ?? 0) - 2 }
    if (i === 0) o.decay = 0.35
    return [s[0], s[1], o]
  }),
  drumKit('Tight Techno', (s, i) => {
    const o = { ...s[2], decay: Math.max(0.08, (s[2]?.decay ?? 0.5) - 0.15) }
    if (i === 0) Object.assign(o, { tone: 0.8, drive: 0.4, decay: 0.38 })
    return [s[0], s[1], o]
  }),
  {
    name: 'Synth Lab',
    sounds: [
      ['Sub Bass', 'bass', { decay: 0.3 }], ['Reese', 'bass', { tone: 0.7, reso: 0.4, pitch: -12, decay: 0.45 }],
      ['Acid', 'bass', { tone: 0.8, reso: 0.7, decay: 0.2 }], ['Saw Lead', 'lead'],
      ['Soft Lead', 'lead', { tone: 0.3, attack: 0.3, decay: 0.6 }], ['Bright Lead', 'lead', { tone: 0.9, reso: 0.4 }],
      ['Pluck', 'pluck'], ['Pluck Long', 'pluck', { decay: 0.8 }],
      ['Warm Pad', 'pad'], ['String Pad', 'pad', { tone: 0.7, attack: 0.5 }], ['Dark Pad', 'pad', { tone: 0.2 }], ['Air Pad', 'pad', { tone: 0.9, decay: 0.9 }],
      ['Kick', 'kick'], ['Snare', 'snare'], ['Hat', 'hat', { decay: 0.15 }], ['Clap', 'clap'],
    ],
  },
  {
    name: 'Empty Samples',
    sounds: Array.from({ length: 16 }, (_, i): SoundSpec => [`Sample ${i + 1}`, 'sample']),
  },
]

export function applyKit(group: Group, kit: Kit): void {
  group.sounds = kit.sounds.map(([name, engine, over]) => makeSound(name, engine, over))
}

// ---- project ----------------------------------------------------------------

export function newGroup(i: number, kit: Kit = KITS[0]!): Group {
  const g: Group = {
    name: GROUP_NAMES[i]!,
    color: GROUP_COLORS[i]!,
    volume: 0.85, pan: 0, reverb: 0, delay: 0, mute: false, solo: false,
    sounds: [],
    patterns: Array.from({ length: NUM_PATTERNS }, () => newPattern(1)),
    pattern: 0,
    snapshots: Array.from({ length: 8 }, () => null),
  }
  applyKit(g, kit)
  return g
}

export function createProject(): Project {
  return {
    version: 1,
    name: 'Untitled',
    tempo: 100,
    swing: 50,
    groups: Array.from({ length: NUM_GROUPS }, (_, i) => newGroup(i, i === 1 ? KITS[4]! : KITS[0]!)),
    scenes: Array.from({ length: NUM_SCENES }, (_, i) => Array.from({ length: NUM_GROUPS }, () => i)),
    song: [],
    master: { ...DEFAULT_MASTER },
  }
}

/** write a step string such as 'x...x...x.x.x...' into a pattern (x = hit, X = accent, o = ghost) */
function steps(p: Project['groups'][number]['patterns'][number], sound: number, s: string, offsetSteps = 0): void {
  [...s.replace(/\s/g, '')].forEach((c, i) => {
    if (c === '.' || c === '-') return
    const v = c === 'X' ? 124 : c === 'o' ? 55 : 100
    p.events.push({ t: (i + offsetSteps) * STEP, s: sound, v, l: STEP, n: 0 })
  })
  touch(p)
}

export function createDemoProject(): Project {
  const p = createProject()
  p.name = 'Demo Beat'
  p.tempo = 92
  p.swing = 56
  const drums = p.groups[0]!
  const b1 = drums.patterns[0]!
  steps(b1, 0, 'X..o..x...o.x...')
  steps(b1, 1, '....X.......X..o')
  steps(b1, 2, '................')
  steps(b1, 4, 'x.xox.xox.xox.xo')
  steps(b1, 5, '..............x.')
  const b2 = drums.patterns[1]!
  b2.bars = 2
  steps(b2, 0, 'X..o..x...o.x...' + 'X..o..x...o.x.o.')
  steps(b2, 1, '....X.......X...' + '....X.......X.xX')
  steps(b2, 2, '....x.......x..o' + '....x...........')
  steps(b2, 4, 'x.xox.xox.xox.xo' + 'x.xox.xox.xox.xo')
  steps(b2, 5, '................' + '..............x.')
  steps(b2, 6, '................' + '..........x.x...')
  const b3 = drums.patterns[2]!
  steps(b3, 0, 'X...X...X...X...')
  steps(b3, 2, '....x.......x...')
  steps(b3, 4, 'xxxxxxxxxxxxxxxx')
  steps(b3, 10, 'x.x.x.x.x.x.x.x.')

  const bass = p.groups[1]!
  bass.name = 'B'
  const bp = bass.patterns[0]!
  const line: [number, number, number][] = [[0, 0, 4], [6, 0, 2], [8, 3, 4], [14, 5, 2]]
  for (const [st, note, len] of line) bp.events.push({ t: st * STEP, s: 0, v: 110, l: len * STEP - 6, n: note })
  touch(bp)
  const bp2 = bass.patterns[1]!
  bp2.bars = 2
  const line2: [number, number, number][] = [[0, 0, 3], [4, 0, 2], [8, 7, 3], [12, 5, 4], [16, 0, 3], [20, 3, 2], [24, 5, 3], [28, 7, 4]]
  for (const [st, note, len] of line2) bp2.events.push({ t: st * STEP, s: 0, v: 105, l: len * STEP - 6, n: note })
  touch(bp2)

  const keys = p.groups[2]!
  applyKit(keys, KITS[4]!)
  keys.name = 'C'
  const chord = (pat: typeof keys.patterns[number], t: number, notes: number[], len: number, s = 8) => {
    for (const n of notes) pat.events.push({ t, s, v: 90, l: len, n })
    touch(pat)
  }
  const kp = keys.patterns[0]!
  kp.bars = 2
  chord(kp, 0, [0, 3, 7], 384 - 24)
  chord(kp, 384, [-2, 2, 5], 384 - 24)
  keys.volume = 0.6
  keys.reverb = 0.4
  const lp = keys.patterns[1]!
  lp.bars = 1
  for (const [st, n] of [[0, 12], [3, 15], [6, 19], [8, 15], [11, 12], [14, 10]] as [number, number][]) {
    lp.events.push({ t: st * STEP, s: 6, v: 100, l: STEP * 2, n })
  }
  touch(lp)

  p.song = [{ scene: 0, bars: 2 }, { scene: 1, bars: 2 }, { scene: 2, bars: 1 }, { scene: 1, bars: 2 }]
  // scene 0: intro drums; scene 1: full; scene 2: break
  p.scenes[0] = [0, 0, 0, 0, 0, 0, 0, 0]
  p.scenes[1] = [1, 1, 1, 0, 0, 0, 0, 0]
  p.scenes[2] = [2, 0, 1, 0, 0, 0, 0, 0]
  return p
}

export function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project
}

/** make sure a loaded project has every field the app expects */
export function migrate(raw: unknown): Project {
  const base = createProject()
  const src = raw as Partial<Project>
  if (!src || !Array.isArray(src.groups)) return base
  const proj: Project = {
    ...base,
    name: src.name ?? base.name,
    tempo: src.tempo ?? base.tempo,
    swing: src.swing ?? base.swing,
    master: { ...base.master, ...(src.master ?? {}) },
    song: Array.isArray(src.song) ? src.song : [],
    scenes: Array.isArray(src.scenes) && src.scenes.length === NUM_SCENES ? src.scenes : base.scenes,
    groups: base.groups.map((bg, gi) => {
      const sg = src.groups![gi]
      if (!sg) return bg
      return {
        ...bg,
        ...sg,
        snapshots: Array.from({ length: 8 }, (_, i) => sg.snapshots?.[i] ?? null),
        sounds: Array.from({ length: NUM_SOUNDS }, (_, si) => {
          const ss = sg.sounds?.[si]
          return ss ? { ...bg.sounds[si]!, ...ss, params: { ...BASE_PARAMS, ...ss.params } } : bg.sounds[si]!
        }),
        patterns: Array.from({ length: NUM_PATTERNS }, (_, pi) => {
          const sp = sg.patterns?.[pi]
          return sp ? { bars: sp.bars ?? 1, events: sp.events ?? [], rev: 0 } : newPattern(1)
        }),
      }
    }),
  }
  return proj
}
