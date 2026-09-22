// Sponsor tiers and sponsor list are real. Goal/raised/backers are placeholder numbers until finance publishes them.
export type SponsorTier = 'System32' | 'Full Screen' | 'Normal Mode' | 'Safe Mode' | 'Individual' | 'Venue' | 'Corporate' | 'Partner';

export interface Sponsor {
  name: string;
  tier: SponsorTier;
  url?: string;
  pending?: boolean;
}

export interface Funding {
  currency: string;
  goal: number;
  raised: number;
  backers: number;
  deadline: string; // ISO date
  updatedAt: string; // ISO datetime
  mock: boolean;
  sponsors: Sponsor[];
}

export const funding: Funding = {
  currency: 'THB',
  goal: 150_000, // MOCK
  raised: 93_000.1, // MOCK
  backers: 6, // MOCK
  deadline: '2026-10-10',
  updatedAt: '2026-09-18T09:00:00+07:00',
  mock: true,
  sponsors: [
    { name: 'Cleverse', tier: 'Venue', url: 'https://cleverse.com' },
    { name: 'Drawdy', tier: 'System32' },
    { name: 'DEV Forward Co., Ltd.', tier: 'Corporate' },
    { name: 'PaxaLabs', tier: 'Partner' },
    { name: 'Bier', tier: 'Individual' },
    { name: 'ครอบครัวนิมมานนรวงศ์', tier: 'Individual' },
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
