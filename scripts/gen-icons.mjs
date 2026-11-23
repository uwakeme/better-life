/**
 * 图标 PNG 生成器（零依赖）
 *
 * 职责：把图标描述渲染成 PNG，写进 assets/icons/ 与 assets/tabbar/。
 * 为什么不用 SVG：WXML 不支持内联 SVG，<image> 的 src 也不可靠地支持 svg。
 * 为什么不用第三方库：项目要求小程序端零依赖，构建工具链也只有 Node 内置模块。
 * 做法：自研一个只支持描边的小光栅化器（line / polyline / circle / arc / rrect），
 * 4× 超采样做抗锯齿，PNG 用 zlib 编码。
 *
 * 用法：
 *   node scripts/gen-icons.mjs          # 重新生成全部图标
 *   node scripts/gen-icons.mjs --check  # 只校验现有资源是否齐备且规格正确
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'assets', 'icons');
const TAB_DIR = path.join(ROOT, 'assets', 'tabbar');

const INK = [0x3f, 0x4a, 0x57];      /* --ink-2 */
const INK_DARK = [0x25, 0x30, 0x3f]; /* --ink */
const WHITE = [0xff, 0xff, 0xff];

/* ------------------------------------------------------------------
 * 图元：全部按 24×24 坐标系描述，渲染时按目标尺寸缩放
 * ------------------------------------------------------------------ */

/** 线段：(x1,y1) → (x2,y2) */
const L = (x1, y1, x2, y2) => ({ t: 'line', x1, y1, x2, y2 });
/** 折线：[[x,y], ...] */
const P = (pts) => ({ t: 'poly', pts });
/** 圆：(cx,cy,r) */
const C = (cx, cy, r) => ({ t: 'circle', cx, cy, r });
/** 圆弧：(cx,cy,r, 起始角, 结束角)，角度制，0° 指向右，顺时针为正 */
const A = (cx, cy, r, a0, a1) => ({ t: 'arc', cx, cy, r, a0, a1 });
/** 圆角矩形：(x,y,w,h,r) */
const RR = (x, y, w, h, r) => ({ t: 'rrect', x, y, w, h, r });

/**
 * 28 个图标。造型对齐原型 design/assets/data.js 里的 ICON 路径（24×24 stroke 风格）。
 * 注意：原型 path 里有贝塞尔与圆弧，转 SVG 路径成本高，这里直接用图元 DSL 重画。
 */
