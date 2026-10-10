// Prize gacha POC: draw from a finite pool, play the pull video for the best rarity, then flip cards one by one.
// Staff only: the reward list comes from Grist through the media server, which checks the NOC staff password.
// Draws, stock and the pull log live on the NOC server (/api/gacha/*), so a reload or a second screen cannot re-roll.
import { tiers, type Prize, type Tier } from '../data/prizes';
import { asset } from '../lib/asset';
import { apiBase } from './netapi';

const MEDIA = (import.meta.env.PUBLIC_GACHA_MEDIA as string | undefined) || 'https://82-26-104-114.sslip.io:8445/';
const shared = `${MEDIA}gacha/shared/`;
const ADMIN_KEY = 'shtx-noc-admin'; // same key (raw string) as /noc, so a logged-in staff browser is logged in here too
const getToken = () => { try { return localStorage.getItem(ADMIN_KEY) ?? ''; } catch { return ''; } };
const setToken = (t: string) => { try { t ? localStorage.setItem(ADMIN_KEY, t) : localStorage.removeItem(ADMIN_KEY); } catch { /* private mode */ } };
const order: Tier[] = ['T1', 'T2', 'T3'];
const api = () => apiBase().replace(/\/$/, '');
const adminFetch = (path: string, init?: RequestInit) => fetch(`${api()}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken())}`, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let prizes: Prize[] = [];
let stock: Record<string, number> = {}; // remaining per prize id, as the server reports it
let count = 3;

function renderStock() {
  const left = (t: Tier) => prizes.filter((p) => p.tier === t).reduce((n, p) => n + (stock[p.id] ?? 0), 0);
  $('stock').innerHTML = order
    .map((t) => `<div><b>${t} ${tiers[t].label}</b> · ${left(t)} left — ${prizes.filter((p) => p.tier === t).map((p) => `${p.name} ×${stock[p.id] ?? 0}`).join(', ')}</div>`)
    .join('');
  $<HTMLButtonElement>('pull').disabled = order.every((t) => left(t) === 0);
}

function setCount(n: number) {
  count = Math.max(1, Math.min(10, n));
  $('count').textContent = String(count);
  $('pull').textContent = `Pull ×${count}`;
}

// The server draws (tier by rate, renormalised over tiers with stock; item weighted by what is left) and records the pull.
async function pull() {
  const team = $<HTMLInputElement>('team').value.trim() || 'Team ?';
  const btn = $<HTMLButtonElement>('pull');
  btn.disabled = true;
  try {
    const res = await adminFetch('/api/gacha/pull', { method: 'POST', body: JSON.stringify({ team, count, demo: $<HTMLSelectElement>('demo').value || undefined }) });
    const data = (await res.json()) as { ok: boolean; error?: string; prizes: string[]; remaining: Record<string, number> };
    if (!res.ok || !data.ok) {
      alert(`Pull failed: ${data.error ?? res.status}`);
      btn.disabled = false;
      return;
    }
    stock = data.remaining;
    const got = data.prizes.map((id) => prizes.find((p) => p.id === id)).filter((p): p is Prize => !!p);
    if (!got.length) return;
    const best = order.find((t) => got.some((p) => p.tier === t))!;
    currentTeam = team;
    $('setup').hidden = true;
    playPull(best, () => showResults(team, got, best));
  } catch (err) {
    alert(`Pull failed: ${(err as Error).message}`);
  } finally {
    btn.disabled = false;
  }
}

const FADE_MS = 700;

// The cards are built under the stage and the stage fades out over them, so the video's last frame melts into the loop.
function playPull(best: Tier, done: () => void) {
  const stage = $('stage');
  const video = $<HTMLVideoElement>('video');
  const fallback = $('fallback');
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
    stage.classList.add('fading');
    setTimeout(() => {
      video.pause();
      stage.hidden = true;
      stage.classList.remove('fading');
    }, FADE_MS);
  };
  const runFallback = () => {
    video.hidden = true;
    fallback.hidden = false;
    fallback.style.setProperty('--c', { T1: '#ffd34d', T2: '#b36bff', T3: '#5ec8ff' }[best]);
    // restart the CSS animations
    fallback.replaceChildren(...[...fallback.children].map((el) => el.cloneNode(true)));
    setTimeout(finish, 3400);
  };
  stage.hidden = false;
  $('skip').onclick = finish;
  fallback.hidden = true;
  video.hidden = false;
  if ($<HTMLInputElement>('novideo').checked) return runFallback();
  video.ontimeupdate = () => { if (video.duration && video.currentTime >= video.duration - FADE_MS / 1000) finish(); };
  video.onended = finish;
  video.onerror = runFallback;
  video.src = `${shared}pull-${best.toLowerCase()}.mp4`;
  video.play().catch(runFallback);
}

let opened = 0;
let currentTeam = '';

