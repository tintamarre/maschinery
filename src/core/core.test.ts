import { describe, expect, it } from 'vitest'
import { BAR, SCALES, STEP } from './constants'
import { addEvent, clearSound, doublePattern, laneValueAt, newPattern, quantizeEvents, removeEventsIn, setBars, shiftEvents, toggleStep, writeAutoPoint } from './pattern'
import { KITS, cloneProject, createDemoProject, createProject, migrate } from './project'
import { swingOffset, unswing } from './sequencer'

describe('swing', () => {
  it('is a no-op when straight', () => {
    expect(swingOffset(24, 0)).toBe(0)
    expect(unswing(30, 0)).toBe(30)
  })

  it('delays the off-beat 16th and keeps downbeats', () => {
    expect(swingOffset(0, 8)).toBe(0)
    expect(swingOffset(24, 8)).toBe(8)
    expect(swingOffset(47.999, 8)).toBeCloseTo(0, 1)
  })

  it('unswing is the inverse of the warp', () => {
    for (const s of [4, 8, 12]) {
      for (let p = 0; p < 96; p += 3) {
        const real = p + swingOffset(p % 48, s)
        expect(unswing(real, s)).toBeCloseTo(p, 6)
      }
    }
  })
})

describe('pattern editing', () => {
  it('toggles steps on and off and bumps rev', () => {
    const p = newPattern(1)
    expect(toggleStep(p, 2, 4)).toBe(true)
    expect(p.events).toEqual([{ t: 4 * STEP, s: 2, v: 100, l: STEP, n: 0 }])
    expect(toggleStep(p, 2, 4)).toBe(false)
    expect(p.events).toHaveLength(0)
    expect(p.rev).toBe(2)
  })

  it('removes only the requested sound and range', () => {
    const p = newPattern(1)
    addEvent(p, { t: 0, s: 0, v: 90, l: 24, n: 0 })
    addEvent(p, { t: 24, s: 0, v: 90, l: 24, n: 0 })
    addEvent(p, { t: 0, s: 1, v: 90, l: 24, n: 0 })
    expect(removeEventsIn(p, 0, 0, 24)).toBe(1)
    expect(p.events.map((e) => [e.s, e.t])).toEqual([[0, 24], [1, 0]])
    clearSound(p, 0)
    expect(p.events).toHaveLength(1)
  })

  it('quantizes to the grid and wraps inside the pattern', () => {
    const p = newPattern(1)
    addEvent(p, { t: 10, s: 0, v: 100, l: 24, n: 0 })
    addEvent(p, { t: BAR - 3, s: 0, v: 100, l: 24, n: 0 })
    quantizeEvents(p, 24)
    expect(p.events.map((e) => e.t)).toEqual([0, 0])
  })

  it('doubles a pattern up to 4 bars', () => {
    const p = newPattern(2)
    addEvent(p, { t: 0, s: 0, v: 100, l: 24, n: 0 })
    doublePattern(p)
    expect(p.bars).toBe(4)
    expect(p.events.map((e) => e.t)).toEqual([0, 2 * BAR])
    doublePattern(p)
    expect(p.bars).toBe(4)
  })

  it('drops events past the end when shrinking and shifts with wrap-around', () => {
    const p = newPattern(2)
    addEvent(p, { t: BAR + 10, s: 0, v: 100, l: 24, n: 0 })
    addEvent(p, { t: 0, s: 0, v: 100, l: 24, n: 0 })
    shiftEvents(p, -STEP)
    expect(p.events.map((e) => e.t).sort((a, b) => a - b)).toEqual([BAR + 10 - STEP, 2 * BAR - STEP])
    setBars(p, 1)
    expect(p.events.map((e) => e.t)).toEqual([BAR + 10 - STEP])
  })
})

describe('project', () => {
  it('has 8 groups of 16 sounds and 16 patterns each', () => {
    const p = createProject()
    expect(p.groups).toHaveLength(8)
    expect(p.groups.every((g) => g.sounds.length === 16 && g.patterns.length === 16)).toBe(true)
  })

  it('survives a JSON round trip through migrate', () => {
    const demo = createDemoProject()
    const again = migrate(JSON.parse(JSON.stringify(demo)))
    expect(again.tempo).toBe(demo.tempo)
    expect(again.groups[0]!.patterns[0]!.events).toEqual(demo.groups[0]!.patterns[0]!.events)
    expect(again.song).toEqual(demo.song)
  })

  it('migrate fills in missing data and rejects junk', () => {
    expect(migrate(null).groups).toHaveLength(8)
    const partial = migrate({ groups: [{ sounds: [{ name: 'X', engine: 'kick', params: { pitch: 3 } }] }] })
    expect(partial.groups[0]!.sounds[0]!.params.pitch).toBe(3)
    expect(partial.groups[0]!.sounds[0]!.params.volume).toBeGreaterThan(0)
    expect(partial.groups[0]!.sounds).toHaveLength(16)
  })

  it('old projects without snapshots get 8 empty slots', () => {
    const p = migrate({ groups: [{ sounds: [] }] })
    expect(p.groups[0]!.snapshots).toEqual(new Array(8).fill(null))
  })

  it('clones deeply', () => {
    const a = createProject()
    const b = cloneProject(a)
    b.groups[0]!.sounds[0]!.params.pitch = 5
    expect(a.groups[0]!.sounds[0]!.params.pitch).toBe(0)
  })

  it('every kit defines 16 sounds', () => {
    for (const k of KITS) expect(k.sounds).toHaveLength(16)
  })
})

describe('scales', () => {
  it('start on the root and stay within an octave', () => {
    for (const [name, notes] of Object.entries(SCALES)) {
      expect(notes[0], name).toBe(0)
      expect(Math.max(...notes), name).toBeLessThan(12)
    }
  })
})

describe('automation', () => {
  const lane = { target: 's0.cutoff', points: [{ t: 0, v: 0 }, { t: 192, v: 1 }] }

  it('interpolates and wraps around the loop', () => {
    expect(laneValueAt(lane, 96, BAR)).toBeCloseTo(0.5)
    expect(laneValueAt(lane, 288, BAR)).toBeCloseTo(0.5)
    expect(laneValueAt({ target: 'x', points: [] }, 10, BAR)).toBeNull()
    expect(laneValueAt({ target: 'x', points: [{ t: 50, v: 0.3 }] }, 10, BAR)).toBe(0.3)
  })

  it('a new take overwrites the points it passed over', () => {
    const p = newPattern(1)
    for (const t of [0, 24, 48, 72, 96]) writeAutoPoint(p, 'g.volume', t, t / 100, null)
    writeAutoPoint(p, 'g.volume', 72, 0.9, 24)
    expect(p.auto[0]!.points.map((pt) => pt.t)).toEqual([0, 24, 72, 96])
    expect(p.auto[0]!.points.find((pt) => pt.t === 72)!.v).toBe(0.9)
  })

  it('doubling keeps the lanes in step with the notes', () => {
    const p = newPattern(1)
    writeAutoPoint(p, 'g.pan', 10, 0.2, null)
    doublePattern(p)
    expect(p.auto[0]!.points.map((pt) => pt.t)).toEqual([10, 10 + BAR])
  })
})