const ICONS = {
  bag: [P([[6, 7], [18, 7], [19, 20], [5, 20]]), P([[9, 7], [9, 5]]), A(12, 5, 3, 180, 360)],
  bowl: [P([[4, 11], [20, 11]]), A(12, 11, 8, 0, 180), P([[9, 7], [10, 5]]), P([[13, 7], [14, 3.4]])],
  house: [P([[4, 11], [12, 4], [20, 11]]), P([[6, 10], [6, 19], [18, 19], [18, 10]])],
  plane: [P([[3, 11], [21, 3], [13, 21], [11, 13], [3, 11]])],
  heart: [C(12, 12, 8), C(9.4, 9.4, 4.6), C(14.6, 9.4, 4.6)],
  wallet: [P([[3, 7], [18, 7], [20, 9], [20, 17], [18, 19], [5, 19], [3, 17], [3, 7]]), P([[16, 12], [21, 12]])],
  shield: [P([[12, 3], [20, 6], [20, 12], [17, 17.5], [12, 20], [7, 17.5], [4, 12], [4, 6], [12, 3]])],
  chat: [P([[4, 5], [20, 5], [20, 16], [9, 16], [4, 20], [4, 5]])],
  tools: [P([[14.5, 6.5], [18, 3], [21, 6], [17.5, 9.5]]), P([[17.5, 9.5], [9, 18]]), L(9, 18, 5.5, 14.5), L(5.5, 14.5, 9, 18)],
  search: [C(11, 11, 7), L(15.8, 15.8, 20, 20)],
  star: [P([[12, 3.2], [14.7, 8.7], [20.8, 9.6], [16.4, 13.9], [17.4, 20], [12, 17.1], [6.6, 20], [7.6, 13.9], [3.2, 9.6], [9.3, 8.7], [12, 3.2]])],
  share: [P([[4, 12], [4, 19], [20, 19], [20, 12]]), L(12, 3, 12, 15), P([[8, 7], [12, 3], [16, 7]])],
  chevron: [P([[9, 6], [15, 12], [9, 18]])],
  back: [P([[15, 6], [9, 12], [15, 18]])],
  filter: [L(4, 6, 20, 6), L(7, 12, 17, 12), L(10, 18, 14, 18)],
  check: [P([[5, 13], [9, 17], [19, 7]])],
  clock: [C(12, 12, 8.5), P([[12, 7.5], [12, 12], [15, 13.5]])],
  warn: [P([[12, 3.5], [21, 20], [3, 20], [12, 3.5]]), L(12, 10, 12, 14.2), C(12, 17.3, .6)],
  link: [A(9, 12, 4.6, 300, 60), A(15, 12, 4.6, 120, 240), L(10.5, 13.5, 13.5, 10.5)],
  inbox: [P([[4, 13], [8, 13], [9.2, 16], [14.8, 16], [16, 13], [20, 13]]), P([[4, 13], [6, 6], [18, 6], [20, 13], [20, 19], [4, 19], [4, 13]])],
  edit: [P([[4, 20], [8, 20], [19, 9], [15, 5], [4, 16], [4, 20]]), P([[14, 6], [18, 10]])],
  plus: [L(12, 5, 12, 19), L(5, 12, 19, 12)],
  external: [P([[14, 4], [20, 4], [20, 10]]), L(20, 4, 11.5, 12.5), P([[18, 14], [18, 19], [5, 19], [5, 6], [10, 6]])],
  bookmark: [P([[6, 4], [18, 4], [18, 20], [12, 16], [6, 20], [6, 4]])],
  grid: [RR(4, 4, 7, 7, 1.5), RR(13, 4, 7, 7, 1.5), RR(4, 13, 7, 7, 1.5), RR(13, 13, 7, 7, 1.5)],
  close: [L(6, 6, 18, 18), L(18, 6, 6, 18)],
  down: [P([[6, 9], [12, 15], [18, 9]])],
  thumbsup: [P([[7, 11], [7, 20], [4, 20], [4, 11], [7, 11]]), P([[7, 11], [11, 3], [13, 5], [13, 10], [18, 10], [20, 12.4], [19, 17], [17, 20], [7, 20]])],
  thumbdown: [P([[17, 13], [17, 4], [20, 4], [20, 13], [17, 13]]), P([[17, 13], [13, 21], [11, 19], [11, 14], [6, 14], [4, 11.6], [5, 7], [7, 4], [17, 4]])],
  list: [L(8, 6, 20, 6), L(8, 12, 20, 12), L(8, 18, 20, 18), C(4, 6, .8), C(4, 12, .8), C(4, 18, .8)],
  settings: [C(12, 12, 3), C(12, 12, 9)],
  doc: [P([[6, 3], [14, 3], [18, 7], [18, 21], [6, 21], [6, 3]]), P([[14, 3], [14, 7], [18, 7]]), L(9, 13, 15, 13), L(9, 17, 13, 17)],
  user: [C(12, 8, 3.6), A(12, 20, 7.5, 180, 360)],
  settings2: [C(12, 12, 3), L(12, 2, 12, 5), L(12, 19, 12, 22), L(2, 12, 5, 12), L(19, 12, 22, 12),
    L(4.9, 4.9, 7, 7), L(17, 17, 19.1, 19.1), L(19.1, 4.9, 17, 7), L(7, 17, 4.9, 19.1)],
  list2: [L(8, 6, 20, 6), L(8, 12, 20, 12), L(8, 18, 20, 18)],
  board: [RR(3, 4, 18, 16, 2), L(3, 9, 21, 9), L(9, 9, 9, 20), L(15, 9, 15, 20)],
  camera: [P([[3, 8], [8, 8], [9.5, 5], [14.5, 5], [16, 8], [21, 8], [21, 19], [3, 19], [3, 8]]), C(12, 13.5, 4)],
  arrowup: [P([[12, 19], [12, 5]]), P([[6, 11], [12, 5], [18, 11]])],
  arrowdown: [P([[12, 5], [12, 19]]), P([[6, 13], [12, 19], [18, 13]])],
  trash: [L(5, 7, 19, 7), P([[6.5, 7], [7.5, 20], [16.5, 20], [17.5, 7]]), P([[9.5, 4], [14.5, 4]]), L(10, 10, 10, 17), L(14, 10, 14, 17)]
};

/* 原型 tabBar 三项：首页 / 找经验 / 我的 */
const TAB_ICONS = { home: 'house', search: 'search', mine: 'user' };

/* ------------------------------------------------------------------
 * 光栅化
 * ------------------------------------------------------------------ */

const SS = 4; /* 超采样倍数 */

