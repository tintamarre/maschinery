import { MIDI_BASE_NOTE } from './constants'

export interface MidiHandlers {
  noteOn(pad: number, velocity: number): void
  noteOff(pad: number): void
  cc(num: number, value: number): void
  bend(value: number): void // -1..1
  transport(kind: 'start' | 'stop' | 'continue'): void
}

export interface MidiPort {
  id: string
  name: string
}

let access: MIDIAccess | null = null
let handlers: MidiHandlers | null = null
let selected = 'all'
let channel = 0
let output: MIDIOutput | null = null

export const midiSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator

function onMessage(e: MIDIMessageEvent): void {
  const d = e.data
  if (!d || !handlers) return
  const status = d[0]!
  const ch = (status & 0x0f) + 1
  const type = status & 0xf0
  if (status >= 0xf8) {
    if (status === 0xfa) handlers.transport('start')
    else if (status === 0xfb) handlers.transport('continue')
    else if (status === 0xfc) handlers.transport('stop')
    return
  }
  if (channel !== 0 && ch !== channel) return
  const a = d[1] ?? 0
  const b = d[2] ?? 0
  if (type === 0x90 && b > 0) {
    const pad = a - MIDI_BASE_NOTE
    if (pad >= 0 && pad < 16) handlers.noteOn(pad, b)
  } else if (type === 0x80 || (type === 0x90 && b === 0)) {
    const pad = a - MIDI_BASE_NOTE
    if (pad >= 0 && pad < 16) handlers.noteOff(pad)
  } else if (type === 0xb0) {
    handlers.cc(a, b)
  } else if (type === 0xe0) {
    handlers.bend(((b << 7) | a) / 8192 - 1)
  }
}

function bind(): void {
  if (!access) return
  access.inputs.forEach((input) => {
    input.onmidimessage = selected === 'none' || (selected !== 'all' && selected !== input.id) ? null : onMessage
  })
}

export async function initMidi(h: MidiHandlers): Promise<MidiPort[]> {
  handlers = h
  if (!midiSupported) return []
  access ??= await navigator.requestMIDIAccess()
  access.onstatechange = bind
  bind()
  return listMidiInputs()
}

export function listMidiInputs(): MidiPort[] {
  const out: MidiPort[] = []
  access?.inputs.forEach((i) => out.push({ id: i.id, name: i.name ?? i.id }))
  return out
}

export function setMidiInput(id: string): void {
  selected = id
  bind()
}

export function setMidiChannel(c: number): void {
  channel = c
}

export function listMidiOutputs(): MidiPort[] {
  const out: MidiPort[] = []
  access?.outputs.forEach((o) => out.push({ id: o.id, name: o.name ?? o.id }))
  return out
}

export function setMidiOutput(id: string): void {
  output = null
  if (!access || id === 'none') return
  access.outputs.forEach((o) => { if (o.id === id) output = o })
}

export function hasMidiOutput(): boolean {
  return output !== null
}

/** `timestamp` is a performance.now() based time in ms; omit to send immediately */
export function midiSend(data: number[], timestamp?: number): void {
  try { output?.send(data, timestamp) } catch { /* port closed */ }
}

export const MIDI_CLOCK = 0xf8
export const MIDI_START = 0xfa
export const MIDI_STOP = 0xfc

/** test hook: inject a fake MIDIAccess */
export function setMidiAccessForTests(fake: MIDIAccess): void {
  access = fake
}
