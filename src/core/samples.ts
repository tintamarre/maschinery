/** Sample registry (decoded buffers), IndexedDB persistence, WAV encoding, mic recording. */

export const sampleBuffers = new Map<string, AudioBuffer>()

const DB_NAME = 'maschinery'
const STORE = 'samples'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbPut(id: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(data, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function dbGet(id: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined)
    req.onerror = () => reject(req.error)
  })
}

export function newSampleId(): string {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const n = channels[0]!.length
  const ch = channels.length
  const buf = new ArrayBuffer(44 + n * ch * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * ch * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, ch, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * ch * 2, true)
  v.setUint16(32, ch * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * ch * 2, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  return buf
}

export function bufferToWav(b: AudioBuffer): ArrayBuffer {
  const chans: Float32Array[] = []
  for (let c = 0; c < b.numberOfChannels; c++) chans.push(b.getChannelData(c))
  return encodeWav(chans, b.sampleRate)
}

let decodeCtx: AudioContext | null = null
function decoder(): AudioContext {
  decodeCtx ??= new AudioContext()
  return decodeCtx
}

/** decode an audio file / blob, register it and persist it. Returns the new sample id. */
export async function addSampleFromData(data: ArrayBuffer, id = newSampleId(), persist = true): Promise<string> {
  const buf = await decoder().decodeAudioData(data.slice(0))
  sampleBuffers.set(id, buf)
  if (persist) await dbPut(id, bufferToWav(buf))
  return id
}

export async function addSampleFromBuffer(buf: AudioBuffer, id = newSampleId()): Promise<string> {
  sampleBuffers.set(id, buf)
  await dbPut(id, bufferToWav(buf))
  return id
}

export async function restoreSamples(ids: string[]): Promise<void> {
  for (const id of ids) {
    if (sampleBuffers.has(id)) continue
    try {
      const data = await dbGet(id)
      if (data) await addSampleFromData(data, id, false)
    } catch { /* missing sample, the pad just stays silent */ }
  }
}

export async function sampleToBase64(id: string): Promise<string | null> {
  const b = sampleBuffers.get(id)
  if (!b) return null
  const bytes = new Uint8Array(bufferToWav(b))
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function sampleFromBase64(id: string, b64: string): Promise<void> {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  await addSampleFromData(bytes.buffer, id)
}

/** trim leading / trailing silence (threshold in linear amplitude) */
export function trimSilence(buf: AudioBuffer, threshold = 0.01): AudioBuffer {
  const d = buf.getChannelData(0)
  let a = 0
  let b = d.length - 1
  while (a < b && Math.abs(d[a]!) < threshold) a++
  while (b > a && Math.abs(d[b]!) < threshold) b--
  a = Math.max(0, a - 64)
  b = Math.min(d.length - 1, b + 256)
  if (b - a < 64) return buf
  const out = decoder().createBuffer(buf.numberOfChannels, b - a + 1, buf.sampleRate)
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(a, b + 1))
  return out
}

/** simple energy-based onset detection, returns slice start positions in 0..1 */
export function detectOnsets(buf: AudioBuffer, maxSlices = 16): number[] {
  const d = buf.getChannelData(0)
  const win = 512
  const energies: number[] = []
  for (let i = 0; i + win < d.length; i += win) {
    let e = 0
    for (let j = 0; j < win; j++) e += d[i + j]! * d[i + j]!
    energies.push(e / win)
  }
  const flux = energies.map((e, i) => Math.max(0, e - (energies[i - 1] ?? 0)))
  const sorted = [...flux].sort((x, y) => y - x)
  const thr = Math.max(sorted[Math.min(maxSlices * 2, sorted.length - 1)] ?? 0, 1e-6)
  const minGap = Math.floor((0.05 * buf.sampleRate) / win)
  const onsets: number[] = [0]
  let last = -minGap
  flux.forEach((f, i) => {
    if (f >= thr && i - last >= minGap && onsets.length < maxSlices) {
      onsets.push((i * win) / d.length)
      last = i
    }
  })
  return onsets.sort((x, y) => x - y)
}

export class MicRecorder {
  private stream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.chunks = []
    this.rec = new MediaRecorder(this.stream)
    this.rec.ondataavailable = (e) => this.chunks.push(e.data)
    this.rec.start()
  }

  stop(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (!this.rec) return reject(new Error('not recording'))
      this.rec.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        const blob = new Blob(this.chunks)
        resolve(await blob.arrayBuffer())
      }
      this.rec.stop()
    })
  }
}
