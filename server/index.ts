// SHTX-NET NOC server: Elysia on Bun + SQLite. Phones report cards and links here; the /noc page watches /api/live.
// Everything a phone can do offline still works without this; the server only makes the stage screen possible.
//   bun install && NET_ADMIN_TOKEN=secret bun index.ts        (PORT defaults to 8787, DB to ./shtx-net.sqlite)
import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { Database } from 'bun:sqlite';

const PORT = Number(process.env.PORT ?? 8787);
const TLS_PORT = Number(process.env.TLS_PORT ?? 8443);
const TLS_CERT = process.env.TLS_CERT ?? ''; // with TLS_KEY: also serve HTTPS on TLS_PORT (e.g. a Let's Encrypt fullchain.pem)
const TLS_KEY = process.env.TLS_KEY ?? '';
const ADMIN = process.env.NET_ADMIN_TOKEN ?? '';
const db = new Database(process.env.NET_DB ?? 'shtx-net.sqlite', { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS nodes (mac TEXT PRIMARY KEY, nick TEXT NOT NULL, skill TEXT NOT NULL DEFAULT '', idea TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS links (a TEXT NOT NULL, b TEXT NOT NULL, via TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b));
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, mac TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS hunt (device TEXT NOT NULL, key TEXT NOT NULL, nick TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, PRIMARY KEY (device, key));
  CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

/* Pause switches (survive restarts): while paused the server refuses new links / finds and every screen shows it */
const qSetting = db.query<{ v: string }, [string]>('SELECT v FROM settings WHERE k = ?');
const setSetting = db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
const pauseState = () => ({ hunt: qSetting.get('pause.hunt')?.v === '1', net: qSetting.get('pause.net')?.v === '1' });

/* Drawdy Logo Hunting: the six product keys, as SHA-256 of the printed key (same list as src/data/hunt.ts) */
const HUNT: { id: string; name: string; hash: string }[] = [
  { id: 'k1', name: 'Recycle Bin', hash: 'e7822b577b7065240606fa98e24398735af63b470331f473ea7f17203797a036' },
  { id: 'k2', name: 'My Computer', hash: '6d800f149c94130dc5ef3adf71298fdd9de66ced2e1feabd769d490169c2afde' },
  { id: 'k3', name: 'Desktop', hash: '89ebb198348516fb06f869b5dcf2a407ecc024b3a15dc20f31e93ea0ac120e3c' },
  { id: 'k4', name: 'C:\\Windows\\System32', hash: '32fc53e6e4525b0b7e406ef3ab205a22a6044681e4ebe93d2f6dfebab86e7be6' },
  { id: 'k5', name: 'Downloads', hash: 'f285ac2970164637f20cd1be9f2d36aa6989c134b90e15f7ca98236e58a7896e' },
  { id: 'k6', name: 'Program Files', hash: '3eb9158e52e4110f8ef8e87732b2d799f7da3ab2f1ef175ed58a6c73e78f0729' },
];
const huntCert = (device: string) => 'ACT-' + new Bun.CryptoHasher('sha256').update(`${device}|${HUNT.map((h) => h.id).join(',')}`).digest('hex').slice(0, 6).toUpperCase();
const qHuntAll = db.query<{ device: string; key: string; nick: string; at: number }, []>('SELECT device, key, nick, at FROM hunt ORDER BY at');
const qHuntDevice = db.query<{ key: string }, [string]>('SELECT key FROM hunt WHERE device = ? ORDER BY at');
const insertFind = db.query('INSERT OR IGNORE INTO hunt (device, key, nick, at) VALUES (?, ?, ?, ?)');
const huntState = () => {
  const rows = qHuntAll.all();
  const keys = HUNT.map((h) => {
    const finds = rows.filter((r) => r.key === h.id);
    return { id: h.id, name: h.name, finds: finds.length, first: finds[0] ? { nick: finds[0].nick, at: finds[0].at } : null };
  });
  const byDevice = new Map<string, { nick: string; keys: Set<string>; at: number }>();
  for (const r of rows) {
    const d = byDevice.get(r.device) ?? { nick: r.nick, keys: new Set<string>(), at: 0 };
    d.keys.add(r.key);
    d.nick = r.nick || d.nick;
    d.at = Math.max(d.at, r.at);
    byDevice.set(r.device, d);
  }
  const completed = Array.from(byDevice.entries()).filter(([, d]) => d.keys.size === HUNT.length).map(([device, d]) => ({ nick: d.nick, cert: huntCert(device), at: d.at })).sort((a, b) => a.at - b.at);
  return { keys, completed, devices: byDevice.size };
};

const started = Date.now();

const normMac = (s: string): string | null => {
  const hex = s.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return hex.length === 12 ? hex.match(/../g)!.join(':') : null;
};
const clip = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

type Node = { mac: string; nick: string; skill: string; idea: string; at: number };
const qNode = db.query<Node, [string]>('SELECT mac, nick, skill, idea, at FROM nodes WHERE mac = ?');
const qNodes = db.query<Node, []>('SELECT mac, nick, skill, idea, at FROM nodes ORDER BY at');
const qLinks = db.query<{ a: string; b: string; via: string; at: number }, []>('SELECT a, b, via, at FROM links ORDER BY at');
const qLinksOf = db.query<Node & { via: string; lat: number }, [string, string]>(
  'SELECT n.mac, n.nick, n.skill, n.idea, n.at, l.via, l.at AS lat FROM links l JOIN nodes n ON n.mac = CASE WHEN l.a = ?1 THEN l.b ELSE l.a END WHERE l.a = ?1 OR l.b = ?2 ORDER BY l.at DESC',
);
const qEvents = db.query<{ type: string; mac: string; detail: string; at: number }, []>('SELECT type, mac, detail, at FROM events ORDER BY id DESC LIMIT 60');
const qCrc = db.query<{ n: number | null }, []>("SELECT SUM(CAST(detail AS INTEGER)) AS n FROM events WHERE type = 'crc'");
const qPackets = db.query<{ n: number | null }, []>("SELECT SUM(CASE via WHEN 'air' THEN 3 ELSE 1 END) AS n FROM links");
const upsertNode = db.query('INSERT INTO nodes (mac, nick, skill, idea, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(mac) DO UPDATE SET nick = excluded.nick, skill = excluded.skill, idea = excluded.idea');
const insertLink = db.query('INSERT OR IGNORE INTO links (a, b, via, at) VALUES (?, ?, ?, ?)');
const insertEvent = db.query('INSERT INTO events (type, mac, detail, at) VALUES (?, ?, ?, ?)');

const state = () => ({
  nodes: qNodes.all(),
  links: qLinks.all(),
  events: qEvents.all(),
  stats: { packets: qPackets.get()?.n ?? 0, crc: qCrc.get()?.n ?? 0, started },
  pause: pauseState(),
});

/* live feed */
const sockets = new Set<{ send(data: string): unknown }>();
const broadcast = (msg: object) => {
  const s = JSON.stringify(msg);
  for (const ws of sockets) {
    try {
      ws.send(s);
    } catch {
      sockets.delete(ws);
    }
  }
};

/* a very small rate limit: 120 requests / minute / IP */
const buckets = new Map<string, { n: number; t: number }>();
const limited = (ip: string) => {
  const now = Date.now();
  const b = buckets.get(ip) ?? { n: 0, t: now };
  if (now - b.t > 60_000) {
    b.n = 0;
    b.t = now;
  }
  b.n++;
  buckets.set(ip, b);
  return b.n > 120;
};

const app = new Elysia()
  .use(cors())
  .onBeforeHandle(({ request, server, set }) => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || server?.requestIP(request)?.address || 'unknown';
    if (limited(ip)) {
      set.status = 429;
      return { error: 'slow down, it is 300 baud' };
    }
  })
  .get('/', () => ({ name: 'SHTX-NET NOC', hosts: qNodes.all().length, links: qLinks.all().length, uptimeMs: Date.now() - started }))
  .get('/api/state', () => state())
  .get('/api/nodes/:mac', ({ params, set }) => {
    const mac = normMac(params.mac);
    const n = mac && qNode.get(mac);
    if (!n) {
      set.status = 404;
      return { error: 'no such host' };
    }
    return n;
  })
  .get('/api/nodes/:mac/links', ({ params, set }) => {
    const mac = normMac(params.mac);
    if (!mac) {
      set.status = 400;
      return { error: 'bad mac' };
    }
    return { links: qLinksOf.all(mac, mac).map((r) => ({ mac: r.mac, nick: r.nick, skill: r.skill, idea: r.idea, via: r.via, at: r.lat })) };
  })
  .post(
    '/api/nodes',
    ({ body, set }) => {
      const mac = normMac(body.mac);
      if (!mac) {
        set.status = 400;
        return { error: 'bad mac' };
      }
      const node: Node = { mac, nick: clip(body.nick, 24) || mac.slice(-5), skill: clip(body.skill, 40), idea: clip(body.idea, 120), at: qNode.get(mac)?.at ?? Date.now() };
      upsertNode.run(node.mac, node.nick, node.skill, node.idea, node.at);
      broadcast({ type: 'node', node });
      return node;
    },
    { body: t.Object({ mac: t.String({ maxLength: 32 }), nick: t.String({ maxLength: 64 }), skill: t.Optional(t.String({ maxLength: 128 })), idea: t.Optional(t.String({ maxLength: 256 })) }) },
  )
  .post(
    '/api/links',
    ({ body, set }) => {
      const a0 = normMac(body.a);
      const b0 = normMac(body.b);
      if (!a0 || !b0 || a0 === b0) {
        set.status = 400;
        return { error: 'bad pair' };
      }
      if (pauseState().net) {
        set.status = 423;
        return { error: 'paused' };
      }
      const [a, b] = a0 < b0 ? [a0, b0] : [b0, a0];
      for (const m of [a, b]) if (!qNode.get(m)) upsertNode.run(m, m.slice(-5), '', '', Date.now());
      const at = Date.now();
      const r = insertLink.run(a, b, body.via, at);
      const fresh = r.changes > 0;
      if (fresh) {
        const link = { a, b, via: body.via, at };
        insertEvent.run('link', a, `${qNode.get(a)?.nick} <-> ${qNode.get(b)?.nick} ESTABLISHED via ${body.via}`, at);
        broadcast({ type: 'link', link, nodes: [qNode.get(a), qNode.get(b)] });
        broadcast({ type: 'event', event: { type: 'link', mac: a, detail: `${qNode.get(a)?.nick} <-> ${qNode.get(b)?.nick} ESTABLISHED via ${body.via}`, at } });
      }
      return { ok: true, fresh, link: { a, b, via: body.via, at } };
    },
    { body: t.Object({ a: t.String({ maxLength: 32 }), b: t.String({ maxLength: 32 }), via: t.Union([t.Literal('air'), t.Literal('qr'), t.Literal('manual')]), proof: t.Optional(t.Any()) }) },
  )
  .post(
    '/api/events',
    ({ body, query, set }) => {
      const type = body.type;
      if (type === 'bsod' && (!ADMIN || query.token !== ADMIN)) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const ev = { type, mac: normMac(body.mac ?? '') ?? '', detail: clip(body.detail, 160), at: Date.now() };
      insertEvent.run(ev.type, ev.mac, ev.detail, ev.at);
      broadcast({ type: 'event', event: ev });
      return { ok: true };
    },
    { body: t.Object({ type: t.Union([t.Literal('crc'), t.Literal('collision'), t.Literal('timeout'), t.Literal('bsod'), t.Literal('note')]), mac: t.Optional(t.String({ maxLength: 32 })), detail: t.Optional(t.String({ maxLength: 512 })) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .get('/api/admin/check', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'wrong password' };
    }
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .delete('/api/nodes/:mac', ({ params, query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    const mac = normMac(params.mac);
    if (!mac) {
      set.status = 400;
      return { error: 'bad mac' };
    }
    const nick = qNode.get(mac)?.nick ?? mac;
    db.query('DELETE FROM links WHERE a = ? OR b = ?').run(mac, mac);
    db.query('DELETE FROM nodes WHERE mac = ?').run(mac);
    insertEvent.run('note', mac, `host ${nick} removed by staff`, Date.now());
    broadcast({ type: 'state', state: state() });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .post('/api/reset', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.exec('DELETE FROM links; DELETE FROM nodes; DELETE FROM events;');
    broadcast({ type: 'state', state: state() });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .get('/api/pause', () => pauseState())
  .post(
    '/api/pause',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      if (body.hunt !== undefined) setSetting.run('pause.hunt', body.hunt ? '1' : '0');
      if (body.net !== undefined) setSetting.run('pause.net', body.net ? '1' : '0');
      const pause = pauseState();
      insertEvent.run('note', '', `pause: hunt=${pause.hunt ? 'on' : 'off'} net=${pause.net ? 'on' : 'off'}`, Date.now());
      broadcast({ type: 'pause', pause });
      return pause;
    },
    { body: t.Object({ hunt: t.Optional(t.Boolean()), net: t.Optional(t.Boolean()) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .get('/api/hunt', () => huntState())
  .post(
    '/api/hunt/find',
    ({ body, set }) => {
      if (pauseState().hunt) {
        set.status = 423;
        return { error: 'paused' };
      }
      const spot = HUNT.find((h) => h.id === body.key);
      if (!spot || spot.hash !== body.proof.toLowerCase()) {
        set.status = 400;
        return { error: 'bad key' };
      }
      const device = clip(body.device, 40);
      const nick = clip(body.nick, 24);
      if (!device) {
        set.status = 400;
        return { error: 'no device' };
      }
      const at = Date.now();
      const r = insertFind.run(device, spot.id, nick, at);
      const found = qHuntDevice.all(device).map((x) => x.key);
      const complete = found.length === HUNT.length;
      if (r.changes > 0) {
        const detail = `${nick || device.slice(-5)} found ${spot.name}${complete ? ' — ACTIVATED' : ''}`;
        insertEvent.run('hunt', '', detail, at);
        broadcast({ type: 'hunt', find: { nick, key: spot.id, name: spot.name, at, complete } });
        broadcast({ type: 'event', event: { type: 'hunt', mac: '', detail, at } });
      }
      return { ok: true, fresh: r.changes > 0, found, complete, cert: complete ? huntCert(device) : undefined };
    },
    { body: t.Object({ device: t.String({ maxLength: 64 }), nick: t.Optional(t.String({ maxLength: 64 })), key: t.String({ maxLength: 8 }), proof: t.String({ maxLength: 64 }) }) },
  )
  .delete('/api/hunt', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.exec('DELETE FROM hunt;');
    broadcast({ type: 'hunt', reset: true });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .ws('/api/live', {
    open(ws) {
      sockets.add(ws);
      ws.send(JSON.stringify({ type: 'state', state: state() }));
    },
    close(ws) {
      sockets.delete(ws);
    },
    message() {
      /* read-only feed */
    },
  })
  .listen(PORT);

console.log(`SHTX-NET NOC server on http://localhost:${app.server?.port} (admin token ${ADMIN ? 'set' : 'NOT set: /api/reset and bsod disabled'})`);

/* Same app on a second, TLS port when certificate files are given (the box has no free 80/443 for a reverse proxy) */
if (TLS_CERT && TLS_KEY) {
  if ((await Bun.file(TLS_CERT).exists()) && (await Bun.file(TLS_KEY).exists())) {
    const tls = new Elysia().use(app).listen({ port: TLS_PORT, tls: { cert: Bun.file(TLS_CERT), key: Bun.file(TLS_KEY) } });
    console.log(`…and https on port ${tls.server?.port}`);
  } else console.log(`TLS files not found yet (${TLS_CERT}); serving plain http only. Restart after the certificate is issued.`);
}
