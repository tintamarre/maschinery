import { reactive, toRaw } from 'vue'
import { BAR, STEP, clamp } from './core/constants'
import { touch } from './core/pattern'
import type { NoteEvent } from './core/types'
import { currentPattern, quantTicks, snapshot, toast, ui } from './store'

/** selected events (raw objects, so identity is stable); `rev` triggers redraws */
export const sel = reactive({ rev: 0, cursor: 0, tool: 'draw' as 'draw' | 'select' })
const selected = new Set<NoteEvent>()
let clipboard: NoteEvent[] = []

export function selectionSize(): number {
  void sel.rev
  return selected.size
}

export function isSelected(e: NoteEvent): boolean {
  return selected.has(e)
}

function changed(): void {
  sel.rev++
}

export function clearSelection(): void {
  if (!selected.size) return
  selected.clear()
  changed()
}

export function setSelection(events: NoteEvent[], additive = false): void {
  if (!additive) selected.clear()
  for (const e of events) selected.add(toRaw(e))
  changed()
}

export function selectAll(): void {
  setSelection([...currentPattern.value.events])
}

function patLen(): number {
  return currentPattern.value.bars * BAR
}

const wrap = (t: number, len: number) => ((t % len) + len) % len

// ---- moving ---------------------------------------------------------------------

let origin = new Map<NoteEvent, { t: number; s: number }>()

export function beginMove(): void {
  snapshot()
  origin = new Map([...selected].map((e) => [e, { t: e.t, s: e.s }]))
}

/** grid used while dragging: the quantize setting, or 1/32 when quantize is off */
export function moveSnap(): number {
  return quantTicks.value > 0 ? quantTicks.value : STEP / 2
}

export function applyMove(dTicks: number, dRows: number): void {
  const len = patLen()
  for (const [e, o] of origin) {
    e.t = wrap(o.t + dTicks, len)
    e.s = clamp(o.s + dRows, 0, 15)
  }
  touch(currentPattern.value)
  changed()
}

// ---- editing ----------------------------------------------------------------------

export function deleteSelection(): void {
  if (!selected.size) return
  snapshot()
  const pat = currentPattern.value
  pat.events = pat.events.filter((e) => !selected.has(toRaw(e)))
  selected.clear()
  touch(pat)
  changed()
}

export function copySelection(): void {
  if (!selected.size) return
  const base = Math.min(...[...selected].map((e) => e.t))
  clipboard = [...selected].map((e) => ({ ...e, t: e.t - base }))
  toast(`Copied ${clipboard.length} note${clipboard.length > 1 ? 's' : ''}`)
}

function pasteAt(tick: number): void {
  if (!clipboard.length) { toast('Nothing to paste'); return }
  snapshot()
  const pat = currentPattern.value
  const len = patLen()
  const added: NoteEvent[] = clipboard.map((e) => ({ ...e, t: wrap(tick + e.t, len) }))
  pat.events.push(...added)
  touch(pat)
  // pick the proxies that were just added so the selection follows the paste
  selected.clear()
  for (const a of pat.events.slice(-added.length)) selected.add(toRaw(a))
  changed()
}

export function pasteAtCursor(): void {
  pasteAt(sel.cursor)
}

/** duplicate the selection right after itself (like Cmd+D in a DAW) */
export function duplicateSelection(): void {
  if (!selected.size) return
  const ts = [...selected].map((e) => e.t)
  const start = Math.min(...ts)
  const end = Math.max(...[...selected].map((e) => e.t + Math.max(e.l, STEP)))
  const span = Math.ceil((end - start) / STEP) * STEP
  copySelection()
  pasteAt(wrap(start + span, patLen()))
}

export function adjustVelocity(delta: number): void {
  if (!selected.size) return
  snapshot(ui.group, undefined, 500)
  for (const e of selected) e.v = clamp(e.v + delta, 1, 127)
  touch(currentPattern.value)
  changed()
}

export function adjustNote(delta: number): void {
  if (!selected.size) return
  snapshot(ui.group, undefined, 500)
  for (const e of selected) e.n = clamp(e.n + delta, -36, 36)
  touch(currentPattern.value)
  changed()
}
