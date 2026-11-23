/**
 * 反馈演示图占位资源生成器（零依赖）
 *
 * 职责：生成 assets/placeholder/photo-1..4.png —— 反馈演示数据里引用的图片占位。
 * 为什么要有：读者侧「我的反馈」与管理员侧「反馈盒」都要能看到图的状态，
 * 没有图就看不出「审核中 / 已通过 / 未通过」三种状态的差别。
 * 约定：占位图只是演示素材，不冒充真实照片；真实反馈的图走上传通道。
 *
 * 用法：
 *   node scripts/gen-placeholders.mjs          # 生成
 *   node scripts/gen-placeholders.mjs --check  # 只校验
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'placeholder');
const SIZE = 240;

/* 纸感底色，与设计令牌 --card / --s-slate 同一套 */
const BG = [0xf2, 0xe8, 0xe3];
const CARD = [0xfd, 0xf6, 0xea];
const LINE = [0x4b, 0x56, 0x63];
const SUN = [0xf8, 0xdc, 0x8e];
const HILL = [0xb9, 0xe3, 0xc4];

/* 四张占位图各配一种底色，一眼能分出是不是同一张 */
const PALETTES = [
  { bg: CARD, hill: HILL },
  { bg: [0xf7, 0xf9, 0xfb], hill: [0xb9, 0xd6, 0xee] },
  { bg: [0xfd, 0xf6, 0xea], hill: [0xd6, 0xc8, 0xec] },
  { bg: [0xf9, 0xf3, 0xec], hill: [0xec, 0xd9, 0xb3] }
];

function crc32 (buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk (type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 写一张 PNG（RGBA，无过滤） */
function writePng (file, pixels, w, h) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < w * 4; x++) raw[rowStart + 1 + x] = pixels[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 6;   /* RGBA */
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
}

/**
 * 画一张占位图：纸底 + 一张相框 + 太阳 + 两座山
 * 用 4× 超采样再降采样，边缘不会有锯齿。
 */
function drawPlaceholder (palette, w, h) {
  const S = 4;
  const W = w * S;
  const H = h * S;
  const acc = new Float64Array(W * H * 3);
  const frameL = 0.18 * W;
  const frameR = 0.82 * W;
  const frameT = 0.20 * H;
  const frameB = 0.80 * H;
  const sunX = 0.63 * W;
  const sunY = 0.36 * H;
  const sunR = 0.075 * W;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col = palette.bg;
      const inFrame = x > frameL && x < frameR && y > frameT && y < frameB;
      if (inFrame) {
        col = [0xff, 0xff, 0xff];
        /* 太阳 */
        const dx = x - sunX;
        const dy = y - sunY;
        if (Math.sqrt(dx * dx + dy * dy) < sunR) col = SUN;
        /* 两座山 */
        const base = frameB;
        const h1 = base - (0.34 * (frameR - frameL)) * ((x - frameL) / (frameR - frameL));
        const h2 = base - (0.52 * (frameR - frameL)) * (1 - (x - frameL) / (frameR - frameL));
        if (y > h1 && y < base) col = palette.hill;
        if (y > h2 && y < base) col = LINE;
      }
      const i = (y * W + x) * 3;
      acc[i] = col[0];
      acc[i + 1] = col[1];
      acc[i + 2] = col[2];
    }
  }

  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const i = ((y * S + sy) * W + (x * S + sx)) * 3;
          r += acc[i];
          g += acc[i + 1];
          b += acc[i + 2];
        }
      }
      const n = S * S;
      const o = (y * w + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = 255;
    }
  }
  return out;
}

function readPngSize (file) {
  const b = fs.readFileSync(file);
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const onlyCheck = process.argv.includes('--check');
const files = PALETTES.map((_, i) => path.join(OUT_DIR, 'photo-' + (i + 1) + '.png'));

if (!onlyCheck) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (let i = 0; i < PALETTES.length; i++) {
    writePng(files[i], drawPlaceholder(PALETTES[i], SIZE, SIZE), SIZE, SIZE);
  }
}

const problems = [];
for (const f of files) {
  if (!fs.existsSync(f)) { problems.push('缺文件：' + path.relative(ROOT, f)); continue; }
  const dim = readPngSize(f);
  if (!dim) { problems.push('不是合法 PNG：' + path.relative(ROOT, f)); continue; }
  if (dim.width !== SIZE || dim.height !== SIZE) {
    problems.push('尺寸不对：' + path.relative(ROOT, f) + '（期望 ' + SIZE + '×' + SIZE + '）');
  }
}

console.log('反馈占位图：' + files.length + ' 个');
if (problems.length) {
  problems.forEach(p => console.error('  · ' + p));
  process.exit(1);
}
console.log('自检通过：尺寸 / 通道 正常');
