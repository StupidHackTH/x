// NOC screen logic: live state over WebSocket (+ polling fallback) from the SHTX-NET server, force-directed mesh,
// leaderboards, event ticker, periodic BSOD. With no server it runs a 60-host demo (what a full room looks like).
import { apiBase, api, type ServerState, type HuntState, type PauseState, type DeadPixelState, type Award } from './netapi';
import QRCode from 'qrcode';
import { icqFor, vendorFor } from '../data/network';
import { encodePcm, buildFrame } from './fsk';

interface Host { mac: string; nick: string; skill: string; idea: string; at: number; x: number; y: number; vx: number; vy: number; deg: number; born: number }
interface Edge { a: string; b: string; via: string; at: number; born: number }
interface Ev { type: string; mac: string; detail: string; at: number }

const hosts = new Map<string, Host>();
const edges = new Map<string, Edge>();
const events: Ev[] = [];
const started = Date.now();
let serverStarted = started;
let crc = 0;
let packets = 0;
let linksSinceBsod = 0;
let demo = false;
let sound = false;

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('noc-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function addHost(n: { mac: string; nick: string; skill?: string; idea?: string; at?: number }) {
  const h = hosts.get(n.mac);
  if (h) {
    h.nick = n.nick || h.nick;
    h.skill = n.skill ?? h.skill;
    h.idea = n.idea ?? h.idea;
    return h;
  }
  const r = Math.min(canvas.width, canvas.height) * 0.35;
  const ang = Math.random() * Math.PI * 2;
  const nh: Host = { mac: n.mac, nick: n.nick, skill: n.skill ?? '', idea: n.idea ?? '', at: n.at ?? Date.now(), x: canvas.width / 2 + Math.cos(ang) * r, y: canvas.height / 2 + Math.sin(ang) * r, vx: 0, vy: 0, deg: 0, born: performance.now() };
  hosts.set(n.mac, nh);
  return nh;
}

function addEdge(l: { a: string; b: string; via: string; at?: number }, announce = true) {
  const k = key(l.a, l.b);
  if (edges.has(k)) return;
  if (!hosts.has(l.a)) addHost({ mac: l.a, nick: l.a.slice(-5) });
  if (!hosts.has(l.b)) addHost({ mac: l.b, nick: l.b.slice(-5) });
  edges.set(k, { a: l.a, b: l.b, via: l.via, at: l.at ?? Date.now(), born: performance.now() });
  hosts.get(l.a)!.deg++;
  hosts.get(l.b)!.deg++;
  packets += l.via === 'air' ? 3 : 1;
  if (announce) {
    pushEvent({ type: 'link', mac: l.a, detail: `${hosts.get(l.a)!.nick} <-> ${hosts.get(l.b)!.nick} ESTABLISHED via ${l.via}`, at: Date.now() });
    if (sound) chirp();
    if (++linksSinceBsod >= 10) {
      linksSinceBsod = 0;
      bsod('SO_MANY_FRIENDS_IRQL_NOT_LESS_OR_EQUAL');
    }
  }
}

function pushEvent(e: Ev) {
  events.unshift(e);
  if (events.length > 80) events.pop();
  if (e.type === 'crc') crc += Number(e.detail) || 1;
  if (e.type === 'bsod') bsod(e.detail || 'FRIENDSHIP_PAGE_FAULT_IN_NONPAGED_AREA');
  renderTicker();
}

let pauseNow: PauseState = { hunt: false, net: false };
function renderPause(p: PauseState) {
  const voteChanged = pauseNow.vote !== p.vote;
  pauseNow = p;
  const bs = document.getElementById('adm-submit');
  if (bs) {
    bs.setAttribute('aria-pressed', String(!!p.submit));
    bs.textContent = p.submit ? 'Open submissions' : 'Close submissions';
  }
  const bv = document.getElementById('adm-vote');
  if (bv) {
    bv.setAttribute('aria-pressed', String(!!p.vote));
    bv.textContent = p.vote ? 'Close voting' : 'Open voting';
  }
  if (voteChanged) void loadVotes();
  renderVoteLink(p.voteUrl ?? '');
  const el = $('noc-paused');
  const what = [p.net ? 'SHTX-NET' : '', p.hunt ? 'Logo Hunting' : ''].filter(Boolean).join(' · ');
  el.hidden = !what;
  $('noc-paused-what').textContent = what ? `${what} หยุดชั่วคราว รอทีมงานประกาศ` : '';
  const bn = document.getElementById('adm-pause-net');
  const bh = document.getElementById('adm-pause-hunt');
  if (bn) {
    bn.setAttribute('aria-pressed', String(p.net));
    bn.textContent = p.net ? 'Resume SHTX-NET' : 'Pause SHTX-NET';
  }
  if (bh) {
    bh.setAttribute('aria-pressed', String(p.hunt));
    bh.textContent = p.hunt ? 'Resume hunt' : 'Pause hunt';
  }
}

function applyState(s: ServerState) {
  if (s.pause) renderPause(s.pause);
  // the server state is authoritative: drop hosts/links it no longer has (reset, kick), then merge
  const macs = new Set(s.nodes.map((n) => n.mac));
  for (const k of Array.from(hosts.keys())) if (!macs.has(k)) hosts.delete(k);
  const keys = new Set(s.links.map((l) => key(l.a, l.b)));
  for (const k of Array.from(edges.keys())) if (!keys.has(k)) edges.delete(k);
  for (const n of s.nodes) addHost(n);
  for (const l of s.links) addEdge(l, false);
  for (const h of hosts.values()) h.deg = 0;
  for (const e of edges.values()) {
    hosts.get(e.a)!.deg++;
    hosts.get(e.b)!.deg++;
  }
  crc = s.stats?.crc ?? crc;
  packets = Math.max(packets, s.stats?.packets ?? 0);
  serverStarted = s.stats?.started ?? serverStarted;
  events.length = 0;
  for (const e of s.events.slice(0, 40)) events.push(e);
  renderTicker();
}

