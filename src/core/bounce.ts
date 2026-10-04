import { BAR, PPQ } from './constants'
import { AudioEngine } from './engine'
import { cloneProject } from './project'
import { Sequencer } from './sequencer'
import { encodeWav } from './samples'
import type { Project, Settings } from './types'

export interface BounceOptions {
  song: boolean
  loops: number // pattern loops when not in song mode
  /** render a single group only (used for resampling) */
  onlyGroup?: number
}

/** total bars a bounce will contain */
export function bounceBars(project: Project, opts: BounceOptions): number {
  if (opts.song && project.song.length) return project.song.reduce((a, s) => a + s.bars, 0)
  const groups = opts.onlyGroup === undefined ? project.groups : [project.groups[opts.onlyGroup]!]
  const longest = Math.max(1, ...groups.map((g) => g.patterns[g.pattern]!.bars))
  return longest * opts.loops
}

/** Render the project offline and return the stereo buffer. */
export async function renderProject(source: Project, settings: Settings, opts: BounceOptions): Promise<AudioBuffer> {
  const project = cloneProject(source)
  if (opts.onlyGroup !== undefined) project.groups.forEach((g, i) => { if (i !== opts.onlyGroup) g.mute = true })
  const sr = 44100
  const bars = bounceBars(project, opts)
  const secPerTick = 60 / (project.tempo * PPQ)
  const tail = 3
  const seconds = bars * BAR * secPerTick + tail
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr)
  const engine = new AudioEngine(ctx, () => project)
  const seq = new Sequencer(engine, () => project, () => ({ ...settings, metronome: false, countIn: 0 }), {
    setGroupPattern: (g, idx) => { project.groups[g]!.pattern = idx },
    addEvent: () => {},
    eraseAt: () => {},
    applyAuto: (g, target, value, time) => {
      const grp = project.groups[g]!
      if (target.startsWith('g.')) {
        ;(grp as unknown as Record<string, number>)[target.slice(2)] = value
        engine.refreshGroup(g, time)
      } else {
        const dot = target.indexOf('.')
        const si = Number(target.slice(1, dot))
        ;(grp.sounds[si]!.params as unknown as Record<string, number>)[target.slice(dot + 1)] = value
        engine.refreshSound(g, si, time)
      }
    },
  })
  seq.runOffline(bars * BAR, opts.song && project.song.length > 0)
  return ctx.startRendering()
}

/** Render the project to a stereo WAV file using an OfflineAudioContext. */
export async function bounceToWav(source: Project, settings: Settings, opts: BounceOptions): Promise<Blob> {
  const buf = await renderProject(source, settings, opts)
  return new Blob([encodeWav([buf.getChannelData(0), buf.getChannelData(1)], buf.sampleRate)], { type: 'audio/wav' })
}
