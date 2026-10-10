// Prize types for the /gacha POC. The prize list itself comes from Grist at runtime (see src/scripts/gacha.ts).
// tier T1 = SSR, T2 = Rare, T3 = General; amount = how many of that item exist.
export type Tier = 'T1' | 'T2' | 'T3';

export interface Prize {
  id: string;
  name: string;
  tier: Tier;
  amount: number;
  icon: string; // a name in Icons.astro
  image?: string; // product photo URL (Grist `Image link`)
  base?: string; // media folder URL with reveal.mp4, show.mp4, music.mp3, meta.json (from Grist `Video link`)
  reveal?: boolean; // has the boss-style special reveal (a media folder)
  flash?: number; // ms into reveal.mp4 where its own white flash/scene change lands (default per tier); from meta.json
}

export const tiers: Record<Tier, { label: string; short: string; rate: number }> = {
  T1: { label: 'SSR', short: 'SSR', rate: 0.06 },
  T2: { label: 'Rare', short: 'R', rate: 0.24 },
  T3: { label: 'General', short: 'N', rate: 0.7 },
};

