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
  CREATE TABLE IF NOT EXISTS prizes (id TEXT PRIMARY KEY, item TEXT NOT NULL, tier TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL DEFAULT 1, cost REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', pos INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS awards (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, place INTEGER NOT NULL DEFAULT 0, mac TEXT NOT NULL DEFAULT '', nick TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '', prize_id TEXT NOT NULL DEFAULT '', item TEXT NOT NULL DEFAULT '', qty INTEGER NOT NULL DEFAULT 1, weight REAL NOT NULL DEFAULT 0, ord INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, revealed INTEGER NOT NULL DEFAULT 0, claimed INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS gacha_pulls (id INTEGER PRIMARY KEY AUTOINCREMENT, team TEXT NOT NULL, count INTEGER NOT NULL, prizes TEXT NOT NULL, at INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS gacha_drawn (id TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS bingo (device TEXT PRIMARY KEY, nick TEXT NOT NULL DEFAULT '', lines INTEGER NOT NULL DEFAULT 0, cells INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS votes (device TEXT PRIMARY KEY, target TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (device TEXT PRIMARY KEY, team TEXT NOT NULL, members TEXT NOT NULL DEFAULT '', project TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', needs TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, first_at INTEGER NOT NULL);
`);

/* Pause switches (survive restarts): while paused the server refuses new links / finds and every screen shows it */
const qSetting = db.query<{ v: string }, [string]>('SELECT v FROM settings WHERE k = ?');
const setSetting = db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
const pauseState = () => ({
  hunt: qSetting.get('pause.hunt')?.v === '1',
  net: qSetting.get('pause.net')?.v === '1',
  submit: qSetting.get('pause.submit')?.v === '1',
  vote: qSetting.get('vote.open')?.v === '1',
  update: Number(qSetting.get('update.at')?.v ?? 0),
  updateMsg: qSetting.get('update.msg')?.v ?? '',
  voteUrl: qSetting.get('vote.url')?.v ?? '', // Uddy's popular-voting app (https://github.com/WasinUddy/shtx-voting), set by staff from the NOC
  dp: deadPixel(),
  awards: awardsState(), // phones re-fetch their prize when `revealed` changes
});

/* ---- Prizes (synced from Grist) and awards: places 1-3 by vote, everyone else by lucky draw ---- */
type Prize = { id: string; item: string; tier: string; count: number; cost: number; note: string; pos: number };
type Award = { id: number; kind: string; place: number; mac: string; nick: string; team: string; prize_id: string; item: string; qty: number; weight: number; ord: number; at: number; revealed: number; claimed: number };
const POOL_TIERS = ['T3', 'ของแจกกลางทาง']; // lucky-draw pool: the Grist sheet uses T3 for everyday giveaways
const POOL_TIER = POOL_TIERS[0];
const isPool = (tier: string) => POOL_TIERS.includes(tier);
const qPrizes = db.query<Prize, []>('SELECT * FROM prizes ORDER BY pos');
const insertPrize = db.query('INSERT INTO prizes (id, item, tier, count, cost, note, pos) VALUES (?, ?, ?, ?, ?, ?, ?)');
const qAwards = db.query<Award, []>('SELECT * FROM awards ORDER BY ord');
const qAwardsMine = db.query<Award, [string]>('SELECT * FROM awards WHERE mac = ? AND revealed = 1 ORDER BY ord');
const insertAward = db.query('INSERT INTO awards (kind, place, mac, nick, team, prize_id, item, qty, weight, ord, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const qHuntCounts = db.query<{ device: string; c: number }, []>('SELECT device, COUNT(*) c FROM hunt GROUP BY device');
const qBingoLines = db.query<{ device: string; lines: number }, []>('SELECT device, lines FROM bingo');
function awardsState() {
  const a = qAwards.all();
  return { total: a.length, revealed: a.filter((x) => x.revealed).length, claimed: a.filter((x) => x.claimed).length };
}
const pubAward = (a: Award) => ({ id: a.id, kind: a.kind, place: a.place, mac: a.mac, nick: a.nick, team: a.team, prize_id: a.prize_id, item: a.item, qty: a.qty, claimed: !!a.claimed });
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function weightedPick(items: { w: number }[]): number {
  let r = rnd() * items.reduce((s, x) => s + x.w, 0);
  for (let i = 0; i < items.length; i++) {
    r -= items[i].w;
    if (r <= 0) return i;
  }
  return items.length - 1;
}
/* ---- gacha helpers: Grist Prize table (doc id from GRIST_DOC; the doc is link-editable so no key is needed, GRIST_API_KEY optional) ---- */
const GRIST_HOST = (process.env.GRIST_HOST ?? 'https://grist.creatorsgarten.org').replace(/\/$/, '');
const GRIST_DOC = process.env.GRIST_DOC ?? '';
const GRIST_KEY = process.env.GRIST_API_KEY ?? '';
type GachaTier = 'T1' | 'T2' | 'T3';
type GachaPrize = { id: string; name: string; tier: GachaTier; amount: number; image?: string; base?: string; reveal: boolean; remaining: number };
type GristRow = { Item?: string; Final_Prize_Tier?: string; Status?: string; Reward_amount?: number; PriceID?: unknown; Image_link?: string; Video_link?: string };
let gristCache: { at: number; rows: GristRow[] } | null = null;
async function gristRows(): Promise<GristRow[]> {
  if (!GRIST_DOC) throw new Error('GRIST_DOC is not set on the server');
  if (gristCache && Date.now() - gristCache.at < 15_000) return gristCache.rows;
  const r = await fetch(`${GRIST_HOST}/api/docs/${GRIST_DOC}/tables/Prize/records`, { headers: GRIST_KEY ? { authorization: `Bearer ${GRIST_KEY}` } : {}, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`grist HTTP ${r.status}`);
  const rows = ((await r.json()) as { records: { fields: GristRow }[] }).records.map((x) => x.fields);
  gristCache = { at: Date.now(), rows };
  return rows;
}
const qGachaDrawn = db.query<{ id: string; n: number }, []>('SELECT id, n FROM gacha_drawn');
const qGachaPulls = db.query<{ id: number; team: string; count: number; prizes: string; at: number; claimed: number }, []>('SELECT * FROM gacha_pulls ORDER BY id');
async function gachaPrizes(): Promise<GachaPrize[]> {
  const drawn = new Map(qGachaDrawn.all().map((d) => [d.id, d.n]));
  return (await gristRows())
    .filter((f) => /^T[123]$/.test(f.Final_Prize_Tier ?? '') && f.Status !== 'Rejected' && Number(f.Reward_amount) > 0 && (f.Item ?? '').trim())
    .map((f) => {
      const base = f.Video_link?.trim() ? f.Video_link.trim().replace(/reveal\.mp4$/, '') : undefined;
      const id = base ? base.split('/').filter(Boolean).pop()! : String(f.PriceID ?? f.Item);
      const amount = Number(f.Reward_amount);
      return { id, name: (f.Item ?? '').trim(), tier: f.Final_Prize_Tier as GachaTier, amount, image: f.Image_link?.trim() || undefined, base, reveal: !!base, remaining: Math.max(0, amount - (drawn.get(id) ?? 0)) };
    });
}
function gachaRates(): Record<GachaTier, number> {
  try {
    const r = JSON.parse(qSetting.get('gacha.rates')?.v || 'null');
    if (r && typeof r.T1 === 'number') return r;
  } catch {
    /* ignore */
  }
  return { T1: 0.06, T2: 0.24, T3: 0.7 };
}
function gachaDrawOne(prizes: GachaPrize[], rates: Record<GachaTier, number>): GachaPrize | null {
  const order: GachaTier[] = ['T1', 'T2', 'T3'];
  const avail = order.filter((t) => prizes.some((p) => p.tier === t && p.remaining > 0));
  if (!avail.length) return null;
  let r = rnd() * avail.reduce((s, t) => s + rates[t], 0);
  const tier = avail.find((t) => (r -= rates[t]) < 0) ?? avail[avail.length - 1];
  const items = prizes.filter((p) => p.tier === tier && p.remaining > 0);
  let k = rnd() * items.reduce((s, p) => s + p.remaining, 0);
  const item = items.find((p) => (k -= p.remaining) < 0) ?? items[items.length - 1];
  item.remaining--;
  return item;
}

/* Everyone registered on SHTX-NET with at least minLinks links, one entry per person (duplicate nicks keep the best-linked device), test nodes dropped */
function drawParticipants(minLinks: number, exclude: string[]) {
  const deg = new Map<string, number>();
  const air = new Map<string, number>();
  for (const l of qLinks.all()) {
    deg.set(l.a, (deg.get(l.a) ?? 0) + 1);
    deg.set(l.b, (deg.get(l.b) ?? 0) + 1);
    if (l.via === 'air') {
      air.set(l.a, (air.get(l.a) ?? 0) + 1);
      air.set(l.b, (air.get(l.b) ?? 0) + 1);
    }
  }
  const hunt = new Map(qHuntCounts.all().map((h) => [h.device, h.c]));
  const bingo = new Map(qBingoLines.all().map((b) => [b.device, b.lines]));
  const ex = new Set(exclude.map((m) => m.toUpperCase()));
  const byNick = new Map<string, { mac: string; nick: string; deg: number; w: number }>();
  for (const n of qNodes.all()) {
    const d = deg.get(n.mac) ?? 0;
    if (d < minLinks || ex.has(n.mac.toUpperCase()) || /^(ทดสอบ|test)/i.test(n.nick.trim())) continue;
    const key = n.nick.trim().toLowerCase() || n.mac;
    const w = 1 + (air.get(n.mac) ?? 0) + ((hunt.get(n.mac) ?? 0) >= 6 ? 3 : 0) + 2 * (bingo.get(n.mac) ?? 0); // bonus-round lottery weight
    const prev = byNick.get(key);
    if (!prev || d > prev.deg) byNick.set(key, { mac: n.mac, nick: n.nick, deg: d, w });
  }
  return Array.from(byNick.values());
}
type DeadPixel = { round: number; at: number; deadline: number; macs: string[] };
function deadPixel(): DeadPixel | null {
  try {
    return JSON.parse(qSetting.get('deadpixel')?.v || 'null');
  } catch {
    return null;
  }
}
const qAirSince = db.query<{ c: number }, [string, string, number]>("SELECT COUNT(*) c FROM links WHERE (a = ? OR b = ?) AND via = 'air' AND at > ?");
const qActiveMacs = db.query<{ mac: string }, [number]>('SELECT DISTINCT n.mac FROM nodes n JOIN links l ON l.a = n.mac OR l.b = n.mac WHERE l.at > ?');
const qBingo = db.query<{ device: string; nick: string; lines: number; cells: number; at: number }, []>('SELECT device, nick, lines, cells, at FROM bingo ORDER BY cells DESC, lines DESC, at ASC');
const qBingoOne = db.query<{ lines: number; cells: number }, [string]>('SELECT lines, cells FROM bingo WHERE device = ?');
const upsertBingo = db.query('INSERT INTO bingo (device, nick, lines, cells, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(device) DO UPDATE SET nick = excluded.nick, lines = excluded.lines, cells = excluded.cells, at = excluded.at');
const qVotes = db.query<{ device: string; target: string; at: number }, []>('SELECT device, target, at FROM votes ORDER BY at');
const upsertVote = db.query('INSERT INTO votes (device, target, at) VALUES (?, ?, ?) ON CONFLICT(device) DO UPDATE SET target = excluded.target, at = excluded.at');
type Project = { device: string; team: string; members: string; project: string; description: string; link: string; needs: string; at: number; first_at: number };
const qProjects = db.query<Project, []>('SELECT * FROM projects ORDER BY first_at');
const qProject = db.query<Project, [string]>('SELECT * FROM projects WHERE device = ?');
const upsertProject = db.query('INSERT INTO projects (device, team, members, project, description, link, needs, at, first_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device) DO UPDATE SET team = excluded.team, members = excluded.members, project = excluded.project, description = excluded.description, link = excluded.link, needs = excluded.needs, at = excluded.at');
const projectList = () => qProjects.all().map((p, i) => ({ ...p, order: i + 1 }));

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
const huntHints = (): Record<string, string> => {
  try {
    return JSON.parse(qSetting.get('hunt.hints')?.v || '{}');
  } catch {
    return {};
  }
};
const huntState = () => {
  const rows = qHuntAll.all();
  const hints = huntHints();
  const keys = HUNT.map((h) => {
    const finds = rows.filter((r) => r.key === h.id);
    return { id: h.id, name: h.name, hint: hints[h.id] ?? null, finds: finds.length, first: finds[0] ? { nick: finds[0].nick, at: finds[0].at } : null };
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
      if (body.submit !== undefined) setSetting.run('pause.submit', body.submit ? '1' : '0');
      if (body.vote !== undefined) setSetting.run('vote.open', body.vote ? '1' : '0');
      if (body.voteUrl !== undefined) {
        const u = clip(body.voteUrl, 300);
        if (u && !/^https?:\/\//i.test(u)) {
          set.status = 400;
          return { error: 'voteUrl must start with http(s)://' };
        }
        setSetting.run('vote.url', u);
        insertEvent.run('note', '', u ? `popular vote link set: ${u}` : 'popular vote link cleared', Date.now());
      }
      if (body.update) {
        setSetting.run('update.at', String(Date.now()));
        setSetting.run('update.msg', clip(body.updateMsg, 140));
        insertEvent.run('note', '', `Windows Update pushed to every phone: ${clip(body.updateMsg, 140) || '(default message)'}`, Date.now());
      }
      const pause = pauseState();
      insertEvent.run('note', '', `pause: hunt=${pause.hunt ? 'on' : 'off'} net=${pause.net ? 'on' : 'off'}`, Date.now());
      broadcast({ type: 'pause', pause });
      return pause;
    },
    { body: t.Object({ hunt: t.Optional(t.Boolean()), net: t.Optional(t.Boolean()), submit: t.Optional(t.Boolean()), vote: t.Optional(t.Boolean()), voteUrl: t.Optional(t.String({ maxLength: 400 })), update: t.Optional(t.Boolean()), updateMsg: t.Optional(t.String({ maxLength: 200 })) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  /* The host with the most QR links (and at least 10) gets "ransomwared": the phone must do real air handshakes to recover */
  .get('/api/ransom', () => {
    const counts = new Map<string, number>();
    for (const l of qLinks.all()) {
      if (l.via !== 'qr') continue;
      counts.set(l.a, (counts.get(l.a) ?? 0) + 1);
      counts.set(l.b, (counts.get(l.b) ?? 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((x, y) => y[1] - x[1])[0];
    if (!top || top[1] < 10) return { macs: [], top: null };
    return { macs: [top[0]], top: { mac: top[0], nick: qNode.get(top[0])?.nick ?? '', qr: top[1] } };
  })
  /* Project submissions for pitching: one per device, resubmit = update, order = first submission time */
  .get('/api/projects', () => ({ projects: projectList() }))
  .get('/api/projects.txt', ({ set }) => {
    // team names in pitching order, one per line: paste into the popular-voting admin (Uddy's app) as the team list
    set.headers['content-type'] = 'text/plain; charset=utf-8';
    return projectList().map((p) => p.team).join('\n') + '\n';
  })
  .get('/api/projects.csv', ({ set }) => {
    set.headers['content-type'] = 'text/csv; charset=utf-8';
    set.headers['content-disposition'] = 'attachment; filename="shtx-projects.csv"';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = projectList().map((p) => [p.order, p.team, p.members, p.project, p.description, p.link, p.needs, new Date(p.first_at).toISOString(), new Date(p.at).toISOString(), p.device].map(esc).join(','));
    return '\ufeff' + ['order,team,members,project,description,link,needs,first_submitted,updated,device', ...rows].join('\n');
  })
  .post(
    '/api/projects',
    ({ body, set }) => {
      if (pauseState().submit) return { ok: false, error: 'closed' }; // 200 so the client can tell "closed" from "network failed"
      const device = clip(body.device, 40);
      if (!device) {
        set.status = 400;
        return { error: 'no device' };
      }
      const vals = { team: clip(body.team, 40), members: clip(body.members, 200), project: clip(body.project, 60), description: clip(body.description, 300), link: clip(body.link, 200), needs: clip(body.needs, 120) };
      const missing = Object.entries(vals).filter(([, v]) => !v).map(([k]) => k);
      if (missing.length) return { ok: false, error: 'missing', missing }; // every field is required
      const now = Date.now();
      const first = qProject.get(device)?.first_at ?? now;
      upsertProject.run(device, vals.team, vals.members, vals.project, vals.description, vals.link, vals.needs, now, first);
      const list = projectList();
      const mine = list.find((p) => p.device === device)!;
      insertEvent.run('note', '', `project ${first === now ? 'submitted' : 'updated'}: ${mine.team} — ${mine.project}`, now);
      broadcast({ type: 'project', project: mine });
      broadcast({ type: 'event', event: { type: 'note', mac: '', detail: `project ${first === now ? 'submitted' : 'updated'}: ${mine.team} — ${mine.project}`, at: now } });
      return { ok: true, order: mine.order };
    },
    { body: t.Object({ device: t.String({ maxLength: 64 }), team: t.String({ maxLength: 80 }), members: t.Optional(t.String({ maxLength: 400 })), project: t.String({ maxLength: 120 }), description: t.Optional(t.String({ maxLength: 600 })), link: t.Optional(t.String({ maxLength: 400 })), needs: t.Optional(t.String({ maxLength: 240 })) }) },
  )
  .delete('/api/projects/:device', ({ params, query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.query('DELETE FROM projects WHERE device = ?').run(params.device);
    broadcast({ type: 'project', removed: params.device });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  /* Most Stupid Project vote: one vote per device for a submitted project, changeable while voting is open */
  .get('/api/votes', () => {
    const counts = new Map<string, number>();
    for (const v of qVotes.all()) counts.set(v.target, (counts.get(v.target) ?? 0) + 1);
    const results = projectList()
      .map((p) => ({ device: p.device, team: p.team, project: p.project, votes: counts.get(p.device) ?? 0 }))
      .sort((a, b) => b.votes - a.votes);
    return { open: pauseState().vote, total: qVotes.all().length, results };
  })
  .post(
    '/api/vote',
    ({ body }) => {
      if (!pauseState().vote) return { ok: false, error: 'closed' };
      const device = clip(body.device, 40);
      const target = clip(body.target, 40);
      if (!device || !target) return { ok: false, error: 'bad' };
      if (device === target) return { ok: false, error: 'self' };
      const p = qProject.get(target);
      if (!p) return { ok: false, error: 'unknown' };
      upsertVote.run(device, target, Date.now());
      broadcast({ type: 'vote' });
      return { ok: true };
    },
    { body: t.Object({ device: t.String({ maxLength: 64 }), target: t.String({ maxLength: 64 }) }) },
  )
  .get('/api/votes.csv', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    set.headers['content-type'] = 'text/csv; charset=utf-8';
    set.headers['content-disposition'] = 'attachment; filename="shtx-votes.csv"';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = qVotes.all().map((v) => [v.device, qNode.get(v.device)?.nick ?? '', v.target, qProject.get(v.target)?.team ?? '', new Date(v.at).toISOString()].map(esc).join(','));
    return '\ufeff' + ['voter_device,voter_nick,target_device,target_team,at', ...rows].join('\n');
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .delete('/api/votes', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.query('DELETE FROM votes').run();
    insertEvent.run('note', '', 'votes cleared', Date.now());
    broadcast({ type: 'vote' });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  /* Packet Loss Bingo leaderboard */
  .get('/api/bingo', () => {
    const rows = qBingo.all();
    return { players: rows.length, bingos: rows.filter((r) => r.lines > 0).length, blackouts: rows.filter((r) => r.cells >= 8).length, top: rows.slice(0, 10).map((r) => ({ nick: r.nick || r.device, lines: r.lines, cells: r.cells, at: r.at })) };
  })
  .post(
    '/api/bingo',
    ({ body }) => {
      const device = clip(body.device, 40);
      if (!device) return { ok: false };
      const prev = qBingoOne.get(device);
      const lines = Math.max(0, Math.min(8, body.lines | 0));
      const cells = Math.max(0, Math.min(8, body.cells | 0));
      const nick = clip(body.nick, 12);
      const now = Date.now();
      upsertBingo.run(device, nick, lines, cells, now);
      const name = nick || device;
      if (cells >= 8 && (prev?.cells ?? 0) < 8) {
        insertEvent.run('note', '', `BLACKOUT: ${name} filled the whole bingo card`, now);
        broadcast({ type: 'event', event: { type: 'note', mac: '', detail: `BLACKOUT: ${name} filled the whole bingo card`, at: now } });
      } else if (lines > 0 && (prev?.lines ?? 0) === 0) {
        insertEvent.run('note', '', `BINGO: ${name} completed a line`, now);
        broadcast({ type: 'event', event: { type: 'note', mac: '', detail: `BINGO: ${name} completed a line`, at: now } });
      }
      broadcast({ type: 'bingo' });
      return { ok: true };
    },
    { body: t.Object({ device: t.String({ maxLength: 64 }), nick: t.Optional(t.String({ maxLength: 40 })), lines: t.Integer(), cells: t.Integer() }) },
  )
  .delete('/api/bingo', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.query('DELETE FROM bingo').run();
    broadcast({ type: 'bingo' });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  /* Dead Pixel: staff kill a few random active nodes; each must make one new AIR link before the deadline */
  .get('/api/deadpixel', () => {
    const dp = deadPixel();
    if (!dp) return null;
    return { ...dp, nodes: dp.macs.map((mac) => ({ mac, nick: qNode.get(mac)?.nick ?? mac, revived: (qAirSince.get(mac, mac, dp.at)?.c ?? 0) > 0 })) };
  })
  .post(
    '/api/deadpixel',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const count = Math.max(1, Math.min(20, body.count ?? 5));
      const minutes = Math.max(1, Math.min(120, body.minutes ?? 10));
      const now = Date.now();
      let pool = qActiveMacs.all(now - 3 * 3600 * 1000).map((r) => r.mac);
      if (pool.length < count) pool = qNodes.all().map((n) => n.mac);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const macs = pool.slice(0, count);
      const dp: DeadPixel = { round: (deadPixel()?.round ?? 0) + 1, at: now, deadline: now + minutes * 60_000, macs };
      setSetting.run('deadpixel', JSON.stringify(dp));
      const names = macs.map((m) => qNode.get(m)?.nick ?? m).join(', ');
      insertEvent.run('note', '', `DEAD PIXEL round ${dp.round}: ${names} — ${minutes} min to make a new AIR link`, now);
      broadcast({ type: 'event', event: { type: 'note', mac: '', detail: `DEAD PIXEL round ${dp.round}: ${names} — ${minutes} min to make a new AIR link`, at: now } });
      broadcast({ type: 'deadpixel' });
      return dp;
    },
    { body: t.Object({ count: t.Optional(t.Integer()), minutes: t.Optional(t.Integer()) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .delete('/api/deadpixel', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.query('DELETE FROM settings WHERE k = ?').run('deadpixel');
    broadcast({ type: 'deadpixel' });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .get('/api/prizes', () => {
    const prizes = qPrizes.all();
    const tickets: Record<string, number> = {};
    for (const x of prizes) tickets[x.tier || '(none)'] = (tickets[x.tier || '(none)'] ?? 0) + x.count;
    return { prizes, tickets, poolTier: POOL_TIER };
  })
  .post(
    '/api/prizes',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      db.transaction(() => {
        db.query('DELETE FROM prizes').run();
        body.prizes.forEach((p, i) => insertPrize.run(clip(p.id, 20) || `X${i}`, clip(p.item, 120), clip(p.tier, 40), Math.max(0, p.count ?? 1), Number(p.cost) || 0, clip(p.note, 200), i));
      })();
      const tickets = body.prizes.filter((p) => isPool(p.tier ?? '')).reduce((s, p) => s + Math.max(0, p.count ?? 1), 0);
      insertEvent.run('note', '', `prize list synced: ${body.prizes.length} items, ${tickets} lucky-draw tickets`, Date.now());
      broadcast({ type: 'prizes' });
      return { ok: true, items: body.prizes.length, tickets };
    },
    { body: t.Object({ prizes: t.Array(t.Object({ id: t.String(), item: t.String(), tier: t.Optional(t.String()), count: t.Optional(t.Integer()), cost: t.Optional(t.Number()), note: t.Optional(t.String()) })) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .get('/api/awards', () => ({ ...awardsState(), awards: qAwards.all().filter((a) => a.revealed).map(pubAward) }))
  .get('/api/awards/mine', ({ query }) => ({ awards: qAwardsMine.all(clip(query.mac, 40)).map(pubAward) }), { query: t.Object({ mac: t.String({ maxLength: 64 }) }) })
  .get('/api/awards/all', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    return { ...awardsState(), awards: qAwards.all().map((a) => ({ ...pubAward(a), revealed: !!a.revealed, weight: a.weight })), participants: drawParticipants(Number(query.minLinks ?? 1), []).length };
  }, { query: t.Object({ token: t.Optional(t.String()), minLinks: t.Optional(t.Numeric()) }) })
  .post(
    '/api/awards/places',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const prizes = qPrizes.all();
      const done: { place: number; team: string; items: string[] }[] = [];
      const places = [...body.places].filter((p) => p.device).sort((a, b) => a.place - b.place);
      const teams = places.map(({ place, device }) => ({ place, proj: qProject.get(clip(device, 40)) }));
      const bad = teams.find((t) => !t.proj);
      if (bad) return { ok: false, error: `unknown team device for place ${bad.place}` };
      db.query("DELETE FROM awards WHERE kind IN ('place', 'gacha')").run();
      if (body.mode === 'gacha') {
        // gacha: every placed team pulls from the combined T1+T2 pool, 1st place pulls first; luck decides who gets the fish tank
        const pool = shuffle(prizes.filter((p) => /^T[12]$/.test(p.tier)).flatMap((p) => Array.from({ length: p.count }, () => p)));
        const pulls = Math.max(1, Math.min(5, body.pulls ?? 1));
        if (pool.length < teams.length * pulls) return { ok: false, error: `gacha pool too small: ${pool.length} tickets in T1+T2 for ${teams.length * pulls} pulls` };
        for (const { place, proj } of teams) {
          const got = pool.splice(0, pulls);
          for (const it of got) insertAward.run('gacha', place, proj!.device, proj!.team, proj!.team, it.id, it.item, 1, 0, 1_000_000 + (10 - place), Date.now());
          done.push({ place, team: proj!.team, items: got.map((i) => i.item) });
        }
      } else {
        for (const { place, proj } of teams) {
          const items = prizes.filter((p) => p.tier === `T${place}` && !isPool(p.tier));
          if (!items.length) return { ok: false, error: `no prize with tier T${place} in the prize list (T3 is the lucky-draw pool; use gacha for 3 places)` };
          for (const it of items) insertAward.run('place', place, proj!.device, proj!.team, proj!.team, it.id, it.item, it.count, 0, 1_000_000 + (10 - place), Date.now());
          done.push({ place, team: proj!.team, items: items.map((i) => i.item) });
        }
      }
      insertEvent.run('note', '', `places awarded (${body.mode === 'gacha' ? 'gacha' : 'by tier'}): ${done.map((d) => `#${d.place} ${d.team} → ${d.items.join(' + ')}`).join(', ')}`, Date.now());
      broadcast({ type: 'awards' });
      return { ok: true, done, ...awardsState() };
    },
    { body: t.Object({ places: t.Array(t.Object({ place: t.Integer({ minimum: 0, maximum: 3 }), device: t.String({ maxLength: 64 }) })), mode: t.Optional(t.String()), pulls: t.Optional(t.Integer()) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .post(
    '/api/awards/draw',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const participants = shuffle(drawParticipants(body.minLinks ?? 1, body.exclude ?? []));
      const prizes = qPrizes.all();
      const tickets = shuffle(prizes.filter((p) => isPool(p.tier)).flatMap((p) => Array.from({ length: p.count }, () => p)));
      // T1/T2 items the placed teams did not take (gacha leftovers) become the first bonus-round prizes
      const used = new Map<string, number>();
      for (const a of qAwards.all()) if (a.kind === 'place' || a.kind === 'gacha') used.set(a.prize_id, (used.get(a.prize_id) ?? 0) + a.qty);
      const highLeft = shuffle(prizes.filter((p) => /^T[12]$/.test(p.tier)).flatMap((p) => Array.from({ length: Math.max(0, p.count - (used.get(p.id) ?? 0)) }, () => p)));
      if (!participants.length) return { ok: false, error: 'no participants' };
      if (tickets.length < participants.length && !body.force) return { ok: false, error: 'short', participants: participants.length, tickets: tickets.length, short: participants.length - tickets.length };
      const now = Date.now();
      db.transaction(() => {
        db.query("DELETE FROM awards WHERE kind IN ('draw', 'bonus')").run();
        const n = Math.min(participants.length, tickets.length);
        for (let i = 0; i < n; i++) insertAward.run('draw', 0, participants[i].mac, participants[i].nick, '', tickets[i].id, tickets[i].item, 1, participants[i].w, Math.floor(rnd() * 900_000), now);
        // leftover tickets: weighted lottery (air links, finished Logo Hunting, bingo lines) — a person can win a second prize here
        const pool = participants.map((p) => ({ ...p }));
        const bonusTickets = [...highLeft, ...tickets.slice(n)];
        for (let i = 0; i < bonusTickets.length && pool.length; i++) {
          const k = weightedPick(pool);
          insertAward.run('bonus', 0, pool[k].mac, pool[k].nick, '', bonusTickets[i].id, bonusTickets[i].item, 1, pool[k].w, 900_000 + i, now);
          pool.splice(k, 1);
        }
      })();
      const bonus = highLeft.length + Math.max(0, tickets.length - participants.length);
      insertEvent.run('note', '', `lucky draw: ${participants.length} people, ${tickets.length} tickets, ${bonus} bonus`, now);
      broadcast({ type: 'awards' });
      return { ok: true, participants: participants.length, tickets: tickets.length, bonus, unlucky: Math.max(0, participants.length - tickets.length), ...awardsState() };
    },
    { body: t.Object({ minLinks: t.Optional(t.Integer()), exclude: t.Optional(t.Array(t.String())), force: t.Optional(t.Boolean()) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .post(
    '/api/awards/reveal',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const pending = qAwards.all().filter((a) => !a.revealed);
      const batch = body.all ? pending : pending.slice(0, Math.max(1, body.n ?? 1));
      for (const a of batch) {
        db.query('UPDATE awards SET revealed = 1 WHERE id = ?').run(a.id);
        broadcast({ type: 'award', award: pubAward(a) });
        insertEvent.run('note', a.mac, a.kind === 'place' || a.kind === 'gacha' ? `🏆 #${a.place} ${a.team}: ${a.item}` : `🎁 ${a.nick} ← ${a.item}`, Date.now());
      }
      broadcast({ type: 'awards' });
      return { ok: true, items: batch.map(pubAward), ...awardsState() };
    },
    { body: t.Object({ n: t.Optional(t.Integer()), all: t.Optional(t.Boolean()) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .post(
    '/api/awards/claim',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const q = clip(body.who, 40).toLowerCase();
      const hits = qAwards.all().filter((a) => a.revealed && (String(a.id) === q || a.mac.toLowerCase() === q || a.nick.trim().toLowerCase() === q || a.team.trim().toLowerCase() === q));
      for (const a of hits) db.query('UPDATE awards SET claimed = ? WHERE id = ?').run(body.claimed === false ? 0 : 1, a.id);
      broadcast({ type: 'awards' });
      return { ok: true, matched: hits.map(pubAward), ...awardsState() };
    },
    { body: t.Object({ who: t.String({ maxLength: 64 }), claimed: t.Optional(t.Boolean()) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .delete('/api/awards', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.query('DELETE FROM awards').run();
    insertEvent.run('note', '', 'awards cleared', Date.now());
    broadcast({ type: 'awards' });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .get('/api/awards.csv', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    set.headers['content-type'] = 'text/csv; charset=utf-8';
    set.headers['content-disposition'] = 'attachment; filename="shtx-awards.csv"';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = qAwards.all().map((a) => [a.id, a.kind, a.place || '', a.nick, a.team, a.mac, a.prize_id, a.item, a.qty, a.revealed ? 'yes' : '', a.claimed ? 'yes' : '', new Date(a.at).toISOString()].map(esc).join(','));
    return '\ufeff' + ['id,kind,place,nick,team,mac,prize_id,item,qty,revealed,claimed,at', ...rows].join('\n');
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  /* ---- Prize gacha (stage page /gacha): the prize list is read live from Grist, draws/stock/log live here so a reload
     or a second screen cannot re-roll. Rates per tier (renormalised over tiers with stock), item weighted by what is left. ---- */
  .get('/api/gacha/prizes', async ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    try {
      const prizes = await gachaPrizes();
      return { prizes, rates: gachaRates(), pulls: qGachaPulls.all().length };
    } catch (e) {
      set.status = 502;
      return { error: `prize list: ${(e as Error).message}` };
    }
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .post(
    '/api/gacha/pull',
    async ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const prizes = await gachaPrizes();
      const rates = gachaRates();
      const count = Math.max(1, Math.min(20, body.count ?? 1));
      const got: GachaPrize[] = [];
      const demo = body.demo ? prizes.find((p) => p.id === body.demo && p.remaining > 0) : undefined;
      if (demo) {
        demo.remaining--;
        got.push(demo);
      }
      for (let i = got.length; i < count; i++) {
        const p = gachaDrawOne(prizes, rates);
        if (!p) break;
        got.push(p);
      }
      if (!got.length) return { ok: false, error: 'no stock left' };
      const now = Date.now();
      const team = clip(body.team, 60) || 'Team ?';
      db.transaction(() => {
        for (const p of got) db.query('INSERT INTO gacha_drawn (id, n) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET n = n + 1').run(p.id);
        db.query('INSERT INTO gacha_pulls (team, count, prizes, at) VALUES (?, ?, ?, ?)').run(team, got.length, JSON.stringify(got.map((p) => p.id)), now);
      })();
      const id = (db.query<{ id: number }, []>('SELECT last_insert_rowid() id').get()?.id) ?? 0;
      const detail = `🎰 ${team} pulled ${got.length}: ${got.map((p) => `${p.tier} ${p.name}`).join(', ')}`;
      insertEvent.run('note', '', detail, now);
      broadcast({ type: 'event', event: { type: 'note', mac: '', detail, at: now } });
      broadcast({ type: 'gacha' });
      return { ok: true, id, team, prizes: got.map((p) => p.id), at: now, remaining: Object.fromEntries(prizes.map((p) => [p.id, p.remaining])) };
    },
    { body: t.Object({ team: t.String({ maxLength: 80 }), count: t.Optional(t.Integer()), demo: t.Optional(t.String({ maxLength: 80 })) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .get('/api/gacha/log', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    return { pulls: qGachaPulls.all().map((r) => ({ ...r, prizes: JSON.parse(r.prizes) as string[], claimed: !!r.claimed })) };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .post('/api/gacha/claim', ({ body, query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.query('UPDATE gacha_pulls SET claimed = ? WHERE id = ?').run(body.claimed === false ? 0 : 1, body.id);
    broadcast({ type: 'gacha' });
    return { ok: true };
  }, { body: t.Object({ id: t.Integer(), claimed: t.Optional(t.Boolean()) }), query: t.Object({ token: t.Optional(t.String()) }) })
  .post('/api/gacha/rates', ({ body, query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    const r = { T1: Math.max(0, body.T1), T2: Math.max(0, body.T2), T3: Math.max(0, body.T3) };
    setSetting.run('gacha.rates', JSON.stringify(r));
    broadcast({ type: 'gacha' });
    return { ok: true, rates: gachaRates() };
  }, { body: t.Object({ T1: t.Number(), T2: t.Number(), T3: t.Number() }), query: t.Object({ token: t.Optional(t.String()) }) })
  .delete('/api/gacha', ({ query, set }) => {
    if (!ADMIN || query.token !== ADMIN) {
      set.status = 403;
      return { error: 'admin only' };
    }
    db.exec('DELETE FROM gacha_pulls; DELETE FROM gacha_drawn;');
    gristCache = null;
    insertEvent.run('note', '', 'gacha stock and log reset', Date.now());
    broadcast({ type: 'gacha' });
    return { ok: true };
  }, { query: t.Object({ token: t.Optional(t.String()) }) })
  .get('/api/hunt', () => huntState())
  .post(
    '/api/hunt/hints',
    ({ body, query, set }) => {
      if (!ADMIN || query.token !== ADMIN) {
        set.status = 403;
        return { error: 'admin only' };
      }
      const hints = huntHints();
      for (const [k, v] of Object.entries(body.hints)) if (HUNT.some((h) => h.id === k)) hints[k] = clip(v, 160);
      setSetting.run('hunt.hints', JSON.stringify(hints));
      broadcast({ type: 'hunt', hints: true });
      return { ok: true, hints };
    },
    { body: t.Object({ hints: t.Record(t.String(), t.String({ maxLength: 200 })) }), query: t.Object({ token: t.Optional(t.String()) }) },
  )
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

/* HTTPS reverse proxy in front of the popular-voting app (Uddy's shtx-voting container, plain http on the docker network)
   so the site can embed it without mixed content. Same Let's Encrypt cert, port VOTE_PROXY_PORT (8444). */
const VOTE_UPSTREAM = (process.env.VOTE_UPSTREAM ?? '').replace(/\/$/, '');
const VOTE_PROXY_PORT = Number(process.env.VOTE_PROXY_PORT ?? 8444);
if (VOTE_UPSTREAM && TLS_CERT && TLS_KEY) {
  const DROP_RES = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'upgrade'];
  Bun.serve({
    port: VOTE_PROXY_PORT,
    tls: { cert: Bun.file(TLS_CERT), key: Bun.file(TLS_KEY) },
    idleTimeout: 0, // SSE streams (/api/live, /api/obs) sit idle for minutes
    async fetch(req, server) {
      const url = new URL(req.url);
      const headers = new Headers(req.headers);
      headers.delete('accept-encoding'); // identity bodies only, so they can be passed through untouched
      headers.set('x-forwarded-proto', 'https');
      headers.set('x-forwarded-host', url.host); // Next.js compares this with Origin for server actions; Auth.js builds redirects from it
      headers.set('x-forwarded-for', server.requestIP(req)?.address ?? '');
      try {
        const up = await fetch(VOTE_UPSTREAM + url.pathname + url.search, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
          redirect: 'manual',
        });
        const h = new Headers(up.headers);
        for (const k of DROP_RES) h.delete(k);
        return new Response(up.body, { status: up.status, headers: h });
      } catch {
        return new Response('popular vote app is not running', { status: 502, headers: { 'content-type': 'text/plain' } });
      }
    },
  });
  console.log(`…popular vote proxy: https on port ${VOTE_PROXY_PORT} → ${VOTE_UPSTREAM}`);
}
