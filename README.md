# Stupid Hackathon X (shtX)

Windows XP–themed website for the 10th Stupid Hackathon in Thailand (10–11 Oct 2026, Cleverse, Rama 9). Built with [Astro](https://astro.build) and Tailwind CSS v4.

Registration is **not** handled by this site — it links out to Eventpop (link TBD in `src/data/event.ts`).

## Develop

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview
```

## How it works

- `src/data/funding.ts` — sponsor tiers and sponsor list (real), plus goal/raised/backers (**mock**, flagged with `mock: true`). The boot screen, funding window, tray icon and balloon tip all read from it.
- `src/data/event.ts` — event basics, registration info, links, about text, venue + directions, draft agenda, what to bring, code of conduct, FAQ, staff, past editions. Anything unconfirmed is marked TBD.
- `src/data/windows.ts` — registry of desktop windows (title, icon, default position/size).
- `src/components/BootScreen.astro` — XP boot screen that animates the funding progress bar before the desktop appears. Click or press a key to skip.
- `src/components/Window.astro` — reusable XP window chrome (title bar, menu bar, status bar). Window contents live in `src/components/windows/`.
- `src/scripts/desktop.ts` — client-side window manager: open/close/minimize/maximize, drag, focus, taskbar buttons, start menu, balloon tip, clock. On phones it also runs the lock screens and the Android shade, drawer, options menu, toast and hardware keys.
- `src/styles/global.css` — Tailwind import plus all `xp-*` theme classes, then the iOS (`ios-*`) and Android (`android-*`) phone shells.

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

`src/components/windows/CameraWindow.astro` is a working camera: it opens the real camera with `getUserMedia`, draws every frame through a canvas with a 2000s look, and saves the result as JPEG (or PNG for the 1-bit look). The preview and the saved photo are the same pixels. Nothing is uploaded.

- Filters: Normal, Webcam '03, Cam Phone 0.3MP (with orange date stamp and 30% JPEG quality), Camcorder (scanlines, red bleed, REC, timestamp), Lomo, Old Photo, Frutiger Aero (gloss and bubbles), Nokia 3310 (80×60 dithered 1-bit LCD), NightShot.
- Controls: Start camera, Flip (only shown when there are two cameras), Mirror, Take photo, Retake, Share (Web Share API, phones), Save (download). The last eight shots sit in a strip under the controls.
- The camera needs HTTPS or localhost. It is released whenever the window is closed or minimized, the app is left on a phone, or the tab goes to the background; press Start again to resume.
- Phones get a portrait 3:4 frame, desktop a 4:3 frame.

## URL parameters

- `?skip` — skip the boot screen (and the lock screen on mobile). Add `&lock` to still show the lock screen.
- `?android` / `?ios` — force the Android or iPhone shell on small screens regardless of the user agent.
- `?mac` / `?xp` — force the Mac or Windows XP shell on large screens regardless of the user agent.
- `?open=funding` — open a window after boot (`about`, `register`, `schedule`, `venue`, `funding`, `sponsors`, `staff`, `faq`, `camera`, `recycle`).
