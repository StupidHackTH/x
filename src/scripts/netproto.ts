// SHTX-NET wire protocol on top of the FSK modem (fsk.ts) and the handshake state machine.
// Framework-free so the whole thing runs in Node for simulation (see scripts/net-sim.ts).
import { macEquals, formatMac, LIMITS, clampBytes } from '../data/network';

const T = { SYN: 1, SYNACK: 2, ACK: 3, CARD: 4, PING: 5 } as const;
export const FLAG_ONLINE = 1; // "I can fetch your card from the server, no need to beam it"

export type Frame =
  | { type: 'syn'; mac: Uint8Array; seq: number; flags: number; nick: string }
  | { type: 'synack'; mac: Uint8Array; seq: number; ack: number; flags: number; nick: string }
  | { type: 'ack'; mac: Uint8Array; peer: Uint8Array; ack: number }
  | { type: 'card'; mac: Uint8Array; peer: Uint8Array; skill: string; idea: string }
  | { type: 'ping'; mac: Uint8Array; nick: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

function str(s: string, maxBytes: number): Uint8Array {
  const b = enc.encode(clampBytes(s, maxBytes));
  const out = new Uint8Array(b.length + 1);
  out[0] = b.length;
  out.set(b, 1);
  return out;
}
function cat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function encodeFrame(f: Frame): Uint8Array {
  switch (f.type) {
    case 'syn':
      return cat([T.SYN, f.flags & 0xff], f.mac, [f.seq & 0xff], str(f.nick, LIMITS.nickBytes));
    case 'synack':
      return cat([T.SYNACK, f.flags & 0xff], f.mac, [f.seq & 0xff, f.ack & 0xff], str(f.nick, LIMITS.nickBytes));
    case 'ack':
      return cat([T.ACK, 0], f.mac, f.peer, [f.ack & 0xff]);
    case 'card':
      return cat([T.CARD, 0], f.mac, f.peer, str(f.skill, LIMITS.skillBytes), str(f.idea, LIMITS.ideaBytes));
    case 'ping':
      return cat([T.PING, 0], f.mac, str(f.nick, LIMITS.nickBytes));
  }
}

export function decodeFrame(b: Uint8Array): Frame | null {
  try {
    let p = 2;
    const mac = () => {
      const m = b.slice(p, p + 6);
      p += 6;
      if (m.length !== 6) throw new Error('short');
      return m;
    };
    const byte = () => {
      if (p >= b.length) throw new Error('short');
      return b[p++];
    };
    const text = () => {
      const n = byte();
      const s = dec.decode(b.slice(p, p + n));
      p += n;
      return s;
    };
    const flags = b[1];
    switch (b[0]) {
      case T.SYN: {
        const m = mac();
        const seq = byte();
        return { type: 'syn', mac: m, seq, flags, nick: text() };
      }
      case T.SYNACK: {
        const m = mac();
        const seq = byte();
        const ack = byte();
        return { type: 'synack', mac: m, seq, ack, flags, nick: text() };
      }
      case T.ACK: {
        const m = mac();
        const peer = mac();
        return { type: 'ack', mac: m, peer, ack: byte() };
      }
      case T.CARD: {
        const m = mac();
        const peer = mac();
        const skill = text();
        return { type: 'card', mac: m, peer, skill, idea: text() };
      }
      case T.PING: {
        const m = mac();
        return { type: 'ping', mac: m, nick: text() };
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/* ---------- handshake state machine ---------- */

export interface ModemLike {
  send(payload: Uint8Array): Promise<void>;
  waitForQuiet(maxMs?: number): Promise<void>;
}

export interface Identity {
  mac: Uint8Array;
  nick: string;
  skill: string;
  idea: string;
}

export interface Established {
  peer: Uint8Array;
  nick: string;
  initiator: boolean;
  seq: number; // ours
  ack: number; // theirs
  needCards: boolean;
}

export interface PeerCard {
  peer: Uint8Array;
  skill: string;
  idea: string;
}

export type LogKind = 'tx' | 'rx' | 'info' | 'ok' | 'err';

export interface NodeHooks {
  log(line: string, kind: LogKind): void;
  onState(state: NodeState): void;
  onEstablished(link: Established): void;
  onCard(card: PeerCard): void;
  online(): boolean;
}

export type NodeState = 'idle' | 'syn_sent' | 'ack_sent' | 'synack_sent' | 'established';

export const TIMING = {
  synTimeout: 9000,
  synRetries: 2,
  synackTimeout: 7000,
  synackRetries: 1,
  cardTimeout: 9000,
  /* after the first SYN-ACK, keep listening this long and pick the loudest (= nearest) answerer */
  synackWindow: 1500,
  /* a frame quieter than this came from a phone across the room: ignore it (near-field "bump" rule) */
  minSynLevel: 0.05,
};

interface Candidate {
  mac: Uint8Array;
  nick: string;
  seq: number;
  flags: number;
  level: number;
}

export class NetNode {
  state: NodeState = 'idle';
  private seq = 0;
  private peer: Uint8Array | null = null;
  private peerNick = '';
  private peerSeq = 0;
  private peerOnline = false;
  private initiator = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private cardSent = false;
  private cardGot = false;
  private candidates: Candidate[] = [];
  sending = false;
  minSynLevel = TIMING.minSynLevel;
  stats = { tx: 0, rx: 0, ignoredFar: 0, timeouts: 0 };

  constructor(
    public me: Identity,
    private modem: ModemLike,
    private hooks: NodeHooks,
  ) {}

  /* our current sequence number (tests craft ACKs against it) */
  get currentSeq() {
    return this.seq;
  }

  private setState(s: NodeState) {
    this.state = s;
    this.hooks.onState(s);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private after(ms: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(fn, ms);
  }

  private flags() {
    return this.hooks.online() ? FLAG_ONLINE : 0;
  }

  private async tx(f: Frame, label: string) {
    this.sending = true;
    try {
      await this.modem.waitForQuiet();
      this.hooks.log(label, 'tx');
      await this.modem.send(encodeFrame(f));
      this.stats.tx++;
    } finally {
      this.sending = false;
    }
  }

  /* Tap "Connect": become the initiator */
  connect() {
    if (this.state === 'syn_sent' || this.state === 'synack_sent') return;
    this.initiator = true;
    this.seq = Math.floor(Math.random() * 256);
    this.attempts = 0;
    this.peer = null;
    this.candidates = [];
    this.setState('syn_sent');
    this.hooks.log(`Dialing… hold the phones close together`, 'info');
    void this.sendSyn();
  }

  cancel() {
    this.clearTimer();
    if (this.state !== 'established') this.setState('idle');
  }

  /* Back to listening after a session; keeps nothing of the old peer */
  reset() {
    this.clearTimer();
    this.peer = null;
    this.cardSent = this.cardGot = false;
    this.setState('idle');
  }

  private async sendSyn() {
    this.attempts++;
    await this.tx({ type: 'syn', mac: this.me.mac, seq: this.seq, flags: this.flags(), nick: this.me.nick }, `SYN seq=${this.seq} → broadcast`);
    if (this.state !== 'syn_sent') return;
    this.after(TIMING.synTimeout, () => {
      if (this.state !== 'syn_sent') return;
      if (this.attempts <= TIMING.synRetries) {
        this.stats.timeouts++;
        this.hooks.log(`Request timed out. Retrying (${this.attempts}/${TIMING.synRetries})…`, 'err');
        void this.sendSyn();
      } else {
        this.hooks.log('No SYN-ACK. Destination host unreachable. (ลองวางมือถือใกล้กว่านี้ หรือใช้ QR)', 'err');
        this.setState('idle');
      }
    });
  }

  private async sendSynAck() {
    this.attempts++;
    await this.tx(
      { type: 'synack', mac: this.me.mac, seq: this.seq, ack: this.peerSeq, flags: this.flags(), nick: this.me.nick },
      `SYN-ACK seq=${this.seq} ack=${this.peerSeq} → ${formatMac(this.peer!)}`,
    );
    if (this.state !== 'synack_sent') return;
    this.after(TIMING.synackTimeout, () => {
      if (this.state !== 'synack_sent') return;
      if (this.attempts <= TIMING.synackRetries) {
        this.stats.timeouts++;
        this.hooks.log('No ACK yet. Resending SYN-ACK…', 'err');
        void this.sendSynAck();
      } else {
        this.hooks.log('Handshake abandoned (no ACK).', 'err');
        this.reset();
      }
    });
  }

  /* Initiator: the SYN-ACK window closed; ACK the loudest answerer and drop the rest */
  private pickPeer() {
    if (this.state !== 'syn_sent' || !this.candidates.length) return;
    const best = this.candidates.reduce((a, b) => (b.level > a.level ? b : a));
    this.peer = best.mac;
    this.peerNick = best.nick;
    this.peerSeq = best.seq;
    this.peerOnline = !!(best.flags & FLAG_ONLINE);
    this.cardSent = this.cardGot = false;
    this.candidates = [];
    this.setState('ack_sent');
    void this.sendAck().then(() => {
      if (this.state === 'ack_sent') this.establish();
    });
  }

  private async sendAck() {
    await this.tx({ type: 'ack', mac: this.me.mac, peer: this.peer!, ack: this.peerSeq }, `ACK ack=${this.peerSeq} → ${formatMac(this.peer!)}`);
  }

  private async sendCard() {
    this.cardSent = true;
    await this.tx({ type: 'card', mac: this.me.mac, peer: this.peer!, skill: this.me.skill, idea: this.me.idea }, `CARD → ${formatMac(this.peer!)} (${this.me.skill})`);
  }

  private establish() {
    this.clearTimer();
    const needCards = !(this.hooks.online() && this.peerOnline);
    this.setState('established');
    this.hooks.log(`CONNECTION ESTABLISHED with ${this.peerNick} [${formatMac(this.peer!)}]`, 'ok');
    this.hooks.onEstablished({ peer: this.peer!, nick: this.peerNick, initiator: this.initiator, seq: this.seq, ack: this.peerSeq, needCards });
    if (needCards) {
      this.hooks.log('Peer or self offline: beaming business cards over the air…', 'info');
      if (this.initiator) void this.sendCard();
      this.after(TIMING.cardTimeout, () => {
        if (this.state !== 'established' || this.cardGot) return;
        if (this.initiator && !this.cardGot) void this.sendCard();
        else if (!this.initiator && !this.cardSent) void this.sendCard();
      });
    }
  }

  /* Feed every decoded frame here; level is the received signal level (0..1) */
  receive(payload: Uint8Array, level: number) {
    const f = decodeFrame(payload);
    if (!f) {
      this.hooks.log('Garbage frame (decoder OK, protocol no)', 'err');
      return;
    }
    this.stats.rx++;
    if (macEquals(f.mac, this.me.mac)) return; // our own echo
    switch (f.type) {
      case 'syn': {
        if (level < this.minSynLevel) {
          this.stats.ignoredFar++;
          this.hooks.log(`SYN from ${f.nick} too faint (level ${level.toFixed(3)}) — not for us`, 'info');
          return;
        }
        if (this.state === 'established' && this.peer && macEquals(f.mac, this.peer) && f.seq === this.peerSeq && !this.initiator) {
          void this.sendSynAck(); // our SYN-ACK was lost; they're retrying
          return;
        }
        if (this.state === 'syn_sent') {
          // simultaneous open: the lower MAC yields and becomes the responder
          if (compareMac(this.me.mac, f.mac) < 0) {
            this.hooks.log('Simultaneous open: yielding, becoming responder', 'info');
            this.clearTimer();
          } else return;
        } else if (this.state !== 'idle' && this.state !== 'established') return; // ack_sent / synack_sent: busy
        this.hooks.log(`SYN from ${f.nick} [${formatMac(f.mac)}] seq=${f.seq} level=${level.toFixed(2)}`, 'rx');
        this.initiator = false;
        this.peer = f.mac;
        this.peerNick = f.nick;
        this.peerSeq = f.seq;
        this.peerOnline = !!(f.flags & FLAG_ONLINE);
        this.seq = Math.floor(Math.random() * 256);
        this.attempts = 0;
        this.cardSent = this.cardGot = false;
        this.setState('synack_sent');
        void this.sendSynAck();
        return;
      }
      case 'synack': {
        if (this.state === 'syn_sent' && f.ack === this.seq) {
          if (level < this.minSynLevel) {
            this.stats.ignoredFar++;
            this.hooks.log(`SYN-ACK from ${f.nick} too faint (level ${level.toFixed(3)}) — across the room, ignoring`, 'info');
            return;
          }
          this.hooks.log(`SYN-ACK from ${f.nick} [${formatMac(f.mac)}] seq=${f.seq} ack=${f.ack} level=${level.toFixed(2)}`, 'rx');
          this.candidates.push({ mac: f.mac, nick: f.nick, seq: f.seq, flags: f.flags, level });
          if (this.candidates.length === 1) this.after(TIMING.synackWindow, () => this.pickPeer());
          else this.hooks.log(`${this.candidates.length} hosts answered; will take the nearest`, 'info');
        } else if ((this.state === 'established' || this.state === 'ack_sent') && this.peer && macEquals(f.mac, this.peer) && f.ack === this.seq) {
          if (this.state === 'established') void this.sendAck(); // our ACK was lost
        }
        return;
      }
      case 'ack': {
        if (!macEquals(f.peer, this.me.mac)) {
          // someone else got the connection; if we were courting the same initiator, stand down
          if (this.state === 'synack_sent' && this.peer && macEquals(f.mac, this.peer)) {
            this.hooks.log('Initiator ACKed another host. Standing down.', 'info');
            this.reset();
          }
          return;
        }
        if (this.state === 'synack_sent' && this.peer && macEquals(f.mac, this.peer) && f.ack === this.seq) {
          this.hooks.log(`ACK from ${formatMac(f.mac)} ack=${f.ack}`, 'rx');
          this.establish();
        }
        return;
      }
      case 'card': {
        if (!macEquals(f.peer, this.me.mac) || !this.peer || !macEquals(f.mac, this.peer)) return;
        this.hooks.log(`CARD from ${formatMac(f.mac)}: ${f.skill} — ${f.idea}`, 'rx');
        this.cardGot = true;
        this.hooks.onCard({ peer: f.mac, skill: f.skill, idea: f.idea });
        if (!this.cardSent) void this.sendCard();
        else this.clearTimer();
        return;
      }
      case 'ping':
        this.hooks.log(`PING from ${f.nick} [${formatMac(f.mac)}] level=${level.toFixed(2)}`, 'rx');
        return;
    }
  }

  async ping() {
    await this.tx({ type: 'ping', mac: this.me.mac, nick: this.me.nick }, 'PING → broadcast (test tone)');
  }
}

export function compareMac(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
