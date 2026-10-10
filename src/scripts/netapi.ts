// SHTX-NET server client. The site is static, so the API base comes from (in order): ?api=… (saved to localStorage),
// localStorage, the PUBLIC_SHTX_NET_API build variable. Empty base = offline mode: everything still works phone-to-phone.
import type { Card } from '../data/network';

const KEY = 'shtx-net-api';

export function apiBase(): string {
  try {
    const q = new URLSearchParams(location.search).get('api');
    if (q !== null) {
      if (q) localStorage.setItem(KEY, q.replace(/\/$/, ''));
      else localStorage.removeItem(KEY);
    }
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch {
    /* private mode etc. */
  }
  const built = (import.meta.env.PUBLIC_SHTX_NET_API as string | undefined) ?? '';
  return built.replace(/\/$/, '');
}

export const hasApi = () => apiBase() !== '';

/** Stable per-phone id shared by the games: the SHTX-NET MAC if the phone has one, else the Logo Hunting device id (created here if needed). */
export function deviceId(): string {
  try {
    const net = JSON.parse(localStorage.getItem('shtx-net-v1') || '{}');
    if (net?.me?.mac) return String(net.me.mac);
    const hunt = JSON.parse(localStorage.getItem('shtx-hunt-v1') || '{}');
    if (hunt?.device) return String(hunt.device);
    const id = `dev-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    localStorage.setItem('shtx-hunt-v1', JSON.stringify({ ...(hunt && typeof hunt === 'object' ? hunt : {}), device: id }));
    return id;
  } catch {
    return 'dev-private';
  }
}

export interface ServerLink {
  mac: string;
  nick: string;
  skill: string;
  idea: string;
  via: string;
  at: number;
}

export interface ServerState {
  nodes: (Card & { at: number })[];
  links: { a: string; b: string; via: string; at: number }[];
  events: { type: string; mac: string; detail: string; at: number }[];
  stats: { packets: number; crc: number; started: number };
  pause?: PauseState;
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!hasApi()) return null;
  try {
    const r = await fetch(apiBase() + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  register: (card: Card) => call<Card>('/api/nodes', { method: 'POST', body: JSON.stringify(card) }),
  node: (mac: string) => call<Card>(`/api/nodes/${encodeURIComponent(mac)}`),
  link: (a: string, b: string, via: string, proof?: unknown) => call<{ ok: boolean }>('/api/links', { method: 'POST', body: JSON.stringify({ a, b, via, proof }) }),
  linksOf: (mac: string) => call<{ links: ServerLink[] }>(`/api/nodes/${encodeURIComponent(mac)}/links`),
  event: (type: string, mac: string, detail = '') => call<{ ok: boolean }>('/api/events', { method: 'POST', body: JSON.stringify({ type, mac, detail }) }),
  state: () => call<ServerState>('/api/state'),
  huntFind: (device: string, nick: string, key: string, proof: string) => call<{ ok: boolean; complete?: boolean }>('/api/hunt/find', { method: 'POST', body: JSON.stringify({ device, nick, key, proof }) }),
  hunt: () => call<HuntState>('/api/hunt'),
  pause: () => call<PauseState>('/api/pause'),
  ransom: () => call<{ macs: string[]; top: { mac: string; nick: string; qr: number } | null }>('/api/ransom'),
  submitProject: (p: { device: string; team: string; members: string; project: string; description: string; link: string; needs: string }) => call<{ ok: boolean; order?: number; error?: string }>('/api/projects', { method: 'POST', body: JSON.stringify(p) }),
  projects: () => call<{ projects: Project[] }>('/api/projects'),
  vote: (device: string, target: string) => call<{ ok: boolean; error?: string }>('/api/vote', { method: 'POST', body: JSON.stringify({ device, target }) }),
  votes: () => call<VoteState>('/api/votes'),
};

export interface VoteState {
  open: boolean;
  total: number;
  results: { device: string; team: string; project: string; votes: number }[];
}

export interface Project {
  device: string;
  team: string;
  members: string;
  project: string;
  description: string;
  link: string;
  needs: string;
  at: number;
  order: number;
}

export interface PauseState {
  hunt: boolean;
  net: boolean;
  submit?: boolean; // submissions closed by staff
  vote?: boolean; // voting open
  update?: number; // timestamp of the last staff "Windows Update" push (0 = never)
  updateMsg?: string;
}

export interface HuntState {
  keys: { id: string; name: string; hint?: string | null; finds: number; first: { nick: string; at: number } | null }[];
  completed: { nick: string; cert: string; at: number }[];
  devices: number;
}
