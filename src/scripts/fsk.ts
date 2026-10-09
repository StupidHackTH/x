// Audio FSK modem (Bell 103 spirit, 2000s dial-up sound). Pure DSP here so it can be unit-tested in Node;
// AudioModem at the bottom wires it to Web Audio. One frame on the wire:
//   250 ms mark tone · preamble (alternating 0/1) · UART-framed sync 0x7E · UART-framed [len][payload][crc16] · tail
// UART framing (start 0, 8 data bits MSB first, stop 1) guarantees a transition at least every 10 bits, which the
// receiver uses to keep its bit clock aligned.

export interface FskOptions {
  baud: number;
  f0: number; // Hz for a 0 bit (space)
  f1: number; // Hz for a 1 bit (mark)
  oversample: number; // soft-decision samples per bit
}
export const FSK_DEFAULTS: FskOptions = { baud: 300, f0: 2400, f1: 3400, oversample: 4 };

const SYNC = 0x7e;
const PREAMBLE_BITS = 48;
const LEAD_MS = 250;
export const MAX_PAYLOAD = 220;

/* CRC-16/CCITT-FALSE */
export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/* [len][payload][crc16] — what goes inside the UART framing */
export function buildFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_PAYLOAD) throw new Error(`payload too long: ${payload.length}`);
  const out = new Uint8Array(payload.length + 3);
  out[0] = payload.length;
  out.set(payload, 1);
  const crc = crc16(out.subarray(0, payload.length + 1));
  out[payload.length + 1] = crc >> 8;
  out[payload.length + 2] = crc & 0xff;
  return out;
}

export function frameBits(frame: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < PREAMBLE_BITS; i++) bits.push(i & 1);
  const uart = (b: number) => {
    bits.push(0);
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    bits.push(1);
  };
  uart(SYNC);
  for (const b of frame) uart(b);
  bits.push(1, 1, 1, 1);
  return bits;
}

/* How long a payload takes on the air, in ms */
export function airtimeMs(payloadLength: number, o: FskOptions = FSK_DEFAULTS): number {
  const bits = PREAMBLE_BITS + 10 * (payloadLength + 4) + 4;
  return LEAD_MS + (bits / o.baud) * 1000 + 20;
}

/* Phase-continuous FSK PCM for one frame */
export function encodePcm(frame: Uint8Array, sampleRate: number, o: FskOptions = FSK_DEFAULTS): Float32Array {
  const bits = frameBits(frame);
  const spb = sampleRate / o.baud;
  const lead = Math.round((sampleRate * LEAD_MS) / 1000);
  const total = lead + Math.ceil(bits.length * spb) + Math.round(sampleRate * 0.02);
  const pcm = new Float32Array(total);
  let phase = 0;
  let n = 0;
  const tone = (f: number, count: number) => {
    const inc = (2 * Math.PI * f) / sampleRate;
    for (let i = 0; i < count && n < total; i++) {
      pcm[n++] = Math.sin(phase);
      phase += inc;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
    }
  };
  tone(o.f1, lead);
  let acc = 0;
  for (const b of bits) {
    acc += spb;
    const count = Math.round(acc);
    acc -= count;
    tone(b ? o.f1 : o.f0, count);
  }
  const fade = Math.round(sampleRate * 0.005);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    pcm[i] *= g;
    pcm[total - 1 - i] *= g;
  }
  for (let i = 0; i < total; i++) pcm[i] *= 0.85;
  return pcm;
}

/* Soft-decision FSK demodulator with preamble lock, UART sync and simple clock tracking */
export class FskDecoder {
  private readonly N: number; // samples per bit (Goertzel window)
  private readonly stepLen: number; // samples between soft decisions
  private readonly c0: number;
  private readonly c1: number;
  private buf = new Float32Array(0);
  private pos = 0;
  private stepAcc = 0;
  private soft: number[] = [];
  private state: 'search' | 'bits' = 'search';
  private nextCenter = 0;
  private bitbuf: number[] = [];
  private synced = false;
  private bytes: number[] = [];
  private bitsSinceLock = 0;
  /* for the UI: input level 0..1 and whether a carrier is on the air */
  level = 0;
  busy = false;
  frames = 0;
  errors = 0;

