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
- `src/scripts/desktop.ts` — client-side window manager: open/close/minimize/maximize, drag, focus, taskbar buttons, start menu, balloon tip, clock.
- `src/styles/global.css` — Tailwind import plus all `xp-*` theme classes.

## XP behaviours

- Boot screen → "welcome" screen → desktop. Click or press a key to skip the boot.
- Desktop icons: single click selects, double click opens (mouse). On touch devices a single tap opens.
- Windows: drag by the title bar, resize from any edge or corner, double-click the title bar to maximize, minimize/close animations, taskbar buttons toggle minimize/restore.
- Taskbar: Show Desktop in Quick Launch, tray chevron toggles the funding balloon, clock tooltip shows the date.
- Right-click the desktop for a context menu. Win key or Ctrl+Esc opens the Start menu, Esc closes menus and dialogs.
- Fonts: Tahoma / Trebuchet MS / Franklin Gothic are used when the visitor has them (Windows); other systems fall back to similar fonts.

## Mobile mode (iPhone 4 / iOS 4)

Below 768px wide the site switches to an original-iPhone look instead of the XP desktop.

- Sequence: boot screen → lock screen → home screen. The lock screen is placed underneath the boot screen before it fades, and `body.ios-locked` keeps the home screen and apps invisible until the slider is released, so nothing flashes before unlock.
- Lock screen: real "slide to unlock" (drag past 60%). Tapping the knob only nudges it as a hint; Enter/Space unlock for keyboards.
- Home screen: glossy app grid, two widgets (funding progress and a live countdown to 10 Oct), page dots, and a dock. The funding badge shows the current percentage.
- Apps: each window opens full screen with an iOS navigation bar, a Home back button, and a bottom tab bar (Home, Register, Venue, Funding, FAQ). Info tables and the FAQ render as iOS grouped lists. The error dialog becomes an iOS alert that overlays the current screen.
- `src/components/MobileShell.astro` holds the shell; the iOS styles live at the bottom of `src/styles/global.css`.

## URL parameters

- `?skip` — skip the boot screen (and the lock screen on mobile). Add `&lock` to still show the lock screen.
- `?open=funding` — open a window after boot (`about`, `register`, `schedule`, `venue`, `funding`, `sponsors`, `staff`, `faq`, `recycle`).
