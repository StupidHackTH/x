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
    url: 'https://www.eventpop.me/s/shtx',
    note: 'ลงทะเบียนผ่านเว็บนี้ไม่ได้ ต้องไปที่ Eventpop เท่านั้น',
  },
  links: {
    website: 'https://stupid.hackathon.in.th',
    previous: 'https://stupid.hackathon.in.th/9/',
    facebook: 'https://www.facebook.com/creatorsgarten',
    discord: 'https://grtn.org/discord',
    creatorsgarten: 'https://creatorsgarten.org',
    instagram: '', // TBD
    sponsor: 'https://grtn.org/e/shtx/spon', // sponsor form
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
    { icon: 'train', label: 'MRT', text: 'สถานีพระราม 9 → Exit 2 ไปทาง Central Rama 9 → เดินไปอาคารรุ่งโรจน์ธนกุล (Unicity) → ขึ้นลิฟต์ชั้น 13 (ไม่ต้องแลกบัตร)' },
    { icon: 'car', label: 'รถยนต์', text: 'จอดชั้น 2–3 · ฿20/ชม. (stamp ที่ Cleverse ลด ฿15 ชั่วโมงแรก)' },
    { icon: 'motorbike', label: 'มอเตอร์ไซค์', text: 'จอดชั้น 1 · ฿5/ชม.' },
    { icon: 'wheelchair', label: 'Wheelchair', text: 'แนะนำ taxi หรือรถส่วนตัว (MRT ไม่แนะนำ มีบันได) → จอดชั้น 2A แล้วขึ้นลิฟต์ · ประตูและทางเข้าชั้น 13 กว้าง รองรับวีลแชร์' },
  ],
  nearby: 'ย่านพระราม 9 · Thailand Cultural Centre (ห่าง 1 สถานี)',
};

// Public showers for people staying overnight (the venue has none). Checked 1 Oct 2026.
export const showers = [
  {
    name: 'Silom Edge Communal Showers',
    where: 'Silom Edge (BTS ศาลาแดง / MRT สีลม)',
    hours: '6:00 – 21:00',
    price: '฿40 (ชุดอาบน้ำ ฿30, ผ้าเช็ดตัว ฿40, เจล/แชมพู ฿10)',
    phone: '094-892-9492 / 02-764-6999',
    mapsUrl: 'https://maps.app.goo.gl/EaATk1eZmudXb4CV7',
    infoUrl: 'https://www.facebook.com/SilomEdge/posts/549609300899372',
    infoLabel: 'โพสต์ของ Silom Edge',
    note: 'โทรเช็กก่อนไปว่ายังเปิดอยู่',
  },
  {
    name: 'QSNCC Shower Station',
    where: 'ศูนย์การประชุมแห่งชาติสิริกิติ์ (MRT ศูนย์ฯ สิริกิติ์)',
    hours: '7:00 – 21:00',
    price: '฿100 / ฿200 (มีผ้าเช็ดตัว ไดร์ เจล แชมพูให้)',
    phone: '02-229-3000',
    mapsUrl: 'https://maps.app.goo.gl/L6oyX5Dxxvqj63tr7',
    infoUrl: 'https://www.qsncc.com/th/media/news-and-update/qsncc-launches-the-shower-station-to-complement/',
    infoLabel: 'ข่าวจาก QSNCC',
    bookUrl: 'https://line.me/R/ti/p/@781uyocx',
    note: 'จองผ่าน LINE ได้',
  },
];

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
  'เสื้อผ้าเปลี่ยน · ผ้าเช็ดตัว (venue ไม่มีที่อาบน้ำ ดูที่อาบน้ำใกล้ ๆ ในหน้า Venue)',
  'ไอเดียโง่ ๆ อย่างน้อย 1 ไอเดีย',
];

