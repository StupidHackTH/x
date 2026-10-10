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
});
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
      const now = Date.now();
      const first = qProject.get(device)?.first_at ?? now;
      upsertProject.run(device, clip(body.team, 40), clip(body.members, 200), clip(body.project, 60), clip(body.description, 300), clip(body.link, 200), clip(body.needs, 120), now, first);
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
