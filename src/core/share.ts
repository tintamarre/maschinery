import type { Project } from './types'

/** Project <-> URL-safe string (gzip + base64url). Samples are never included. */

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const buf = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream)).arrayBuffer()
  return new Uint8Array(buf)
}

/** drop empty patterns so links stay short; migrate() puts them back */
function slim(p: Project): unknown {
  return {
    ...p,
    groups: p.groups.map((g) => ({
      ...g,
      patterns: g.patterns.map((pat) => (pat.events.length || pat.auto.length || pat.bars > 1 ? { bars: pat.bars, events: pat.events, auto: pat.auto } : null)),
    })),
  }
}

export async function encodeProject(p: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(slim(p)))
  return toBase64Url(await pipe(json, new CompressionStream('gzip')))
}

export async function decodeProject(text: string): Promise<unknown> {
  const json = await pipe(fromBase64Url(text), new DecompressionStream('gzip'))
  return JSON.parse(new TextDecoder().decode(json)) as unknown
}

/** latency estimate from a tap-along test: median of (tap - click - output latency), in ms */
export function estimateLatency(taps: number[], clicks: number[], outputLatency: number): number | null {
  const offsets: number[] = []
  for (const t of taps) {
    let best = clicks[0]!
    for (const c of clicks) if (Math.abs(c - t) < Math.abs(best - t)) best = c
    const off = t - best - outputLatency
    if (Math.abs(off) < 0.25) offsets.push(off * 1000)
  }
  if (offsets.length < 5) return null
  offsets.sort((a, b) => a - b)
  const mid = Math.floor(offsets.length / 2)
  return Math.round(offsets.length % 2 ? offsets[mid]! : (offsets[mid - 1]! + offsets[mid]!) / 2)
}