/* ---------- ransomware victim (most QR links): banner + skull on the mesh ---------- */
let ransomMac: string | null = null;
let ransomInfo: { nick: string; qr: number } | null = null;
async function loadRansom() {
  if (demo) return;
  const r = await api.ransom();
  if (!r) return;
  const prev = ransomMac;
  ransomMac = r.macs[0] ?? null;
  ransomInfo = r.top ? { nick: r.top.nick, qr: r.top.qr } : null;
  const el = $('noc-ransom');
  el.hidden = !ransomMac;
  if (ransomInfo) $('noc-ransom-text').textContent = `${ransomInfo.nick || ransomMac} · QR ${ransomInfo.qr} ครั้ง · AIR connection required`;
  if (ransomMac && ransomMac !== prev) pushEvent({ type: 'note', mac: ransomMac, detail: `RANSOMWARE: ${ransomInfo?.nick || ransomMac} abused QR (${ransomInfo?.qr}) — must connect via AIR`, at: Date.now() });
}

/* ---------- prizes: places by vote + lucky draw, revealed one by one on the stage ---------- */
let awardsNow: { total: number; revealed: number; claimed: number; awards: Award[] } = { total: 0, revealed: 0, claimed: 0, awards: [] };
const revealQueue: Award[] = [];
let revealing = false;
async function loadAwards() {
  if (demo) return;
  const r = await api.awards();
  if (!r) return;
  awardsNow = r;
  const panel = $('noc-awards-panel');
  panel.hidden = r.total === 0;
  $('noc-awards-stats').textContent = r.total ? `(${r.revealed}/${r.total} เปิดแล้ว · รับไป ${r.claimed})` : '';
  const ol = $('noc-awards');
  ol.innerHTML = '';
  for (const a of r.awards.slice(-8).reverse()) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n"></span><b></b><span class="mac"></span>`;
    li.querySelector('.n')!.textContent = a.kind === 'place' ? '🏆' : a.kind === 'bonus' ? '✨' : '🎁';
    const b = li.querySelector('b')!;
    b.textContent = `${a.kind === 'place' ? `#${a.place} ${a.team}` : a.nick} ← ${a.item}`;
    if (a.claimed) b.classList.add('c');
    li.querySelector('.mac')!.textContent = a.prize_id;
    ol.appendChild(li);
  }
}
function pumpReveal() {
  if (revealing) return;
  const a = revealQueue.shift();
  if (!a) return;
  revealing = true;
  const el = $('noc-award');
  const card = $('noc-award-card');
  card.classList.toggle('place', a.kind === 'place');
  $('noc-award-kicker').textContent = a.kind === 'place' ? `🏆 รางวัลที่ ${a.place} · ผลโหวต` : a.kind === 'bonus' ? '✨ BONUS ROUND' : '🎁 LUCKY DRAW';
  const name = $('noc-award-name');
  const finalName = a.kind === 'place' ? a.team : a.nick || a.mac;
  $('noc-award-item').textContent = '…';
  $('noc-award-sub').textContent = '';
  el.hidden = false;
  name.classList.add('spin');
  const pool = Array.from(hosts.values()).map((h) => h.nick).filter(Boolean);
  let ticks = 0;
  const spin = setInterval(() => {
    name.textContent = pool.length ? pool[Math.floor(Math.random() * pool.length)] : '…';
    if (++ticks >= 14) {
      clearInterval(spin);
      name.classList.remove('spin');
      name.textContent = finalName;
      setTimeout(() => {
        $('noc-award-item').textContent = `${a.item}${a.qty > 1 ? ` ×${a.qty}` : ''}`;
        $('noc-award-sub').textContent = `${a.prize_id} · รับได้ที่โต๊ะ staff`;
        if (sound) chirp();
      }, 500);
      setTimeout(() => {
        revealing = false;
        if (revealQueue.length) pumpReveal();
        else setTimeout(() => { if (!revealing && !revealQueue.length) el.hidden = true; }, 2500);
      }, 4200);
    }
  }, 90);
}
function onAwardRevealed(a: Award) {
  revealQueue.push(a);
  pumpReveal();
  pushEvent({ type: 'note', mac: a.mac, detail: a.kind === 'place' ? `🏆 #${a.place} ${a.team}: ${a.item}` : `🎁 ${a.nick} ← ${a.item}`, at: Date.now() });
}

/* ---------- popular-vote link (Uddy's app): QR on the stage screen ---------- */
let voteLinkNow: string | null = null;
function renderVoteLink(url: string) {
  if (url === voteLinkNow) return;
  voteLinkNow = url;
  const panel = $('noc-votelink');
  panel.hidden = !url;
  const input = document.getElementById('adm-vote-url') as HTMLInputElement | null;
  if (input && document.activeElement !== input) input.value = url;
  if (!url) return;
  $('noc-vote-url').textContent = url.replace(/^https?:\/\//, '');
  void QRCode.toCanvas($('noc-vote-qr') as HTMLCanvasElement, url, { width: 180, margin: 1, errorCorrectionLevel: 'M' }).catch(() => undefined);
}

/* ---------- Dead Pixel round: banner + dying nodes on the mesh ---------- */
let deadNow: DeadPixelState | null = null;
const deadStatus = new Map<string, boolean>(); // mac → revived
async function loadDeadPixel() {
  if (demo) return;
  const r = await api.deadPixel();
  deadNow = r ?? null;
  deadStatus.clear();
  if (deadNow) for (const n of deadNow.nodes) deadStatus.set(n.mac, n.revived);
  renderDeadPixel();
}
function renderDeadPixel() {
  const el = $('noc-dead');
  const d = deadNow;
  if (!d || Date.now() > d.deadline + 10 * 60_000) {
    el.hidden = true;
    return;
  }
  const left = Math.max(0, d.deadline - Date.now());
  const mm = `${String(Math.floor(left / 60_000)).padStart(2, '0')}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`;
  const revived = d.nodes.filter((n) => n.revived).length;
  const t = $('noc-dead-text');
  t.innerHTML = '';
  t.append(`round ${d.round} · ${left > 0 ? mm : 'หมดเวลา'} · revived ${revived}/${d.nodes.length} · `);
  d.nodes.forEach((n, i) => {
    const s = document.createElement(n.revived ? 'i' : 's');
    s.textContent = n.nick;
    t.appendChild(s);
    if (i < d.nodes.length - 1) t.append(', ');
  });
  el.hidden = false;
}
setInterval(renderDeadPixel, 1000);

/* ---------- Packet Loss Bingo leaderboard ---------- */
async function loadBingo() {
  if (demo) return;
  const r = await api.bingoBoard();
  if (!r) return;
  const ol = $('noc-bingo');
  ol.innerHTML = '';
  (ol.closest('.panel') as HTMLElement).hidden = r.players === 0;
  for (const [i, p] of r.top.slice(0, 5).entries()) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n"></span><b></b><span class="deg"></span>`;
    li.querySelector('.n')!.textContent = String(i + 1);
    li.querySelector('b')!.textContent = `${p.cells >= 8 ? '★ ' : p.lines ? '✔ ' : ''}${p.nick}`;
    li.querySelector('.deg')!.textContent = p.cells >= 8 ? 'BLACKOUT' : p.lines ? `BINGO ×${p.lines}` : `${p.cells}/8`;
    ol.appendChild(li);
  }
  $('noc-bingo-stats').textContent = r.players ? `(${r.players} เล่น · ${r.bingos} bingo · ${r.blackouts} blackout)` : '(ยังไม่มีใครเล่น)';
}

