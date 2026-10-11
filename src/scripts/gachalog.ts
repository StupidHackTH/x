// Staff gacha log: reads /api/gacha/log + /api/gacha/prizes from the NOC server, toggles "collected" via /api/gacha/claim.
import { apiBase } from './netapi';

interface Prize { id: string; name: string; tier: 'T1' | 'T2' | 'T3'; amount: number; remaining: number }
interface Pull { id: number; team: string; count: number; prizes: string[]; at: number; claimed: boolean }
const ADMIN_KEY = 'shtx-noc-admin';
const api = () => apiBase().replace(/\/$/, '');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const getToken = () => { try { return localStorage.getItem(ADMIN_KEY) ?? ''; } catch { return ''; } };
const setToken = (t: string) => { try { t ? localStorage.setItem(ADMIN_KEY, t) : localStorage.removeItem(ADMIN_KEY); } catch { /* private mode */ } };
const call = (path: string, init?: RequestInit) => fetch(`${api()}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken())}`, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hhmm = (t: number) => new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const TIER_ORDER = { T1: 0, T2: 1, T3: 2 } as const;

let prizes = new Map<string, Prize>();
let pulls: Pull[] = [];
let filter: 'all' | 'todo' | 'done' = 'all';
let byPrize = false;

const prizeOf = (id: string): Prize => prizes.get(id) ?? { id, name: id, tier: 'T3', amount: 0, remaining: 0 };
const chip = (id: string) => { const p = prizeOf(id); return `<span class="chip ${p.tier.toLowerCase()}"><i>${p.tier}</i>${esc(p.name)}</span>`; };

async function load(): Promise<boolean> {
  const [pr, lg] = await Promise.all([call('/api/gacha/prizes'), call('/api/gacha/log')]);
  if (pr.status === 403 || lg.status === 403) return false;
  if (!lg.ok) throw new Error(`log ${lg.status}`);
  pulls = ((await lg.json()) as { pulls: Pull[] }).pulls;
  if (pr.ok) prizes = new Map(((await pr.json()) as { prizes: Prize[] }).prizes.map((p) => [p.id, p]));
  $('sync').textContent = `อัปเดต ${hhmm(Date.now())}`;
  render();
  return true;
}

function render() {
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const given = pulls.reduce((n, p) => n + p.prizes.length, 0);
  const claimed = pulls.filter((p) => p.claimed);
  const tierGiven = { T1: 0, T2: 0, T3: 0 };
  for (const p of pulls) for (const id of p.prizes) tierGiven[prizeOf(id).tier]++;
  const tierLeft = { T1: 0, T2: 0, T3: 0 };
  for (const p of prizes.values()) tierLeft[p.tier] += p.remaining;
  $('counts').innerHTML = [
    `pull <b>${pulls.length}</b>`, `ทีม <b>${new Set(pulls.map((p) => p.team)).size}</b>`, `ของออก <b>${given}</b>`,
    `รับของแล้ว <b>${claimed.length}/${pulls.length}</b> pull`,
    ...(['T1', 'T2', 'T3'] as const).map((t) => `${t} ออก <b>${tierGiven[t]}</b> เหลือ <b>${tierLeft[t]}</b>`),
  ].join('<span>·</span>');

  if (byPrize) return renderTally(q);
  const rows = pulls
    .filter((p) => filter === 'all' || (filter === 'done') === p.claimed)
    .filter((p) => !q || p.team.toLowerCase().includes(q) || p.prizes.some((id) => prizeOf(id).name.toLowerCase().includes(q)))
    .sort((a, b) => b.id - a.id);
  $('list').innerHTML = rows.length
    ? rows.map((p) => `<div class="pull${p.claimed ? ' c' : ''}"><div class="who"><b>${esc(p.team)}</b><small>#${p.id} · ${hhmm(p.at)} · ${p.prizes.length} ชิ้น</small></div>
        <button class="xpbtn${p.claimed ? ' on' : ''}" type="button" data-claim="${p.id}" data-v="${p.claimed ? '0' : '1'}">${p.claimed ? '✓ รับแล้ว' : 'รับของแล้ว'}</button>
        <div class="chips">${[...p.prizes].sort((a, b) => TIER_ORDER[prizeOf(a).tier] - TIER_ORDER[prizeOf(b).tier]).map(chip).join('')}</div></div>`).join('')
    : `<div class="empty">${pulls.length ? 'ไม่มีรายการที่ตรง' : 'ยังไม่มีใครกด pull'}</div>`;
}

function renderTally(q: string) {
  const teams = new Map<string, string[]>();
  for (const p of pulls) for (const id of p.prizes) teams.set(id, [...(teams.get(id) ?? []), p.team]);
  const ids = new Set([...prizes.keys(), ...teams.keys()]);
  const rows = [...ids].map(prizeOf)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (teams.get(p.id) ?? []).some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || (teams.get(b.id)?.length ?? 0) - (teams.get(a.id)?.length ?? 0) || a.name.localeCompare(b.name, 'th'));
  const count = (list: string[]) => [...list.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string, number>())].map(([t, n]) => esc(n > 1 ? `${t} ×${n}` : t)).join(', ');
  $('list').innerHTML = `<table class="tally"><thead><tr><th>ของ</th><th class="n">ออก</th><th class="n">เหลือ</th><th>ทีมที่ได้</th></tr></thead><tbody>${rows.map((p) => {
    const got = teams.get(p.id) ?? [];
    return `<tr class="${p.remaining ? '' : 'out'}"><td>${chip(p.id)}</td><td class="n">${got.length}</td><td class="n">${p.remaining}/${p.amount}</td><td><small>${count(got) || '–'}</small></td></tr>`;
  }).join('')}</tbody></table>`;
}

