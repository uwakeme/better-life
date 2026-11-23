/**
 * 样式令牌自检
 *
 * 职责：令牌是全站唯一的取值来源，漂了就全站跟着漂。检查五项：
 *   1. styles/tokens.wxss 与原型 design/assets/dir-c.css 的同名令牌必须逐一相等
 *   2. utils/view.js 的 COLOR_HEX 必须与 tokens.wxss 一致（内联兜底色不能与令牌脱节）
 *   3. 所有 wxss 里用到的 var(--x) 都必须在 tokens.wxss 里定义过
 *   4. 尺寸令牌必须 px / rpx 双份，且 rpx = px × 2（999px 的胶囊除外）
 *   5. 对比度全矩阵复算：正文级文字 ≥ 4.5:1，语义贴纸配白字 ≥ 5.3:1
 *
 * 用法：node scripts/verify-tokens.js
 */
const fs = require('fs');
const path = require('path');
const { group, check, report } = require('./_kit');

const ROOT = path.resolve(__dirname, '..');

/** 从样式文件里抽出所有 --name: value 声明 */
function parseVars (text) {
  const out = {};
  const re = /--([\w-]+)\s*:\s*([^;{}]+);/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = m[2].trim();
  return out;
}

function hexToRgb (hex) {
  const h = String(hex).trim().replace('#', '');
  if (h.length === 3) {
    return { r: parseInt(h.charAt(0) + h.charAt(0), 16), g: parseInt(h.charAt(1) + h.charAt(1), 16), b: parseInt(h.charAt(2) + h.charAt(2), 16) };
  }
  if (h.length < 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function luminance (rgb) {
  const ch = [rgb.r, rgb.g, rgb.b].map(function (v) {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio (a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function listWxss (dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) listWxss(full, out);
    else if (name.endsWith('.wxss')) out.push(full);
  }
  return out;
}

function main () {
  const tokenFile = path.join(ROOT, 'styles', 'tokens.wxss');
  const cssFile = path.join(ROOT, 'design', 'assets', 'dir-c.css');
  const tokenText = fs.readFileSync(tokenFile, 'utf8');
  const tokens = parseVars(tokenText);

  group('令牌表');
  check('tokens.wxss 存在', fs.existsSync(tokenFile));
  check('解析出令牌', Object.keys(tokens).length > 0, '解析到 ' + Object.keys(tokens).length + ' 个');

  /* --- 1. 与原型对照 --- */
  group('与原型一致');
  if (fs.existsSync(cssFile)) {
    const cssVars = parseVars(fs.readFileSync(cssFile, 'utf8'));
    const drift = [];
    for (const name of Object.keys(tokens)) {
      const v = tokens[name];
      /* 只比颜色与阴影这类语义值；尺寸类原型用自己的单位，不强求 */
      if (!/^#|^rgba/.test(v)) continue;
      if (cssVars[name] === undefined) { drift.push(name + '（原型没有）'); continue; }
      if (cssVars[name] !== v) drift.push(name + '：令牌 ' + v + ' ≠ 原型 ' + cssVars[name]);
    }
    check('颜色令牌与原型逐一相等', drift.length === 0, drift.join('；'));
  } else {
    check('原型样式文件存在', false, cssFile);
  }

  /* --- 2. COLOR_HEX 对齐 --- */
  group('内联兜底色');
  const viewText = fs.readFileSync(path.join(ROOT, 'utils', 'view.js'), 'utf8');
  const hexRe = /'([\w-]+)'\s*:\s*'(#[0-9a-fA-F]{3,8})'/g;
  const hexes = [];
  let hm;
  while ((hm = hexRe.exec(viewText))) hexes.push({ name: hm[1], hex: hm[2] });
  check('view.js 里有颜色映射', hexes.length > 0, '找到 ' + hexes.length + ' 个');
  const mismatch = hexes.filter((x) => tokens[x.name] !== x.hex);
  check('颜色映射与令牌一致', mismatch.length === 0,
    mismatch.map((x) => x.name + ' ' + x.hex + ' ≠ ' + tokens[x.name]).join('；'));

  /* --- 3. var() 都有定义 --- */
  group('var() 引用');
  const files = listWxss(path.join(ROOT, 'pages'), [])
    .concat(listWxss(path.join(ROOT, 'components'), []))
    .concat([tokenFile, path.join(ROOT, 'styles', 'components.wxss'), path.join(ROOT, 'app.wxss')]);
  const undefinedVars = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const re = /var\(--([\w-]+)/g;
    let m;
    while ((m = re.exec(text))) {
      if (tokens[m[1]] === undefined) {
        undefinedVars.push(path.relative(ROOT, file).replace(/\\/g, '/') + ' → --' + m[1]);
      }
    }
  }
  check('用到的令牌都有定义', undefinedVars.length === 0, undefinedVars.join(', '));

  /* --- 4. px / rpx 双份 --- */
  group('尺寸双份');
  const missingRpx = [];
  const badScale = [];
  for (const name of Object.keys(tokens)) {
    const v = tokens[name];
    const pm = v.match(/^(\d+(?:\.\d+)?)px$/);
    if (!pm) continue;
    if (name.slice(-4) === '-rpx') continue;
    const partner = tokens[name + '-rpx'];
    if (partner === undefined) { missingRpx.push(name); continue; }
    const rm = partner.match(/^(\d+(?:\.\d+)?)rpx$/);
    if (!rm) { badScale.push(name + ' 的双份不是 rpx：' + partner); continue; }
    const px = Number(pm[1]);
    const rpx = Number(rm[1]);
    if (px === 999) continue;   /* 胶囊是特殊值 */
    if (Math.abs(rpx - px * 2) > 0.01) badScale.push(name + ' ' + px + 'px 对应 ' + rpx + 'rpx，应为 ' + px * 2);
  }
  check('每个 px 令牌都有 rpx 双份', missingRpx.length === 0, missingRpx.join(', '));
  check('rpx 是 px 的两倍', badScale.length === 0, badScale.join('；'));

  /* --- 5. 对比度矩阵 --- */
  group('对比度矩阵');
  const TEXTS = ['ink', 'ink-2', 'ink-3', 'good-ink', 'bad-ink', 'neutral-ink', 'link-ink'];
  const BGS = ['s-lemon', 's-mint', 's-peach', 's-sky', 's-lilac', 's-cream', 's-wheat', 's-slate', 'paper', 'paper-2'];
  const STICKERS = ['good', 'bad', 'neutral'];
  const low = [];
  let min = { value: 99, pair: '' };
  for (const t of TEXTS) {
    for (const bg of BGS) {
      const c = hexToRgb(tokens[t]);
      const b = hexToRgb(tokens[bg]);
      if (!c || !b) { low.push(t + ' on ' + bg + '：颜色不是 hex'); continue; }
      const r = ratio(c, b);
      if (r < min.value) min = { value: r, pair: t + ' on ' + bg };
      if (r < 4.5) low.push(t + ' on ' + bg + ' = ' + r.toFixed(2) + ':1');
    }
  }
  check('正文级文字在任意便签底上 ≥ 4.5:1', low.length === 0, low.join('；'));
  check('对比度矩阵有结果', min.value < 99, '最低 ' + min.pair + ' ' + min.value.toFixed(2) + ':1');

  const stickerLow = [];
  let stickerMin = { value: 99, pair: '' };
  for (const s of STICKERS) {
    const b = hexToRgb(tokens[s]);
    if (!b) { stickerLow.push(s + ' 不是 hex'); continue; }
    const r = ratio({ r: 255, g: 255, b: 255 }, b);
    if (r < stickerMin.value) stickerMin = { value: r, pair: '白字 on ' + s };
    if (r < 5.3) stickerLow.push('白字 on ' + s + ' = ' + r.toFixed(2) + ':1');
  }
  check('语义贴纸配白字 ≥ 5.3:1', stickerLow.length === 0, stickerLow.join('；'));

  group('余量');
  console.log('    最低对比度：' + min.pair + ' ' + min.value.toFixed(2) + ':1（正文门槛 4.5）');
  console.log('    贴纸最低：' + stickerMin.pair + ' ' + stickerMin.value.toFixed(2) + ':1（门槛 5.3）');

  const failed = report('样式令牌自检');
  process.exit(failed ? 1 : 0);
}

main();