// Registry of desktop windows. Used by icons, taskbar, and the start menu.
export interface WindowDef {
  id: string;
  title: string;
  label: string; // desktop icon label
  x: number;
  y: number;
  w: number;
  h: number;
  open?: boolean;
}

export const windows: WindowDef[] = [
  { id: 'about', title: 'Stupid Hackathon X - Welcome', label: 'About shtX', x: 120, y: 30, w: 620, h: 560, open: true },
  { id: 'register', title: 'Registration - Eventpop', label: 'Register', x: 300, y: 50, w: 500, h: 430 },
  { id: 'schedule', title: 'Agenda - Notepad', label: 'Agenda', x: 200, y: 90, w: 540, h: 460 },
  { id: 'venue', title: 'Venue - Cleverse', label: 'Venue', x: 240, y: 50, w: 600, h: 640 },
  { id: 'funding', title: 'Funding Goal Status', label: 'Funding Goal', x: 380, y: 100, w: 520, h: 500 },
  { id: 'sponsors', title: 'Sponsors', label: 'Sponsors', x: 150, y: 30, w: 860, h: 700 },
  { id: 'staff', title: 'Event Staff', label: 'Staff', x: 180, y: 40, w: 900, h: 680 },
  { id: 'faq', title: 'Help and Support Center', label: 'FAQ & Rules', x: 160, y: 60, w: 560, h: 480 },
  { id: 'conduct', title: 'Code of Conduct', label: 'Conduct', x: 230, y: 30, w: 600, h: 640 },
  { id: 'camera', title: 'Camera - Stupid Photo Booth', label: 'Camera', x: 280, y: 40, w: 560, h: 600 },
  { id: 'shtxnet', title: 'Network Connections - SHTX-NET', label: 'SHTX-NET', x: 170, y: 30, w: 940, h: 700 },
  { id: 'activate', title: 'Windows Product Activation', label: 'Activate Windows', x: 300, y: 60, w: 640, h: 660 },
  { id: 'submit', title: 'Project Submission - Pitching', label: 'Submit Project', x: 320, y: 50, w: 560, h: 640 },
  { id: 'recycle', title: 'Recycle Bin', label: 'Recycle Bin', x: 340, y: 140, w: 460, h: 360 },
  { id: 'error', title: 'Stupid Hackathon X', label: 'Error', x: 420, y: 220, w: 380, h: 160 },
];

export const byId = Object.fromEntries(windows.map((w) => [w.id, w]));
