// Drawdy Logo Hunting ("Activate Windows"): six product keys hidden around the venue. Only SHA-256 hashes live here;
// the plain keys are printed on the cards (scripts/hunt-cards.mjs reads them from HUNT_KEYS) and kept in claudeclaude.md.
export interface HuntSpot { id: string; name: string; hint: string; day: 1 | 2; hash: string }
export const huntSpots: HuntSpot[] = [
  { id: 'k1', name: 'Recycle Bin', hint: 'ของที่ถูกลบแล้วยังกู้คืนได้ ลองเปิดฝาดูข้างใน', day: 1, hash: '6f4788f372ae874ef8f9dca401d09ba103b30b0ac0ce6173732eb4004e9b40e7' },
  { id: 'k2', name: 'My Computer', hint: 'ไม่ต้องไปไกล บูท Drawdy นั่นแหละ ลองดูหลังจอ', day: 1, hash: 'bba2b1d8b4a1a81e303b5c70d9fadd88a38cdc77fbf9a439786f4d588c61d88a' },
  { id: 'k3', name: 'Desktop', hint: 'ทุกอย่างบน Desktop ต้องมีโต๊ะรองรับ ก้มดูข้างใต้', day: 1, hash: 'e100634ce085b56829f512ca686a265719769cb295776c9959436a1006c32367' },
  { id: 'k4', name: 'C:\\Windows\\System32', hint: 'โฟลเดอร์ที่ห้ามลบ อยู่ใกล้สายแลนกับไฟกะพริบ', day: 1, hash: '975c9c185e9d813ee55c09f07c2e57ab21734f8ac4dacbd779d6d63558073b3e' },
  { id: 'k5', name: 'Downloads', hint: 'ของที่โหลดมาจะโผล่ตรงทางเข้าชั้น 13', day: 1, hash: 'f64e8e1a74577dda9bea6929a89fd194dff38742cde6234a27ee25d3e964997d' },
  { id: 'k6', name: 'Program Files', hint: 'โปรแกรมที่รันทุกเช้าคือกาแฟ ดูแถวนั้น', day: 1, hash: '65a311787f303fbc82614d771ac8a3c9a7c2a8854d289c2a686d786559f86cf5' },
];
export const huntDays = { 1: '2026-10-10', 2: '2026-10-11' } as const;
export const huntSponsor = { name: 'Drawdy', url: 'https://drawdy.io', logo: 'drawdy.png' };
