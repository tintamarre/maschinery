import { BAR, STEP } from './constants'
import type { AutoLane, NoteEvent, Pattern } from './types'

export function newPattern(bars = 1): Pattern {
  return { bars, events: [], auto: [], rev: 0 }
}

export function touch(p: Pattern): void {
  p.rev++
}

export function patternLength(p: Pattern): number {
  return p.bars * BAR
}

export function addEvent(p: Pattern, ev: NoteEvent): void {
  p.events.push(ev)
  touch(p)
}

/** events of sound `s` whose start lies in [from, to) */
export function eventsIn(p: Pattern, s: number, from: number, to: number): NoteEvent[] {
  return p.events.filter((e) => e.s === s && e.t >= from && e.t < to)
}

export function removeEventsIn(p: Pattern, s: number, from: number, to: number): number {
  const before = p.events.length
  p.events = p.events.filter((e) => !(e.s === s && e.t >= from && e.t < to))
  if (p.events.length !== before) touch(p)
  return before - p.events.length
}

/** toggle a grid step (16th) for a sound; returns true when an event was added */
export function toggleStep(p: Pattern, s: number, step: number, vel = 100, note = 0): boolean {
  const from = step * STEP
  if (removeEventsIn(p, s, from, from + STEP) > 0) return false
  addEvent(p, { t: from, s, v: vel, l: STEP, n: note })
  return true
}

export function clearSound(p: Pattern, s: number): void {
  p.events = p.events.filter((e) => e.s !== s)
  touch(p)
}

export function clearPattern(p: Pattern): void {
  p.events = []
  p.auto = []
  touch(p)
}

export function setBars(p: Pattern, bars: number): void {
  p.bars = bars
  p.events = p.events.filter((e) => e.t < bars * BAR)
  for (const lane of p.auto) lane.points = lane.points.filter((pt) => pt.t < bars * BAR)
  p.auto = p.auto.filter((l) => l.points.length > 0)
  touch(p)
}

export function copyPatternInto(src: Pattern, dst: Pattern): void {
  dst.bars = src.bars
  dst.events = src.events.map((e) => ({ ...e }))
  dst.auto = (src.auto ?? []).map((l) => ({ target: l.target, points: l.points.map((pt) => ({ ...pt })) }))
  touch(dst)
}

export function quantizeEvents(p: Pattern, grid: number, strength = 1, soundIdx?: number): void {
  if (grid <= 0) return
  const len = patternLength(p)
  for (const e of p.events) {
    if (soundIdx !== undefined && e.s !== soundIdx) continue
    const snapped = Math.round(e.t / grid) * grid
    e.t = ((Math.round(e.t + (snapped - e.t) * strength) % len) + len) % len
  }
  touch(p)
}

/** double the pattern content (bars x2, max 4) */
export function doublePattern(p: Pattern): void {
  if (p.bars >= 4) return
  const len = patternLength(p)
  const copy = p.events.map((e) => ({ ...e, t: e.t + len }))
  p.events.push(...copy)
  for (const lane of p.auto) lane.points.push(...lane.points.map((pt) => ({ t: pt.t + len, v: pt.v })))
  p.bars = Math.min(4, p.bars * 2)
  touch(p)
}

export function shiftEvents(p: Pattern, ticks: number, soundIdx?: number): void {
  const len = patternLength(p)
  for (const e of p.events) {
    if (soundIdx !== undefined && e.s !== soundIdx) continue
    e.t = (((e.t + ticks) % len) + len) % len
  }
  touch(p)
}

export function randomizeVelocity(p: Pattern, amount: number): void {
  for (const e of p.events) e.v = Math.max(1, Math.min(127, Math.round(e.v + (Math.random() * 2 - 1) * amount)))
  touch(p)
}

/** sorted copy of the events of a pattern, handy for rendering */
export function sorted(p: Pattern): NoteEvent[] {
  return [...p.events].sort((a, b) => a.t - b.t)
}

// ---- automation -----------------------------------------------------------------

/** linearly interpolated lane value at a tick, wrapping around the loop end; null for an empty lane */
export function laneValueAt(lane: AutoLane, tick: number, len: number): number | null {
  const pts = lane.points
  if (!pts.length) return null
  if (pts.length === 1) return pts[0]!.v
  let prev: { t: number; v: number } | undefined
  let next: { t: number; v: number } | undefined
  for (const pt of pts) {
    if (pt.t <= tick) prev = pt
    else { next = pt; break }
  }
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  const a = prev ?? { t: last.t - len, v: last.v }
  const b = next ?? { t: first.t + len, v: first.v }
  const span = b.t - a.t
  if (span <= 0) return a.v
  return a.v + ((b.v - a.v) * (tick - a.t)) / span
}

/** write a point; overwrites the points passed since the previous write so a take replaces the old curve */
export function writeAutoPoint(p: Pattern, target: string, tick: number, value: number, prevTick: number | null): void {
  let lane = p.auto.find((l) => l.target === target)
  if (!lane) {
    lane = { target, points: [] }
    p.auto.push(lane)
    lane = p.auto[p.auto.length - 1]!
  }
  if (prevTick !== null) {
    const len = patternLength(p)
    lane.points = lane.points.filter((pt) =>
      prevTick <= tick ? !(pt.t > prevTick && pt.t <= tick) : !(pt.t > prevTick && pt.t < len) && !(pt.t >= 0 && pt.t <= tick),
    )
  }
  lane.points.push({ t: tick, v: value })
  lane.points.sort((x, y) => x.t - y.t)
  touch(p)
}

export function removeLane(p: Pattern, target: string): void {
  p.auto = p.auto.filter((l) => l.target !== target)
  touch(p)
}
