// Windows XP desktop behaviour: boot sequence, window management, taskbar, start menu, clock.

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));

const mobileQuery = window.matchMedia('(max-width: 767px)');
const isMobile = () => mobileQuery.matches;
const isDesktop = () => !mobileQuery.matches;
const isFinePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Boot sequence ---------------- */

const BOOT_MESSAGES = [
  'Checking sponsor wallets…',
  'Counting coins…',
  'Asking uncle for 500.10 baht…',
  'Defragmenting pizza budget…',
  'Negotiating with the venue…',
  'Applying funding.dll patch…',
  'Almost there. Probably.',
];

/* Screen that follows the boot: XP "welcome" on desktop, iOS lock screen on mobile.
   revealNext() puts it in place *under* the boot screen so nothing else shows through the fade. */
function revealNext() {
  if (isMobile()) {
    const lock = $('#ios-lock');
    if (lock) lock.hidden = false;
  } else {
    const welcome = $('#welcome');
    if (welcome && !reducedMotion()) welcome.hidden = false;
  }
}

function runNext(onDone: () => void) {
  if (isMobile()) return runLockScreen(onDone);
  const welcome = $('#welcome');
  if (!welcome || welcome.hidden) return unlockDone(onDone);
  setTimeout(() => {
    welcome.classList.add('xp-fade-out');
    setTimeout(() => {
      welcome.remove();
      unlockDone(onDone);
    }, 500);
  }, 1300);
}

function unlockDone(onDone: () => void) {
  document.body.classList.remove('ios-locked');
  $('#ios-lock')?.remove();
  $('#welcome')?.remove();
  onDone();
}

/* ---------------- iOS lock screen (mobile) ---------------- */

function runLockScreen(onDone: () => void) {
  const lock = $('#ios-lock');
  const slider = $('#ios-slider');
  const knob = $('#ios-knob');
  if (!lock || !slider || !knob) return unlockDone(onDone);
  lock.hidden = false;
  const label = slider.querySelector('.label') as HTMLElement | null;
  let unlocked = false;

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    lock.classList.add('ios-unlock');
    setTimeout(() => unlockDone(onDone), 380);
  };
  const maxX = () => slider.clientWidth - knob.offsetWidth - 6;
  const settle = (x: number) => {
    knob.style.left = `${3 + x}px`;
    if (label) label.style.opacity = String(Math.max(0, 1 - x / (maxX() * 0.55)));
  };

  knob.addEventListener('pointerdown', (e) => {
    if (unlocked) return;
    e.preventDefault();
    knob.setPointerCapture(e.pointerId);
    knob.classList.add('dragging');
    const startX = e.clientX;
    let moved = 0;
    const move = (ev: PointerEvent) => {
      moved = Math.max(0, Math.min(maxX(), ev.clientX - startX));
      settle(moved);
    };
    const up = () => {
      knob.removeEventListener('pointermove', move);
      knob.removeEventListener('pointerup', up);
      knob.removeEventListener('pointercancel', up);
      knob.classList.remove('dragging');
      if (moved > maxX() * 0.6) {
        settle(maxX());
        unlock();
      } else {
        settle(0);
        if (moved < 6) {
          // A tap: nudge the knob as a hint that it slides
          knob.classList.remove('hint');
          void knob.offsetWidth;
          knob.classList.add('hint');
        }
      }
    };
    knob.addEventListener('pointermove', move);
    knob.addEventListener('pointerup', up);
    knob.addEventListener('pointercancel', up);
  });
  slider.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      settle(maxX());
      unlock();
    }
  });
}