  readonly sampleRate: number;
  readonly o: FskOptions;
  private readonly onFrame: (payload: Uint8Array, level: number) => void;
  private frameRms = 0;
  private frameSamples = 0;

  constructor(sampleRate: number, o: FskOptions = FSK_DEFAULTS, onFrame: (payload: Uint8Array, level: number) => void) {
    this.sampleRate = sampleRate;
    this.o = o;
    this.onFrame = onFrame;
    this.N = Math.round(sampleRate / o.baud);
    this.stepLen = sampleRate / o.baud / o.oversample;
    this.c0 = 2 * Math.cos((2 * Math.PI * o.f0) / sampleRate);
    this.c1 = 2 * Math.cos((2 * Math.PI * o.f1) / sampleRate);
  }

  push(chunk: Float32Array) {
    const merged = new Float32Array(this.buf.length - this.pos + chunk.length);
    merged.set(this.buf.subarray(this.pos));
    merged.set(chunk, this.buf.length - this.pos);
    this.buf = merged;
    this.pos = 0;
    while (this.pos + this.N <= this.buf.length) {
      this.decide(this.pos);
      this.stepAcc += this.stepLen;
      const adv = Math.floor(this.stepAcc);
      this.stepAcc -= adv;
      this.pos += adv;
    }
  }

  private decide(start: number) {
    const b = this.buf;
    const N = this.N;
    let s0a = 0, s0b = 0, s1a = 0, s1b = 0, sq = 0;
    for (let i = 0; i < N; i++) {
      const x = b[start + i];
      sq += x * x;
      const t0 = x + this.c0 * s0a - s0b; s0b = s0a; s0a = t0;
      const t1 = x + this.c1 * s1a - s1b; s1b = s1a; s1a = t1;
    }
    const p0 = s0a * s0a + s0b * s0b - this.c0 * s0a * s0b;
    const p1 = s1a * s1a + s1b * s1b - this.c1 * s1a * s1b;
    const rms = Math.sqrt(sq / N);
    const toneFrac = (p0 + p1) / ((N * N * rms * rms) / 2 + 1e-9);
    this.level = Math.min(1, rms * 4);
    this.busy = rms > 0.004 && toneFrac > 0.25;
    if (this.state === 'bits') {
      this.frameRms += rms;
      this.frameSamples++;
    }
    const s = (p1 - p0) / (p1 + p0 + 1e-9);
    this.soft.push(s);
    if (this.soft.length > 4096) {
      const cut = this.soft.length - 2048;
      this.soft = this.soft.slice(cut);
      this.nextCenter -= cut;
    }
    const i = this.soft.length - 1;
    if (this.state === 'search') this.searchPreamble(i);
    else if (i === this.nextCenter) this.takeBit(i);
  }

  private searchPreamble(i: number) {
    const os = this.o.oversample;
    const L = 24;
    if (i < L * os) return;
    let sign = Math.sign(this.soft[i]);
    if (Math.abs(this.soft[i]) < 0.3) return;
    for (let k = 1; k < L; k++) {
      const v = this.soft[i - k * os];
      sign = -sign;
      if (Math.abs(v) < 0.3 || Math.sign(v) !== sign) return;
    }
    this.state = 'bits';
    this.nextCenter = i + os;
    this.bitbuf = [];
    this.synced = false;
    this.bytes = [];
    this.bitsSinceLock = 0;
    this.frameRms = 0;
    this.frameSamples = 0;
  }

