// SHTX-NET NOC server: Elysia on Bun + SQLite. Phones report cards and links here; the /noc page watches /api/live.
// Everything a phone can do offline still works without this; the server only makes the stage screen possible.
//   bun install && NET_ADMIN_TOKEN=secret bun index.ts        (PORT defaults to 8787, DB to ./shtx-net.sqlite)
import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { Database } from 'bun:sqlite';

const PORT = Number(process.env.PORT ?? 8787);
const ADMIN = process.env.NET_ADMIN_TOKEN ?? '';
const db = new Database(process.env.NET_DB ?? 'shtx-net.sqlite', { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS nodes (mac TEXT PRIMARY KEY, nick TEXT NOT NULL, skill TEXT NOT NULL DEFAULT '', idea TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS links (a TEXT NOT NULL, b TEXT NOT NULL, via TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b));
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, mac TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
`);
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
  .post('/api/reset', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.exec('DELETE FROM links; DELETE FROM nodes; DELETE FROM events;');
    broadcast({ type: 'state', state: state() });
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