function exportCsv() {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['pull', 'time', 'team', 'tier', 'prize', 'collected'].map(cell).join(',')];
  for (const p of [...pulls].sort((a, b) => a.id - b.id)) for (const id of p.prizes) { const z = prizeOf(id); lines.push([p.id, new Date(p.at).toISOString(), p.team, z.tier, z.name, p.claimed ? 'yes' : 'no'].map(cell).join(',')); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `shtx-gacha-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('list').addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-claim]');
  if (!b) return;
  b.disabled = true;
  const res = await call('/api/gacha/claim', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.claim), claimed: b.dataset.v === '1' }) }).catch(() => null);
  $('msg').textContent = res?.ok ? '' : 'บันทึกไม่สำเร็จ ลองใหม่';
  await load().catch(() => undefined);
});

function live() {
  try {
    const ws = new WebSocket(`${api().replace(/^http/, 'ws')}/api/live`);
    ws.onmessage = (m) => { try { if (JSON.parse(m.data).type === 'gacha') void load().catch(() => undefined); } catch { /* ignore */ } };
    ws.onclose = () => setTimeout(live, 3000);
  } catch { setTimeout(live, 5000); }
}

async function unlock(token: string) {
  setToken(token);
  try {
    if (!(await load())) { setToken(''); return false; }
  } catch (e) { $('lock-msg').textContent = `โหลดไม่ได้ (${(e as Error).message})`; return false; }
  $('lock').hidden = true;
  $('desk').hidden = false;
  live();
  return true;
}

$<HTMLFormElement>('lock-form').onsubmit = async (e) => {
  e.preventDefault();
  $('lock-msg').textContent = '…';
  if (!(await unlock($<HTMLInputElement>('lock-pass').value.trim()))) $('lock-msg').textContent = $('lock-msg').textContent === '…' ? 'รหัสผ่านไม่ถูกต้อง' : $('lock-msg').textContent;
  else $('lock-msg').textContent = '';
};
$('q').addEventListener('input', render);
document.querySelectorAll<HTMLButtonElement>('.bar [data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f as typeof filter; document.querySelectorAll('.bar [data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
$('view').onclick = () => { byPrize = !byPrize; $('view').setAttribute('aria-pressed', String(byPrize)); render(); };
$('csv').onclick = exportCsv;
$<HTMLAnchorElement>('gacha-link').href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/gacha/`;
$('logout').onclick = () => { setToken(''); location.reload(); };
setInterval(() => { if (!$('desk').hidden) void load().catch(() => undefined); }, 15_000);
{
  const q = new URLSearchParams(location.search);
  const t = q.get('admin');
  if (t !== null) { setToken(t); q.delete('admin'); history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`); }
  const token = getToken();
  if (token) void unlock(token);
}
