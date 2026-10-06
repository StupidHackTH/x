// Simulates SHTX-NET handshakes over a noisy acoustic channel: three phones share the air; A dials, B is next to it,
// C is across the room (faint). Both A and B must reach ESTABLISHED, C must stand down. Run: npm run net:sim
import { encodePcm, buildFrame, FskDecoder, airtimeMs, FSK_DEFAULTS } from '../src/scripts/fsk';
import { NetNode, type ModemLike, type Established, type PeerCard } from '../src/scripts/netproto';
import { packMac, formatMac } from '../src/data/network';

const SR = 48000;
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

interface Phone { name: string; node: NetNode; dec: FskDecoder; gainFrom: Record<string, number>; established?: Established; card?: PeerCard; log: string[] }
const phones: Phone[] = [];
let busyUntil = 0;
const now = () => Date.now();
let collisions = 0;

/* The air: a frame sent by `from` is heard by every other phone at its own gain, with room noise. */
function makeModem(from: () => Phone): ModemLike {
  return {
    async waitForQuiet() {
      while (now() < busyUntil) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 200));
    },
    async send(payload) {
      const me = from();
      const pcm = encodePcm(buildFrame(payload), SR);
      const ms = airtimeMs(payload.length);
      if (now() < busyUntil) collisions++;
      busyUntil = now() + ms;
      for (const p of phones) {
        if (p === me) continue;
        const g = p.gainFrom[me.name] ?? 0;
        const air = new Float32Array(pcm.length + SR / 4);
        for (let i = 0; i < air.length; i++) air[i] = 0.02 * gauss();
        for (let i = 0; i < pcm.length; i++) air[i + SR / 8] += g * pcm[i];
        setTimeout(() => { for (let i = 0; i < air.length; i += 2048) p.dec.push(air.subarray(i, i + 2048)); }, ms);
      }
      await new Promise((r) => setTimeout(r, ms));
    },
  };
}

function phone(name: string, nick: string, online: boolean, gainFrom: Record<string, number>): Phone {
  const p: Phone = { name, gainFrom, log: [] } as Phone;
  const me = { mac: packMac([1, 2, 3, 4, 5]), nick, skill: `${nick}-skill`, idea: `ไอเดียของ ${nick}` };
  p.node = new NetNode(me, makeModem(() => p), {
    log: (line, kind) => p.log.push(`[${name}] ${kind.padEnd(4)} ${line}`),
    onState: () => {},
    onEstablished: (l) => (p.established = l),
    onCard: (c) => (p.card = c),
    online: () => online,
  });
  p.dec = new FskDecoder(SR, FSK_DEFAULTS, (payload, level) => p.node.receive(payload, level));
  phones.push(p);
  return p;
}

async function scenario(title: string, online: boolean) {
  phones.length = 0;
  collisions = 0;
  const A = phone('A', 'โขง', online, { B: 0.5, C: 0.03 });
  const B = phone('B', 'ไท', online, { A: 0.5, C: 0.03 });
  const C = phone('C', 'Far', online, { A: 0.03, B: 0.03 });
  const t0 = now();
  A.node.connect();
  const deadline = now() + 40_000;
  while (now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    const done = A.established && B.established && (!A.established.needCards || (A.card && B.card));
    if (done) break;
  }
  const ok = !!A.established && !!B.established && !C.established && C.node.state === 'idle' && (!A.established?.needCards || (!!A.card && !!B.card));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${title}  (${((now() - t0) / 1000).toFixed(1)} s, collisions=${collisions}, C ignored ${C.node.stats.ignoredFar} faint SYN)`);
  for (const p of phones) for (const l of p.log) console.log('   ', l);
  if (A.established) console.log('    A sees peer', formatMac(A.established.peer), A.established.nick, A.card ? `card: ${A.card.skill}` : '(card via server)');
  if (B.established) console.log('    B sees peer', formatMac(B.established.peer), B.established.nick, B.card ? `card: ${B.card.skill}` : '(card via server)');
  return ok;
}

const results = [await scenario('both online: 3-way handshake only', true), await scenario('offline: handshake + cards beamed over the air', false)];
console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
