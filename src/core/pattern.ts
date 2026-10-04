import { BAR, STEP } from './constants'
import type { NoteEvent, Pattern } from './types'

export function newPattern(bars = 1): Pattern {
  return { bars, events: [], rev: 0 }
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
  touch(p)
}

export function setBars(p: Pattern, bars: number): void {
  p.bars = bars
  p.events = p.events.filter((e) => e.t < bars * BAR)
  touch(p)
}

export function copyPatternInto(src: Pattern, dst: Pattern): void {
  dst.bars = src.bars
  dst.events = src.events.map((e) => ({ ...e }))
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
