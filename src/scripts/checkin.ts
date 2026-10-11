// Check-in desk: attendee list + check-in / deposit-refund toggles on the NOC server, shared across staff phones.
import { apiBase } from './netapi';

interface Attendee { ref: string; name: string; grp: string; ticket: string; price: number; paid: number; email: string; phone: string; order_no: string; eventpop_used: string; team: string; note: string; checked_at: number; refunded_at: number }
const ADMIN_KEY = 'shtx-noc-admin';
const api = () => apiBase().replace(/\/$/, '');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const getToken = () => { try { return localStorage.getItem(ADMIN_KEY) ?? ''; } catch { return ''; } };
const setToken = (t: string) => { try { t ? localStorage.setItem(ADMIN_KEY, t) : localStorage.removeItem(ADMIN_KEY); } catch { /* private mode */ } };
const call = async (path: string, init?: RequestInit) => fetch(`${api()}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken())}`, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });

let rows: Attendee[] = [];
let counts = { total: 0, checked: 0, refunded: 0, paid: 0, paidChecked: 0, paidRefunded: 0, refundedBaht: 0, toRefundBaht: 0 };
let filter: 'todo' | 'checked' | 'refund' | 'all' = 'todo';
let paidOnly = true;
let sortBy: 'name' | 'ticket' | 'checked' | 'paid' | 'pos' = 'name';
const say = (t: string) => { $('msg').textContent = t; setTimeout(() => { if ($('msg').textContent === t) $('msg').textContent = ''; }, 4000); };
const time = (ms: number) => new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

async function load(): Promise<boolean> {
  const r = await call('/api/attendees');
  if (r.status === 403) return false;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { attendees: Attendee[]; counts: typeof counts };
  rows = d.attendees;
  counts = d.counts;
  render();
  $('sync').textContent = `sync ${time(Date.now())}`;
  return true;
}

function render() {
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const list = $('list');
  const shown = rows.filter((a) => {
    if (paidOnly && !(a.price > 0)) return false;
    if (filter === 'todo' && a.checked_at) return false;
    if (filter === 'checked' && !a.checked_at) return false;
    if (filter === 'refund' && (!a.price || a.refunded_at)) return false;
    if (!q) return true;
    return [a.name, a.email, a.phone, a.ref, a.order_no, a.ticket, a.team].some((v) => (v || '').toLowerCase().includes(q));
  });
  const coll = new Intl.Collator('th');
  shown.sort((a, b) => sortBy === 'name' ? coll.compare(a.name, b.name) : sortBy === 'ticket' ? coll.compare(a.ticket, b.ticket) || coll.compare(a.name, b.name) : sortBy === 'checked' ? (b.checked_at || 0) - (a.checked_at || 0) || coll.compare(a.name, b.name) : sortBy === 'paid' ? (b.paid || b.price) - (a.paid || a.price) || coll.compare(a.name, b.name) : 0);
  list.replaceChildren(
    ...shown.map((a) => {
      const row = document.createElement('div');
      row.className = `row${a.refunded_at ? ' r' : a.checked_at ? ' c' : ''}`;
      row.innerHTML = `<div><b></b><small></small><small class="st"></small></div><div class="acts"><button class="xpbtn ci" type="button"></button><button class="xpbtn rf" type="button"></button></div>`;
      row.querySelector('b')!.textContent = a.name;
      row.querySelectorAll('small')[0].textContent = `${a.ticket}${a.price ? ` · จ่ายจริง ฿${a.paid || a.price}` : ' · ฟรี'}${a.grp && a.grp !== 'ผู้เข้าร่วม' ? ` · ${a.grp}` : ''} · ${a.ref}${a.team ? ` · ทีม ${a.team}` : ''}`;
      row.querySelector('.st')!.textContent = `${a.checked_at ? `เช็คอิน ${time(a.checked_at)}` : a.eventpop_used ? `Eventpop สแกนแล้ว (${a.eventpop_used})` : 'ยังไม่เช็คอิน'}${a.refunded_at ? ` · คืนมัดจำแล้ว ${time(a.refunded_at)}` : ''}${a.note ? ` · ${a.note}` : ''}`;
      const ci = row.querySelector<HTMLButtonElement>('.ci')!;
      ci.textContent = a.checked_at ? '✔ เช็คอินแล้ว' : 'เช็คอิน';
      ci.classList.toggle('on', !!a.checked_at);
      ci.onclick = () => void mark(a, { checked: !a.checked_at });
      const rf = row.querySelector<HTMLButtonElement>('.rf')!;
      rf.hidden = !a.price;
      rf.textContent = a.refunded_at ? `✔ คืน ฿${a.paid || a.price}` : `คืน ฿${a.paid || a.price}`;
      rf.classList.toggle('on', !!a.refunded_at);
      rf.onclick = () => { if (a.refunded_at && !confirm(`ยกเลิกการคืนเงินของ ${a.name}?`)) return; void mark(a, { refunded: !a.refunded_at }); };
      return row;
    }),
  );
  if (!shown.length) list.innerHTML = `<div class="empty">${rows.length ? 'ไม่มีรายการในตัวกรองนี้' : 'ยังไม่มีรายชื่อ นำเข้า CSV จาก Eventpop ด้านล่าง'}</div>`;
  $('counts').innerHTML = `ผู้เข้าร่วมจ่ายเงิน <b>${counts.paidChecked}/${counts.paid}</b> เช็คอิน · คืนเงินแล้ว <b>${counts.paidRefunded}/${counts.paid}</b> (฿${counts.refundedBaht.toLocaleString()}) · ยังต้องคืน ฿${counts.toRefundBaht.toLocaleString()} · ทุกบัตร <b>${counts.checked}/${counts.total}</b> · แสดง ${shown.length}`;
}