/* ---------- Most Stupid Project vote ---------- */
async function loadVotes() {
  if (demo) return;
  const r = await api.votes();
  if (!r) return;
  const ol = $('noc-vote');
  ol.innerHTML = '';
  (ol.closest('.panel') as HTMLElement).hidden = !r.open && r.total === 0;
  const max = Math.max(1, ...r.results.map((x) => x.votes));
  r.results.slice(0, 6).forEach((x, i) => {
    const li = document.createElement('li');
    if (!r.open && r.total > 0 && i === 0 && x.votes > 0) li.className = 'win';
    li.innerHTML = `<span class="n"></span><b><i></i><span></span></b><span class="deg"></span>`;
    li.querySelector('.n')!.textContent = String(i + 1);
    (li.querySelector('i') as HTMLElement).style.width = `${Math.round((x.votes / max) * 100)}%`;
    li.querySelector('b span')!.textContent = `${!r.open && r.total > 0 && i === 0 && x.votes > 0 ? '👑 ' : ''}${x.team} — ${x.project}`;
    li.querySelector('.deg')!.textContent = String(x.votes);
    ol.appendChild(li);
  });
  $('noc-vote-state').textContent = r.open ? `(เปิดโหวต · ${r.total} เสียง)` : r.total ? `(ปิดแล้ว · ${r.total} เสียง)` : '(ยังไม่เปิด)';
}

/* ---------- pitching queue ---------- */
async function loadProjects() {
  if (demo) return;
  const r = await api.projects();
  if (!r) return;
  const ol = $('noc-projects');
  ol.innerHTML = '';
  (ol.closest('.panel') as HTMLElement).hidden = r.projects.length === 0;
  for (const p of r.projects.slice(0, 6)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n"></span><b></b><span class="mac"></span>`;
    li.querySelector('.n')!.textContent = String(p.order);
    li.querySelector('b')!.textContent = `${p.team} — ${p.project}`;
    li.querySelector('.mac')!.textContent = p.needs ? p.needs.slice(0, 18) : '';
    ol.appendChild(li);
  }
  $('noc-proj-count').textContent = `(${r.projects.length})`;
  for (const id of ['adm-p1', 'adm-p2', 'adm-p3']) {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (!sel) continue;
    const keep = sel.value;
    sel.innerHTML = `<option value="">${id.replace('adm-p', 'ที่ ')}…</option>` + r.projects.map((p) => `<option value="${p.device}">${p.order}. ${p.team.replace(/</g, '')}</option>`).join('');
    sel.value = keep;
  }
}

/* ---------- Drawdy Logo Hunting ---------- */
function renderHunt(h: HuntState | null) {
  const keys = $('hunt-keys');
  const done = $('hunt-done');
  if (!h) return;
  keys.innerHTML = '';
  for (const k of h.keys) {
    const d = document.createElement('div');
    d.className = `hunt-key${k.finds ? ' found' : ''}`;
    d.innerHTML = `<b></b><span></span>`;
    d.querySelector('b')!.textContent = String(k.finds);
    d.querySelector('span')!.textContent = k.name + (k.first ? ` · แรก: ${k.first.nick || '?'}` : '');
    keys.appendChild(d);
  }
  done.innerHTML = h.completed.length ? `activated แล้ว <b>${h.completed.length}</b> คน: ` : `${h.devices} คนกำลังหา · ยังไม่มีใคร activate`;
  if (h.completed.length) {
    const s = document.createElement('span');
    s.textContent = h.completed.slice(-8).map((c) => `${c.nick || '?'} (${c.cert})`).join(', ');
    done.appendChild(s);
  }
}
async function loadHunt() {
  if (demo) return;
  renderHunt(await api.hunt());
}