function runBoot(onDone: () => void) {
  const boot = $('#boot');
  if (!boot) return onDone();
  // ?skip bypasses the boot screen (useful for direct links and screenshots)
  const params = new URLSearchParams(location.search);
  if (params.has('skip')) {
    boot.remove();
    $('#welcome')?.remove();
    if (isMobile() && params.has('lock')) return runLockScreen(onDone);
    return unlockDone(onDone);
  }

  const percent = Number(boot.dataset.percent ?? 0);
  const raised = Number(boot.dataset.raised ?? 0);
  const pctEl = $('#boot-pct', boot);
  const raisedEl = $('#boot-raised', boot);
  const statusEl = $('#boot-status', boot);
  const progress = $('#boot-progress', boot);

  const DURATION = 3400;
  const start = performance.now();
  let msgIdx = 0;
  let finished = false;

  const fmt = (n: number) => '฿' + Math.round(n).toLocaleString('en-US');
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  const render = (p: number, r: number) => {
    if (pctEl) pctEl.textContent = `${Math.round(p)}%`;
    if (raisedEl) raisedEl.textContent = fmt(r);
    progress?.setAttribute('aria-valuenow', String(Math.round(p)));
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    render(percent, raised);
    if (statusEl) statusEl.textContent = percent >= 100 ? 'Funding goal reached.' : 'Funding goal status:';
    revealNext();
    boot.classList.add('xp-fade-out');
    setTimeout(() => {
      boot.remove();
      runNext(onDone);
    }, 550);
  };

  const tick = (now: number) => {
    if (finished) return;
    const t = Math.min(1, (now - start) / DURATION);
    const e = easeOut(t);
    render(percent * e, raised * e);
    const wantIdx = Math.min(BOOT_MESSAGES.length - 1, Math.floor(t * BOOT_MESSAGES.length));
    if (wantIdx !== msgIdx && statusEl) {
      msgIdx = wantIdx;
      statusEl.textContent = BOOT_MESSAGES[msgIdx];
    }
    if (t < 1) requestAnimationFrame(tick);
    else setTimeout(finish, 600);
  };
  requestAnimationFrame(tick);

  const skip = () => finish();
  boot.addEventListener('click', skip, { once: true });
  window.addEventListener('keydown', skip, { once: true });
}

/* ---------------- Window manager ---------------- */

let zCounter = 100;
const taskbarWindows = $('#taskbar-windows')!;

const allWindows = () => $$<HTMLElement>('[data-window]');
const winEl = (id: string) => $<HTMLElement>(`[data-window="${id}"]`);
const taskButton = (id: string) => $<HTMLButtonElement>(`[data-task="${id}"]`, taskbarWindows);
const isVisible = (w: HTMLElement) => !w.hidden && !w.hasAttribute('data-minimized');

function syncTaskbar() {
  for (const w of allWindows()) {
    const id = w.dataset.window!;
    const isOpen = !w.hidden;
    const existing = taskButton(id);
    if (isOpen && !existing) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'xp-task-btn';
      btn.dataset.task = id;
      btn.title = w.dataset.title ?? id;
      btn.innerHTML = `<span class="glyph" aria-hidden="true">${w.dataset.glyph ?? ''}</span><span class="truncate">${w.dataset.title ?? id}</span>`;
      btn.addEventListener('click', () => {
        const el = winEl(id)!;
        if (el.hasAttribute('data-minimized')) {
          el.removeAttribute('data-minimized');
          focusWindow(id);
        } else if (!el.hasAttribute('data-inactive')) {
          minimizeWindow(id);
        } else {
          focusWindow(id);
        }
      });
      taskbarWindows.appendChild(btn);
    } else if (!isOpen && existing) {
      existing.remove();
    }
    const btn = taskButton(id);
    if (btn) {
      if (!w.hasAttribute('data-inactive') && !w.hasAttribute('data-minimized')) btn.setAttribute('data-active', '');
      else btn.removeAttribute('data-active');
    }
  }
}

function focusWindow(id: string) {
  const el = winEl(id);
  if (!el) return;
  for (const w of allWindows()) w.setAttribute('data-inactive', '');
  el.removeAttribute('data-inactive');
  el.removeAttribute('data-minimized');
  el.style.zIndex = String(++zCounter);
  syncTaskbar();
}

function focusTopMost() {
  const remaining = allWindows().filter(isVisible);
  const top = remaining.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
  if (top) focusWindow(top.dataset.window!);
  else syncTaskbar();
}

function clampIntoView(el: HTMLElement) {
  if (!isDesktop()) return;
  const maxX = Math.max(0, window.innerWidth - el.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - 30 - el.offsetHeight);
  const x = Math.min(Math.max(0, el.offsetLeft), maxX);
  const y = Math.min(Math.max(0, el.offsetTop), maxY);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (el.offsetHeight > window.innerHeight - 30) el.style.height = `${window.innerHeight - 40}px`;
  if (el.offsetWidth > window.innerWidth) el.style.width = `${window.innerWidth - 8}px`;
}

function openWindow(id: string) {
  const el = winEl(id);
  if (!el) return;
  if (isMobile()) {
    const isAlert = id === 'error';
    // Alerts overlay whatever is showing; apps replace the current app
    if (!isAlert) for (const w of allWindows()) if (w !== el && !w.hidden) w.setAttribute('data-minimized', '');
    el.hidden = false;
    el.removeAttribute('data-minimized');
    el.removeAttribute('data-closing');
    el.removeAttribute('data-minimizing');
    el.removeAttribute('data-inactive');
    el.scrollTop = 0;
    if (!isAlert) document.body.classList.add('ios-app-open');
    syncTabbar();
    return;
  }
  const wasHidden = el.hidden;
  el.hidden = false;
  el.removeAttribute('data-minimized');
  el.removeAttribute('data-closing');
  el.removeAttribute('data-minimizing');
  if (wasHidden) {
    const offset = (allWindows().filter((w) => !w.hidden).length % 6) * 14;
    if (isDesktop()) {
      el.style.left = `${el.offsetLeft + offset}px`;
      el.style.top = `${el.offsetTop + offset}px`;
    }
    clampIntoView(el);
  }
  focusWindow(id);
}

