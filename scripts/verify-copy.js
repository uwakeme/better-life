/**
 * 界面文案口径自检
 *
 * 职责：把三条写进设计文档的口径钉成断言 ——
 *   1. 读者侧不出现角色术语（「管理员」「普通用户」「复核」）
 *   2. 界面说明性文案用书面语，不出现口语词
 *   3. 经验正文保持口语化 —— 所以不检查 data/ 与 utils/local.js 的内容
 *
 * 为什么第 1 条要按「守卫」判断而不是简单找词：
 *   读者侧页面里确实有「管理员」三个字，但它们都在 wx:if="{{isAdmin}}" 这类
 *   分支里 —— 只有本人就是管理员时才渲染。普通用户看不到，才算合规。
 *
 * 用法：node scripts/verify-copy.js
 */
const fs = require('fs');
const path = require('path');
const { group, check, report, tags, buildTree, attrValue } = require('./_kit');

const ROOT = path.resolve(__dirname, '..');

/** 读者侧页面（普通用户会看到的） */
const READER_PAGES = [
  'pages/home/home', 'pages/category/category', 'pages/detail/detail',
  'pages/source/source', 'pages/about/about', 'pages/search/search',
  'pages/mine/mine', 'pages/favorites/favorites', 'pages/feedback/feedback',
  'pages/inbox/inbox'
];

/** 读者侧不该出现的角色术语 */
const ROLE_WORDS = ['管理员', '普通用户', '复核'];

/** 只有这些角色才看得到的分支，角色词出现在里面是合规的 */
const GUARDS = ['isAdmin', 'allowed', 'devPanel', 'role'];

/** 界面说明性文案不该出现的口语词 */
const COLLOQUIAL = ['哪儿', '贴过去', '寄出反馈', '贴出去', '点一下看为什么', '看一眼就好'];

function read (p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

/**
 * 把注释涂成空白（保留换行，行号不变）
 * 为什么必须涂：设计说明写在文件头的注释里，大量提到「管理员」
 *   —— 那些是给开发者看的，不会渲染到界面上，不该算违规。
 */
function blankComments (text, isHtml) {
  const re = isHtml ? /<!--[\s\S]*?-->/g : /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g;
  return text.replace(re, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
}

function main () {
  group('读者侧页面清单');
  check('读者侧页面都存在', READER_PAGES.every(function (p) {
    return fs.existsSync(path.join(ROOT, p + '.wxml'));
  }), READER_PAGES.filter(function (p) { return !fs.existsSync(path.join(ROOT, p + '.wxml')); }).join(', '));

  /* --- 1. 角色术语 --- */
  for (const p of READER_PAGES) {
    const file = path.join(ROOT, p + '.wxml');
    const text = blankComments(read(file), true);
    if (!text) continue;
    const rel = p + '.wxml';
    group(rel + ' · 角色术语');
    const list = tags(text);
    buildTree(list, text);
    const bad = [];
    for (const word of ROLE_WORDS) {
      let at = text.indexOf(word);
      while (at >= 0) {
        /* 找出这段文字落在哪个元素里 —— 取包含它的最内层开标签 */
        let owner = null;
        for (const t of list) {
          if (t.closing) continue;
          if (t.start <= at && at < t.end) {
            if (!owner || t.start > owner.start) owner = t;
          }
        }
        let guarded = '';
        if (owner) {
          let cur = owner;
          while (cur) {
            const cond = attrValue(cur.attrs, 'wx:if');
            if (cond) {
              for (const g of GUARDS) {
                if (cond.indexOf(g) >= 0) { guarded = cond; break; }
              }
            }
            if (guarded) break;
            cur = cur.parent;
          }
        }
        if (!guarded) {
          const line = text.slice(0, at).split('\n').length;
          bad.push(word + '（第 ' + line + ' 行，没有角色守卫）');
        }
        at = text.indexOf(word, at + word.length);
      }
    }
    check('角色术语只在管理员/开发分支里出现', bad.length === 0, bad.join('；'));
  }

  /* --- 2. 角色术语在 JS 里也要有角色判断 --- */
  for (const p of READER_PAGES) {
    const file = path.join(ROOT, p + '.js');
    const text = blankComments(read(file), false);
    if (!text) continue;
    group(p + '.js · 角色术语');
    const bad = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const word of ROLE_WORDS) {
        if (lines[i].indexOf(word) < 0) continue;
        /* 往上找最近的方法定义，看这个方法里有没有角色判断 */
        let start = i;
        while (start >= 0 && !/^\s{2,6}[A-Za-z_$][\w$]*\s*:\s*function/.test(lines[start])) start--;
        let end = i;
        while (end < lines.length && !/^\s{2,6}[A-Za-z_$][\w$]*\s*:\s*function/.test(lines[end])) end++;
        const body = lines.slice(start, end).join('\n');
        if (body.indexOf('role.') < 0 && body.indexOf('isAdmin') < 0) {
          bad.push(word + '（第 ' + (i + 1) + ' 行所在方法没有角色判断）');
        }
      }
    }
    check('角色提示语所在方法都有角色判断', bad.length === 0, bad.join('；'));
  }

  /* --- 3. 界面文案不用口语词 --- */
  group('界面文案口吻');
  const files = [];
  for (const p of READER_PAGES) {
    files.push(path.join(ROOT, p + '.wxml'));
    files.push(path.join(ROOT, p + '.js'));
  }
  for (const c of fs.readdirSync(path.join(ROOT, 'components'))) {
    const dir = path.join(ROOT, 'components', c);
    if (!fs.statSync(dir).isDirectory()) continue;
    files.push(path.join(dir, c + '.wxml'));
  }
  const colloquialHits = [];
  for (const file of files) {
    const text = read(file);
    if (!text) continue;
    for (const word of COLLOQUIAL) {
      const at = text.indexOf(word);
      if (at < 0) continue;
      const line = text.slice(0, at).split('\n').length;
      colloquialHits.push(path.relative(ROOT, file).replace(/\\/g, '/') + ' 第 ' + line + ' 行：' + word);
    }
  }
  check('界面文案没有口语词', colloquialHits.length === 0, colloquialHits.join('；'));

  /* --- 4. 内容正文保持口语化（不能被上一条误伤） --- */
  group('内容正文');
  const data = JSON.parse(read(path.join(ROOT, 'data', 'experiences.json')));
  const arr = Array.isArray(data) ? data : (data.experiences || []);
  const bodies = arr.map((e) => String(e.body || '')).join('');
  check('经验正文里保留了口语表达', /一下|怎么|能不能|别/.test(bodies), '正文没有口语痕迹');
  check('内容文件不在界面文案检查范围内', bodies.length > 0);

  group('隐私说明');
  const privacy = read(path.join(ROOT, 'pages/about/about.wxml'));
  check('不再声称收藏与搜索记录只存本机', privacy.indexOf('收藏与搜索记录只保存在这台设备上') < 0);
  check('明确数据同步到服务端', privacy.indexOf('服务端') >= 0);
  check('明确搜索历史仅存本机', /搜索历史[^。<]*(本机|这台设备)/.test(privacy));

  const failed = report('界面文案口径');
  process.exit(failed ? 1 : 0);
}

main();