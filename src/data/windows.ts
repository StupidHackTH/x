// Registry of desktop windows. Used by icons, taskbar, and the start menu.
export interface WindowDef {
  id: string;
  title: string;
  glyph: string; // emoji icon
  label: string; // desktop icon label
  x: number;
  y: number;
  w: number;
  h: number;
  open?: boolean;
}

export const windows: WindowDef[] = [
  { id: 'about', title: 'Stupid Hackathon X - Welcome', glyph: '💾', label: 'About shtX', x: 120, y: 30, w: 620, h: 560, open: true },
  { id: 'register', title: 'Registration - Eventpop', glyph: '🎟️', label: 'Register', x: 300, y: 50, w: 500, h: 430 },
  { id: 'schedule', title: 'Agenda - Notepad', glyph: '📅', label: 'Agenda', x: 200, y: 90, w: 540, h: 460 },
  { id: 'venue', title: 'Venue - Cleverse', glyph: '🗺️', label: 'Venue', x: 240, y: 50, w: 560, h: 540 },
  { id: 'funding', title: 'Funding Goal Status', glyph: '💰', label: 'Funding Goal', x: 380, y: 100, w: 520, h: 500 },
  { id: 'sponsors', title: 'Sponsors', glyph: '🤝', label: 'Sponsors', x: 260, y: 70, w: 520, h: 440 },
  { id: 'staff', title: 'Event Staff', glyph: '🎭', label: 'Staff', x: 320, y: 80, w: 480, h: 440 },
  { id: 'faq', title: 'Help and Support Center', glyph: '❓', label: 'FAQ & Rules', x: 160, y: 60, w: 560, h: 480 },
  { id: 'camera', title: 'Camera - Stupid Photo Booth', glyph: '📷', label: 'Camera', x: 280, y: 40, w: 560, h: 600 },
  { id: 'recycle', title: 'Recycle Bin', glyph: '🗑️', label: 'Recycle Bin', x: 340, y: 140, w: 460, h: 360 },
  { id: 'error', title: 'Stupid Hackathon X', glyph: '⚠️', label: 'Error', x: 420, y: 220, w: 380, h: 160 },
];

export const byId = Object.fromEntries(windows.map((w) => [w.id, w]));