function closeWindow(id: string) {
  const el = winEl(id);
  if (!el || el.hidden) return;
  const done = () => {
    el.hidden = true;
    el.removeAttribute('data-closing');
    el.setAttribute('data-inactive', '');
    el.removeAttribute('data-maximized');
    if (isMobile()) {
      const stillOpen = allWindows().some((w) => isVisible(w) && w.dataset.window !== 'error');
      if (!stillOpen) document.body.classList.remove('ios-app-open');
      syncTaskbar();
      syncTabbar();
      return;
    }
    focusTopMost();
  };
  if (reducedMotion()) return done();
  el.setAttribute('data-closing', '');
  el.addEventListener('animationend', done, { once: true });
}

function minimizeWindow(id: string) {
  const el = winEl(id);
  if (!el || el.hidden || el.hasAttribute('data-minimized')) return;
  const done = () => {
    el.removeAttribute('data-minimizing');
    el.setAttribute('data-minimized', '');
    el.setAttribute('data-inactive', '');
    focusTopMost();
  };
  if (reducedMotion()) return done();
  el.setAttribute('data-minimizing', '');
  el.addEventListener('animationend', done, { once: true });
}

function toggleMaximize(id: string) {
  const el = winEl(id);
  if (!el) return;
  if (el.hasAttribute('data-maximized')) el.removeAttribute('data-maximized');
  else el.setAttribute('data-maximized', '');
  focusWindow(id);
}

function showDesktop() {
  const visible = allWindows().filter(isVisible);
  if (visible.length) {
    for (const w of visible) {
      w.setAttribute('data-minimized', '');
      w.setAttribute('data-inactive', '');
    }
    syncTaskbar();
  } else {
    for (const w of allWindows()) if (!w.hidden) w.removeAttribute('data-minimized');
    focusTopMost();
  }
}

function showError(message?: string) {
  const text = $('#error-text');
  if (text && message) text.textContent = message;
  const el = winEl('error');
  if (el && isDesktop()) {
    el.style.left = `${Math.max(0, (window.innerWidth - el.offsetWidth) / 2)}px`;
    el.style.top = `${Math.max(0, (window.innerHeight - el.offsetHeight) / 2 - 40)}px`;
  }
  openWindow('error');
}

/* ---------------- Dragging ---------------- */

function enableDragging() {
  for (const w of allWindows()) {
    const handle = $('[data-drag-handle]', w) as HTMLElement | null;
    if (!handle) continue;
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (!isDesktop() || w.hasAttribute('data-maximized')) return;
      focusWindow(w.dataset.window!);
      const startX = e.clientX - w.offsetLeft;
      const startY = e.clientY - w.offsetTop;
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        w.style.left = `${Math.max(-w.offsetWidth + 80, Math.min(window.innerWidth - 80, ev.clientX - startX))}px`;
        w.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - startY))}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    handle.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if ($('[data-action="maximize"]', w)) toggleMaximize(w.dataset.window!);
    });
  }
}

/* ---------------- Resizing ---------------- */

const MIN_W = 280;
const MIN_H = 160;

