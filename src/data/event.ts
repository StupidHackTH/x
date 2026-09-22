// Real event data for Stupid Hackathon X (shtX). Items marked TBD are still unconfirmed.

export const event = {
  name: 'Stupid Hackathon X',
  nameTh: 'Stupid Hackathon ครั้งที่ 10',
  codename: 'shtX',
  edition: 10,
  year: 2026,
  tagline: 'แฮกกาธอนสำหรับสร้างโปรเจกต์ที่ "ไม่มีใครต้องการ"',
  taglineEn: 'A hackathon for building things nobody needs.',
  theme: 'Y2X / 20X — Frutiger Aero',
  themeNote: 'เทคยุค 2010 · แทนเลข 0 ด้วย X (เช่น 2010 → 20X)',
  dates: '10–11 ต.ค. 2026 (เสาร์–อาทิตย์)',
  datesEn: 'Sat 10 – Sun 11 October 2026',
  duration: '2 วัน 1 คืน · ค้างคืนที่ venue ได้ (ไม่บังคับ)',
  time: 'ประกาศเร็ว ๆ นี้ (Day 1 เริ่มช่วงสาย · Day 2 ปิดช่วงเย็น)',
  timeConfirmed: false,
  capacity: 60,
  organizer: 'Creatorsgarten',
  since: 2017,
  registration: {
    platform: 'Eventpop',
    opens: '21 ก.ย. 2026',
    price: 'ฟรี + มัดจำ ฿300 (คืนได้)',
    url: '', // TBD — Eventpop link not published yet
    note: 'ลงทะเบียนผ่านเว็บนี้ไม่ได้ ต้องไปที่ Eventpop เท่านั้น',
  },
  links: {
    website: 'https://stupid.hackathon.in.th',
    previous: 'https://stupid.hackathon.in.th/9/',
    facebook: 'https://www.facebook.com/creatorsgarten',
    discord: 'https://creatorsgarten.org/discord',
    creatorsgarten: 'https://creatorsgarten.org',
    instagram: '', // TBD
    sponsor: 'mailto:team@creatorsgarten.org',
  },
  about: [
    'Stupid Hackathon in Thailand คือเทศกาลแฮกกาธอน "สร้างของโง่ ๆ ที่ไม่มีใครต้องการ" จัดโดย Creatorsgarten ตั้งแต่ปี 2017 เป็นงานฟรี ไม่แสวงผลกำไร community-first และเป็นส่วนหนึ่งของเครือข่าย Stupid Hackathon ทั่วโลก (เริ่มต้นจากนิวยอร์ก)',
    'กฎเหล็ก: ห้ามสร้างสิ่งที่ "มีประโยชน์" — ปลดปล่อยจินตนาการ ไร้ข้อจำกัดเรื่อง business model หรือ KPI เป็นสนามเด็กเล่นของนักสร้างทุกแขนง ทั้งโปรแกรมเมอร์ ดีไซเนอร์ ศิลปิน วิศวกร นักศึกษา และใครก็ตามที่อยากสร้างอะไรสักอย่าง',
    'ผ่านมาแล้ว 9 ครั้ง (2017–2025) มีผู้เข้าร่วม 84–174 คนต่อครั้ง · 6–33 ทีม · venue หลากหลายทั้ง onsite และ online จุดเด่นคือระบบ challenge ticket แบบเกมและมาสคอตประจำงาน — SHT9 ได้คะแนนความพึงพอใจสูงสุด 9.4/10',
  ],
};

export const venue = {
  name: 'Cleverse',
  zone: 'โซนคาเฟ่',
  building: 'อาคาร 44/1 รุ่งโรจน์ธนกุล (UNICITY) ชั้น 13',
  buildingNote: 'โซนออฟฟิศที่มี Cafe Amazon',
  area: 'พระราม 9, กรุงเทพฯ',
  mapsQuery: 'รุ่งโรจน์ธนกุล UNICITY MRT พระราม 9',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('อาคารรุ่งโรจน์ธนกุล UNICITY พระราม 9'),
  transit: [
    { icon: '🚇', label: 'MRT', text: 'สถานีพระราม 9 → Exit 2 ไปทาง Central Rama 9 → เดินไปอาคารรุ่งโรจน์ธนกุล (Unicity) → ขึ้นลิฟต์ชั้น 13 (ไม่ต้องแลกบัตร)' },
    { icon: '🚗', label: 'รถยนต์', text: 'จอดชั้น 2–3 · ฿20/ชม. (stamp ที่ Cleverse ลด ฿15)' },
    { icon: '🏍️', label: 'มอเตอร์ไซค์', text: 'จอดชั้น 1 · ฿5/ชม.' },
    { icon: '♿', label: 'Wheelchair', text: 'แนะนำ taxi หรือรถส่วนตัว (MRT ไม่แนะนำ มีบันได) → จอดชั้น 2A แล้วขึ้นลิฟต์ · ประตูและทางเข้าชั้น 13 กว้าง รองรับวีลแชร์' },
  ],
  nearby: 'ย่านพระราม 9 · Thailand Cultural Centre (ห่าง 1 สถานี)',
};

