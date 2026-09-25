// Screenshot every screen of the shtX site with headless Chrome (fake camera device), then print a gallery to PDF.
// usage: npx astro build && npx astro preview --port 4323 --host 127.0.0.1 && node scripts/screenshots.mjs screenshots http://127.0.0.1:4323
// Capture from the preview build, not the dev server (dev toolbar, possibly stale component CSS). macOS Chrome path below.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.argv[2] ?? 'screenshots';
const BASE = process.argv[3] ?? 'http://localhost:4321';
const PORT = 9333;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--hide-scrollbars',
  '--window-size=1280,800', `--user-data-dir=${join(OUT, '.profile')}`, 'about:blank',
], { stdio: 'ignore' });

for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/json/version`)).ok) break; } catch {}
  if (i > 100) throw new Error('chrome did not start');
  await sleep(100);
}
const page = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = new Set();
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); if (p) msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      else for (const h of this.handlers) h(msg);
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  waitFor(method) { return new Promise((res) => { const h = (msg) => { if (msg.method === method) { this.handlers.delete(h); res(msg.params); } }; this.handlers.add(h); }); }
}
const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.open();
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

const XP = { name: 'Windows XP desktop', width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, ua: 'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.112 Safari/537.36' };
const MAC = { name: 'Mac OS X desktop', width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_5_8) AppleWebKit/533.18.1 (KHTML, like Gecko) Version/5.0.2 Safari/533.18.5' };
const IPHONE = { name: 'iPhone shell', width: 390, height: 844, deviceScaleFactor: 2, mobile: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 4_3 like Mac OS X) AppleWebKit/533.17.9 (KHTML, like Gecko) Version/5.0.2 Mobile/8J2 Safari/6533.18.5' };
const ANDROID = { name: 'Android shell', width: 480, height: 800, deviceScaleFactor: 2, mobile: true, ua: 'Mozilla/5.0 (Linux; U; Android 2.3.4; en-us; Nexus S Build/GRJ22) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1' };

const evaluate = (expression) => cdp.send('Runtime.evaluate', { expression, returnByValue: true });
const click = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('missing ' + ${JSON.stringify(sel)}); el.click(); return true; })()`);
async function hover(sel) {
  const r = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  const [x, y] = r.result.value;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}
const manifest = [];
async function shot(name, caption, { device, url, wait = 700, steps = [] }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: device.width, height: device.height, deviceScaleFactor: device.deviceScaleFactor, mobile: device.mobile });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: device.mobile });
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: device.ua });
  if (url) { const loaded = cdp.waitFor('Page.loadEventFired'); await cdp.send('Page.navigate', { url: BASE + url }); await loaded; }
  await sleep(wait);
  for (const step of steps) {
    if (step.click) {
      const r = await click(step.click);
      if (r.exceptionDetails) throw new Error(`${name}: ${r.exceptionDetails.exception?.description ?? 'click failed'}`);
    } else if (step.hover) await hover(step.hover);
    await sleep(step.wait ?? 450);
  }
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  manifest.push({ name, caption, device: device.name });
  console.log('shot', name);
}

const start = { click: '[data-cam="start"]', wait: 1800 };
const filter = (id) => ({ click: `[data-filter="${id}"]`, wait: 600 });
const startMenu = (id) => ({ click: `.xp-startmenu-item[data-open="${id}"]`, wait: 300 });
const goMenu = (id) => ({ click: `#mac-menu-go [data-open="${id}"]`, wait: 300 });

// ---- Windows XP desktop (Windows user agent) ----
await shot('01-xp-boot', 'Boot screen: XP loading bar counts up the funding goal', { device: XP, url: '/', wait: 1500 });
await shot('02-xp-welcome', '"welcome" screen after the boot', { device: XP, url: '/', wait: 4700 });
await shot('03-xp-home', 'Desktop: About window opens by default, funding balloon tip in the tray', { device: XP, url: '/?skip', wait: 1700 });
await shot('04-xp-startmenu', 'Start menu lists every window from the registry (Camera included)', { device: XP, steps: [{ click: '#start-btn' }] });
await shot('05-xp-windows', 'Several windows open: Venue, Agenda, Funding Goal, Sponsors', { device: XP, url: '/?skip&open=venue', wait: 1200, steps: [startMenu('schedule'), startMenu('funding'), startMenu('sponsors')] });
await shot('06-xp-error', 'Register → Go: XP error dialog because tickets are not open yet', { device: XP, url: '/?skip&open=register', wait: 1200, steps: [{ click: '[data-action="fake-register"]' }] });
await shot('07-xp-recycle', 'Recycle Bin', { device: XP, url: '/?skip&open=recycle', wait: 1200 });