function showResults(team: string, got: Prize[], best: Tier) {
  opened = 0;
  const results = $('results');
  results.classList.remove('dealt');
  $('res-title').innerHTML = `${team}<small>${got.length} pull${got.length > 1 ? 's' : ''} · click a disc to reveal</small>`;
  $('cards').replaceChildren(
    ...got.map((p, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `card ${p.tier}`;
      card.style.animationDelay = `${i * 0.14}s`;
      card.innerHTML = `
        <div class="face back"><div class="disc"></div><img src="${asset('logo-transparent.png')}" alt="" /><span>PRIZE DISC</span></div>
        <div class="face front"><div class="tier">${tiers[p.tier].label}</div>${p.image ? `<img class="photo" src="${p.image}" alt="" />` : `<svg class="icon"><use href="#i-${p.icon}"/></svg>`}<b>${p.name}</b></div>`;
      card.onclick = () => reveal(card, p, got.length);
      return card;
    }),
  );
  // tail of the pull video, ping-ponged (made with ffmpeg, see .context/prize-system.md); the blurred keyframe shows if it is missing
  const loop = $<HTMLVideoElement>('bgloop');
  loop.classList.remove('on');
  loop.onplaying = () => loop.classList.add('on');
  loop.src = `${shared}loop-${best.toLowerCase()}.mp4`;
  loop.play().catch(() => {});
  $('reveal-all').hidden = false;
  $('next').hidden = true;
  results.hidden = false;
  setTimeout(() => results.classList.add('dealt'), FADE_MS / 2);
}

// Rarer cards wind up longer before they flip.
const windup: Record<Tier, number> = { T1: 650, T2: 280, T3: 0 };

function reveal(card: HTMLElement, p: Prize, total: number): Promise<void> {
  if (card.classList.contains('open') || card.classList.contains('charging')) return Promise.resolve();
  card.classList.add('charging');
  return new Promise((resolve) => setTimeout(async () => {
    if (p.reveal) {
      await special(p);
      card.classList.add('instant');
      card.classList.replace('charging', 'open');
    } else {
      card.classList.replace('charging', 'open');
      chime(p.tier);
      if (p.tier === 'T1') setTimeout(() => burst(card), 250);
    }
    if (++opened === total) {
      $('reveal-all').hidden = true;
      $('next').hidden = false;
    }
    resolve();
  }, windup[p.tier]));
}

// Boss-song style reveal: animation (8 s T2 / 15 s T1) ending on the item, then a 10 s showcase over a seamless loop of
// that last frame, all under one music cue whose drop is aligned to the hand-off. `white` follows each video's own flash.
const SHOW_MS = 10_000;
const beats: Record<'T1' | 'T2', { anim: number; white: number }> = {
  T1: { anim: 15_000, white: 11_600 },
  T2: { anim: 8000, white: 5100 },
};

function special(p: Prize): Promise<void> {
  return new Promise((resolve) => {
    const tier = p.tier === 'T3' ? 'T2' : p.tier;
    const b = beats[tier];
    const root = $('special');
    const rev = $<HTMLVideoElement>('sp-reveal');
    const show = $<HTMLVideoElement>('sp-show');
    const music = new Audio(`${p.base}music.mp3`);
    const loop = $<HTMLVideoElement>('bgloop');
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    let phase: 'anim' | 'show' | 'done' = 'anim';

    root.className = `special ${tier}`;
    root.hidden = false;
    $<HTMLImageElement>('sp-jacket').src = p.image ?? '';
    $('sp-tier').textContent = tiers[p.tier].label;
    $('sp-name').textContent = p.name;
    $('sp-team').textContent = `${currentTeam} · Stupid Hackathon X`;
    show.src = `${p.base}show.mp4`;
    show.style.opacity = '0';
    rev.style.opacity = '1';
    rev.src = `${p.base}reveal.mp4`;
    loop.pause();

    const toShow = () => {
      if (phase !== 'anim') return;
      phase = 'show';
      show.currentTime = 0;
      show.play().catch(() => {});
      show.style.opacity = '1';
      rev.style.opacity = '0';
      root.classList.add('showing');
      chime(p.tier);
      at(SHOW_MS, close);
    };
    const close = () => {
      if (phase === 'done') return;
      phase = 'done';
      timers.forEach(clearTimeout);
      root.classList.add('out');
      const vol = music.volume;
      [0.6, 0.3, 0].forEach((v, i) => setTimeout(() => (music.volume = vol * v), i * 180));
      setTimeout(() => {
        music.pause();
        rev.pause();
        show.pause();
        root.hidden = true;
        root.className = 'special';
        loop.play().catch(() => {});
        resolve();
      }, 600);
    };

    at(p.flash ?? b.white, () => { const w = $('sp-white'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); });
    at(b.anim + 1500, toShow); // safety net if the video stalls
    rev.onended = toShow;
    rev.onerror = toShow;
    $('sp-skip').onclick = close;
    music.play().catch(() => {});
    rev.play().catch(toShow);
  });
}

function burst(card: HTMLElement) {
  const flash = document.createElement('div');
  flash.className = 'flash';
  document.body.append(flash);
  setTimeout(() => flash.remove(), 1000);
  const r = card.getBoundingClientRect();
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    const a = Math.random() * Math.PI * 2;
    const d = 120 + Math.random() * 260;
    s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:hsl(${Math.random() * 360} 100% 65%);--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
    document.body.append(s);
    setTimeout(() => s.remove(), 1200);
  }
}

