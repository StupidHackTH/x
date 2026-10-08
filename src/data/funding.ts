// Sponsor tiers and the sponsor ledger are real. `raised` and `backers` are computed from the list: add a sponsor
// with its `amount` and both update. In-kind sponsors (venue, partners) have no amount. Set `mock: true` to show
// the "estimate" notice in the Funding window while numbers are provisional.
export type SponsorTier = 'System32' | 'Full Screen' | 'Normal Mode' | 'Safe Mode' | 'Individual' | 'Venue' | 'Corporate' | 'Partner';

export interface Sponsor {
  name: string;
  tier: SponsorTier;
  amount?: number; // THB received; omitted for in-kind support
  url?: string;
  logo?: string; // file in public/sponsors/ (from the sponsor form; bank slips are NOT logos, leave those out)
  main?: boolean; // the main sponsor: big logo on top of the Sponsors window and in the About sidebar
  message?: string; // a line the sponsor asked us to print
  pending?: boolean;
}

export interface Funding {
  currency: string;
  goal: number;
  raised: number; // summed from the sponsor amounts below
  backers: number; // counted from the sponsor list below
  deadline: string; // ISO date
  updatedAt: string; // ISO datetime
  mock: boolean;
  sponsors: Sponsor[];
}

export const funding: Funding = {
  currency: 'THB',
  goal: 150_000,
  get raised() {
    return Math.round(this.sponsors.reduce((sum, s) => sum + (s.pending ? 0 : s.amount ?? 0), 0) * 100) / 100;
  },
  get backers() {
    return this.sponsors.length;
  },
  deadline: '2026-10-10',
  updatedAt: '2026-10-08T20:50:00+07:00',
  mock: false,
  sponsors: [
    { name: 'Cleverse', tier: 'Venue', url: 'https://cleverse.com', logo: 'cleverse.svg' },
    { name: 'Drawdy', tier: 'System32', amount: 55_000.1, url: 'https://drawdy.io', logo: 'drawdy.png', main: true },
    { name: 'ShakeSphere', tier: 'Normal Mode', amount: 15_000, logo: 'shakesphere.png' },
    { name: 'DEV Forward Co., Ltd.', tier: 'Safe Mode', amount: 5_000.1, url: 'https://devforward.tech', logo: 'devforward.svg', message: 'DEV Forward • Moving Forward Through Coding' },
    { name: 'PaxaLabs', tier: 'Partner', logo: 'paxalabs.svg' },
    { name: 'บริษัท เกมเพลง จำกัด', tier: 'Safe Mode', amount: 5_000.67, url: 'https://plengrai.gamepleng.com/', logo: 'gamepleng.jpg', message: 'เกมเพลงไร เปิดวันเดียวกับวันงานเลย' },
    { name: 'Mr. Thanyanit Jongjitragan', tier: 'Safe Mode', amount: 6_006.13, url: 'https://shopee.co.th/gentlestyles_official', logo: 'gentlestyles.jpg', message: 'ช่วยอุดหนุนเสื้อผ้าร้านนี้หน่อยครับ อยากได้ค่าคอมเพิ่มครับ 🙏 https://shopee.co.th/gentlestyles_official' },
    { name: 'Bier', tier: 'Individual', amount: 1_669, url: 'https://yuttakhanb.dev', logo: 'bier.jpg', message: 'เล่าก็มั่ว ฟันก็หลอ ป้าเก็บฟันปลอม ไว้เคี้ยวข้าวดีกว่า' },
    { name: 'SarunInt', tier: 'Individual', amount: 1_013.25 },
    { name: 'Minori414', tier: 'Individual', amount: 862.07, message: 'ปีนี้ไม่สะดวกไป ขอส่งใจไปแทนละกัน' },
    { name: 'Sasi Chanplakorn', tier: 'Individual', amount: 500.11, url: 'https://mindsch.github.io', logo: 'sasi.jpg', message: 'กดบัตรไม่ทันอีกแล้ว ฮือ สปอนทีมนะ ขอบคุณที่จัดอีเว้นสุดจะเริ่ด <3' },
    { name: 'Panthipa Suksirisorn', tier: 'Individual', amount: 550 },
    { name: 'ครอบครัวนิมมานนรวงศ์', tier: 'Individual', amount: 500.01 },
    { name: 'Meen', tier: 'Individual', amount: 500.67, url: 'https://youtu.be/dQw4w9WgXcQ', logo: 'meen.jpg', message: '[object Object]' },
  ],
};

// Sponsorship packages for this year (in THB), numbered as on the call-for-sponsor poster (Tier 1 = Safe Mode … Tier 4 = System32).
// Every tier ends in .10 because X.
export const tiers: { name: SponsorTier; level: number; amount: number; blurb: string }[] = [
  { name: 'System32', level: 4, amount: 50_000.1, blurb: 'ลบไม่ได้ ขาดไม่ได้' },
  { name: 'Full Screen', level: 3, amount: 30_000.1, blurb: 'เต็มจอ เต็มใจ' },
  { name: 'Normal Mode', level: 2, amount: 10_000.1, blurb: 'บูตปกติ ทำงานปกติ' },
  { name: 'Safe Mode', level: 1, amount: 5_000.1, blurb: 'บูตแบบปลอดภัย ไดรเวอร์น้อยแต่ใจใหญ่' },
  { name: 'Individual', level: 0, amount: 500.1, blurb: 'ผู้ใช้ทั่วไป ใจบุญ' },
];

export const tierOrder: SponsorTier[] = ['Venue', 'System32', 'Full Screen', 'Normal Mode', 'Corporate', 'Partner', 'Safe Mode', 'Individual'];

export const fundingPercent = Math.min(100, Math.round((funding.raised / funding.goal) * 100));

export const formatTHB = (n: number) =>
  '฿' + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
