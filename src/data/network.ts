// SHTX-NET: the icebreaker "network". Pure data + helpers shared by the Network window, the NOC page and the server.
// Five questions pack into the MAC address (3 bits each, bytes 1–2); bytes 3–5 are random so 60–200 people never collide.

export interface Question {
  id: string;
  q: string;
  options: string[];
}

export const questions: Question[] = [
  {
    id: 'nic',
    q: 'การ์ดแลนของคุณยี่ห้ออะไร',
    options: ['Realtek', 'Broadcom', 'Intel', '3Com', 'D-Link', 'ติดมากับเมนบอร์ด', 'USB dongle ที่ยืมเพื่อนมา', 'ไม่รู้ แต่ไฟมันกะพริบ'],
  },
  {
    id: 'browser',
    q: 'ปี 2005 คุณใช้เบราว์เซอร์อะไร',
    options: ['Internet Explorer 6', 'Firefox', 'Opera', 'Netscape', 'Safari', 'Maxthon', 'อะไรก็ได้ที่ร้านเน็ตมี', 'ยังไม่เกิด'],
  },
  {
    id: 'uplink',
    q: 'เน็ตที่บ้านตอนนั้นเร็วแค่ไหน',
    options: ['56k dial-up (เสียงต๊อด ๆ)', 'ADSL 256k', 'ร้านเน็ต ชม.ละ 15', 'Wi-Fi เพื่อนบ้าน', 'GPRS บนมือถือ', 'Hi-Speed 1 Mbps', 'LAN มหาลัย', 'ไม่มีเน็ต'],
  },
  {
    id: 'role',
    q: 'ในงานแฮ็กกาธอน คุณคือ',
    options: ['คนคิดไอเดีย', 'คนพิมพ์โค้ด', 'คนทำสไลด์', 'คนหาข้าว', 'คนหลับ', 'คนเดินถามทีมอื่น', 'คนทำ demo พัง', 'คน debug ตอนตีสาม'],
  },
  {
    id: 'outage',
    q: 'Wi-Fi ล่ม คุณจะ',
    options: ['รีสตาร์ตเราเตอร์', 'โทษ ISP', 'เปิด hotspot', 'นอน', 'ไปคุยกับคนข้าง ๆ', 'เขียนโค้ด offline', 'กินข้าว', 'กลับบ้าน'],
  },
];

/* OUI-style vendor string decoded from the first question */
export const vendors = [
  'Realtek Semiconductor Corp.',
  'Broadcom Inc.',
  'Intel Corporate',
  '3Com Corporation',
  'D-Link International',
  'Onboard LAN (ไดรเวอร์หาย)',
  'Generic USB Ethernet (ยืมมา)',
  'Unknown Vendor (ไฟกะพริบ)',
];

export const skillSuggestions = ['Frontend', 'Backend', 'Design', 'Hardware', 'Data', 'Pitch', 'หาข้าว', 'ให้กำลังใจ', 'นอนเก่ง', 'ถามเก่ง'];

export const LIMITS = { nick: 12, skill: 20, idea: 60, nickBytes: 24, skillBytes: 40, ideaBytes: 120 } as const;

export interface Card {
  mac: string; // "02:AB:CD:12:34:56"
  nick: string;
  skill: string;
  idea: string;
}

export interface Link {
  mac: string; // peer
  nick: string;
  skill?: string;
  idea?: string;
  via: 'air' | 'qr' | 'manual';
  at: number; // epoch ms
}

export function packMac(answers: number[], random: Uint8Array = cryptoBytes(3)): Uint8Array {
  const a = answers.map((v) => Math.max(0, Math.min(7, v | 0)));
  const b = new Uint8Array(6);
  b[0] = 0x02; // locally administered, unicast: it is not a real vendor and we are proud of it
  b[1] = (a[0] << 5) | (a[1] << 2) | (a[2] >> 1);
  b[2] = ((a[2] & 1) << 7) | (a[3] << 4) | (a[4] << 1) | (random[0] & 1);
  b[3] = random[0];
  b[4] = random[1];
  b[5] = random[2];
  return b;
}

export function unpackAnswers(mac: Uint8Array | string): number[] {
  const b = typeof mac === 'string' ? parseMac(mac) : mac;
  if (!b) return [0, 0, 0, 0, 0];
  return [b[1] >> 5, (b[1] >> 2) & 7, ((b[1] & 3) << 1) | (b[2] >> 7), (b[2] >> 4) & 7, (b[2] >> 1) & 7];
}

export function formatMac(b: Uint8Array): string {
  return Array.from(b, (v) => v.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

export function parseMac(s: string): Uint8Array | null {
  const hex = s.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) return null;
  return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
}

export function macEquals(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/* Fake ICQ number (9 digits) derived from the MAC, so a card prints the same UIN everywhere */
export function icqFor(mac: string): string {
  let h = 0x811c9dc5;
  for (const ch of mac) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const n = 100_000_000 + (h % 900_000_000);
  return String(n);
}

export function hostnameFor(nick: string): string {
  const clean = nick.trim().replace(/\s+/g, '-').toUpperCase() || 'HOST';
  return `${clean}-PC`;
}

export function vendorFor(mac: string): string {
  return vendors[unpackAnswers(mac)[0]] ?? vendors[7];
}

export function traitsFor(mac: string): string[] {
  const a = unpackAnswers(mac);
  return questions.map((q, i) => q.options[a[i]] ?? '?');
}

function cryptoBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
}

/* Clamp a string to a UTF-8 byte budget without splitting a character */
export function clampBytes(s: string, maxBytes: number): string {
  const enc = new TextEncoder();
  let out = '';
  for (const ch of s) {
    if (enc.encode(out + ch).length > maxBytes) break;
    out += ch;
  }
  return out;
}

/* How many cards earn the Proof of Friendship certificate */
export const CERT_LINKS = 5;
