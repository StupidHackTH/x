// End-to-end check of the SHTX-NET window in headless Chrome with a fake microphone: runs the wizard, starts listening,
// injects a crafted SYN and ACK straight into the live decoder (same code path as real audio, minus the air) and
// expects CONNECTION ESTABLISHED; then the QR-arrival path and the NOC demo page. Usage: node scripts/net-e2e.mjs [base]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.argv[2] ?? 'http://127.0.0.1:4323';
const PORT = 9800 + Math.floor(Math.random() * 150);
const profile = mkdtempSync(join(tmpdir(), 'shtx-e2e-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}/json/version`); break; } catch { await sleep(200); } }
const page = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed'); return r.result?.result?.value; };
await send('Page.enable'); await send('Runtime.enable');
const goto = async (url) => { await send('Page.navigate', { url: BASE + url }); await sleep(1500); };
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

await goto('/?skip&open=shtxnet');
check('window opens on wizard', (await ev(`document.getElementById('net').dataset.view`)) === 'setup');
await ev(`(() => { const v = (id, val) => { const el = document.getElementById(id); el.value = val; }; v('net-nick', 'โขง'); v('net-skill', 'Frontend'); v('net-idea', 'เว็บที่โหลดช้าลงทุกครั้งที่กด'); document.getElementById('net-next').click(); })()`);
for (let i = 0; i < 5; i++) await ev(`(() => { document.querySelector('input[name="q${i}"][value="${(i * 2) % 8}"]').click(); document.getElementById('net-next').click(); })()`);
const mac = await ev(`document.getElementById('net-new-mac').textContent`);
check('wizard produced a MAC', /^02(:[0-9A-F]{2}){5}$/.test(mac), mac);
await ev(`document.getElementById('net-finish').click()`);
await sleep(300);
check('main view after Finish', (await ev(`document.getElementById('net').dataset.view`)) === 'main');
check('card shows nick', (await ev(`document.getElementById('net-me-nick').textContent`)) === 'โขง');
await ev(`document.getElementById('net-listen').click()`);
await sleep(1500);
check('listening with fake mic', (await ev(`document.getElementById('net').dataset.listen`)) === 'on', await ev(`document.getElementById('net-status').textContent`));
const sr = await ev(`__shtxnet.modem.ctx.sampleRate`);
check('decoder alive', (await ev(`!!__shtxnet.modem.decoder`)) === true, `${sr} Hz`);
// a peer ไท sends SYN at a healthy level
await ev(`(() => { const h = __shtxnet; const peer = new Uint8Array([2,0x29,0xCA,0x2A,0x7B,0xA2]); const syn = h.encodeFrame({ type: 'syn', mac: peer, seq: 42, flags: 0, nick: 'ไท' }); const pcm = h.encodePcm(h.buildFrame(syn), h.modem.ctx.sampleRate).map((v) => v * 0.3); for (let i = 0; i < pcm.length; i += 2048) h.modem.decoder.push(pcm.subarray(i, i + 2048)); return true; })()`);
await sleep(300);
check('SYN heard → responder state', (await ev(`__shtxnet.node.state`)) === 'synack_sent', await ev(`__shtxnet.node.state`));
await sleep(4500); // SYN-ACK goes out of the (fake) speaker
check('still waiting for ACK', (await ev(`__shtxnet.node.state`)) === 'synack_sent', await ev(`__shtxnet.node.state`));
await ev(`(() => { const h = __shtxnet; const peer = new Uint8Array([2,0x29,0xCA,0x2A,0x7B,0xA2]); const ack = h.encodeFrame({ type: 'ack', mac: peer, peer: h.parseMac(h.store.me.mac), ack: h.node.currentSeq }); const pcm = h.encodePcm(h.buildFrame(ack), h.modem.ctx.sampleRate).map((v) => v * 0.3); for (let i = 0; i < pcm.length; i += 2048) h.modem.decoder.push(pcm.subarray(i, i + 2048)); return true; })()`);
await sleep(400);
check('ACK heard → ESTABLISHED', (await ev(`__shtxnet.node.state`)) === 'established', await ev(`__shtxnet.node.state`));
check('peer overlay shown with nick', (await ev(`!document.getElementById('net-peer').hidden && document.getElementById('net-peer-nick').textContent`)) === 'ไท');
check('contact stored', (await ev(`__shtxnet.store.links.length`)) === 1);
// faint SYN from across the room is ignored
await ev(`(() => { const h = __shtxnet; h.node.reset(); const far = new Uint8Array([2,0x11,0x22,0x33,0x44,0x55]); const syn = h.encodeFrame({ type: 'syn', mac: far, seq: 7, flags: 0, nick: 'Far' }); const pcm = h.encodePcm(h.buildFrame(syn), h.modem.ctx.sampleRate).map((v) => v * 0.02); for (let i = 0; i < pcm.length; i += 2048) h.modem.decoder.push(pcm.subarray(i, i + 2048)); return true; })()`);
await sleep(300);
check('faint SYN ignored (stays idle)', (await ev(`__shtxnet.node.state`)) === 'idle', `ignoredFar=${await ev(`__shtxnet.node.stats.ignoredFar`)}`);
// QR arrival
await goto('/?skip&open=shtxnet&peer=02AABBCCDDEE&n=Riffy&s=Design&i=%E0%B9%82%E0%B8%87%E0%B9%88%E0%B8%A2%E0%B8%B1%E0%B8%87%E0%B9%84%E0%B8%A1%E0%B9%88%E0%B8%9E%E0%B8%AD');
check('QR arrival adds contact', (await ev(`__shtxnet.store.links.length`)) === 2, await ev(`JSON.stringify(__shtxnet.store.links.map((l) => l.nick + '/' + l.via))`));
check('QR params scrubbed from URL', !(await ev(`location.search`)).includes('peer='), await ev(`location.search`));
check('peer overlay for QR', (await ev(`document.getElementById('net-peer-nick').textContent`)) === 'Riffy');
// NOC demo
await goto('/noc/?demo');
await sleep(9000);
const hosts = Number(await ev(`document.getElementById('st-hosts').textContent`));
const links = Number(await ev(`document.getElementById('st-links').textContent`));
check('NOC demo shows 60 hosts', hosts === 60, `hosts=${hosts} links=${links}`);
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
ws.close(); cleanup(); process.exit(failed ? 1 : 0);