// ---- Camera (on XP) ----
await shot('10-camera-off', 'Camera window before starting (nothing leaves the browser)', { device: XP, url: '/?skip&open=camera', wait: 1200 });
await shot('11-camera-normal', 'Live preview, Normal (headless Chrome fake camera pattern)', { device: XP, steps: [start] });
for (const [id, caption] of [
  ['webcam', "Webcam '03: 240×180, low contrast, blue cast, noise"],
  ['camphone', 'Cam Phone 0.3MP: 160×120 pixels, posterized, warm, orange date stamp, JPEG quality 30%'],
  ['camcorder', 'Camcorder: scanlines, red channel bleed, blinking REC, SP, timestamp, viewfinder corners'],
  ['lomo', 'Lomo: saturated, contrasty, green shadows, heavy vignette'],
  ['sepia', 'Old Photo: sepia matrix, grain, vignette'],
  ['aero', 'Frutiger Aero: cool tint, bloom, gloss, drifting bubbles, aqua glow'],
  ['nokia', 'Nokia 3310: 80×60, Bayer-dithered 1-bit LCD, pixel grid, saved as PNG'],
  ['nightshot', 'NightShot: green monochrome, gain, noise, blinking indicator'],
]) await shot(`12-camera-${id}`, caption, { device: XP, steps: [filter(id)] });
await shot('13-camera-effects', 'Photo Booth Effects chooser: nine live previews', { device: XP, steps: [{ click: '.cam-effectsbtn', wait: 900 }] });
await shot('14-camera-countdown', 'Shutter: 3-2-1 countdown before the flash', { device: XP, steps: [{ click: '.cam-effect[data-filter="lomo"]', wait: 300 }, { click: '.cam-shutter', wait: 1300 }] });
await shot('15-camera-strip', 'After a still, a 4-up and a clip: the film strip', { device: XP, steps: [{ click: '.cam-pbmodes [data-cam-mode="burst"]', wait: 3200 }, { click: '.cam-shutter', wait: 7000 }, { click: '.cam-pbmodes [data-cam-mode="video"]', wait: 200 }, { click: '.cam-shutter', wait: 2500 }, { click: '.cam-shutter', wait: 1500 }] });
await shot('16-camera-review', 'Review of the clip with player, previous/next, Delete, Share, Save', { device: XP, steps: [{ click: '#cam-strip button', wait: 900 }] });

// ---- Mac OS X Leopard (Mac user agent, no URL parameter) ----
await shot('20-mac-boot', 'Leopard boot: gray screen, big X, spinning gear, funding readout', { device: MAC, url: '/', wait: 1500 });
await shot('21-mac-home', 'Desktop: menu bar, Aurora wallpaper, icons on the right, Dock, Growl-style funding bubble', { device: MAC, url: '/?skip', wait: 1700 });
await shot('22-mac-applemenu', 'shtX (Apple) menu', { device: MAC, steps: [{ click: '#mac-menubar [data-menu="apple"]' }] });
await shot('23-mac-gomenu', 'Go menu lists every window and the external links', { device: MAC, steps: [{ click: '#mac-menubar [data-menu="go"]' }] });
await shot('24-mac-windows', 'Several windows: traffic lights, centered titles, Aqua buttons, candy-striped progress bar; Dock dots mark open windows', { device: MAC, url: '/?skip&open=funding', wait: 1200, steps: [{ click: '#mac-menubar [data-menu="go"]', wait: 200 }, goMenu('venue'), { click: '#mac-menubar [data-menu="go"]', wait: 200 }, goMenu('schedule'), { click: '#mac-menubar [data-menu="go"]', wait: 200 }, goMenu('sponsors')] });
await shot('25-mac-dock', 'Dock magnification with label on hover', { device: MAC, steps: [{ hover: '#mac-dock [data-dock="camera"]', wait: 400 }] });
await shot('26-mac-minimized', 'Window menu → Minimize: the front window shrinks into the Dock (dimmed icon)', { device: MAC, url: '/?skip&open=about', wait: 1200, steps: [{ click: '#mac-menubar [data-menu="window"]', wait: 200 }, { click: '#mac-menu-window [data-action="mac-hide"]', wait: 700 }] });
await shot('27-mac-alert', 'Register → Go: Leopard alert', { device: MAC, url: '/?skip&open=register', wait: 1200, steps: [{ click: '[data-action="fake-register"]' }] });
await shot('28-mac-camera', 'Photo Booth in a Leopard window, Lomo look', { device: MAC, url: '/?skip&open=camera', wait: 1200, steps: [start, filter('lomo')] });

