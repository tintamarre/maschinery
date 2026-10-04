import { BAR, PPQ } from './constants'
import { AudioEngine } from './engine'
import { cloneProject } from './project'
import { Sequencer } from './sequencer'
import { encodeWav } from './samples'
import type { Project, Settings } from './types'

export interface BounceOptions {
  song: boolean
  loops: number // pattern loops when not in song mode
}

/** total bars a bounce will contain */
export function bounceBars(project: Project, opts: BounceOptions): number {
  if (opts.song && project.song.length) return project.song.reduce((a, s) => a + s.bars, 0)
  const longest = Math.max(1, ...project.groups.map((g) => g.patterns[g.pattern]!.bars))
  return longest * opts.loops
}

/** Render the project to a stereo WAV file using an OfflineAudioContext. */
export async function bounceToWav(source: Project, settings: Settings, opts: BounceOptions): Promise<Blob> {
  const project = cloneProject(source)
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
  })
  seq.runOffline(bars * BAR, opts.song && project.song.length > 0)
  const buf = await ctx.startRendering()
  const wav = encodeWav([buf.getChannelData(0), buf.getChannelData(1)], sr)
  return new Blob([wav], { type: 'audio/wav' })
}