  private takeBit(c: number) {
    const os = this.o.oversample;
    const bit = this.soft[c] > 0 ? 1 : 0;
    // clock tracking: when the bit flipped, the zero crossing should sit half a bit before this center
    let next = c + os;
    const prev = this.bitbuf.length ? this.bitbuf[this.bitbuf.length - 1] : -1;
    if (prev >= 0 && prev !== bit && os >= 4) {
      const before = this.soft[c - os / 2 - 1];
      const after = this.soft[c - os / 2 + 1];
      const cur = bit ? 1 : -1;
      if (Math.sign(before) === cur) next -= 1; // crossing came early: we sample late
      else if (Math.sign(after) === -cur) next += 1; // crossing came late: we sample early
    }
    this.nextCenter = next;
    this.bitbuf.push(bit);
    this.bitsSinceLock++;
    if (!this.synced) {
      const n = this.bitbuf.length;
      if (n >= 10) {
        const w = this.bitbuf.slice(n - 10);
        const want = [0, 0, 1, 1, 1, 1, 1, 1, 0, 1];
        if (w.every((v, k) => v === want[k])) {
          this.synced = true;
          this.bitbuf = [];
          return;
        }
      }
      if (this.bitsSinceLock > PREAMBLE_BITS + 40) this.reset(false);
      return;
    }
    if (this.bitbuf.length < 10) return;
    const w = this.bitbuf;
    this.bitbuf = [];
    if (w[0] !== 0 || w[9] !== 1) return this.reset(true);
    let v = 0;
    for (let k = 1; k <= 8; k++) v = (v << 1) | w[k];
    this.bytes.push(v);
    const len = this.bytes[0];
    if (this.bytes.length === 1 && len > MAX_PAYLOAD) return this.reset(true);
    if (this.bytes.length === len + 3) {
      const frame = Uint8Array.from(this.bytes);
      const crc = (frame[len + 1] << 8) | frame[len + 2];
      if (crc === crc16(frame.subarray(0, len + 1))) {
        this.frames++;
        this.onFrame(frame.subarray(1, len + 1), this.frameSamples ? this.frameRms / this.frameSamples : 0);
        this.reset(false);
      } else this.reset(true);
    }
  }

  private reset(error: boolean) {
    if (error) this.errors++;
    this.state = 'search';
    this.bitbuf = [];
    this.bytes = [];
    this.synced = false;
  }
}

/* Web Audio wrapper: microphone in, speaker out, half duplex (the decoder is muted while we talk) */
export class AudioModem {
  ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private proc: ScriptProcessorNode | null = null;
  decoder: FskDecoder | null = null;
  sending = false;
  listening = false;
  onFrame: (payload: Uint8Array, level: number) => void = () => {};
  onLevel: (level: number, busy: boolean) => void = () => {};

  o: FskOptions;

  constructor(o: FskOptions = FSK_DEFAULTS) {
    this.o = o;
  }

  private async context() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  /* Needs a user gesture on iOS (mic permission + audio unlock) */
  async listen() {
    if (this.listening) return;
    const ctx = await this.context();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      video: false,
    });
    // iOS Safari suspends/interrupts a running context when the mic session starts: resume again afterwards
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    ctx.onstatechange = () => {
      if (this.listening && ctx.state !== 'running') void ctx.resume().catch(() => {});
    };
    const src = ctx.createMediaStreamSource(this.stream);
    this.decoder = new FskDecoder(ctx.sampleRate, this.o, (p, level) => this.onFrame(p, level));
    this.proc = ctx.createScriptProcessor(2048, 1, 1);
    this.proc.onaudioprocess = (e) => {
      const d = this.decoder!;
      if (!this.sending) d.push(e.inputBuffer.getChannelData(0).slice());
      this.onLevel(d.level, d.busy);
    };
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(this.proc);
    this.proc.connect(sink);
    sink.connect(ctx.destination);
    this.listening = true;
  }

  stop() {
    this.proc?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.proc = null;
    this.stream = null;
    this.listening = false;
  }

  get busy() {
    return !!this.decoder?.busy;
  }

  /* CSMA/CA: wait for a quiet channel (bounded), then a random slot */
  async waitForQuiet(maxMs = 3000) {
    const t0 = Date.now();
    while (this.busy && Date.now() - t0 < maxMs) await new Promise((r) => setTimeout(r, 80));
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 400));
  }

  async send(payload: Uint8Array) {
    const ctx = await this.context();
    const pcm = encodePcm(buildFrame(payload), ctx.sampleRate, this.o);
    const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buf.copyToChannel(pcm, 0);
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(ctx.destination);
    this.sending = true;
    await new Promise<void>((resolve) => {
      node.onended = () => resolve();
      node.start();
    });
    await new Promise((r) => setTimeout(r, 150));
    this.sending = false;
  }
}