// ---- iPhone (chosen because the user agent is not Android) ----
await shot('30-ios-boot', 'Boot screen on a phone', { device: IPHONE, url: '/', wait: 1500 });
await shot('31-ios-lock', 'iOS 4 lock screen: slide to unlock', { device: IPHONE, url: '/?skip&lock', wait: 900 });
await shot('32-ios-home', 'Home screen: app grid (Camera added), widgets, dock', { device: IPHONE, url: '/?skip', wait: 900 });
await shot('33-ios-about', 'App view with iOS navigation bar and tab bar', { device: IPHONE, url: '/?skip&open=about', wait: 900 });
await shot('34-ios-faq', 'FAQ as grouped lists', { device: IPHONE, url: '/?skip&open=faq', wait: 900 });
await shot('35-ios-alert', 'Error dialog as an iOS alert', { device: IPHONE, url: '/?skip&open=register', wait: 900, steps: [{ click: '[data-action="fake-register"]' }] });
await shot('36-ios-camera', 'Camera app on iPhone, Frutiger Aero look, portrait frame', { device: IPHONE, url: '/?skip&open=camera', wait: 900, steps: [start, filter('aero')] });
await shot('37-ios-recording', 'VIDEO mode while recording: timer and red stop square', { device: IPHONE, steps: [{ click: '.cam-modes [data-cam-mode="video"]', wait: 300 }, { click: '.cam-shutter', wait: 2500 }] });
await shot('38-ios-review', 'Review of the clip from the thumbnail: Share and Save (share sheet on iPhone)', { device: IPHONE, steps: [{ click: '.cam-shutter', wait: 1500 }, { click: '.cam-thumb', wait: 900 }] });

// ---- Android (chosen from the user agent, no URL parameter) ----
await shot('40-android-boot', 'Boot: glowing "android" wordmark, funding readout stays', { device: ANDROID, url: '/', wait: 1500 });
await shot('41-android-lock', 'Gingerbread lock screen: drag the lock tab right, sound tab left', { device: ANDROID, url: '/?skip&lock', wait: 900 });
await shot('42-android-home', 'Launcher: search widget, app grid, widgets, hotseat; funding toast after boot', { device: ANDROID, url: '/?skip', wait: 1500 });
await shot('43-android-drawer', 'All apps drawer', { device: ANDROID, steps: [{ click: '[data-action="android-drawer"]', wait: 500 }] });
await shot('44-android-menu', 'Menu key: Gingerbread options menu', { device: ANDROID, url: '/?skip', wait: 3400, steps: [{ click: '.android-bezel [data-action="android-menu"]', wait: 500 }] });
await shot('45-android-shade', 'Tap the status bar: notification shade', { device: ANDROID, url: '/?skip', wait: 3400, steps: [{ click: '.android-statusbar', wait: 500 }] });
await shot('46-android-about', 'App view: dark title bar with icon, flat lists', { device: ANDROID, url: '/?skip&open=about', wait: 3400 });
await shot('47-android-funding', 'Funding Goal: orange progress bar, gray buttons', { device: ANDROID, url: '/?skip&open=funding', wait: 3400 });
await shot('48-android-dialog', 'Error dialog as a Gingerbread AlertDialog', { device: ANDROID, url: '/?skip&open=register', wait: 3400, steps: [{ click: '[data-action="fake-register"]' }] });
await shot('49-android-camera', 'Camera app on Android, Camcorder look', { device: ANDROID, url: '/?skip&open=camera', wait: 3400, steps: [start, filter('camcorder')] });

chrome.kill();

// ---- Gallery → PDF ----
const groups = {};
for (const m of manifest) (groups[m.device] ??= []).push(m);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html><meta charset="utf-8"><title>shtX screens</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, "Noto Sans Thai", sans-serif; color: #111; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 2mm; } .meta { color: #666; font-size: 11px; margin-bottom: 6mm; }
  h2 { font-size: 16px; margin: 0 0 4mm; padding-bottom: 1mm; border-bottom: 2px solid #245edb; }
  section + section { page-break-before: always; }
  .grid { display: grid; gap: 4mm; } .cols1 { grid-template-columns: 1fr; } .cols3 { grid-template-columns: repeat(3, 1fr); }
  figure { margin: 0; page-break-inside: avoid; break-inside: avoid; }
  img { display: block; width: 100%; border: 1px solid #bbb; }
  figcaption { font-size: 10px; color: #333; margin-top: 1.5mm; line-height: 1.3; }
  figcaption b { color: #245edb; }
</style>
<h1>Stupid Hackathon X · screen capture</h1>
<div class="meta">${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })} · production build · headless Chrome with a fake camera device (the moving colour pattern is Chrome's test source, not a real camera) · shell chosen from the user agent: Windows → XP, Macintosh → Leopard, Android → Gingerbread, other phones → iPhone</div>
${Object.entries(groups).map(([device, items]) => `<section><h2>${esc(device)}</h2><div class="grid ${device.includes('desktop') ? 'cols1' : 'cols3'}">${items.map((m) => `<figure><img src="${m.name}.png"><figcaption><b>${m.name}</b> · ${esc(m.caption)}</figcaption></figure>`).join('')}</div></section>`).join('')}`;
writeFileSync(join(OUT, 'gallery.html'), html);
const pdf = join(OUT, 'shtX-screens.pdf');
const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000', `--user-data-dir=${join(OUT, '.profile-pdf')}`, `--print-to-pdf=${pdf}`, `file://${join(OUT, 'gallery.html')}`], { encoding: 'utf8' });
console.log('pdf', r.status === 0 ? pdf : r.stderr);
process.exit(0);
