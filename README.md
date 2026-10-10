# Stupid Hackathon X (shtX)

Windows XP–themed website for the 10th Stupid Hackathon in Thailand (10–11 Oct 2026, Cleverse, Rama 9). Built with [Astro](https://astro.build) and Tailwind CSS v4.

Registration is **not** handled by this site — it links out to Eventpop (`registration.url` in `src/data/event.ts`).

## Deploy

Every push to `main` of [StupidHackTH/x](https://github.com/StupidHackTH/x) builds and publishes to GitHub Pages at **https://stupid.hackathon.in.th/x/** (the StupidHackTH org site carries that custom domain; `stupidhackth.github.io/x/` redirects there). See `.github/workflows/deploy.yml`; Pages source = GitHub Actions. The site lives under `/x/`, so `astro.config.mjs` reads `BASE_PATH` (the workflow sets `/x`) and every link into `public/` goes through `asset()` from `src/lib/asset.ts`. Locally and on a custom domain the base is `/`. To preview the Pages layout locally: `BASE_PATH=/x npx astro build && npx astro preview` then open `/x/`.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview
```

## How it works

- `src/data/funding.ts` — sponsor tiers and the sponsor ledger; `raised` and `backers` are computed from it. A sponsor's `logo` names a file in `public/sponsors/` (web-sized copies of what they sent through the sponsor form; never upload bank slips), `main: true` puts the logo on top of the Sponsors window and in the About sidebar. Set `mock: true` while numbers are provisional to show an "estimate" notice in the Funding window. The boot screen, funding window, tray icon and balloon tip all read from it.
- `src/data/event.ts` — event basics, registration info, links, about text, venue + directions, nearby public showers for the overnight stay, draft agenda, what to bring, the full code of conduct (shown in its own Code of Conduct window and summarized in FAQ; reports go to the Creatorsgarten Facebook page), FAQ, staff, past editions. Anything unconfirmed is marked TBD.
- `src/data/windows.ts` — registry of desktop windows (title, icon, default position/size).
- `src/components/Icons.astro` — one SVG sprite of glossy 2000s-style icons used by every shell (`<Icon name="…" />` from `Icon.astro`); the window id doubles as the icon name. The sprite is hidden with zero size, not `display: none`, because browsers otherwise drop its gradients.
- `src/components/BootScreen.astro` — boot screen that animates the funding progress bar before the desktop appears (XP loading bar, Leopard spinner or the glowing “android” wordmark, always with the Stupid Hackathon logo). Click or press a key to skip.
- `src/components/Window.astro` — reusable XP window chrome (title bar, menu bar, status bar). Window contents live in `src/components/windows/`.
- `src/scripts/desktop.ts` — client-side window manager: open/close/minimize/maximize, drag, focus, taskbar buttons, start menu, balloon tip, clock. On phones it also runs the lock screens and the Android shade, drawer, options menu, toast and hardware keys.
- `src/styles/global.css` — Tailwind import plus all `xp-*` theme classes, then the iOS (`ios-*`), Android (`android-*`) and Mac (`mac-*`) shells. The four wallpapers (Bliss-like hill, Aurora, iOS water drops, Gingerbread light streaks) are inline SVG data URIs generated once and pasted in.

## XP behaviours

- Boot screen → "welcome" screen → desktop. Click or press a key to skip the boot.
- Desktop icons: single click selects, double click opens (mouse). On touch devices a single tap opens.
- Windows: drag by the title bar, resize from any edge or corner, double-click the title bar to maximize, minimize/close animations, taskbar buttons toggle minimize/restore.
- Taskbar: Show Desktop in Quick Launch, tray chevron toggles the funding balloon, clock tooltip shows the date.
- Right-click the desktop for a context menu. Win key or Ctrl+Esc opens the Start menu, Esc closes menus and dialogs.
- Fonts: Tahoma / Trebuchet MS / Franklin Gothic are used when the visitor has them (Windows); other systems fall back to similar fonts.

## Mac mode (Mac OS X Leopard)

On large screens, Macs (user agent contains `Macintosh`) get a Mac OS X Leopard look instead of Windows XP; `?mac` and `?xp` force either one. The windows are the same components, restyled by the "DESKTOP MODE: Mac OS X Leopard" section of `src/styles/global.css`; the chrome lives in `src/components/MacShell.astro`.

- Boot: gray Leopard boot with a big "X" (OS X, shtX) and the spinning gear; the funding readout stays. No "welcome" screen; it goes straight to the desktop.
- Menu bar: the shtX icon opens the Apple-style menu (About This Mac, Software Update, Sleep/Restart/Shut Down, Log Out — the last four are gags). The bold app name follows the front window. File/Edit/View/Go/Window/Help are real drop-downs; Go and Window list every window. Hovering across titles switches menus while one is open. Status area: funding percentage, Wi-Fi, volume, battery, clock, Spotlight (a gag).
- Dock: Finder (the mascot, opens About), every window, a separator, Facebook, Discord and Trash (Recycle Bin). Icons magnify on hover with a label above, get a glowing dot when their window is open, and dim when it is minimized. Reflections use `-webkit-box-reflect` (WebKit/Blink only).
- Windows: unified gray title bar with traffic lights (close, minimize, zoom; symbols appear on hover), centered title, no in-window menu bar, Aqua buttons (the default one pulses), candy-striped progress bar, Leopard resize grip. Minimize plays a genie-ish animation. The error dialog becomes a Leopard alert. The funding balloon becomes a Growl-style bubble at the top right. Desktop icons sit on the right.

## Mobile mode

Below 768px wide the site switches from the XP desktop to a phone shell. Android phones (user agent contains `Android`) get an Android 2.3 Gingerbread look; everything else gets the original iPhone look. A tiny inline script in `src/layouts/Layout.astro` picks the shell before first paint by adding `html.android`; `?android` and `?ios` force either one for testing.

Both shells share the boot screen and the same window manager in `src/scripts/desktop.ts`. The lock screen is placed underneath the boot screen before it fades, and `body.mobile-locked` keeps the home screen and apps invisible until unlock, so nothing flashes. `body.mobile-app-open` marks that an app is showing.

### iPhone 4 / iOS 4 (`src/components/IosShell.astro`)

- Sequence: boot screen → lock screen → home screen.
- Lock screen: real "slide to unlock" (drag past 60%). Tapping the knob only nudges it as a hint; Enter/Space unlock for keyboards.
- Home screen: glossy app grid, two widgets (funding progress and a live countdown to 10 Oct), page dots, and a dock. The funding badge shows the current percentage.
- Apps: each window opens full screen with an iOS navigation bar, a Home back button, and a bottom tab bar (Home, Register, Venue, Funding, FAQ). Info tables and the FAQ render as iOS grouped lists. The error dialog becomes an iOS alert that overlays the current screen.
- The iOS styles live in the "MOBILE MODE: iPhone 4 / iOS 4" section of `src/styles/global.css`.

### Android 2.3 Gingerbread (`src/components/AndroidShell.astro`)

- Boot: the glowing "android" wordmark replaces the XP logo and progress bar; the funding readout stays.
- Lock screen: Gingerbread tab slider. Drag the lock tab right to unlock (it turns green past 60%); drag the sound tab left to toggle silent mode (it only shows a toast).
- Home screen: search widget (a gag), app grid, funding and countdown widgets, and a hotseat with Register, the all-apps drawer, and Browser.
- Status bar: green Gingerbread icons and a 24-hour clock. Tap it to pull down the notification shade (funding goal, registration, event date). "Clear" clears the notifications, not the funding goal.
- Capacitive keys under the screen, Nexus S order: Back closes the top layer (shade → menu → dialog → drawer → app), Menu opens the options menu (Camera, Register, Venue, Funding, FAQ, Settings), Search shows a toast, Home goes home.
- Apps: dark title bar with the app icon, flat lists with dividers, gray buttons that turn orange when pressed. There is no close button; use Back or Home. The error dialog becomes a Gingerbread AlertDialog.
- The Android styles live in the "MOBILE MODE: Android 2.3 Gingerbread" section of `src/styles/global.css`.

## Camera (Stupid Photo Booth)

`src/components/windows/CameraWindow.astro` is a working camera: it opens the real camera with `getUserMedia`, draws every frame through a canvas with a 2000s look, and saves photos as JPEG (PNG for the 1-bit look) and clips as MP4 or WebM (whatever `MediaRecorder` supports). The clip is recorded from the canvas, so the look is baked into the video; the microphone is asked for on the first recording and skipped if refused. Nothing is uploaded.

- Looks: Webcam '03, Cam Phone 0.3MP (orange date stamp, 30% JPEG quality), Camcorder (scanlines, red bleed, REC, timestamp), Lomo, Normal, Old Photo, Frutiger Aero (gloss and bubbles), Nokia 3310 (a real 84×48 one-bit LCD with slow-pixel ghosting, signal and battery bars and a Menu softkey, drawn inside the phone's face with its keypad), NightShot. Every look is a pixel function plus an overlay in the `looks` map of the component script.
- On computers it is Photo Booth: three modes (still, four pictures composed into a 2×2 with a 3-2-1 countdown before each frame, movie clip), the big red shutter with a 3-2-1 countdown and a full-screen white flash, an Effects button that shows nine live previews, and a film strip. Clicking a strip thumbnail opens review with previous/next, Delete, Share and Save.
- On phones it is a camera app: full-screen viewfinder, SVG toolbar (screen flash for selfies, rule-of-thirds grid, filters on/off, close), a carousel of live filter previews over the viewfinder, an iOS-style mode strip (only PHOTO and VIDEO exist; TIME-LAPSE, SLO-MO, PORTRAIT and PANO just show a toast), round shutter (red square while recording), Flip (only with two cameras), and the last capture as a thumbnail that opens review. Tapping the viewfinder shows a yellow focus square (decorative). The window title bar and the iOS tab bar are hidden while it is open.
- Zoom: a pill with .5 / 1x / 2 / 3 presets (.5 only when the camera reports a wide lens), pinch on the viewfinder, mouse wheel or trackpad on computers, up to 5×. The camera's own zoom is used when the browser exposes it (`MediaStreamTrack` zoom capability, Chrome on Android and iOS 17+), digital crop beyond that or on other browsers.
- Shutter click and record beeps are generated with WebAudio (no files); Android phones also vibrate on the shutter.
- Full screen: the ⛶ button (Photo Booth bar on computers, top bar on phones) puts the camera alone on the whole display via the Fullscreen API; the frame goes up to 1280×960 there. Hidden on iPhone Safari, which has no page full screen.
- Save downloads the file; on iPhone and iPad it opens the share sheet instead, whose "Save Image/Video" stores it in Photos (a plain download would land in Files, and Safari ignores download links to data: URLs, so files are blob URLs). Clips stop automatically after ten minutes (about 19 MB per minute at 2.5 Mbps).
- The camera needs HTTPS or localhost. It is released whenever the window is closed or minimized, the app is left on a phone, or the tab goes to the background; press the start button again to resume.
- Phones get a portrait 3:4 frame (480×640), computers 4:3 (640×480, or 960×720 once the window is wider than 900px, for example maximized). The preview, review media and effect tiles are sized by script to the largest box of their true aspect ratio that fits, so nothing is ever stretched, whatever the window shape or browser.

## SHTX-NET (icebreaker: acoustic modem + 3-way handshake)

The `SHTX-NET` window (`src/components/windows/NetworkWindow.astro`) turns every phone into a 2000s network host. There is
no Bluetooth or Wi-Fi involved: phones talk to each other **through the speaker and microphone** with a real FSK modem.

- **Modem** (`src/scripts/fsk.ts`): 300 baud binary FSK, 2400 Hz = 0 / 3400 Hz = 1 (above most speech energy), phase-continuous
  encoder, Goertzel soft-decision decoder with preamble lock, UART framing (start/stop bits) for clock tracking, CRC-16/CCITT.
  Frame = 250 ms mark lead · 48-bit preamble · 0x7E sync · `[len][payload][crc]`. A 32-byte frame is on the air for ~1.6 s.
  In simulation it decodes at -3 dB SNR against pink noise and ±0.3 % clock drift (`npm run net:sim`).
- **Identity** (`src/data/network.ts`): the wizard asks 5 questions (NIC vendor, 2005 browser, uplink, hackathon role, what you
  do when Wi-Fi dies). The answers are packed into bytes 1–2 of a locally-administered MAC (`02:xx:xx:…`, 3 bits each), bytes
  3–5 are random so 60–200 people never collide. The MAC decodes back into a joke OUI vendor, an ICQ# and a hostname.
  Only a nickname, a skill and a dumb idea are stored; nothing leaves the phone unless a NOC server is configured.
- **Handshake** (`src/scripts/netproto.ts`): one side taps *Connect* and broadcasts `SYN(mac, seq, nick)`; every listening phone
  that hears it *loud enough* (near-field rule, default RMS ≥ 0.05, adjustable "ระยะ") answers `SYN-ACK` after a random
  slot; the initiator collects answers for 1.5 s and ACKs the **loudest** one (= the phone it is actually touching); the
  others hear an ACK addressed to someone else and stand down. Carrier sense + random backoff before every transmission,
  retransmits on timeout, lost-ACK recovery, simultaneous-open resolution (lower MAC yields). If either side is offline the
  business cards are beamed over the air too (`CARD` frames); otherwise they are fetched from the server by MAC.
- **Fallbacks**: *QR fallback* renders a link (`?open=shtxnet&peer=<mac>&n=…`) that the other phone scans with its normal
  camera; *Enter MAC…* looks a host up on the server. Both count as links (tagged `qr` / `manual`).
- **Contacts & certificate**: cards are kept in `localStorage` (`shtx-net-v1`); after 5 handshakes the *Proof of Friendship*
  certificate unlocks (printable); 40 or more contacts turn it into the Gold Edition ("Gold Core Switch").
- **Debug hook**: `window.__shtxnet` exposes the modem, the node and frame helpers (used by `node scripts/net-e2e.mjs`, an
  end-to-end test in headless Chrome that injects a SYN and an ACK straight into the live decoder).

### NOC (stage screen) and server

`/noc` (`src/pages/noc.astro`, `src/scripts/noc.ts`) is the Frutiger Aero Network Operations Center for the projector: live
force-directed mesh, core switches (highest degree), just-connected, dumb idea of the moment, event ticker, a BSOD every 10
links, and an optional "chime" that is a real tiny FSK frame. With no server it shows demo traffic for 60 hosts (`/noc/?demo`).

The server lives in `server/` (Elysia on Bun, SQLite, WebSocket feed):

```
cd server && bun install
NET_ADMIN_TOKEN=secret bun index.ts          # http://localhost:8787 — or docker build . / fly / railway
```

Endpoints: `GET /api/state`, `GET|POST /api/nodes`, `GET /api/nodes/:mac/links`, `POST /api/links`, `POST /api/events`,
`WS /api/live`, `POST /api/reset?token=…` (admin). Point the site at it with the build variable `PUBLIC_SHTX_NET_API`
(GitHub Pages reads the repository variable `SHTX_NET_API`) or at runtime with `?api=https://host` (saved in `localStorage`).

Production (2026): the API runs on the venue box as container `shtx-net`, HTTPS on `https://82-26-104-114.sslip.io:8443` with a
Let's Encrypt certificate (volume `shtx-certs`, issued by borrowing port 80 for a few seconds; renew before 2027-01 the same way:
`docker stop oryx; docker run --rm -p 80:80 -v shtx-certs:/etc/letsencrypt certbot/certbot renew; docker start oryx`). The
container reads `TLS_CERT`/`TLS_KEY` and serves the same app on `TLS_PORT` (default 8443) next to plain HTTP on 8787.

Alternative without touching ports 80/443 at all: a Tailscale sidecar that
shares the API container's network and publishes it with Funnel. Needs an auth key from the tailnet admin and the
`funnel` node attribute approved once:

```
docker run -d --name ts-shtx-net --restart unless-stopped --network container:shtx-net \
  -e TS_AUTHKEY=tskey-auth-… -e TS_HOSTNAME=shtx-net -e TS_STATE_DIR=/var/lib/tailscale \
  -e TS_SERVE_CONFIG=/config/serve.json -v ts-shtx-net:/var/lib/tailscale \
  -v $PWD/tailscale-serve.json:/config/serve.json:ro tailscale/tailscale:latest
# → https://shtx-net.<tailnet>.ts.net  (set it as SHTX_NET_API)
```

Staff controls: press **Staff** on `/noc` and enter the staff password (= `NET_ADMIN_TOKEN` on the server, kept in
`~/shtx-net/admin.token` on the box; change it there and run `./run.sh`). The browser remembers it; `/noc/?admin=<password>`
also works. A *Staff* bar appears on the graph: **Reset game** (two clicks, wipes hosts, links and events),
**BSOD** (pushes a blue screen to every NOC screen), **Kick** (removes a host and its links by nickname or MAC, for
anything rude on the projector) and **Log out**. The same things over HTTP: `POST /api/reset?token=…`,
`POST /api/events?token=…` with `{"type":"bsod"}`, `DELETE /api/nodes/:mac?token=…`.

### How 60 people play

Everyone runs the wizard in parallel (2–3 min, no audio). Then free roam: find someone you don't know, both tap *Start
listening*, hold the phones a palm apart at 40–60 % volume, one taps *Connect* — the handshake takes ~6 s and both get each
other's card. The acoustic channel is local (a phone 3 m away is ~25 dB quieter), the near-field rule drops faint SYNs, and the
initiator picks the loudest answer, so 30 pairs can handshake at once in one hall. Loud room? QR fallback. Collect 5 cards
for the certificate; the NOC shows the mesh, the core switches and the dumb ideas on stage.

## Drawdy Logo Hunting (Activate Windows)

Sponsor activation game: six Drawdy product keys are hidden around the venue (`src/data/hunt.ts` holds the spot names,
hints, release day and the SHA-256 of each key; the plain keys are only on the printed cards and in the organizer's notes).
The **Activate Windows** window (`src/components/windows/HuntWindow.astro`) is a Windows Product Activation wizard: type the key from the card (the
card's QR, `?open=activate&key=…`, is a decoy that rickrolls the scanner), hints are asked per slot by the player ("ขอคำใบ้", one every 2 minutes; slot order shuffled per phone), six keys = "Windows is now activated" with a certificate code (`ACT-xxxxxx`, derived from the device id) to show at
the Drawdy booth. Finds are reported to the NOC server (`POST /api/hunt/find` with the key hash as proof); `/noc` shows
finds per spot, first finders and who has activated; the Staff bar has *Reset hunt*.

Print the cards: `HUNT_KEYS="k1,k2,k3,k4,k5,k6" node --experimental-strip-types scripts/hunt-cards.mjs out/` → A6 PDF with
QR + key per spot, XP "Found New Hardware" look.

## Screenshots

`node scripts/screenshots.mjs <outDir> [baseUrl]` drives headless Chrome (with a fake camera device, so the camera runs without a permission prompt) through every screen of all four shells and prints a captioned gallery to `<outDir>/shtX-screens-<date>-<time>.pdf`. Capture from a preview of the production build, not the dev server (dev toolbar, possibly stale CSS):

```
npx astro build && npx astro preview --port 4323 --host 127.0.0.1
node scripts/screenshots.mjs screenshots http://127.0.0.1:4323
```

The camera screens use Chrome's test pattern. To shoot them with a real picture, convert it to Y4M and pass it in: `ffmpeg -loop 1 -i photo.jpg -t 2 -r 15 -vf "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2" -pix_fmt yuv420p /tmp/face.y4m`, then `FAKE_VIDEO=/tmp/face.y4m node scripts/screenshots.mjs …` (the file must sit in a plain path such as /tmp).

## URL parameters

- `?skip` — skip the boot screen (and the lock screen on mobile). Add `&lock` to still show the lock screen.

Full screen for the whole site: right-click the XP desktop → Full Screen, the shtX/Window menus on Mac (Enter/Exit Full Screen), or Menu → Full screen on Android. Esc leaves it.
- `?android` / `?ios` — force the Android or iPhone shell on small screens regardless of the user agent.
- `?mac` / `?xp` — force the Mac or Windows XP shell on large screens regardless of the user agent.
- `?open=funding` — open a window after boot (`about`, `register`, `schedule`, `venue`, `funding`, `sponsors`, `staff`, `faq`, `conduct`, `camera`, `recycle`).