/* ---------- live feed ---------- */
function connect() {
  const base = apiBase();
  if (!base) return startDemo();
  let ws: WebSocket | null = null;
  let backoff = 1000;
  const open = () => {
    ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/live`);
    ws.onopen = () => {
      backoff = 1000;
      pushEvent({ type: 'info', mac: '', detail: 'NOC feed connected', at: Date.now() });
    };
    ws.onmessage = (m) => {
      try {
        const msg = JSON.parse(m.data);
        if (msg.type === 'state') applyState(msg.state);
        else if (msg.type === 'node') addHost(msg.node);
        else if (msg.type === 'link') {
          if (msg.nodes) for (const n of msg.nodes) addHost(n);
          addEdge(msg.link);
        } else if (msg.type === 'event') pushEvent(msg.event);
        else if (msg.type === 'project') void loadProjects();
        else if (msg.type === 'vote') void loadVotes();
        else if (msg.type === 'bingo') void loadBingo();
        else if (msg.type === 'deadpixel') void loadDeadPixel();
        else if (msg.type === 'award') onAwardRevealed(msg.award);
        else if (msg.type === 'awards' || msg.type === 'prizes') void loadAwards();
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 15000);
    };
  };
  open();
  void api.state().then((s) => s && applyState(s));
  void loadHunt();
  void loadRansom();
  void loadProjects();
  void loadVotes();
  void loadBingo();
  void loadDeadPixel();
  void loadAwards();
  setInterval(() => void loadAwards(), 30_000);
  setInterval(() => void loadBingo(), 30_000);
  setInterval(() => void loadDeadPixel(), 10_000);
  setInterval(() => void loadProjects(), 30_000);
  setInterval(() => void loadVotes(), 15_000);
  setInterval(() => void api.state().then((s) => s && applyState(s)), 20_000);
  setInterval(() => void loadHunt(), 30_000);
  setInterval(() => void loadRansom(), 30_000);
}

/* ---------- demo: 60 people in a hall ---------- */
const demoNicks = ['โขง', 'ไท', 'พีม', 'มีมี่', 'กัส', 'Carrot', 'อาร์ต', 'นีโม่', 'Opec', 'นีน่า', 'ลีโอ', 'Nac', 'Thee', 'Juk', 'บีบี', 'Neo', 'Uddy', 'Folk', 'นรภัทร', 'Riffy', 'Poom', 'เบียร์', 'มิโนริ', 'สาสิ', 'แพน', 'เจ', 'บอส', 'ฟ้า', 'ตูน', 'ปอนด์', 'ไอซ์', 'กาย', 'มาร์ค', 'เอิร์ธ', 'พลอย', 'เฟิร์น', 'นิว', 'บีม', 'ก้อง', 'ต้น', 'แบงค์', 'กร', 'ออม', 'มิ้นท์', 'โอ๊ต', 'เตย', 'จูน', 'ภีม', 'ไนซ์', 'ปัน', 'เอม', 'วิน', 'ตาล', 'ภู', 'เดียร์', 'บุ๊ค', 'ฝ้าย', 'กัน', 'เป้', 'ปิง'];
const demoSkills = ['Frontend', 'Backend', 'Design', 'Hardware', 'Data', 'Pitch', 'หาข้าว', 'ให้กำลังใจ', 'นอนเก่ง', 'ถามเก่ง'];
const demoIdeas = ['เว็บที่โหลดช้าลงทุกครั้งที่กด', 'แอปเตือนให้หายใจ ทุก 3 วินาที', 'คีย์บอร์ดที่พิมพ์ได้แต่คำว่า ok', 'เครื่องคิดเลขที่ปัดเศษทุกอย่างเป็น 7', 'นาฬิกาปลุกที่ปลุกคนข้างบ้าน', 'เมาส์ที่ต้องเดินไปคลิกเอง', 'ตู้เย็นที่ส่ง LINE มาต่อว่า', 'เครื่องตรวจว่าโง่พอหรือยัง', 'โมเด็ม 300 baud ที่พูดภาษาไทย', 'แปรงสีฟันที่โพสต์เฟซบุ๊กให้'];
function startDemo() {
  demo = true;
  $('noc-demo').hidden = false;
  const macs: string[] = [];
  demoNicks.forEach((nick, i) => {
    const rnd = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    const mac = `02:${rnd()}:${rnd()}:${rnd()}:${rnd()}:${rnd()}`;
    macs.push(mac);
    setTimeout(() => addHost({ mac, nick, skill: demoSkills[i % demoSkills.length], idea: demoIdeas[i % demoIdeas.length] }), i * 120);
  });
  let n = 0;
  const tick = () => {
    if (n++ > 400) return;
    const a = macs[Math.floor(Math.random() * macs.length)];
    const b = macs[Math.floor(Math.random() * macs.length)];
    if (a !== b) addEdge({ a, b, via: Math.random() < 0.85 ? 'air' : 'qr' });
    if (Math.random() < 0.15) pushEvent({ type: 'crc', mac: a, detail: '1', at: Date.now() });
    if (Math.random() < 0.08) pushEvent({ type: 'collision', mac: b, detail: 'carrier sense: channel busy, backing off', at: Date.now() });
    setTimeout(tick, 900 + Math.random() * 1800);
  };
  setTimeout(tick, 8000);
  pushEvent({ type: 'info', mac: '', detail: 'No NOC server configured: showing demo traffic for 60 hosts', at: Date.now() });
  renderHunt({ keys: ['Recycle Bin', 'My Computer', 'Desktop', 'C:\\Windows\\System32', 'Downloads', 'Program Files'].map((name, i) => ({ id: `k${i + 1}`, name, finds: [14, 22, 9, 3, 0, 5][i], first: i === 4 ? null : { nick: demoNicks[i * 3], at: Date.now() } })), completed: [{ nick: 'โขง', cert: 'ACT-7F3K2A', at: Date.now() }, { nick: 'ไท', cert: 'ACT-9Q1ZX4', at: Date.now() }], devices: 31 });
}

/* ---------- render ---------- */
function resize() {
  const r = canvas.parentElement!.getBoundingClientRect();
  canvas.width = Math.max(300, Math.floor(r.width * devicePixelRatio));
  canvas.height = Math.max(200, Math.floor(r.height * devicePixelRatio));
}
window.addEventListener('resize', resize);
resize();

function physics() {
  const hs = Array.from(hosts.values());
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const k = Math.sqrt((W * H) / Math.max(1, hs.length)) * 0.55;
  for (let i = 0; i < hs.length; i++) {
    const a = hs[i];
    for (let j = i + 1; j < hs.length; j++) {
      const b = hs[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy + 0.01;
      if (d2 > k * k * 9) continue;
      const f = (k * k) / d2;
      dx *= f * 0.02;
      dy *= f * 0.02;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }
    a.vx += (cx - a.x) * 0.0015;
    a.vy += (cy - a.y) * 0.0015;
  }
  for (const e of edges.values()) {
    const a = hosts.get(e.a)!;
    const b = hosts.get(e.b)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const f = ((d - k * 0.9) / d) * 0.01;
    a.vx += dx * f;
    a.vy += dy * f;
    b.vx -= dx * f;
    b.vy -= dy * f;
  }
  const pad = 40 * devicePixelRatio;
  for (const h of hs) {
    h.vx *= 0.85;
    h.vy *= 0.85;
    h.x = Math.max(pad, Math.min(W - pad, h.x + h.vx));
    h.y = Math.max(pad, Math.min(H - pad, h.y + h.vy));
  }
}

function draw() {
  const now = performance.now();
  const dpr = devicePixelRatio;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const e of edges.values()) {
    const a = hosts.get(e.a)!;
    const b = hosts.get(e.b)!;
    const age = now - e.born;
    const fresh = Math.max(0, 1 - age / 4000);
    ctx.lineWidth = (1 + fresh * 3) * dpr;
    ctx.strokeStyle = e.via === 'air' ? `rgba(170,255,200,${0.35 + fresh * 0.6})` : `rgba(255,230,150,${0.35 + fresh * 0.6})`;
    ctx.shadowBlur = fresh * 16 * dpr;
    ctx.shadowColor = '#8ef5a3';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (age < 1500) {
      const t = (age % 500) / 500;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  ctx.font = `${12 * dpr}px 'Segoe UI', Tahoma, 'Noto Sans Thai', sans-serif`;
  ctx.textAlign = 'center';
  for (const h of hosts.values()) {
    const r = (9 + Math.min(14, h.deg * 1.6)) * dpr;
    const pop = Math.min(1, (now - h.born) / 600);
    const rr = r * (0.3 + 0.7 * pop);
    const g = ctx.createRadialGradient(h.x - rr * 0.35, h.y - rr * 0.4, rr * 0.1, h.x, h.y, rr);
    const victim = h.mac === ransomMac;
    const deadState = deadNow && Date.now() < deadNow.deadline + 10 * 60_000 ? deadStatus.get(h.mac) : undefined; // undefined = not in the round, false = dying, true = revived
    const dying = deadState === false;
    if (dying) ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(now / 90 + h.x));
    const col = dying ? ['#eee', '#777', '#111'] : victim ? ['#ff6b6b', '#8a0000', '#000'] : h.deg === 0 ? ['#ffd0d0', '#ff7b7b', '#a83232'] : h.deg >= 5 ? ['#fff3b0', '#ffd34d', '#b8860b'] : ['#e6ffee', '#8ef5a3', '#2f9e52'];
    g.addColorStop(0, col[0]);
    g.addColorStop(0.5, col[1]);
    g.addColorStop(1, col[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(h.x, h.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y - rr * 0.45, rr * 0.55, rr * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (victim || deadState === true) {
      ctx.strokeStyle = victim ? '#ff3b3b' : '#8ef5a3';
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(h.x, h.y, rr + 4 * dpr + Math.sin(now / 150) * 2 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = dying ? '#ddd' : deadState === true ? '#8ef5a3' : victim ? '#ff6b6b' : '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4 * dpr;
    ctx.fillText(dying ? `✖ ${h.nick} · DEAD PIXEL` : deadState === true ? `✚ ${h.nick} · REVIVED` : victim ? `☠ ${h.nick} · RANSOMWARE` : h.nick, h.x, h.y + rr + 14 * dpr);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function renderSide() {
  const hs = Array.from(hosts.values());
  const top = hs.filter((h) => h.deg > 0).sort((a, b) => b.deg - a.deg || a.at - b.at).slice(0, 8);
  $('noc-top').innerHTML = top.map((h, i) => `<li><span class="n">${i + 1}</span><b></b><span class="deg">${h.deg}</span></li>`).join('');
  Array.from($('noc-top').querySelectorAll('b')).forEach((b, i) => (b.textContent = `${top[i].nick} · ${top[i].skill || vendorFor(top[i].mac)}`));
  const recent = Array.from(edges.values()).sort((a, b) => b.at - a.at).slice(0, 7);
  $('noc-recent').innerHTML = recent.map(() => `<li><b></b><span class="mac"></span></li>`).join('');
  Array.from($('noc-recent').querySelectorAll('li')).forEach((li, i) => {
    const e = recent[i];
    li.querySelector('b')!.textContent = `${hosts.get(e.a)!.nick} ↔ ${hosts.get(e.b)!.nick}`;
    li.querySelector('.mac')!.textContent = e.via;
  });
  $('st-hosts').textContent = String(hosts.size);
  $('st-links').textContent = String(edges.size);
  $('st-packets').textContent = String(packets);
  $('st-crc').textContent = String(crc);
  const up = Math.floor((Date.now() - (demo ? started : serverStarted)) / 1000);
  $('st-uptime').textContent = `${Math.floor(up / 3600)}:${String(Math.floor((up % 3600) / 60)).padStart(2, '0')}`;
  const d = new Date();
  $('noc-clock').textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}

let ideaIndex = 0;
function rotateIdea() {
  const withIdeas = Array.from(hosts.values()).filter((h) => h.idea);
  if (!withIdeas.length) return;
  const h = withIdeas[ideaIndex++ % withIdeas.length];
  $('noc-idea').textContent = `“${h.idea}”`;
  $('noc-idea-by').textContent = `— ${h.nick} · ${h.skill || vendorFor(h.mac)} · ICQ ${icqFor(h.mac)}`;
}
setInterval(rotateIdea, 7000);

function renderTicker() {
  const el = $('noc-ticker');
  el.innerHTML = '';
  for (const e of events.slice(0, 14)) {
    const s = document.createElement('span');
    const t = new Date(e.at);
    const hh = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    s.textContent = `${hh} ${e.type.toUpperCase()} ${e.detail}`;
    if (e.type === 'crc' || e.type === 'collision' || e.type === 'timeout') s.className = 'err';
    el.appendChild(s);
  }
}

function bsod(code: string) {
  const el = $('noc-bsod');
  el.textContent = `A problem has been detected and SHTX-NET has been shut down to prevent damage to your friendships.\n\n${code}\n\nIf this is the first time you've seen this Stop error screen, go talk to a stranger. If this screen appears again, follow these steps:\n\nCheck to make sure any new hardware or software is properly installed. If this is a new installation, ask your hardware or software manufacturer for any SHTX-NET updates you might need.\n\nIf problems continue, disable or remove any newly installed hardware or software. Disable BIOS memory options such as caching or shadowing. If you need to use Safe Mode to remove or disable components, restart your computer, press F8 to select Advanced Startup Options, and then select Safe Mode.\n\nTechnical information:\n\n*** STOP: 0x0000005H (0x7C0DE, 0x300BAUD, 0x${hosts.size.toString(16).toUpperCase()}, 0x${edges.size.toString(16).toUpperCase()})\n\nBeginning dump of physical memory\nPhysical memory dump complete.\nContact your system administrator or ไท for further assistance.`;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 6000);
}

/* ---------- sound: a real (tiny) FSK frame as the "new link" chime ---------- */
let actx: AudioContext | null = null;
function chirp() {
  try {
    actx ??= new AudioContext();
    const pcm = encodePcm(buildFrame(new TextEncoder().encode('LINK')), actx.sampleRate);
    const buf = actx.createBuffer(1, pcm.length, actx.sampleRate);
    buf.copyToChannel(pcm, 0);
    const src = actx.createBufferSource();
    const gain = actx.createGain();
    gain.gain.value = 0.25;
    src.buffer = buf;
    src.connect(gain).connect(actx.destination);
    src.start();
  } catch {
    /* ignore */
  }
}
$('noc-sound').addEventListener('click', (e) => {
  sound = !sound;
  (e.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(sound));
  (e.currentTarget as HTMLButtonElement).textContent = `Sound: ${sound ? 'on' : 'off'}`;
  if (sound) chirp();
});
$('noc-full').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()));

