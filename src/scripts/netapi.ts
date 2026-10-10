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
};

export interface PauseState {
  hunt: boolean;
  net: boolean;
}

export interface HuntState {
  keys: { id: string; name: string; hint?: string | null; finds: number; first: { nick: string; at: number } | null }[];
  completed: { nick: string; cert: string; at: number }[];
  devices: number;
}
