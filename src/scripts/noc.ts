// NOC screen logic: live state over WebSocket (+ polling fallback) from the SHTX-NET server, force-directed mesh,
// leaderboards, event ticker, periodic BSOD. With no server it runs a 60-host demo (what a full room looks like).
import { apiBase, api, type ServerState, type HuntState } from './netapi';
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

let pauseNow: { hunt: boolean; net: boolean; submit?: boolean } = { hunt: false, net: false };
function renderPause(p: { hunt: boolean; net: boolean; submit?: boolean }) {
  pauseNow = p;
  const bs = document.getElementById('adm-submit');
  if (bs) {
    bs.setAttribute('aria-pressed', String(!!p.submit));
    bs.textContent = p.submit ? 'Open submissions' : 'Close submissions';
  }
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

/* ---------- pitching queue ---------- */
async function loadProjects() {
  if (demo) return;
  const r = await api.projects();
  if (!r) return;
  const ol = $('noc-projects');
  ol.innerHTML = '';
  for (const p of r.projects.slice(0, 12)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n"></span><b></b><span class="mac"></span>`;
    li.querySelector('.n')!.textContent = String(p.order);
    li.querySelector('b')!.textContent = `${p.team} — ${p.project}`;
    li.querySelector('.mac')!.textContent = p.needs ? p.needs.slice(0, 18) : '';
    ol.appendChild(li);
  }
  $('noc-proj-count').textContent = `(${r.projects.length})`;
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
  setInterval(() => void loadProjects(), 30_000);
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
    const col = victim ? ['#ff6b6b', '#8a0000', '#000'] : h.deg === 0 ? ['#ffd0d0', '#ff7b7b', '#a83232'] : h.deg >= 5 ? ['#fff3b0', '#ffd34d', '#b8860b'] : ['#e6ffee', '#8ef5a3', '#2f9e52'];
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
    if (victim) {
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(h.x, h.y, rr + 4 * dpr + Math.sin(now / 150) * 2 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = victim ? '#ff6b6b' : '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4 * dpr;
    ctx.fillText(victim ? `☠ ${h.nick} · RANSOMWARE` : h.nick, h.x, h.y + rr + 14 * dpr);
    ctx.shadowBlur = 0;
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
