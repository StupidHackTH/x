// Drawdy Logo Hunting ("Activate Windows"): six product keys hidden around the venue. Only SHA-256 hashes live here;
// the plain keys are printed on the cards (scripts/hunt-cards.mjs reads them from HUNT_KEYS) and kept in claudeclaude.md.
export interface HuntSpot { id: string; name: string; hint: string; day: 1 | 2; hash: string }
export const huntSpots: HuntSpot[] = [
  { id: 'k1', name: 'Recycle Bin', hint: 'ของที่ถูกลบแล้วยังกู้คืนได้ ลองเปิดฝาดูข้างใน', day: 1, hash: 'e7822b577b7065240606fa98e24398735af63b470331f473ea7f17203797a036' },
  { id: 'k2', name: 'My Computer', hint: 'ไม่ต้องไปไกล บูท Drawdy นั่นแหละ ลองดูหลังจอ', day: 1, hash: '6d800f149c94130dc5ef3adf71298fdd9de66ced2e1feabd769d490169c2afde' },
  { id: 'k3', name: 'Desktop', hint: 'ทุกอย่างบน Desktop ต้องมีโต๊ะรองรับ ก้มดูข้างใต้', day: 1, hash: '89ebb198348516fb06f869b5dcf2a407ecc024b3a15dc20f31e93ea0ac120e3c' },
  { id: 'k4', name: 'C:\\Windows\\System32', hint: 'โฟลเดอร์ที่ห้ามลบ อยู่ใกล้สายแลนกับไฟกะพริบ', day: 2, hash: '32fc53e6e4525b0b7e406ef3ab205a22a6044681e4ebe93d2f6dfebab86e7be6' },
  { id: 'k5', name: 'Downloads', hint: 'ของที่โหลดมาจะโผล่ตรงทางเข้าชั้น 13', day: 2, hash: 'f285ac2970164637f20cd1be9f2d36aa6989c134b90e15f7ca98236e58a7896e' },
  { id: 'k6', name: 'Program Files', hint: 'โปรแกรมที่รันทุกเช้าคือกาแฟ ดูแถวนั้น', day: 2, hash: '3eb9158e52e4110f8ef8e87732b2d799f7da3ab2f1ef175ed58a6c73e78f0729' },
];
export const huntDays = { 1: '2026-10-10', 2: '2026-10-11' } as const;
export const huntSponsor = { name: 'Drawdy', url: 'https://drawdy.io', logo: 'drawdy.png' };
