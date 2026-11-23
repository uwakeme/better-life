/**
 * WXML 静态检查
 *
 * 职责：在跑预览之前就把「写错了但运行时才炸」的问题挑出来。
 * 检查四类：
 *   1. 标签不闭合 / 用了 WXML 没有的 HTML 标签（span、div…）/ 用了不存在的组件
 *   2. 事件绑定指向的方法在同目录的 .js 里不存在（点了没反应）
 *   3. 嵌套 wx:for 内外都靠默认名（item / index）→ 内层把外层的遮蔽了
 *   4. 引用的图片资源在 assets 下不存在
 *
 * 用法：node scripts/lint-wxml.js
 */
const fs = require('fs');
const path = require('path');
const { group, check, report, tags, buildTree, attrValue } = require('./_kit');

const ROOT = path.resolve(__dirname, '..');

/** WXML 内置标签 */
const ALLOWED = [
  'view', 'text', 'image', 'button', 'input', 'textarea', 'label', 'form',
  'scroll-view', 'swiper', 'swiper-item', 'navigator', 'rich-text', 'template',
  'block', 'slot', 'cover-view', 'cover-image', 'icon', 'progress', 'checkbox',
  'checkbox-group', 'radio', 'radio-group', 'picker', 'picker-view', 'picker-view-column',
  'slider', 'switch', 'movable-area', 'movable-view', 'video', 'camera', 'map', 'canvas',
  'web-view', 'ad', 'official-account', 'open-data', 'import', 'include', 'wxs'
];

/** 常见误用：HTML 标签在 WXML 里不生效 */
const HTML_ONLY = [
  'span', 'div', 'p', 'section', 'header', 'footer', 'main', 'aside', 'nav',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'a', 'strong', 'em', 'b', 'i', 'img', 'pre', 'code'
];

/** 本项目自己的组件 */
function ownComponents () {
  const dir = path.join(ROOT, 'components');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (n) {
    return fs.statSync(path.join(dir, n)).isDirectory();
  });
}

function walk (dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(full, out);
    } else if (name.endsWith('.wxml')) {
      out.push(full);
    }
  }
  return out;
}


/** 子树文本里是否用到了某个裸变量（{{ index }} / {{item.x}}） */
function usesVar (body, name) {
  const re = new RegExp('\\{\\{[^}]*?(?<![\\w.])' + name + '(?![\\w])[^}]*?\\}\\}', 'g');
  return re.test(body);
}

function main () {
  const files = walk(path.join(ROOT, 'pages'), []).concat(walk(path.join(ROOT, 'components'), []));
  const own = ownComponents();
  const known = ALLOWED.concat(own);

  group('文件');
  check('找到 WXML 文件', files.length > 0, '找到 ' + files.length + ' 个');

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    const list = tags(text);

    /* --- 标签 --- */
    group(rel + ' · 标签');
    const problem = buildTree(list, text);
    check('标签闭合', !problem, problem);

    const bad = list.filter((t) => HTML_ONLY.indexOf(t.name) >= 0);
    check('没有用 HTML 标签', bad.length === 0, bad.map((b) => b.name).join(', '));
    const unknown = list.filter((t) => known.indexOf(t.name) < 0 && HTML_ONLY.indexOf(t.name) < 0 && !/^[A-Z]/.test(t.name));
    check('标签都在白名单里', unknown.length === 0, unknown.map((u) => u.name).join(', '));

    /* --- 事件 --- */
    group(rel + ' · 事件');
    const jsFile = file.replace(/\.wxml$/, '.js');
    const js = fs.existsSync(jsFile) ? fs.readFileSync(jsFile, 'utf8') : '';
    const handlers = [];
    const re = /(?:bind|catch):?[a-zA-Z]+\s*=\s*["']([A-Za-z_$][\w$]*)["']/g;
    let hm;
    while ((hm = re.exec(text))) {
      if (handlers.indexOf(hm[1]) < 0) handlers.push(hm[1]);
    }
    const missing = handlers.filter((h) => !new RegExp('(^|[^\\w])' + h.replace(/\$/g, '\\$') + '\\s*[:(]').test(js));
    check('事件方法都存在', missing.length === 0, missing.join(', '));

    /* --- 列表 --- */
    group(rel + ' · 列表');
    const nestedProblems = [];
    for (const node of list) {
      if (node.closing || !/wx:for\s*=/.test(node.attrs)) continue;
      /* 找最近的、也在 wx:for 的祖先 */
      let outer = node.parent;
      while (outer && !/wx:for\s*=/.test(outer.attrs)) outer = outer.parent;
      if (!outer) continue;
      const innerItem = attrValue(node.attrs, 'wx:for-item');
      const innerIndex = attrValue(node.attrs, 'wx:for-index');
      const outerItem = attrValue(outer.attrs, 'wx:for-item') || 'item';
      const outerIndex = attrValue(outer.attrs, 'wx:for-index') || 'index';
      const body = text.slice(node.start, node.end);
      /* 内层没声明 wx:for-item 时 item 才被遮蔽 */
      if (!innerItem && outerItem === 'item' && usesVar(body, 'item')) {
        nestedProblems.push('内层 wx:for 把外层的 item 遮蔽了，内层要写 wx:for-item');
      }
      if (!innerIndex && outerIndex === 'index' && usesVar(body, 'index')) {
        nestedProblems.push('内层 wx:for 把外层的 index 遮蔽了，内层要写 wx:for-index');
      }
    }
    check('嵌套列表没有遮蔽外层变量', nestedProblems.length === 0, nestedProblems.join('；'));

    /* --- 资源 --- */
    group(rel + ' · 资源');
    const srcs = [];
    const re2 = /(?:src|url)\s*=\s*["']([^"']+\.(?:png|jpg|jpeg|gif|svg|webp))["']/g;
    let sm;
    while ((sm = re2.exec(text))) {
      if (srcs.indexOf(sm[1]) < 0) srcs.push(sm[1]);
    }
    const missingAssets = srcs.filter(function (s) {
      if (/^https?:\/\//.test(s)) return false;
      if (s.indexOf('{{') >= 0) return false;  /* 动态路径无法静态核对 */
      const abs = s.charAt(0) === '/' ? path.join(ROOT, s) : path.resolve(path.dirname(file), s);
      return !fs.existsSync(abs);
    });
    check('引用的资源都存在', missingAssets.length === 0, missingAssets.join(', '));
  }

  const failed = report('WXML 静态检查');
  process.exit(failed ? 1 : 0);
}

main();