function enableResizing() {
  for (const w of allWindows()) {
    for (const handle of $$<HTMLElement>('[data-resize]', w)) {
      const dir = handle.dataset.resize!;
      handle.addEventListener('pointerdown', (e) => {
        if (!isDesktop() || w.hasAttribute('data-maximized')) return;
        e.preventDefault();
        e.stopPropagation();
        focusWindow(w.dataset.window!);
        w.setAttribute('data-resizing', '');
        handle.setPointerCapture(e.pointerId);
        const sx = e.clientX;
        const sy = e.clientY;
        const r = { left: w.offsetLeft, top: w.offsetTop, width: w.offsetWidth, height: w.offsetHeight };
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - sx;
          const dy = ev.clientY - sy;
          let { left, top, width, height } = r;
          if (dir.includes('e')) width = Math.max(MIN_W, r.width + dx);
          if (dir.includes('s')) height = Math.max(MIN_H, r.height + dy);
          if (dir.includes('w')) {
            width = Math.max(MIN_W, r.width - dx);
            left = r.left + (r.width - width);
          }
          if (dir.includes('n')) {
            height = Math.max(MIN_H, r.height - dy);
            top = Math.max(0, r.top + (r.height - height));
            height = r.top + r.height - top;
          }
          width = Math.min(width, window.innerWidth - left);
          height = Math.min(height, window.innerHeight - 30 - top);
          w.style.left = `${left}px`;
          w.style.top = `${top}px`;
          w.style.width = `${width}px`;
          w.style.height = `${height}px`;
        };
        const up = () => {
          w.removeAttribute('data-resizing');
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }
  }
}

/* ---------------- Desktop icons (XP: click selects, double-click opens) ---------------- */

function clearIconSelection() {
  for (const i of $$('.xp-icon.selected')) i.classList.remove('selected');
}

function enableIcons() {
  const icons = $$<HTMLElement>('#desktop-icons .xp-icon');
  for (const icon of icons) {
    icon.addEventListener('click', (e) => {
      if (!isFinePointer()) return; // touch: let the delegated data-open handler open it
      e.stopPropagation();
      e.preventDefault();
      clearIconSelection();
      icon.classList.add('selected');
    });
    icon.addEventListener('dblclick', (e) => {
      e.preventDefault();
      clearIconSelection();
      const id = icon.dataset.open;
      if (id) openWindow(id);
      else if (icon instanceof HTMLAnchorElement) window.open(icon.href, '_blank', 'noopener');
    });
    icon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && icon.dataset.open) openWindow(icon.dataset.open);
    });
  }
}

/* ---------------- iOS tab bar + widgets ---------------- */

function syncTabbar() {
  const open = allWindows().find((w) => isVisible(w) && w.dataset.window !== 'error')?.dataset.window ?? '';
  for (const tab of $$<HTMLElement>('.ios-tabbar [data-tab]')) {
    if (tab.dataset.tab === open) tab.setAttribute('data-active', '');
    else tab.removeAttribute('data-active');
  }
}

function updateCountdown() {
  const el = $<HTMLElement>('[data-countdown]');
  if (!el) return;
  const target = new Date(el.dataset.countdown!).getTime();
  const days = Math.ceil((target - Date.now()) / 86_400_000);
  const num = $('.days', el);
  const unit = $('.unit', el);
  if (!num || !unit) return;
  if (days > 1) {
    num.textContent = String(days);
    unit.textContent = 'days to go';
  } else if (days === 1) {
    num.textContent = '1';
    unit.textContent = 'day to go';
  } else if (days > -2) {
    num.textContent = 'NOW';
    unit.textContent = 'hacking';
  } else {
    num.textContent = '✓';
    unit.textContent = 'see you next year';
  }
}

/* ---------------- Start menu, context menu, balloon, clock ---------------- */

const startBtn = $<HTMLButtonElement>('#start-btn')!;
const startMenu = $('#startmenu')!;
const balloon = $('#balloon')!;
const contextMenu = $('#contextmenu')!;

function setStartMenu(open: boolean) {
  startMenu.hidden = !open;
  startBtn.setAttribute('aria-expanded', String(open));
}

function openContextMenu(x: number, y: number) {
  contextMenu.hidden = false;
  const w = contextMenu.offsetWidth;
  const h = contextMenu.offsetHeight;
  contextMenu.style.left = `${Math.min(x, window.innerWidth - w - 4)}px`;
  contextMenu.style.top = `${Math.min(y, window.innerHeight - 30 - h - 4)}px`;
}

function startClock() {
  const clock = $<HTMLTimeElement>('#clock');
  if (!clock) return;
  const iosClock = $('#ios-clock');
  const lockTime = $('#ios-lock-time');
  const lockDate = $('#ios-lock-date');
  const update = () => {
    const now = new Date();
    const t = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    clock.textContent = t;
    clock.dateTime = now.toISOString();
    clock.title = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (iosClock) iosClock.textContent = t;
    if (lockTime) lockTime.textContent = t.replace(/ (AM|PM)$/, '');
    if (lockDate) lockDate.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };
  update();
  setInterval(update, 1000);
}

/* ---------------- Global event delegation ---------------- */

