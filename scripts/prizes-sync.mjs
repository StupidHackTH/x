#!/usr/bin/env node
// Push the Grist "Prize" table to the NOC server as the prize list for the awards.
//   GRIST_API_KEY=… NET_ADMIN_TOKEN=… node scripts/prizes-sync.mjs
// Required: GRIST_DOC (the Grist doc id; never commit it, the repo is public). Optional: GRIST_HOST, NET_API.
const GRIST_HOST = process.env.GRIST_HOST ?? 'https://grist.creatorsgarten.org';
const DOC = process.env.GRIST_DOC;
const NET_API = (process.env.NET_API ?? 'https://82-26-104-114.sslip.io:8443').replace(/\/$/, '');
const key = process.env.GRIST_API_KEY;
const token = process.env.NET_ADMIN_TOKEN;
if (!key || !token || !DOC) {
  console.error('need GRIST_API_KEY, NET_ADMIN_TOKEN and GRIST_DOC');
  process.exit(2);
}
const r = await fetch(`${GRIST_HOST}/api/docs/${DOC}/tables/Prize/records`, { headers: { authorization: `Bearer ${key}` } });
if (!r.ok) throw new Error(`grist ${r.status}`);
const { records } = await r.json();
const prizes = records
  .filter((x) => (x.fields.Item || '').trim())
  .map((x) => ({ id: String(x.fields.PriceID || `P${x.id}`), item: String(x.fields.Item).trim(), tier: String(x.fields.Final_Prize_Tier || ''), count: Number(x.fields.Reward_amount) || 0, cost: Number(x.fields.Cost) || 0, note: String(x.fields.Notes || '') }));
const p = await fetch(`${NET_API}/api/prizes?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prizes }) });
console.log(p.status, await p.text());
