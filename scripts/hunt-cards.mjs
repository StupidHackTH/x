// Prints the six Drawdy Logo Hunting cards (A6, XP "Found New Hardware" look) with QR codes.
// usage: HUNT_KEYS="DRWDY-…,DRWDY-…,…(6, in k1..k6 order)" [A4=1] node --experimental-strip-types scripts/hunt-cards.mjs [outdir]
//        A4=1 imposes 2×2 cards per A4 sheet (two sheets, cut marks); A4=6 puts all six on one A4 (2×3, cards at 2/3 size)
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import { huntSpots } from '../src/data/hunt.ts';

const keys = (process.env.HUNT_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (keys.length !== huntSpots.length) throw new Error(`HUNT_KEYS must have ${huntSpots.length} keys`);
const OUT = resolve(process.argv[2] ?? 'hunt-cards');
mkdirSync(OUT, { recursive: true });
const SITE = 'https://stupid.hackathon.in.th/x/';
const PUB = `file://${resolve('public')}`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const cards = [];
for (const [i, spot] of huntSpots.entries()) {
  const key = keys[i];
  const url = `${SITE}?skip&open=activate&key=${encodeURIComponent(key)}`;
  const qr = await QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'Q' });
  cards.push(`<section class="card">
    <div class="sky"></div><div class="grass"></div>
    <div class="win">
      <div class="bar">Found New Hardware · ${i + 1}/${huntSpots.length}<span class="btns"><i></i><i></i><i class="x"></i></span></div>
      <div class="body">
        <div class="top"><img class="drawdy" src="${PUB}/sponsors/drawdy.png" alt="Drawdy"><div class="lab">Logo Hunting · Activate Windows</div></div>
        <div class="folder"><svg viewBox="0 0 64 64" width="26" height="26"><path d="M6 14h18l4 6h30v30H6z" fill="#f2c94c" stroke="#a67c00" stroke-width="2"/></svg>${esc(spot.name)}</div>
        <img class="qr" src="${qr}" alt="">
        <div class="key">${esc(key)}</div>
        <p class="how">สแกน QR หรือเปิด <b>stupid.hackathon.in.th/x</b> → Activate Windows แล้วพิมพ์ key นี้</p>
        <p class="rule">ห้ามหยิบ ห้ามย้ายการ์ด ให้คนอื่นหาเจอด้วย · ครบ 6 ใบ รับของรางวัลที่บูท Drawdy</p>
      </div>
    </div>
    <div class="taskbar"><span class="start">start</span><span>STUPID HACKATHON X · 10-11 OCT 2026</span></div>
  </section>`);
}
const A4 = process.env.A4 === '1' || process.env.A4 === '6';
const ONE = process.env.A4 === '6'; // all six on one A4: 2×3 cells of 105×99 mm, cards scaled to 2/3
const sheets = ONE ? [cards] : A4 ? [cards.slice(0, 4), cards.slice(4)] : [];
const body = ONE
  ? `<div class="sheet one">${cards.map((c) => `<div class="cell">${c}</div>`).join('')}<i class="cut v"></i><i class="cut h1"></i><i class="cut h2"></i></div>`
  : A4
    ? sheets.map((cs) => `<div class="sheet">${cs.join('')}<i class="cut v"></i><i class="cut h"></i></div>`).join('')
    : cards.join('\n');
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
  @page { size: ${A4 ? 'A4' : 'A6'}; margin: 0; }
  .sheet { position: relative; width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-auto-rows: 148mm; page-break-after: always; background: #fff; }
  .sheet .card { page-break-after: auto; outline: 0.3mm dashed rgba(0,0,0,.35); outline-offset: -0.15mm; }
  .cut { position: absolute; background: transparent; border: 0; pointer-events: none; }
  .cut.v { left: 105mm; top: 0; height: 297mm; border-left: 0.3mm dashed #999; }
  .cut.h { top: 148mm; left: 0; width: 210mm; border-top: 0.3mm dashed #999; }
  .sheet.one { grid-template-columns: 105mm 105mm; grid-auto-rows: 99mm; }
  .sheet.one .cell { position: relative; width: 105mm; height: 99mm; overflow: hidden; outline: 0.3mm dashed rgba(0,0,0,.35); outline-offset: -0.15mm; }
  .sheet.one .card { position: absolute; left: 17.4mm; top: 0; transform: scale(0.669); transform-origin: top left; outline: 0; }
  .cut.h1 { top: 99mm; left: 0; width: 210mm; border-top: 0.3mm dashed #999; }
  .cut.h2 { top: 198mm; left: 0; width: 210mm; border-top: 0.3mm dashed #999; }
  * { box-sizing: border-box; } body { margin: 0; font-family: Tahoma, 'Inter Thai Looped', sans-serif; }
  .card { position: relative; width: 105mm; height: 148mm; overflow: hidden; page-break-after: always; background: #2f8be8; }
  .sky { position: absolute; inset: 0; background: linear-gradient(180deg, #0f4fb8 0%, #2f8be8 30%, #8fd3ff 60%, #d9f2ff 72%); }
  .grass { position: absolute; left: -20mm; right: -20mm; bottom: -30mm; height: 60mm; border-radius: 50%; background: radial-gradient(ellipse at 40% 20%, #b9f08a 0%, #5fbf3f 35%, #2f8a2a 75%); }
  .win { position: absolute; left: 6mm; right: 6mm; top: 7mm; background: #ece9d8; border: 1px solid #0a246a; border-radius: 3mm 3mm 1mm 1mm; overflow: hidden; box-shadow: 0 3mm 6mm rgba(0,30,90,.4); }
  .bar { display: flex; align-items: center; gap: 2mm; padding: 2mm 3mm; color: #fff; font: 700 11pt Tahoma, sans-serif; background: linear-gradient(180deg, #3d8cf0 0%, #1f5fd6 8%, #2a6ee0 40%, #1b4fb8 90%); text-shadow: 1px 1px 0 #0a246a; }
  .btns { margin-left: auto; display: flex; gap: 1mm; } .btns i { width: 4.5mm; height: 4.5mm; border-radius: 1mm; border: 1px solid #fff; background: linear-gradient(180deg,#6fa8ff,#2f66d8); display: inline-block; } .btns i.x { background: linear-gradient(180deg,#ff9d8a,#d9452a); }
  .body { background: #fff; padding: 3mm 4mm 3.5mm; text-align: center; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 2mm; } .drawdy { height: 7mm; } .lab { font-size: 7.5pt; color: #555; letter-spacing: .5px; text-transform: uppercase; }
  .folder { display: flex; align-items: center; justify-content: center; gap: 1.5mm; margin: 3mm 0 1.5mm; font: 700 15pt Tahoma, sans-serif; color: #0a246a; }
  .qr { width: 52mm; height: 52mm; display: block; margin: 0 auto; border: 1px solid #ccc; }
  .key { margin: 2.5mm 0 1.5mm; font: 700 15.5pt 'Lucida Console', 'Courier New', monospace; letter-spacing: .5px; color: #0b7a2a; background: #eefbea; border: 1px dashed #8fd39a; padding: 1.5mm 0; }
  .how { margin: 0; font-size: 8.5pt; color: #222; line-height: 1.35; } .rule { margin: 1.5mm 0 0; font-size: 7pt; color: #777; line-height: 1.3; }
  .taskbar { position: absolute; left: 0; right: 0; bottom: 0; height: 8mm; display: flex; align-items: center; gap: 3mm; padding-right: 3mm; color: #fff; font: 700 7pt Tahoma, sans-serif; letter-spacing: 1px; background: linear-gradient(180deg, #3b7fe0 0%, #245edb 6%, #2460d8 70%, #1b47b0 100%); }
  .start { height: 8mm; padding: 0 4mm 0 3mm; display: flex; align-items: center; font: italic 700 9pt Tahoma, sans-serif; background: linear-gradient(180deg, #5ad85a 0%, #3cb43c 8%, #2f9e2f 60%, #227d22 100%); border-radius: 0 4mm 4mm 0; }
</style></head><body>${body}</body></html>`;
writeFileSync(`${OUT}/cards.html`, html);
const pdf = `${OUT}/shtx-logo-hunting-cards${ONE ? '-A4-1sheet' : A4 ? '-A4' : ''}.pdf`;
const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=5000', `--user-data-dir=${OUT}/.profile`, `--print-to-pdf=${pdf}`, `file://${OUT}/cards.html`], { encoding: 'utf8', timeout: 90000, killSignal: 'SIGKILL' });
spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=397,562', '--virtual-time-budget=5000', `--user-data-dir=${OUT}/.profile2`, `--screenshot=${OUT}/card-1.png`, `file://${OUT}/cards.html`], { encoding: 'utf8', timeout: 90000, killSignal: 'SIGKILL' });
console.log('wrote', pdf, (r.stderr || '').includes('bytes written') ? 'ok' : '(check)');