function bindEvents() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    contextMenu.hidden = true;

    const opener = target.closest<HTMLElement>('[data-open]');
    if (opener) {
      if (opener.classList.contains('xp-icon') && isFinePointer()) return; // handled by dblclick
      openWindow(opener.dataset.open!);
      setStartMenu(false);
      balloon.hidden = true;
      return;
    }

    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action!;
      const win = actionEl.closest<HTMLElement>('[data-window]');
      const id = win?.dataset.window;
      switch (action) {
        case 'close':
          if (id) closeWindow(id);
          break;
        case 'minimize':
          if (id) minimizeWindow(id);
          break;
        case 'maximize':
          if (id) toggleMaximize(id);
          break;
        case 'close-balloon':
          balloon.hidden = true;
          break;
        case 'ios-home': {
          const open = allWindows().find((w) => isVisible(w) && w.dataset.window !== 'error');
          if (open) closeWindow(open.dataset.window!);
          break;
        }
        case 'show-desktop':
          setStartMenu(false);
          showDesktop();
          break;
        case 'tray-chevron':
          balloon.hidden = !balloon.hidden;
          break;
        case 'ctx-refresh':
          clearIconSelection();
          break;
        case 'ctx-arrange':
          clearIconSelection();
          break;
        case 'fake-register':
          showError('ยังไม่เปิดลงทะเบียน — ตั๋วจะเปิดที่ Eventpop วันที่ 21 ก.ย. 2026 ติดตามได้ที่ Facebook Creatorsgarten และ Discord');
          break;
        case 'logoff':
          setStartMenu(false);
          showError('Log off ไม่ได้ เพราะยังไม่ได้ log in (ลงทะเบียนที่ Eventpop ก่อน)');
          break;
        case 'shutdown':
          setStartMenu(false);
          showError('It is not safe to turn off your computer. งานยังไม่ได้ funding ครบ');
          break;
      }
      return;
    }

    const win = target.closest<HTMLElement>('[data-window]');
    if (win) {
      if (win.hasAttribute('data-inactive')) focusWindow(win.dataset.window!);
    } else if (!target.closest('#startmenu') && !target.closest('#start-btn') && !target.closest('.xp-taskbar')) {
      // Clicked the desktop background
      clearIconSelection();
      for (const w of allWindows()) w.setAttribute('data-inactive', '');
      syncTaskbar();
    }

    if (!target.closest('#startmenu') && !target.closest('#start-btn')) setStartMenu(false);
    if (target.closest('#balloon') && !target.closest('[data-action]')) {
      balloon.hidden = true;
      openWindow('funding');
    }
  });

  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    if (!isDesktop()) return;
    if (target.closest('[data-window]') || target.closest('.xp-taskbar') || target.closest('#startmenu')) return;
    e.preventDefault();
    setStartMenu(false);
    openContextMenu(e.clientX, e.clientY);
  });

  startBtn.addEventListener('click', () => setStartMenu(startMenu.hidden));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setStartMenu(false);
      contextMenu.hidden = true;
      const errorWin = winEl('error');
      if (errorWin && !errorWin.hidden) closeWindow('error');
    }
    // Win key / Ctrl+Esc opens the start menu like XP
    if (e.key === 'Meta' || (e.ctrlKey && e.key === 'Escape')) {
      e.preventDefault();
      setStartMenu(startMenu.hidden);
    }
  });

  window.addEventListener('resize', () => {
    for (const w of allWindows()) if (!w.hidden) clampIntoView(w);
  });

  mobileQuery.addEventListener('change', (e) => {
    setStartMenu(false);
    contextMenu.hidden = true;
    if (e.matches) {
      // → mobile: go to the home screen
      for (const w of allWindows()) if (!w.hidden) w.setAttribute('data-minimized', '');
      document.body.classList.remove('ios-app-open');
      syncTabbar();
    } else {
      // → desktop: restore whatever was open
      document.body.classList.remove('ios-app-open');
      for (const w of allWindows()) {
        if (!w.hidden) {
          w.removeAttribute('data-minimized');
          clampIntoView(w);
        }
      }
      focusTopMost();
    }
  });
}

/* ---------------- Init ---------------- */

function init() {
  bindEvents();
  enableDragging();
  enableResizing();
  enableIcons();
  startClock();
  updateCountdown();
  setInterval(updateCountdown, 60_000);

  if (isMobile()) for (const w of allWindows()) if (!w.hidden) w.setAttribute('data-minimized', '');
  for (const w of allWindows()) if (!w.hidden) clampIntoView(w);
  const initiallyOpen = allWindows().filter((w) => !w.hidden);
  syncTaskbar();
  if (initiallyOpen.length && !isMobile()) focusWindow(initiallyOpen[initiallyOpen.length - 1].dataset.window!);

  runBoot(() => {
    const wanted = new URLSearchParams(location.search).get('open');
    if (wanted && winEl(wanted)) openWindow(wanted);
    if (isMobile()) return;
    setTimeout(() => {
      balloon.hidden = false;
      setTimeout(() => (balloon.hidden = true), 9000);
    }, 900);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