// Agenda outline. Exact times will be announced.
export const agenda = [
  { day: 'Day 1 · เสาร์ 10 ต.ค.', items: [
    { time: 'สาย', title: 'ลงทะเบียน · เปิดงาน', note: 'เวลาจะประกาศอีกครั้ง' },
    { time: 'เช้า', title: 'Ice-breaking & จับทีม', note: 'มาคนเดียวก็ได้ เดี๋ยวหาทีมให้' },
    { time: 'บ่าย', title: 'เริ่ม hack', note: 'ห้ามทำของมีประโยชน์' },
    { time: 'เย็น–ค่ำ', title: 'hack ต่อ · ค้างคืนได้', note: 'ค้างคืนไม่บังคับ' },
  ] },
  { day: 'Day 2 · อาทิตย์ 11 ต.ค.', items: [
    { time: 'เช้า', title: 'hack ต่อ', note: 'กาแฟคือ system requirement' },
    { time: 'บ่าย', title: 'Pitching & awards', note: 'บั๊กคือฟีเจอร์' },
    { time: '~18:00', title: 'ปิดงาน', note: 'It is now safe to turn off your computer.' },
  ] },
];

export const whatToBring = [
  'โน้ตบุ๊ก + ที่ชาร์จ (และปลั๊กพ่วง ถ้ามี)',
  'ของสำหรับค้างคืน: ถุงนอน/เสื่อ/หมอน (ถ้าจะค้าง)',
  'ของใช้ส่วนตัว · ยาประจำตัว',
  'เสื้อผ้าเปลี่ยน · ผ้าเช็ดตัว',
  'ไอเดียโง่ ๆ อย่างน้อย 1 ไอเดีย',
];

export const codeOfConduct = {
  encouraged: ['โปรเจกต์แปลก ๆ นอกกรอบ', 'การทดลองอะไรใหม่ ๆ', 'ช่วยเหลือกันระหว่างทีม', 'ความสนุก'],
  prohibited: ['เนื้อหาเหยียด/เลือกปฏิบัติ', 'การคุกคามทุกรูปแบบ', 'กิจกรรมผิดกฎหมาย', 'พฤติกรรมรบกวนผู้อื่น', 'สแปมขายของ'],
  note: 'Mature content allowed, but consider all ages welcome.',
};

export const faq = [
  { q: 'Stupid Hackathon คืออะไร', a: 'แฮกกาธอนที่มีกฎข้อเดียว: ห้ามสร้างของที่มีประโยชน์ ถ้าโปรเจกต์คุณมี business model แปลว่าทำผิดโจทย์' },
  { q: 'ใครมาได้บ้าง', a: 'ทุกคน โปรแกรมเมอร์ ดีไซเนอร์ ศิลปิน วิศวกร นักศึกษา หรือใครก็ตามที่อยากสร้างอะไรสักอย่าง มาคนเดียวก็ได้ มีช่วง ice-breaking ให้จับทีม' },
  { q: 'ค่าใช้จ่าย', a: `ฟรี แต่มีมัดจำ ฿300 ผ่าน Eventpop คืนให้เมื่อมาร่วมงาน รับประมาณ ${event.capacity} คน` },
  { q: 'ลงทะเบียนที่ไหน', a: `ที่ ${event.registration.platform} เท่านั้น เปิดประมาณ ${event.registration.opens} — ลงทะเบียนผ่านเว็บนี้ไม่ได้` },
  { q: 'ค้างคืนได้ไหม', a: 'ได้ ที่ venue (Cleverse) แต่ไม่บังคับ เอาถุงนอนมาเอง' },
  { q: 'ธีมปีนี้', a: `${event.theme} — ${event.themeNote} (เว็บนี้เลยเป็น Windows XP เพราะ X)` },
  { q: 'มีรางวัลไหม', a: 'มี pitching และ awards แต่อย่าหวังเงินล้าน หวังเสียงปรบมือแทน' },
  { q: 'อยากสปอนเซอร์', a: 'เปิดหน้าต่าง Funding Goal หรือ Sponsors เพื่อดู tier แล้วติดต่อทีมงานได้เลย' },
];

export const staff = [
  { name: 'พีม', handle: 'peamz4', role: 'Lead organizer' },
  { name: 'ไท', handle: 'dtinth', role: 'Advisor' },
  { name: 'โขง', handle: 'nattawatt', role: 'Firefighter · MC livestreaming · MC venue' },
  { name: 'กัส', handle: 'drowningtoast', role: 'Head challenge' },
  { name: 'มีมี่', handle: 'awww_wwww', role: 'Finance lead' },
  { name: 'อาร์ต', handle: 'cgix', role: 'Finance' },
  { name: 'Opec', handle: 'opecgame', role: 'Runner' },
  { name: 'Carrot', handle: 'Pariyakorn.S', role: 'Graphic' },
  { name: 'Neo', handle: 'ne0negi', role: 'Staff' },
  { name: 'Uddy', handle: 'wasinuddy', role: 'Staff' },
];

export const pastEditions = [
  { edition: 1, year: 2017 },
  { edition: 2, year: 2018 },
  { edition: 3, year: 2019 },
  { edition: 4, year: 2020 },
  { edition: 5, year: 2021 },
  { edition: 6, year: 2022 },
  { edition: 7, year: 2023 },
  { edition: 8, year: 2024 },
  { edition: 9, year: 2025, note: 'GameDevHub Bangkok · rating 9.4/10', url: 'https://stupid.hackathon.in.th/9/' },
];