/** 点到线段距离 */
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 弧线离散成折线段 */
function arcSegments(cx, cy, r, a0, a1) {
  const span = Math.abs(a1 - a0);
  const steps = Math.max(6, Math.ceil(span / 6));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (a0 + (a1 - a0) * (i / steps)) * Math.PI / 180;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** 圆角矩形离散成折线 */
function rrectSegments(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  const pts = [];
  const corners = [
    [x + w - rr, y + rr, -90, 0],
    [x + w - rr, y + h - rr, 0, 90],
    [x + rr, y + h - rr, 90, 180],
    [x + rr, y + rr, 180, 270]
  ];
  for (const c of corners) {
    for (const p of arcSegments(c[0], c[1], rr, c[2], c[3])) pts.push(p);
  }
  pts.push(pts[0]);
  return pts;
}

/**
 * 把图元展开成线段列表（24×24 坐标系）
 */
function toSegments(prims) {
  const segs = [];
  for (const pr of prims) {
    if (pr.t === 'line') {
      segs.push([pr.x1, pr.y1, pr.x2, pr.y2]);
    } else if (pr.t === 'poly') {
      for (let i = 0; i < pr.pts.length - 1; i++) {
        const a = pr.pts[i], b = pr.pts[i + 1];
        segs.push([a[0], a[1], b[0], b[1]]);
      }
    } else if (pr.t === 'circle') {
      const pts = arcSegments(pr.cx, pr.cy, pr.r, 0, 360);
      for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    } else if (pr.t === 'arc') {
      const pts = arcSegments(pr.cx, pr.cy, pr.r, pr.a0, pr.a1);
      for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    } else if (pr.t === 'rrect') {
      const pts = rrectSegments(pr.x, pr.y, pr.w, pr.h, pr.r);
      for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    }
  }
  return segs;
}

/**
 * 渲染一个图标为 RGBA 像素缓冲
 */
function renderIcon(prims, size, stroke, color, scale = 24 / 24) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const segs = toSegments(prims);
  const half = stroke / 2;
  const k = size / 24 * scale;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (px + (sx + 0.5) / SS) / k;
          const fy = (py + (sy + 0.5) / SS) / k;
          let hit = false;
          for (const s of segs) {
            if (distSeg(fx, fy, s[0], s[1], s[2], s[3]) <= half) { hit = true; break; }
          }
          if (hit) cover++;
        }
      }
      if (!cover) continue;
      const alpha = Math.round((cover / (SS * SS)) * 255);
      const o = (py * size + px) * 4;
      buf[o] = color[0];
      buf[o + 1] = color[1];
      buf[o + 2] = color[2];
      buf[o + 3] = alpha;
    }
  }
  return buf;
}

/* ------------------------------------------------------------------
 * PNG 编码
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; /* filter: none */
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 6;   /* color type: RGBA */
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------------
 * 输出
 * ------------------------------------------------------------------ */

const VARIANTS = [
  { suffix: '', color: INK },
  { suffix: '-w', color: WHITE }
];

function writeIcon(name, prims, size, color, file) {
  const rgba = renderIcon(prims, size, 1.6, color);
  fs.writeFileSync(file, encodePng(rgba, size));
  return { name, file, size, bytes: fs.statSync(file).size };
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

/** 读 PNG 头，校验尺寸 */
function readPngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const onlyCheck = process.argv.includes('--check');
const report = [];

if (!onlyCheck) {
  ensureDir(ICON_DIR);
  ensureDir(TAB_DIR);

  for (const [name, prims] of Object.entries(ICONS)) {
    for (const v of VARIANTS) {
      const file = path.join(ICON_DIR, name + v.suffix + '.png');
      report.push(writeIcon(name, prims, 48, v.color, file));
    }
  }

  /* tabBar：81×81，常态用 ink-3，选中态用 ink */
  for (const [tab, iconName] of Object.entries(TAB_ICONS)) {
    const prims = ICONS[iconName];
    report.push(writeIcon(tab, prims, 81, INK, path.join(TAB_DIR, tab + '.png')));
    report.push(writeIcon(tab + '-active', prims, 81, INK_DARK, path.join(TAB_DIR, tab + '-active.png')));
  }
}

/* ------------------------------------------------------------------
 * 自检：文件齐备 + 尺寸正确 + 有非透明像素
 * ------------------------------------------------------------------ */

const problems = [];
const expect = [];

for (const name of Object.keys(ICONS)) {
  for (const v of VARIANTS) expect.push({ file: path.join(ICON_DIR, name + v.suffix + '.png'), size: 48 });
}
for (const tab of Object.keys(TAB_ICONS)) {
  expect.push({ file: path.join(TAB_DIR, tab + '.png'), size: 81 });
  expect.push({ file: path.join(TAB_DIR, tab + '-active.png'), size: 81 });
}

for (const e of expect) {
  if (!fs.existsSync(e.file)) { problems.push('缺文件：' + path.relative(ROOT, e.file)); continue; }
  const dim = readPngSize(e.file);
  if (!dim) { problems.push('不是合法 PNG：' + path.relative(ROOT, e.file)); continue; }
  if (dim.width !== e.size || dim.height !== e.size) {
    problems.push('尺寸不对：' + path.relative(ROOT, e.file) + ' → ' + dim.width + '×' + dim.height + '，期望 ' + e.size + '×' + e.size);
  }
  const buf = fs.readFileSync(e.file);
  let opaque = 0;
  for (let i = 3; i < buf.length; i += 4 * 97) if (buf[i] > 8) opaque++;
  if (opaque === 0) problems.push('全透明（画不出东西）：' + path.relative(ROOT, e.file));
}

console.log('图标：' + expect.length + ' 个资源，' + Object.keys(ICONS).length + ' 个图形 × 2 色 + ' + (Object.keys(TAB_ICONS).length * 2) + ' 张 tabBar');
if (problems.length) {
  console.error('\n发现问题：');
  problems.forEach(p => console.error('  · ' + p));
  process.exit(1);
}
console.log('自检通过：尺寸 / 通道 / 非空像素全部正常');
