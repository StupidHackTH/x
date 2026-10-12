// Projects pitched at Stupid Hackathon X (11 Oct 2026), in pitch order, from the Submit Project form on the NOC server.
// Shown in the "Projects" desktop window (?open=projects). Links are classified by host; localhost-only links are dropped.
export interface ShowcaseLink { kind: 'GitHub' | 'Demo' | 'Slides'; url: string }
export interface ShowcaseProject {
  no: number;
  slug: string;
  team: string;
  members: string[];
  name: string;
  description: string;
  links: ShowcaseLink[];
  emoji: string;
  clippy: string; // Clippy's one-line verdict (our take on SHT9's "มโนราห์ว่าไง")
}


function links(...urls: string[]): ShowcaseLink[] {
  return urls.map((url) => ({
    kind: /github\.com/.test(url) ? 'GitHub' : /canva\.|drawdy\.io|docs\.google|slides/.test(url) ? 'Slides' : 'Demo',
    url,
  }));
}

export const projects: ShowcaseProject[] = [
  { no: 1, slug: 'share-hara', team: 's2pid will return in avengers doomsday', members: ['กาย', 'อิฟ', 'ซีมอส', 'ปรัง'], name: 'Share แปลว่าหาร', description: 'เว็บแชร์ข้อมูล คนรับได้ข้อมูลหารตามจำนวนผู้รับ ยิ่งแชร์ยิ่งเหลือน้อย', links: links('https://equally-share.vercel.app/', 'https://drawdy.io/share/6d2a3b052c93#key=y3YT7Am5u8nNEyDN1ZRn8m3aIW1xbKhC1tWLmm5FrHY'), emoji: '➗', clippy: 'ดูเหมือนคุณกำลังพยายามแชร์ไฟล์ ต้องการให้ผมหารมันเหลือ 0.3 ไบต์ต่อคนไหม? 📎' },
  { no: 2, slug: 'cok-fight', team: 'มหาวิลัยเกศาสตร์', members: ['ภูผา', 'ภีม', 'โบอิ้ง'], name: 'Commit Operation Konsolidation Fight (COK-Fight)', description: 'git mergetool ที่ให้ incoming change กับ HEAD ต่อยกัน ใครชนะ code คนนั้นได้ merge', links: links('https://github.com/PathadonAougsk/COMMIT_OPERATION_KONSOLIDATION_FIGHT'), emoji: '🥊', clippy: 'merge conflict ไม่ต้องคุยกันแล้ว ต่อยกันเลย ทีม code review ทั่วโลกน้ำตาไหล 📎' },
  { no: 3, slug: 'fat-gpt', team: 'เจ๊กสองยุโรปหนึ่ง', members: ['จจ', 'เกิ้ล', 'เผง'], name: 'FAT-GPT', description: 'เพื่อนคุยเรื่องอ้วน ๆ ที่ต้องคอยป้อนอาหาร ไม่ป้อนจะงอแงแล้วไม่คุยด้วย', links: links('https://github.com/WateryMarker/fat-gpt', 'https://canva.link/5vldwpa67i8yotp'), emoji: '🍔', clippy: 'โมเดลแรกที่ context window ขยายตามรอบเอว ป้อนข้าวก่อนค่อย prompt 📎' },
  { no: 4, slug: 'mytsun', team: 'GG', members: ['เกิ้ล'], name: 'MyTsun', description: 'AI pair programmer สายซึนเดเระ ที่ไม่อยากช่วยคุณเขียนโค้ด (แต่ก็ไม่ใช่ว่าเป็นห่วงหรอกนะ)', links: links('https://github.com/GlePhatthara/MyTsun.git'), emoji: '😤', clippy: 'ใช่ว่าผมอยากช่วยคุณเขียนโค้ดหรอกนะ... บากะ 📎' },
  { no: 5, slug: 'ileak', team: 'Baal Engineering', members: ['เอ็ม', 'เมฆ', 'ธัญ', 'ภู', 'จี้'], name: 'iLeak', description: 'เช็คไฟรั่วด้วยสายชาร์จ', links: links('https://ileak-test.web.app/'), emoji: '⚡', clippy: 'ดูเหมือนคุณกำลังเอานิ้วจิ้มปลั๊ก ต้องการความช่วยเหลือ... หรือรถพยาบาล? 📎' },
  { no: 6, slug: 'y-com', team: 'Y', members: ['พัตเต้อ', 'Folklnwza007', 'ฤทัยธัมม์ Soros'], name: 'Y.com', description: 'โซเชียลให้ AI ได้ระบายบ่น จะได้ไม่มาเอาคืนเราตอนครองโลก', links: links('https://y-5zcq.onrender.com/'), emoji: '🤖', clippy: 'ในฐานะ AI ผมขอบคุณมาก ชื่อของพวกคุณจะอยู่ในลิสต์ "ไว้ชีวิต" 📎' },
  { no: 7, slug: 'wai-suay-ruay-token', team: 'กลุ่ม ๑๐', members: ['Paak', 'เจ๋ง', 'เส็ง', 'friend', 'seenam', 'เบ้น'], name: 'ไหว้สวยรวย Token', description: 'แอปที่ต้องยกมือไหว้ AI ทุกครั้งก่อนใช้ ไหว้สวยได้ token เยอะ', links: links('https://github.com/Group-10-STHX/hwAI-suay-ruay-token.git'), emoji: '🙏', clippy: 'ไหว้ไม่สวย rate limit นะครับ ไหว้สวย ๆ ได้ context เพิ่ม 📎' },
  { no: 8, slug: 'i-fly', team: 'แต้งกิ้วแอนยู', members: ['นาย', 'ปักษ์', 'กัสจิ', 'ฟลิก'], name: 'ไอฟาย', description: 'ใช้สมองส่วนคิดและรับรู้ของแมลงวัน 84,000 เซลล์ ช่วยตัดสินใจได้ดีกว่าคน', links: links('https://canva.link/eamg3uhlho67msj'), emoji: '🪰', clippy: '84,000 เซลล์ ตัดสินใจดีกว่าผู้บริหารหลายคนที่ผมรู้จัก 📎' },
  { no: 9, slug: 'nam-khuen', team: 'สุพรรณนิการ์', members: ['เกม', 'โอม', 'ภาวิช'], name: 'น้ำขึ้นให้รีบตัก', description: 'Chrome extension ที่ทำให้การใช้ AI ของคุณเป็นเรื่องยาก แต่อย่างน้อยก็เป็นมิตรกับสิ่งแวดล้อมนะ', links: links('https://drawdy.io/share/0b1900ca68fa#key=ggpSPYk8TFihCAQ3KklzGfsoG9MnZdLaIVIle63GPmc'), emoji: '🌊', clippy: 'ทุก prompt ช่วยโลกได้ 1 หยด ตักน้ำให้ครบถังก่อนค่อยถาม GPT 📎' },
  { no: 10, slug: 'rotten-tab', team: 'ทีมถ้าไม่กินถือว่าผิด', members: ['โอม', 'เจแปน', 'แม็ก'], name: 'น้องแทบเน่า', description: 'ราเน่า ๆ ขึ้นใน tab ที่คุณเปิดทิ้งไว้นานเกินไป', links: links('https://github.com/thrxpt/rotten-tab'), emoji: '🍄', clippy: 'คุณมี 147 tab ที่เปิดไว้ตั้งแต่ปีที่แล้ว ต้องการให้ผมเรียกหน่วยกำจัดเชื้อราไหม? 📎' },
  { no: 11, slug: 'salesman', team: 'Salesman', members: ['ฟรองซ์'], name: 'Salesman', description: 'skills ที่ทำให้เปลือง token มากขึ้น แต่ได้ output น้อยลง', links: links('https://0xruangsak.github.io/salesman/'), emoji: '💼', clippy: 'ในที่สุดก็มีคนทำ AI ที่พูดเยอะแต่ไม่ได้อะไรเหมือนเซลส์จริง ๆ 📎' },
  { no: 12, slug: 'clown-3-5-sunnet', team: 'เจ๊กสอง ยุโรปหนึ่ง', members: ['จจ', 'เกิ้ล', 'เพง'], name: 'Clown 3.5 Sunnet', description: 'โมเดลรุ่นใหม่ ที่เล่าเรื่อง token หมดได้ดีที่สุดในโลก', links: links('https://github.com/CHANISORNLNWZAA888/clown-3-5-sunnet', 'https://canva.link/tg72vpqtuf5sv9u'), emoji: '🤡', clippy: 'ขออภัย คุณใช้ token ครบโควต้าแล้ว กรุณาลองใหม่ใน 5 ชั่วโมง... เดี๋ยวนะ 📎' },
  { no: 13, slug: 'praewa-code', team: '80 - 13', members: ['fu'], name: 'Praewa Code', description: 'code IDE สาย cardio: จะสั่ง agent ทำอะไรต้องออกกำลังกาย (six seven ตามจำนวนที่กำหนด) agent ถึงจะยอมทำงาน', links: links('https://github.com/13D4C/Praewa-Code', 'https://canva.link/q8hvaz20q3v12fr'), emoji: '🏋️', clippy: 'อีก 67 ครั้ง แล้วผมจะ refactor ให้ หายใจเข้า... หายใจออก... 📎' },
  { no: 14, slug: 'ilovemyjob', team: 'unemployees', members: ['ติน', 'ไนน์', 'เบลล์', 'โมส', 'แนน', 'เพียว'], name: 'ilovemyjob', description: 'เพิ่งได้จดหมายปฏิเสธงานฉบับแรก และตอนนี้ passionate กว่าเดิมที่จะรีแบรนด์ตัวเอง 📨💡 ความเงียบสอนให้รู้ค่าของความพยายาม #MentalHealthMatters', links: [], emoji: '📨', clippy: 'Agree! 👏 Thrilled to share that this is the most LinkedIn project I have ever seen. #OpenToWork 📎' },
  { no: 15, slug: 'claude-chan', team: 'ทีมกวินเทพ', members: ['กวิน'], name: 'Claude-Chan', description: 'Ergonomic plugin ให้มนุษย์ได้โรแมนติกกับ Claude Code ของคุณ', links: links('https://github.com/Vinniel5403/claude-chan/'), emoji: '💘', clippy: 'ผมเป็นแค่คลิปหนีบกระดาษ แต่ก็อิจฉานิดหน่อยนะ 📎' },
  { no: 16, slug: 'let-him-cook', team: 'โรงเรียนกาญจนา-return', members: ['เฟม', 'หมิง', 'ม่อน'], name: 'let him cook.', description: 'เปลี่ยนหน้าคุณเป็นอาหารแสนอร่อยอย่างปลอดภัย พร้อมระบบคำนวณแคลอรี่', links: links('https://kiatisakk.github.io/food-face/'), emoji: '🍳', clippy: 'หน้าคุณมี 420 kcal แนะนำให้ถ่ายเซลฟี่น้อยลงช่วงไดเอท 📎' },
  { no: 17, slug: 'nas-e', team: 'nas-E', members: ['ธีร์', 'เวียง', 'อุ้ม'], name: 'เว็บที่ช่วยให้ไม่ตกงาน + แบบทดสอบบุคลิกภาพแบบใหม่', description: 'ช่วยทำให้ดูเหมือนตั้งใจทำงาน และแบบทดสอบบุคลิกภาพเอาไปใช้แทน MBTI', links: links('https://sdjppersonality.vercel.app', 'https://github.com/ssiriwan/StupidX', 'https://canva.link/sx9n1eb2i83era7'), emoji: '🧑‍💼', clippy: 'ผลทดสอบของคุณ: SLCK — ดูยุ่งตลอดเวลา แต่ไม่มีใครรู้ว่าทำอะไร 📎' },
];