// Code of Conduct. Written by the organizer (same author as the AI-Preneur Day 2026 CoC), adapted for a 60-person
// overnight hackathon. The short encouraged/prohibited lists feed the FAQ window; everything else is the full page.
export const codeOfConduct = {
  updated: '2 ต.ค. 2026',
  authors: [
    { name: 'โขง', handle: 'nattawatt' },
    { name: 'ไท', handle: 'dtinth' },
  ],
  principle:
    'เราอยากให้ shtX เป็นที่ที่ทุกคนสร้างของโง่ ๆ ได้อย่างปลอดภัยและสบายใจ กฎนี้ใช้กับทุกคนในงานโดยไม่มีข้อยกเว้น ไม่ว่าจะเป็นใครหรือมีตำแหน่งอะไร และเรายึดหลักว่า "ความรู้สึกของผู้ได้รับผลกระทบ สำคัญกว่าเจตนาของผู้กระทำ"',
  scope: [
    'ผู้เข้าร่วม ทีมงาน สปอนเซอร์ แขก และทุกคนที่อยู่ในงาน',
    'ทั้งที่ venue (รวมโถง ลิฟต์ ที่จอดรถ และบริเวณรอบอาคาร) และช่องทางออนไลน์ของงาน เช่น Discord, Facebook',
    'ตั้งแต่เปิดลงทะเบียนจนถึงปิดงาน รวมกิจกรรมนอกรอบระหว่างงาน เมื่องานจบ กฎนี้ก็จบ',
  ],
  encouraged: ['โปรเจกต์แปลก ๆ นอกกรอบ', 'การทดลองอะไรใหม่ ๆ', 'ช่วยเหลือกันระหว่างทีม', 'ความสนุก'],
  prohibited: ['การคุกคามทุกรูปแบบ', 'การเหยียดและเลือกปฏิบัติ', 'ถ่ายหรือเผยแพร่ภาพคนอื่นโดยไม่ขอ', 'กิจกรรมผิดกฎหมาย', 'รบกวนผู้อื่นหรือทำลายของ venue'],
  note: 'อ่านฉบับเต็มได้ในหน้าต่าง Code of Conduct การลงทะเบียนถือว่ายอมรับกฎทั้งหมด',
  expected: [
    'ให้เกียรติกันในทุกการพูดคุย รับฟังความเห็นที่ต่างจากเราอย่างเปิดใจ',
    'ให้เกียรติคำว่า "ไม่" ของคนอื่น ไม่ว่าจะเป็นเรื่องอะไร',
    'วิจารณ์งาน ไม่วิจารณ์คน ให้ feedback แบบสร้างสรรค์ และไม่ดูถูกคนที่รู้น้อยกว่า',
    'ให้ทุกคนในทีมได้พูดเท่า ๆ กัน',
    'เห็นใครเดือดร้อนหรือไม่สบายใจ ช่วยเหลือหรือแจ้งทีมงาน',
    'ทำผิดก็ขอโทษจริง ๆ ไม่ต้องแก้ตัว และไม่โกหกเพื่อให้ตัวเองดูดี',
    'ทำตามคำแนะนำของทีมงานทันที',
  ],
  overnight: [
    'ดูแลของ venue และอุปกรณ์ของ Cleverse เหมือนของตัวเอง',
    'หลังเที่ยงคืนลดเสียงลง มีคนนอนอยู่',
    'ไม่เข้าโซนออฟฟิศที่ไม่ได้เปิดให้ และไม่ยุ่งกับของพนักงาน',
    'ห้ามวางของขวางทางหนีไฟ',
    'ของมีค่าดูแลเอง ของหายแจ้งทีมงานทันที',
  ],
  zeroTolerance: [
    {
      title: 'การคุกคามทางเพศ',
      items: [
        'แตะเนื้อต้องตัวโดยไม่ได้รับความยินยอมอย่างชัดเจน',
        'จีบหรือชวนไปต่อซ้ำ ๆ หลังถูกปฏิเสธแล้ว รวมถึงขอช่องทางติดต่อซ้ำ',
        'ส่งเนื้อหาทางเพศ มุกตลกเรื่องร่างกายหรือรูปร่าง หรือสร้างเนื้อหาทางเพศเกี่ยวกับผู้เข้าร่วม',
        'เดินตาม ติดตาม หรือรอดักผู้เข้าร่วมโดยไม่มีเหตุผล',
      ],
    },
    {
      title: 'การข่มขู่และสร้างความกลัว',
      items: [
        'ขู่หรือข่มขู่ ไม่ว่าจะต่อหน้า ทางวาจา หรือออนไลน์ รวมถึงขู่ทำลายชื่อเสียงหรือทรัพย์สิน',
        'ก่อกวนการนำเสนอหรือกิจกรรมโดยเจตนา โจมตีหรือด้อยค่าคนต่อหน้าสาธารณะ',
        'ใช้ตำแหน่ง อิทธิพล หรือความสัมพันธ์กดดันคนอื่น',
        'ใช้ความรุนแรง หรือบิดเบือนเรื่องกลับด้าน (gaslighting) เพื่อเลี่ยงความรับผิดชอบ',
      ],
    },
    {
      title: 'การเหยียดและเลือกปฏิบัติ',
      items: [
        'คำพูดหรือการกระทำที่เหยียดเชื้อชาติ ศาสนา เพศ อายุ ความพิการ รูปร่าง หรือตัวตนอื่นใด',
        'เหมารวมหรือลดทอนความเป็นคนของกลุ่มใดกลุ่มหนึ่ง และตั้งคำถามกับความน่าเชื่อถือของคนจากตัวตนของเขา',
        'กีดกันบางกลุ่มออกจากการพูดหรือการตัดสินใจอย่างเป็นระบบ',
        'เรียกสรรพนามที่คนอื่นไม่ต้องการซ้ำ ๆ หลังถูกบอกแล้ว',
      ],
    },
    {
      title: 'ความเป็นส่วนตัว',
      items: [
        'แอบถ่ายหรืออัดเสียงคนใดคนหนึ่งเจาะจงทั้งที่เขาไม่รู้ตัวหรือปฏิเสธแล้ว และเผยแพร่ภาพแบบนั้น',
        'เปิดเผยข้อมูลส่วนตัวของผู้อื่น (doxxing)',
        'เข้าถึงอุปกรณ์หรือบัญชีของคนอื่นโดยไม่ได้รับอนุญาต',
        'เอาบทสนทนาที่ตกลงกันว่า off the record ไปเผยแพร่',
      ],
    },
    {
      title: 'อื่น ๆ',
      items: [
        'มาร่วมงานในสภาพเมาหรือภายใต้สารเสพติด',
        'ทำลายของ venue หรือของผู้อื่นโดยเจตนา',
        'โกงหรือบ่อนทำลายกระบวนการตัดสิน แอบอ้างผลงาน ตัวตน หรือความสัมพันธ์กับคนอื่นเพื่อเอาหน้า',
        'เข้างานโดยไม่มีตั๋วที่ถูกต้อง',
      ],
    },
  ],
  media: [
    'ทีมงานมีช่างภาพและ livestream ตลอดงาน ภาพและวิดีโออาจถูกใช้ประชาสัมพันธ์งานและส่งให้สปอนเซอร์',
    'ถ่ายบรรยากาศงานแล้วติดคนอื่นเป็นเรื่องปกติ แต่ถ้าจะตั้งใจถ่ายหรืออัดเสียงใครคนใดคนหนึ่งเจาะจง (หน้าชัด ๆ จอ หรืองานของเขา) ขอเขาก่อน และหยุดถ้าเขาไม่โอเค',
    'ขอความร่วมมือ: ก่อนโพสต์ภาพที่เห็นหน้าคนอื่น ถามเจ้าตัวอีกครั้ง และอย่าใช้ภาพในทางที่ทำให้เขาเสียหาย',
  ],
  projects:
    'โปรเจกต์โง่ ๆ จะหยาบ ดาร์ก หรือ mature ได้ แต่ขอให้นึกถึงว่ามีคนทุกวัยในงาน ห้ามเนื้อหาผิดกฎหมาย และห้ามเนื้อหาทางเพศ การเหยียด หรือการคุกคามที่พุ่งเป้าไปที่ผู้เข้าร่วมหรือคนจริง ๆ',
  reporting: {
    url: 'https://www.facebook.com/creatorsgarten',
    // Named people to go to. 2–3 names, ideally not all the same gender. Empty = only the generic channels show.
    contacts: [] as { name: string; handle: string }[],
    how: [
      'บอกทีมงานหน้างานได้ทันที (ดูจากเสื้อทีมงาน) หรือบอกผู้รับเรื่องด้านล่างโดยตรง',
      'ทักเพจ Facebook Creatorsgarten ได้ตลอด',
      'ถ้าคนที่เกี่ยวข้องเป็นทีมงานหรือเป็นผู้รับเรื่องเอง ให้แจ้งผู้รับเรื่องคนอื่นในรายชื่อ คนที่ถูกร้องเรียนจะไม่มีส่วนในการพิจารณา',
      'จะบอกชื่อหรือลักษณะคนที่เกี่ยวข้อง เวลา สถานที่ สิ่งที่เกิดขึ้น และพยานก็ได้ แต่ไม่จำเป็นต้องครบ',
    ],
    notes: [
      'ไม่ต้องมีหลักฐานสมบูรณ์ แค่คุณรู้สึกไม่ปลอดภัยก็รายงานได้แล้ว',
      'ทีมงานจะรับฟังโดยไม่ตัดสิน รักษาความลับของผู้รายงาน และดูแลให้เร็วที่สุด เหตุที่เกิดในงานจะมีผลเบื้องต้นภายในวันนั้น',
      'การรายงานเท็จโดยเจตนาถือเป็นการละเมิดกฎนี้เช่นกัน',
    ],
  },
  enforcement: [
    { level: 1, title: 'ตักเตือนและให้หยุดทันที', items: ['อาจให้ออกจากพื้นที่ชั่วคราว', 'บันทึกเหตุการณ์ไว้'] },
    { level: 2, title: 'จำกัดการร่วมกิจกรรม', items: ['ห้ามเข้าบางกิจกรรม', 'ร่วมงานต่อได้ภายใต้การดูแลของทีมงาน', 'ห้ามติดต่อผู้ได้รับผลกระทบ'] },
    { level: 3, title: 'เชิญออกจากงานทันที', items: ['ไม่คืนมัดจำ ฿300', 'ห้ามกลับเข้า venue', 'ขอความช่วยเหลือจากอาคารหรือตำรวจถ้าจำเป็น', 'หากเข้าข่ายผิดกฎหมาย ดำเนินการตามกฎหมาย'] },
  ],
  enforcementNotes: [
    'ทีมงานข้ามขั้นได้ตามความร้ายแรงของเหตุ',
    'ไม่ทำตามคำสั่งของทีมงานถือว่าเลื่อนขั้นทันที',
    'ทีมงานขอสงวนสิทธิ์ปฏิเสธการลงทะเบียนหรือยกเลิกตั๋วล่วงหน้า เมื่อมีเหตุด้านความปลอดภัยที่น่าเชื่อถือ แม้ยังไม่เกิดเหตุในงานนี้',
  ],
  acceptance: [
    'การลงทะเบียนที่ Eventpop ถือว่ายอมรับกฎนี้ทั้งหมด',
    'ความปลอดภัยเป็นเรื่องของทุกคน การเพิกเฉยต่อการละเมิดไม่ใช่ความเป็นกลาง',
    'ทีมงานอาจปรับปรุงกฎนี้ได้ โดยยึดฉบับล่าสุดบนหน้านี้',
  ],
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

// Staff, shown in this order: advisors, leads, then everyone else (the Staff window groups by `group`).
// Roles come from the staff form (Oct 2026). `handle` is optional. `wiki` is the person's username on
// creatorsgarten.org/wiki/People (the Staff window links there); `fullName` and `photo` (public/staff/<wiki>.jpg,
// 160px copies) were fetched from that profile.
export type StaffGroup = 'advisor' | 'organizer' | 'lead' | 'staff' | 'faci';
export interface StaffMember { name: string; handle?: string; role: string; group: StaffGroup; wiki?: string; fullName?: string; photo?: string }
export const staffGroups: { id: StaffGroup; title: string; blurb: string }[] = [
  { id: 'advisor', title: 'Advisors', blurb: 'ที่ปรึกษา · คนที่คอยบอกว่าโง่ยังไม่พอ' },
  { id: 'organizer', title: 'Organizers', blurb: 'ผู้จัดงาน · คนที่ตามคนอื่นตอนตีสาม และทำให้งานเกิดขึ้นจริง' },
  { id: 'lead', title: 'Leads', blurb: 'หัวหน้าฝ่าย · คนที่โดนตามตอนตีสาม และทำให้งานเกิดขึ้นจริง' },
  { id: 'faci', title: 'Facilitators', blurb: 'ผู้ดำเนินกิจกรรม · คนที่ทำให้คุณกล้าคุยกับคนแปลกหน้า' },
  { id: 'staff', title: 'Staff', blurb: 'ทีมงาน · คนที่ทำให้งานเกิดขึ้นจริง' },
];
export const staff: StaffMember[] = [
  // advisors
  { name: 'ไท', handle: 'dtinth', role: 'Advisor', group: 'advisor', wiki: 'dtinth', fullName: 'Thai Pangsakulyanont', photo: 'dtinth.jpg' },
  { name: 'Riffy', handle: 'rayriffy', role: 'Advisor', group: 'advisor', wiki: 'rayriffy', fullName: 'Phumrapee Limpianchop', photo: 'rayriffy.jpg' },
  { name: 'Poom', handle: 'poom', role: 'Advisor', group: 'advisor', wiki: 'poom', fullName: 'Phoomparin Mano', photo: 'poom.jpg' },
  // organizer
  { name: 'พีม', handle: 'peamz4', role: 'Lead organizer', group: 'organizer', wiki: 'peamz4', fullName: 'Pirawish Pratumngern' },
  // leads
  { name: 'โขง', handle: 'nattawatt', role: 'Firefighter · MC livestreaming · MC venue', group: 'organizer', wiki: 'nattawatthongthong', fullName: 'Nattawatt Hongthong', photo: 'nattawatthongthong.jpg' },
  { name: 'กัส', handle: 'drowningtoast', role: 'Head challenge · Tickets', group: 'lead' },
  { name: 'มีมี่', handle: 'awww_wwww', role: 'Finance lead · Food', group: 'organizer', wiki: 'khxmjarx', fullName: 'Khimjare Chodkadee', photo: 'khxmjarx.jpg' },
  // facilitators
  { name: 'หนุ่ม', role: 'Facilitator', group: 'faci', fullName: 'Noom' },
  { name: 'Ice', role: 'Facilitator', group: 'faci', fullName: 'Kamol Treewatchararat' },
  // staff
  { name: 'อาร์ต', handle: 'cgix', role: 'Finance', group: 'staff' },
  { name: 'นีโม่', role: 'Finance', group: 'staff' },
  { name: 'Opec', handle: 'opecgame', role: 'Runner', group: 'staff', wiki: 'opecgame', fullName: 'Kittipong Songyos', photo: 'opecgame.jpg' },
  { name: 'Carrot', handle: 'Pariyakorn.S', role: 'Graphic lead', group: 'lead' },
  { name: 'นีน่า', role: 'Swag', group: 'staff' },
  { name: 'ลีโอ', role: 'Challenge · Tech · ขนของ', group: 'staff', wiki: 'leomotors', fullName: 'Leomotors', photo: 'leomotors.jpg' },
  { name: 'Nac', role: 'Challenge', group: 'staff', wiki: 'nacnano', fullName: 'Chotpisit Adunsehawat', photo: 'nacnano.jpg' },
  { name: 'Thee', handle: 'betich', role: 'Challenge', group: 'staff', wiki: 'betich', fullName: 'Panithi Makthiengtrong', photo: 'betich.jpg' },
  { name: 'Juk', role: 'OB', group: 'staff', wiki: 'juk', fullName: 'Chukkrit Visitsaktavorn', photo: 'juk.jpg' },
  { name: 'บีบี', role: 'OB', group: 'staff', wiki: 'siravijbb', fullName: 'Siravij Praevisavakij', photo: 'siravijbb.jpg' },
  { name: 'Neo', handle: 'ne0negi', role: 'Staff', group: 'staff' },
  { name: 'Uddy', handle: 'wasinuddy', role: 'Staff', group: 'staff' },
  { name: 'Folkiesss', role: 'Staff', group: 'staff', photo: 'folk.jpg' },
  { name: 'นรภัทร', role: 'Staff', group: 'staff', photo: 'norraphat.jpg' },
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
