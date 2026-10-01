// Sponsor tiers and the sponsor ledger are real. `raised` and `backers` are computed from the list: add a sponsor
// with its `amount` and both update. In-kind sponsors (venue, partners) have no amount. Set `mock: true` to show
// the "estimate" notice in the Funding window while numbers are provisional.
export type SponsorTier = 'System32' | 'Full Screen' | 'Normal Mode' | 'Safe Mode' | 'Individual' | 'Venue' | 'Corporate' | 'Partner';

export interface Sponsor {
  name: string;
  tier: SponsorTier;
  amount?: number; // THB received; omitted for in-kind support
  url?: string;
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
  updatedAt: '2026-10-01T19:30:00+07:00',
  mock: false,
  sponsors: [
    { name: 'Cleverse', tier: 'Venue', url: 'https://cleverse.com' },
    { name: 'Drawdy', tier: 'System32', amount: 55_000.1 },
    { name: 'ShakeSphere', tier: 'Normal Mode', amount: 15_000 },
    { name: 'DEV Forward Co., Ltd.', tier: 'Corporate', amount: 5_000.1 },
    { name: 'PaxaLabs', tier: 'Partner' },
    { name: 'บริษัท เกมเพลง จำกัด', tier: 'Safe Mode', amount: 5_000.67 },
    { name: 'Bier', tier: 'Individual', amount: 1_669, message: 'เล่าก็มั่ว ฟันก็หลอ ป้าเก็บฟันปลอม ไว้เคี้ยวข้าวดีกว่า' },
    { name: 'Minori414', tier: 'Individual', amount: 862.07 },
    { name: 'Sasi Chanplakorn', tier: 'Individual', amount: 500.11 },
    { name: 'ครอบครัวนิมมานนรวงศ์', tier: 'Individual', amount: 500.01 },
  ],
};

// Sponsorship packages for this year (in THB). Every tier ends in .10 because X.
export const tiers: { name: SponsorTier; amount: number; blurb: string }[] = [
  { name: 'System32', amount: 50_000.1, blurb: 'ลบไม่ได้ ขาดไม่ได้' },
  { name: 'Full Screen', amount: 30_000.1, blurb: 'เต็มจอ เต็มใจ' },
  { name: 'Normal Mode', amount: 10_000.1, blurb: 'บูตปกติ ทำงานปกติ' },
  { name: 'Safe Mode', amount: 5_000.1, blurb: 'บูตแบบปลอดภัย ไดรเวอร์น้อยแต่ใจใหญ่' },
  { name: 'Individual', amount: 500.1, blurb: 'ผู้ใช้ทั่วไป ใจบุญ' },
];

export const tierOrder: SponsorTier[] = ['Venue', 'System32', 'Full Screen', 'Normal Mode', 'Corporate', 'Partner', 'Safe Mode', 'Individual'];

export const fundingPercent = Math.min(100, Math.round((funding.raised / funding.goal) * 100));

export const formatTHB = (n: number) =>
  '฿' + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
