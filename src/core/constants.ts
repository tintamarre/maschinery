export const PPQ = 96
export const STEP = 24 // ticks per 16th
export const BAR = 384
export const NUM_GROUPS = 8
export const NUM_SOUNDS = 16
export const NUM_PATTERNS = 16
export const NUM_SCENES = 16

export const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const GROUP_COLORS = ['#ff4d6d', '#ff9e00', '#ffd60a', '#7bd389', '#2ec4b6', '#4cc9f0', '#7b6cf6', '#d65db1']

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const SCALES: Record<string, number[]> = {
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'Pentatonic Major': [0, 2, 4, 7, 9],
  'Pentatonic Minor': [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
}

export const REPEAT_RATES = [
  { label: '1/4', ticks: 96 },
  { label: '1/4T', ticks: 64 },
  { label: '1/8', ticks: 48 },
  { label: '1/8T', ticks: 32 },
  { label: '1/16', ticks: 24 },
  { label: '1/16T', ticks: 16 },
  { label: '1/32', ticks: 12 },
  { label: '1/32T', ticks: 8 },
]

export const QUANTIZE = [
  { label: 'Off', ticks: 0 },
  { label: '1/4', ticks: 96 },
  { label: '1/8', ticks: 48 },
  { label: '1/16', ticks: 24 },
  { label: '1/32', ticks: 12 },
]

export const DELAY_DIVS = [
  { label: '1/16', beats: 0.25 },
  { label: '1/8', beats: 0.5 },
  { label: '1/8.', beats: 0.75 },
  { label: '1/4', beats: 1 },
  { label: '1/4.', beats: 1.5 },
  { label: '1/2', beats: 2 },
]

export const MIDI_BASE_NOTE = 36
export const CHORD_QUALITIES = ['Triads', '7ths', 'Power', 'Sus']

/** Pad index 0..15 (pad 1 = bottom-left) to computer keyboard key. */
export const PAD_KEYS = ['z', 'x', 'c', 'v', 'a', 's', 'd', 'f', 'q', 'w', 'e', 'r', '1', '2', '3', '4']

export function noteName(semitone: number): string {
  const n = ((semitone % 12) + 12) % 12
  return NOTE_NAMES[n]! + (Math.floor(semitone / 12) + 3)
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