/* ---------- staff controls: Staff button → password (= NET_ADMIN_TOKEN), or /noc/?admin=<token>; remembered in this browser ---------- */
const ADMIN_KEY = 'shtx-noc-admin';
function savedToken(): string {
  try {
    const q = new URLSearchParams(location.search);
    const t = q.get('admin');
    if (t !== null) {
      if (t) localStorage.setItem(ADMIN_KEY, t);
      else localStorage.removeItem(ADMIN_KEY);
      q.delete('admin');
      history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
    }
    return localStorage.getItem(ADMIN_KEY) ?? '';
  } catch {
    return '';
  }
}
async function checkToken(token: string): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase()}/api/admin/check?token=${encodeURIComponent(token)}`);
    return r.ok;
  } catch {
    return false;
  }
}
function setupAdmin() {
  const bar = $('noc-admin');
  const staffBtn = $('noc-staff') as HTMLButtonElement;
  const login = $('noc-login') as HTMLFormElement;
  const pass = $('noc-pass') as HTMLInputElement;
  const loginMsg = $('noc-login-msg');
  const msg = $('adm-msg');
  let token = '';
  if (!apiBase()) {
    staffBtn.hidden = true;
    return;
  }
  const say = (t: string) => {
    msg.textContent = t;
    setTimeout(() => (msg.textContent = ''), 4000);
  };
  const showBar = (t: string) => {
    token = t;
    try {
      localStorage.setItem(ADMIN_KEY, t);
    } catch {
      /* ignore */
    }
    bar.hidden = false;
    staffBtn.hidden = true;
    login.hidden = true;
  };
  const hideBar = () => {
    token = '';
    try {
      localStorage.removeItem(ADMIN_KEY);
    } catch {
      /* ignore */
    }
    bar.hidden = true;
    staffBtn.hidden = false;
  };
  staffBtn.addEventListener('click', () => {
    login.hidden = false;
    loginMsg.textContent = '';
    pass.value = '';
    pass.focus();
  });
  $('noc-login-cancel').addEventListener('click', () => (login.hidden = true));
  login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = pass.value;
    if (!t) return;
    loginMsg.textContent = '…';
    if (await checkToken(t)) showBar(t);
    else loginMsg.textContent = 'รหัสผ่านไม่ถูกต้อง';
  });
  const saved = savedToken();
  if (saved) void checkToken(saved).then((ok) => (ok ? showBar(saved) : hideBar()));

  const call = async (path: string, init: RequestInit) => {
    const r = await fetch(`${apiBase()}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, { ...init, headers: { 'content-type': 'application/json' } });
    if (r.status === 403) {
      say('รหัสผ่านไม่ถูกต้องแล้ว ล็อกอินใหม่');
      hideBar();
    } else if (!r.ok) say(`ล้มเหลว (${r.status})`);
    return r.ok;
  };
  const reset = $('adm-reset') as HTMLButtonElement;
  let armed: ReturnType<typeof setTimeout> | null = null;
  reset.addEventListener('click', async () => {
    if (!armed) {
      reset.textContent = 'กดอีกครั้งเพื่อลบทุกอย่าง';
      reset.classList.add('danger');
      armed = setTimeout(() => {
        armed = null;
        reset.textContent = 'Reset game…';
        reset.classList.remove('danger');
      }, 5000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    reset.textContent = 'Reset game…';
    reset.classList.remove('danger');
    if (await call('/api/reset', { method: 'POST' })) {
      linksSinceBsod = 0;
      say('ล้างแล้ว: 0 hosts, 0 links');
    }
  });
  $('adm-bsod').addEventListener('click', async () => {
    const codes = ['FRIENDSHIP_PAGE_FAULT_IN_NONPAGED_AREA', 'IDEA_TOO_STUPID_FOR_KERNEL', 'IRQL_NOT_LESS_OR_EQUAL_TO_300_BAUD', 'DRIVER_HANDSHAKE_TIMEOUT'];
    await call('/api/events', { method: 'POST', body: JSON.stringify({ type: 'bsod', detail: codes[Math.floor(Math.random() * codes.length)] }) });
  });
  const kick = async () => {
    const q = ($('adm-kick') as HTMLInputElement).value.trim();
    if (!q) return;
    const hex = q.replace(/[^0-9a-fA-F]/g, '');
    const h = Array.from(hosts.values()).find((x) => (hex.length === 12 && x.mac.replace(/:/g, '').toUpperCase() === hex.toUpperCase()) || x.nick.toLowerCase() === q.toLowerCase());
    if (!h) return say('ไม่พบ host นี้');
    if (await call(`/api/nodes/${encodeURIComponent(h.mac)}`, { method: 'DELETE' })) {
      ($('adm-kick') as HTMLInputElement).value = '';
      say(`เตะ ${h.nick} ออกแล้ว`);
    }
  };
  $('adm-kick-btn').addEventListener('click', () => void kick());
  $('adm-kick').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void kick();
  });
  $('adm-pause-net').addEventListener('click', async () => {
    await call('/api/pause', { method: 'POST', body: JSON.stringify({ net: !pauseNow.net }) });
  });
  $('adm-submit').addEventListener('click', async () => {
    await call('/api/pause', { method: 'POST', body: JSON.stringify({ submit: !pauseNow.submit }) });
  });
  $('adm-vote').addEventListener('click', async () => {
    await call('/api/pause', { method: 'POST', body: JSON.stringify({ vote: !pauseNow.vote }) });
  });
  const voteReset = $('adm-vote-reset') as HTMLButtonElement;
  let voteArmed: ReturnType<typeof setTimeout> | null = null;
  voteReset.addEventListener('click', async () => {
    if (!voteArmed) {
      voteReset.textContent = 'กดอีกครั้งเพื่อล้างคะแนน';
      voteReset.classList.add('danger');
      voteArmed = setTimeout(() => {
        voteArmed = null;
        voteReset.textContent = 'Reset votes…';
        voteReset.classList.remove('danger');
      }, 5000);
      return;
    }
    clearTimeout(voteArmed);
    voteArmed = null;
    voteReset.textContent = 'Reset votes…';
    voteReset.classList.remove('danger');
    if (await call('/api/votes', { method: 'DELETE' })) say('ล้างคะแนนโหวตแล้ว');
  });
  $('adm-places').addEventListener('click', async () => {
    const places = [1, 2, 3].map((n) => ({ place: n, device: ($(`adm-p${n}`) as HTMLSelectElement).value })).filter((p) => p.device);
    if (!places.length) return say('เลือกทีมอย่างน้อย 1 อันดับก่อน');
    const r = await call<{ ok: boolean; error?: string; done?: { place: number; team: string; items: string[] }[] }>('/api/awards/places', { method: 'POST', body: JSON.stringify({ places }) });
    if (!r) return;
    if (!r.ok) return say(`ไม่สำเร็จ: ${r.error}`);
    say(`บันทึกแล้ว: ${r.done!.map((d) => `ที่ ${d.place} ${d.team} → ${d.items.join(' + ')}`).join(' | ')} (ยังไม่เปิดเผย กด Reveal)`);
  });
  $('adm-draw').addEventListener('click', async () => {
    const r = await call<{ ok: boolean; error?: string; participants?: number; tickets?: number; bonus?: number; short?: number }>('/api/awards/draw', { method: 'POST', body: JSON.stringify({ minLinks: 1 }) });
    if (!r) return;
    if (!r.ok) return say(r.error === 'short' ? `ของไม่พอ: คน ${r.participants} แต่ตั๋ว ${r.tickets} (ขาด ${r.short}) เพิ่ม Reward amount ใน Grist แล้ว sync ใหม่ หรือกด Shift+Lucky draw เพื่อสุ่มเท่าที่มี` : `ไม่สำเร็จ: ${r.error}`);
    say(`สุ่มแล้ว: ${r.participants} คน · ${r.tickets} ตั๋ว · โบนัส ${r.bonus} ชิ้น (ยังไม่เปิดเผย กด Reveal)`);
  });
  $('adm-draw').addEventListener('click', async (e) => {
    if (!(e as MouseEvent).shiftKey) return;
    const r = await call<{ ok: boolean; participants?: number; tickets?: number; unlucky?: number }>('/api/awards/draw', { method: 'POST', body: JSON.stringify({ minLinks: 1, force: true }) });
    if (r?.ok) say(`สุ่มแบบของไม่พอ: ${r.participants} คน · ${r.tickets} ตั๋ว · ไม่ได้ของ ${r.unlucky} คน`);
  }, true);
  $('adm-reveal').addEventListener('click', async () => {
    const r = await call<{ ok: boolean; items: Award[]; total: number }>('/api/awards/reveal', { method: 'POST', body: JSON.stringify({ n: 1 }) });
    if (r && !r.items.length) say('เปิดครบแล้ว');
  });
  let revealAllTimer: ReturnType<typeof setInterval> | null = null;
  $('adm-reveal-all').addEventListener('click', () => {
    if (revealAllTimer) {
      clearInterval(revealAllTimer);
      revealAllTimer = null;
      $('adm-reveal-all').textContent = 'Reveal all';
      return say('หยุดแล้ว');
    }
    $('adm-reveal-all').textContent = 'Stop';
    const step = async () => {
      if (revealQueue.length > 1) return; // let the stage catch up
      const r = await call<{ ok: boolean; items: Award[] }>('/api/awards/reveal', { method: 'POST', body: JSON.stringify({ n: 1 }) });
      if (!r || !r.items.length) {
        if (revealAllTimer) clearInterval(revealAllTimer);
        revealAllTimer = null;
        $('adm-reveal-all').textContent = 'Reveal all';
        say('เปิดครบทุกรางวัลแล้ว');
      }
    };
    void step();
    revealAllTimer = setInterval(() => void step(), 5500);
  });
  $('adm-claim-btn').addEventListener('click', async () => {
    const who = ($('adm-claim') as HTMLInputElement).value.trim();
    if (!who) return;
    const r = await call<{ ok: boolean; matched: Award[] }>('/api/awards/claim', { method: 'POST', body: JSON.stringify({ who }) });
    if (!r) return;
    ($('adm-claim') as HTMLInputElement).value = '';
    say(r.matched.length ? `จ่ายแล้ว: ${r.matched.map((a) => `${a.nick || a.team} ← ${a.item}`).join(', ')}` : `ไม่พบ "${who}" ในรายการที่เปิดเผยแล้ว`);
  });
  $('adm-claim').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('adm-claim-btn').click();
  });
  const awardsReset = $('adm-awards-reset') as HTMLButtonElement;
  let awardsArmed: ReturnType<typeof setTimeout> | null = null;
  awardsReset.addEventListener('click', async () => {
    if (!awardsArmed) {
      awardsReset.textContent = 'กดอีกครั้งเพื่อล้างรางวัล';
      awardsReset.classList.add('danger');
      awardsArmed = setTimeout(() => {
        awardsArmed = null;
        awardsReset.textContent = 'Reset awards…';
        awardsReset.classList.remove('danger');
      }, 5000);
      return;
    }
    clearTimeout(awardsArmed);
    awardsArmed = null;
    awardsReset.textContent = 'Reset awards…';
    awardsReset.classList.remove('danger');
    if (await call('/api/awards', { method: 'DELETE' })) say('ล้างรางวัลแล้ว');
  });
  $('adm-dead').addEventListener('click', async () => {
    const r = await call<{ macs: string[] }>('/api/deadpixel', { method: 'POST', body: JSON.stringify({ count: 5, minutes: 10 }) });
    if (r) say(`Dead Pixel: สุ่ม ${r.macs.length} node แล้ว มีเวลา 10 นาที`);
  });
  $('adm-dead-end').addEventListener('click', async () => {
    if (await call('/api/deadpixel', { method: 'DELETE' })) say('จบรอบ Dead Pixel แล้ว');
  });
  const bingoReset = $('adm-bingo-reset') as HTMLButtonElement;
  let bingoArmed: ReturnType<typeof setTimeout> | null = null;
  bingoReset.addEventListener('click', async () => {
    if (!bingoArmed) {
      bingoReset.textContent = 'กดอีกครั้งเพื่อล้าง bingo';
      bingoReset.classList.add('danger');
      bingoArmed = setTimeout(() => {
        bingoArmed = null;
        bingoReset.textContent = 'Reset bingo…';
        bingoReset.classList.remove('danger');
      }, 5000);
      return;
    }
    clearTimeout(bingoArmed);
    bingoArmed = null;
    bingoReset.textContent = 'Reset bingo…';
    bingoReset.classList.remove('danger');
    if (await call('/api/bingo', { method: 'DELETE' })) say('ล้างกระดาน bingo แล้ว');
  });
  $('adm-vote-url-set').addEventListener('click', async () => {
    const voteUrl = ($('adm-vote-url') as HTMLInputElement).value.trim();
    const r = await call<PauseState>('/api/pause', { method: 'POST', body: JSON.stringify({ voteUrl }) });
    if (r) say(voteUrl ? 'ตั้งลิงก์โหวตแล้ว ขึ้นในหน้าต่าง Stupid Vote ทุกเครื่องภายใน 15 วิ' : 'ล้างลิงก์โหวตแล้ว');
  });
  $('adm-update').addEventListener('click', async () => {
    const updateMsg = ($('adm-update-msg') as HTMLInputElement).value.trim();
    if (await call('/api/pause', { method: 'POST', body: JSON.stringify({ update: true, updateMsg }) })) say('ส่ง Windows Update ไปทุกเครื่องแล้ว (ขึ้นภายใน 30 วิ)');
  });
  $('adm-pause-hunt').addEventListener('click', async () => {
    await call('/api/pause', { method: 'POST', body: JSON.stringify({ hunt: !pauseNow.hunt }) });
  });
  const hintsForm = $('noc-hints') as HTMLFormElement;
  $('adm-hints').addEventListener('click', async () => {
    const h = await api.hunt();
    if (!h) return say('โหลดคำใบ้ไม่ได้');
    const rows = $('noc-hints-rows');
    rows.innerHTML = '';
    for (const k of h.keys) {
      const l = document.createElement('label');
      l.innerHTML = `<span></span><input name="${k.id}" maxlength="160">`;
      l.querySelector('span')!.textContent = `${k.id} · ${k.name}`;
      (l.querySelector('input') as HTMLInputElement).value = k.hint || '';
      rows.appendChild(l);
    }
    $('noc-hints-msg').textContent = 'ช่องว่าง = ใช้คำใบ้เดิมจากเว็บ';
    hintsForm.hidden = false;
  });
  $('noc-hints-cancel').addEventListener('click', () => (hintsForm.hidden = true));
  hintsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hints: Record<string, string> = {};
    for (const inp of hintsForm.querySelectorAll<HTMLInputElement>('input[name]')) hints[inp.name] = inp.value.trim();
    if (await call('/api/hunt/hints', { method: 'POST', body: JSON.stringify({ hints }) })) {
      hintsForm.hidden = true;
      say('บันทึกคำใบ้แล้ว');
    }
  });
  const huntReset = $('adm-hunt-reset') as HTMLButtonElement;
  let huntArmed: ReturnType<typeof setTimeout> | null = null;
  huntReset.addEventListener('click', async () => {
    if (!huntArmed) {
      huntReset.textContent = 'กดอีกครั้งเพื่อล้างผล hunt';
      huntReset.classList.add('danger');
      huntArmed = setTimeout(() => {
        huntArmed = null;
        huntReset.textContent = 'Reset hunt…';
        huntReset.classList.remove('danger');
      }, 5000);
      return;
    }
    clearTimeout(huntArmed);
    huntArmed = null;
    huntReset.textContent = 'Reset hunt…';
    huntReset.classList.remove('danger');
    if (await call('/api/hunt', { method: 'DELETE' })) {
      say('ล้างผล Logo Hunting แล้ว');
      void loadHunt();
    }
  });
  $('adm-logout').addEventListener('click', hideBar);
}
setupAdmin();

function frame() {
  physics();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(renderSide, 500);
connect();
if (new URLSearchParams(location.search).has('demo') && !demo) startDemo();
