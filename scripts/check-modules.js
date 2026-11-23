/**
 * 模块加载冒烟 + 运行时铁律检查
 *
 * 职责：挡「删了函数体留着引用」这类事故，并把运行时铁律钉成断言。
 * 铁律三条（设计文档 §11）：
 *   1. 运行时代码不用 ?. 与 ??（小程序运行时对高版本语法支持不稳）
 *   2. wx.request 只能出现在 utils/cloud.js 一处
 *   3. require 目录必须写全到 /index，不能靠目录名碰运气
 *
 * 用法：node scripts/check-modules.js
 */
const fs = require('fs');
const path = require('path');
const { group, check, report } = require('./_kit');

const ROOT = path.resolve(__dirname, '..');

/** 小程序运行时的替身：只求模块能加载，不求行为正确 */
function wxStub () {
  const store = {};
  const target = {};
  return new Proxy(target, {
    get (t, prop) {
      if (prop === 'setStorageSync') return function (k, v) { store[k] = v; };
      if (prop === 'getStorageSync') return function (k) { return store[k] === undefined ? '' : store[k]; };
      if (prop === 'removeStorageSync') return function (k) { delete store[k]; };
      if (prop === 'getSystemInfoSync') {
        return function () {
          return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20, pixelRatio: 2,
            safeArea: { top: 20, bottom: 667, left: 0, right: 375 } };
        };
      }
      if (prop === 'getMenuButtonBoundingClientRect') {
        return function () { return { top: 26, bottom: 58, left: 300, right: 370, width: 70, height: 32 }; };
      }
      return function () { return undefined; };
    }
  });
}

function listJs (dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'node_modules') continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) listJs(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

function main () {
  global.wx = wxStub();
  global.Page = function (o) { global.__page = o; };
  global.Component = function (o) { global.__component = o; };
  global.App = function (o) { global.__app = o; };
  global.getApp = function () { return { globalData: {} }; };
  global.getCurrentPages = function () { return []; };

  const runtime = listJs(path.join(ROOT, 'utils'), [])
    .concat(listJs(path.join(ROOT, 'components'), []))
    .concat(listJs(path.join(ROOT, 'pages'), []))
    .concat([path.join(ROOT, 'app.js')]);

  group('运行时模块');
  for (const file of runtime) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    let ok = true;
    let err = '';
    try {
      delete require.cache[require.resolve(file)];
      const mod = require(file);
      /* 只有 utils 是有导出的模块；组件与页面是 Component()/Page() 声明式，
         没有 module.exports 是正常的 */
      if (rel.indexOf('utils/') === 0) {
        if (!mod || typeof mod !== 'object' || Object.keys(mod).length === 0) {
          ok = false;
          err = 'utils 模块应当导出对象';
        }
      }
    } catch (e) {
      ok = false;
      err = String(e && e.message ? e.message : e).slice(0, 120);
    }
    check(rel + ' 能加载', ok, err);
  }

  /* --- 铁律 --- */
  group('运行时铁律');
  const optionalChaining = [];
  const nullish = [];
  const requests = [];
  const badRequire = [];
  const unresolved = [];
  for (const file of runtime) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf8');
    /* 去掉注释再看，避免把说明文字里的符号当成代码 */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/\?\./.test(code)) optionalChaining.push(rel);
    if (/\?\?/.test(code)) nullish.push(rel);
    if (/wx\s*\.\s*request\s*\(/.test(code) && rel !== 'utils/cloud.js') requests.push(rel);
    const re = /require\((['"])([^'"]+)\1\)/g;
    let m;
    while ((m = re.exec(code))) {
      const spec = m[2];
      if (!spec.startsWith('.')) continue;
      const abs = path.resolve(path.dirname(file), spec);
      if (spec.endsWith('/config') || spec === '../config') badRequire.push(rel + ' → ' + spec);
      const okFile = fs.existsSync(abs) || fs.existsSync(abs + '.js') || fs.existsSync(path.join(abs, 'index.js'));
      if (!okFile) unresolved.push(rel + ' → ' + spec);
    }
  }
  check('没有用 ?. 可选链', optionalChaining.length === 0, optionalChaining.join(', '));
  check('没有用 ?? 空值合并', nullish.length === 0, nullish.join(', '));
  check('wx.request 只在 utils/cloud.js', requests.length === 0, requests.join(', '));
  check('require 目录写到 /index', badRequire.length === 0, badRequire.join(', '));
  check('require 的路径都存在', unresolved.length === 0, unresolved.join(', '));

  /* --- 服务端模块 --- */
  group('服务端模块');
  const serverFiles = listJs(path.join(ROOT, 'server', 'src'), [])
    .concat(listJs(path.join(ROOT, 'server', 'scripts'), []));
  for (const file of serverFiles) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    let ok = true;
    let err = '';
    try {
      delete require.cache[require.resolve(file)];
      require(file);
    } catch (e) {
      ok = false;
      err = String(e && e.message ? e.message : e).slice(0, 120);
    }
    check(rel + ' 能加载', ok, err);
  }

  const failed = report('模块加载冒烟');
  process.exit(failed ? 1 : 0);
}

main();