let audio: AudioContext | undefined;
function chime(t: Tier) {
  audio ??= new AudioContext();
  const notes = { T3: [660], T2: [523, 784], T1: [523, 659, 784, 1047] }[t];
  notes.forEach((f, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    const at = audio!.currentTime + i * 0.09;
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    o.connect(g).connect(audio!.destination);
    o.start(at);
    o.stop(at + 0.65);
  });
}

$('minus').onclick = () => setCount(count - 1);
$('plus').onclick = () => setCount(count + 1);
$('pull').onclick = () => void pull();
$('reset').onclick = async () => {
  if (!confirm('Reset prize stock and the pull log on the server? (every pull so far is forgotten)')) return;
  await adminFetch('/api/gacha', { method: 'DELETE' });
  await unlock(getToken());
};
$('reveal-all').onclick = () => {
  // commons first, SSR last
  const rank = (c: Element) => order.indexOf([...c.classList].find((k) => k in tiers) as Tier);
  const queue = [...document.querySelectorAll<HTMLElement>('.card:not(.open)')].sort((a, b) => rank(b) - rank(a));
  (async () => {
    for (const c of queue) {
      c.click();
      await new Promise((r) => setTimeout(r, 600));
      // a special reveal holds the queue until it closes
      while (!$('special').hidden || c.classList.contains('charging')) await new Promise((r) => setTimeout(r, 200));
    }
  })();
};
$('next').onclick = () => {
  $('results').hidden = true;
  $<HTMLVideoElement>('bgloop').pause();
  $('setup').hidden = false;
  $<HTMLInputElement>('team').value = '';
  renderStock();
};
// Prize list from the NOC server (which reads the Grist Prize table live and knows what has been drawn). `base` = media
// folder from Grist `Video link`; its meta.json may add { "flash": ms }.
interface ServerPrize { id: string; name: string; tier: Tier; amount: number; image?: string; base?: string; reveal: boolean; remaining: number }

async function loadPrizes(token: string): Promise<Prize[] | null> {
  const res = await fetch(`${api()}/api/gacha/prizes?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`reward list: HTTP ${res.status}`);
  const data = (await res.json()) as { prizes: ServerPrize[]; rates: Record<Tier, number> };
  for (const t of order) if (typeof data.rates?.[t] === 'number') tiers[t].rate = data.rates[t];
  stock = Object.fromEntries(data.prizes.map((p) => [p.id, p.remaining]));
  const list = data.prizes.map((p): Prize => ({ id: p.id, name: p.name, tier: p.tier, amount: p.amount, icon: 'gear', image: p.image, base: p.base, reveal: p.reveal }));
  await Promise.all(list.filter((p) => p.base).map(async (p) => {
    const meta = await fetch(`${p.base}meta.json`).catch(() => null);
    if (meta?.ok) Object.assign(p, await meta.json());
  }));
  return list;
}

async function loadTeams() {
  try {
    const r = await fetch(`${api()}/api/projects`, { cache: 'no-store' });
    if (!r.ok) return;
    const { projects } = (await r.json()) as { projects: { order: number; team: string; members: string }[] };
    const dl = document.getElementById('teams');
    if (dl) dl.replaceChildren(...projects.map((p) => new Option(`${p.members ? `${p.members.split(/[,\n]/).filter((m) => m.trim()).length} คน` : ''}`, p.team)));
  } catch {
    /* offline */
  }
}

function savedToken(): string {
  const q = new URLSearchParams(location.search);
  const t = q.get('admin');
  if (t !== null) {
    setToken(t);
    q.delete('admin');
    history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
  }
  return getToken();
}

async function unlock(token: string): Promise<boolean> {
  const list = await loadPrizes(token);
  if (!list) return false;
  setToken(token);
  prizes = list;
  void loadTeams();
  $('demo').replaceChildren(new Option('Demo: random', ''), ...prizes.filter((p) => p.reveal).map((p) => new Option(`Demo: ${tiers[p.tier].label} ${p.name}`, p.id)));
  renderStock();
  $('lock').hidden = true;
  $('setup').hidden = false;
  return true;
}

$<HTMLFormElement>('lock-form').onsubmit = async (e) => {
  e.preventDefault();
  const msg = $('lock-msg');
  msg.textContent = '…';
  try {
    msg.textContent = (await unlock($<HTMLInputElement>('lock-pass').value.trim())) ? '' : 'รหัสผ่านไม่ถูกต้อง';
  } catch (err) {
    msg.textContent = `โหลดรายการรางวัลไม่ได้ (${(err as Error).message})`;
  }
};
$('logout').onclick = () => {
  setToken('');
  location.reload();
};

document.body.style.setProperty('--bg', `url(${shared}keyframe.png)`);
setCount(3);
const token = savedToken();
if (token) unlock(token).catch(() => {});