async function mark(a: Attendee, fields: { checked?: boolean; refunded?: boolean }) {
  const r = await call('/api/attendees/mark', { method: 'POST', body: JSON.stringify({ ref: a.ref, ...fields }) });
  if (!r.ok) return say('บันทึกไม่สำเร็จ ลองใหม่');
  const d = (await r.json()) as { ok: boolean; attendee: Attendee };
  Object.assign(a, d.attendee);
  await load();
  if (fields.checked) say(`เช็คอิน ${a.name} แล้ว`);
  if (fields.refunded) say(`คืน ฿${a.paid || a.price} ให้ ${a.name} แล้ว`);
}

// Eventpop "attendees" export → rows (ref = Reference code)
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((v) => v.trim()));
}
const money = (s: string) => Number((s || '').replace(/[฿,\s]/g, '')) || 0;
async function importCsv(file: File) {
  const text = (await file.text()).replace(/^﻿/, '');
  const [head, ...body] = parseCsv(text);
  const col = (name: string) => head.findIndex((h) => h.trim() === name);
  const idx = { ref: col('Reference code'), type: col('Ticket type'), email: col('Email'), fn: col('Firstname'), ln: col('Lastname'), phone: col('Phone'), order: col('Order number'), price: col('Price'), used: col('Used at'), team: col('ชื่อทีม') };
  // the attendees export has no fee column: keep the server's `paid` (imported from the orders export) by sending none
  if (idx.ref < 0 || idx.fn < 0) return say('ไม่ใช่ไฟล์ attendees ของ Eventpop (ไม่มี Reference code / Firstname)');
  const rowsOut = body.map((r) => {
    const ticket = r[idx.type] ?? '';
    const price = money(r[idx.price] ?? '');
    const grp = /^Staff/i.test(ticket) ? 'Staff' : /Sponsor|สังเกตการณ์/.test(ticket) ? 'Sponsor/Observer' : price > 0 ? 'ผู้เข้าร่วม' : 'ฟรี';
    return { ref: r[idx.ref], name: `${r[idx.fn] ?? ''} ${r[idx.ln] ?? ''}`.trim(), grp, ticket, price, email: r[idx.email] ?? '', phone: r[idx.phone] ?? '', order_no: r[idx.order] ?? '', eventpop_used: r[idx.used] ?? '', team: idx.team >= 0 ? r[idx.team] ?? '' : '' };
  }).filter((r) => r.ref && r.name);
  const res = await call('/api/attendees/import', { method: 'POST', body: JSON.stringify({ rows: rowsOut }) });
  const d = (await res.json()) as { ok?: boolean; rows?: number; added?: number; error?: string };
  say(d.ok ? `นำเข้า ${d.rows} แถว (ใหม่ ${d.added})` : `นำเข้าไม่สำเร็จ: ${d.error ?? res.status}`);
  await load();
}

async function unlock(token: string) {
  setToken(token);
  try {
    if (!(await load())) { setToken(''); return false; }
  } catch (e) { $('lock-msg').textContent = `โหลดไม่ได้ (${(e as Error).message})`; return false; }
  $('lock').hidden = true;
  $('desk').hidden = false;
  $<HTMLAnchorElement>('export').href = `${api()}/api/attendees.csv?token=${encodeURIComponent(token)}`;
  return true;
}

$<HTMLFormElement>('lock-form').onsubmit = async (e) => {
  e.preventDefault();
  $('lock-msg').textContent = '…';
  if (!(await unlock($<HTMLInputElement>('lock-pass').value.trim()))) $('lock-msg').textContent = $('lock-msg').textContent === '…' ? 'รหัสผ่านไม่ถูกต้อง' : $('lock-msg').textContent;
  else $('lock-msg').textContent = '';
};
$('q').addEventListener('input', render);
$('paidonly').onclick = () => { paidOnly = !paidOnly; $('paidonly').setAttribute('aria-pressed', String(paidOnly)); render(); };
$<HTMLSelectElement>('sort').onchange = (e) => { sortBy = (e.target as HTMLSelectElement).value as typeof sortBy; render(); };
document.querySelectorAll<HTMLButtonElement>('.bar [data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f as typeof filter; document.querySelectorAll('.bar [data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
$<HTMLInputElement>('csv').onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importCsv(f); };
$('logout').onclick = () => { setToken(''); location.reload(); };
setInterval(() => { if (!$('desk').hidden) void load().catch(() => undefined); }, 10_000);
{
  const q = new URLSearchParams(location.search);
  const t = q.get('admin');
  if (t !== null) { setToken(t); q.delete('admin'); history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`); }
  const token = getToken();
  if (token) void unlock(token);
}
