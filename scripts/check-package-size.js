/**
 * 上传包体积自检
 *
 * 职责：小程序主包上限 2MB，超了公众平台直接拒收。
 *   谁能进包只有 project.config.json 的 packOptions.ignore 说了算 ——
 *   新加一个顶层目录（比如 ci/）而忘了加进 ignore，
 *   就会把几十 MB 的 node_modules 一起传上去，必然被拒。
 *
 * 查两件事：
 *   1. 顶层目录有没有漏在 packOptions.ignore 之外（新目录忘了登记）
 *   2. 照 ignore 规则挑出来的文件加起来有没有超 2MB
 *
 * ⚠️ 这里的口径比微信开发者工具略松（node_modules / .git / miniprogram_npm
 *    一律不算），所以算出来的数只会偏小 —— 偏小意味着不会误报。
 *
 * 用法：node scripts/check-package-size.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIMIT = 2 * 1024 * 1024;          /* 微信主包上限 2MB */

/** 任何情况下都不进包的东西（开发者工具也不打包它们） */
const ALWAYS_SKIP = ['node_modules', '.git', 'miniprogram_npm'];

/** 顶层目录里这些是要打进包的；其余的必须在 packOptions.ignore 里声明 */
const PACKAGED_TOP_DIRS = [
  'assets', 'components', 'config', 'data', 'pages', 'styles', 'utils'
];

function readJson (p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function topDirs (dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) out.push(name);
  }
  return out;
}

function collect (dir, rel, skipDirs, skipFiles, out) {
  for (const name of fs.readdirSync(dir)) {
    if (ALWAYS_SKIP.indexOf(name) >= 0) continue;
    const abs = path.join(dir, name);
    const relPath = rel ? rel + '/' + name : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      if (skipDirs.indexOf(relPath) >= 0) continue;
      collect(abs, relPath, skipDirs, skipFiles, out);
    } else {
      if (skipFiles.indexOf(relPath) >= 0) continue;
      out.push({ rel: relPath, size: st.size });
    }
  }
}

function main () {
  const cfg = readJson(path.join(ROOT, 'project.config.json'));
  if (!cfg) {
    console.error('✗ 读不到 project.config.json');
    process.exit(1);
  }
  const ignore = (cfg.packOptions && cfg.packOptions.ignore) || [];
  const skipDirs = ignore.filter(function (i) { return i.type === 'folder'; }).map(function (i) { return i.value; });
  const skipFiles = ignore.filter(function (i) { return i.type === 'file'; }).map(function (i) { return i.value; });

  /* --- 1. 顶层目录有没有漏登记 --- */
  const undeclared = topDirs(ROOT).filter(function (d) {
    if (ALWAYS_SKIP.indexOf(d) >= 0) return false;
    if (PACKAGED_TOP_DIRS.indexOf(d) >= 0) return false;
    return skipDirs.indexOf(d) < 0;
  });

  /* --- 2. 体积 --- */
  const files = [];
  collect(ROOT, '', skipDirs, skipFiles, files);
  const total = files.reduce(function (s, f) { return s + f.size; }, 0);

  console.log('打进包的文件：' + files.length + ' 个');
  console.log('合计：' + total + ' 字节（' + (total / 1024 / 1024).toFixed(3) + ' MB）');
  console.log('上限：' + LIMIT + ' 字节（2 MB）');
  console.log('余量：' + (LIMIT - total) + ' 字节');

  if (undeclared.length) {
    console.error('');
    console.error('✗ 顶层目录没在 project.config.json 的 packOptions.ignore 里声明：' + undeclared.join('、'));
    console.error('  这几个目录会被一起打进上传包。要么加进 ignore（不进包），要么确认它本来就该进包。');
    console.error('  已知要进包的顶层目录：' + PACKAGED_TOP_DIRS.join('、'));
    process.exit(1);
  }

  if (total > LIMIT) {
    console.error('');
    console.error('✗ 上传包超过 2MB，公众平台会拒收。最大的几个文件：');
    files.sort(function (a, b) { return b.size - a.size; }).slice(0, 10).forEach(function (f) {
      console.error('  ' + f.size + '  ' + f.rel);
    });
    process.exit(1);
  }

  console.log('✓ 通过');
}

main();
