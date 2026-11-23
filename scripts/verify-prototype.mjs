/* ==========================================================================
   better-life 原型自检脚本（scripts/verify-prototype.mjs）

   口径：断言要写「状态级」，不能只写「DOM 存在级」。
   「按钮在」证明不了「按下去对不对」——
   所以涉及状态机的行为，直接调数据层函数，再断言另一个对象没被连带影响。

   用法：
     node scripts/verify-prototype.mjs          # 跑全量自检
     node scripts/verify-prototype.mjs --dump search:user:default   # 看某页渲染结果
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = (...s) => path.join(ROOT, ...s);

/* ---------- 断言框架 ---------- */
let passed = 0;
const failures = [];

function ok (name, cond, detail) {
  if (cond) { passed++; return true; }
  failures.push(detail ? name + '  →  ' + detail : name);
  return false;
}
function eq (name, actual, expected) {
  return ok(name, actual === expected,
    '得到 ' + JSON.stringify(actual) + '，期望 ' + JSON.stringify(expected));
}
function has (name, hay, needle) {
  return ok(name, typeof hay === 'string' && hay.indexOf(needle) >= 0, '未找到「' + needle + '」');
}
function hasNot (name, hay, needle) {
  return ok(name, typeof hay === 'string' && hay.indexOf(needle) < 0, '不该出现「' + needle + '」');
}
function section (title) {
  console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(2, 44 - title.length)));
}

/* ---------- 载入原型（页面渲染函数是纯字符串，不依赖 DOM） ---------- */
const sandbox = { console, setTimeout: () => 0, clearTimeout: () => {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['design/assets/data.js', 'design/assets/js/c-1.js', 'design/assets/js/c-2.js', 'design/assets/js/c-3.js']
  .forEach((f) => {
    vm.runInContext(fs.readFileSync(abs(...f.split('/')), 'utf8'), sandbox, { filename: f });
  });

const LB = sandbox.LB;
const LBC = sandbox.LBC;
const pages = sandbox.LB_DIRS.c.pages;

/* ---------- 页面清单（与 design/assets/shell.js 的 PAGES 保持一致） ---------- */
const PAGES = [
  ['home', {}], ['category', { id: 1 }], ['search', {}], ['detail', { id: 1 }],
  ['source', { id: 1 }], ['mine', {}], ['favorites', {}], ['feedback', { id: 1 }],
  ['inbox', {}], ['admin-list', {}], ['admin-edit', { id: 1 }],
  ['admin-tags', {}], ['admin-feedback', {}], ['about', {}]
];
const ROLES = ['admin', 'user'];
const SCENES = ['default', 'vector', 'keyword', 'demo', 'empty', 'disputed',
  'loading', 'timeout', 'anon', 'offline'];

function render (page, params, role, scenario) {
  const fn = pages[page];
  if (!fn) return '';
  return fn({
    page, params: params || {}, scenario: scenario || 'default', role: role || 'user',
    F: LB, go: () => {}, back: () => {}, reset: () => {}
  });
}

/* ---------- dump 模式：调断言时先看真实渲染结果 ---------- */
if (process.argv.includes('--dump')) {
  const at = process.argv.indexOf('--dump');
  const arg = process.argv[at + 1] || 'search:user:default';
  const [pg, role, scene] = arg.split(':');
  const def = PAGES.filter((x) => x[0] === pg)[0] || PAGES[2];
  const html = render(def[0], def[1], role || 'user', scene || 'default');
  if (process.argv.includes('--text')) {
    console.log(html.replace(/<[^>]+>/g, '\n').split('\n').map((x) => x.trim())
      .filter(Boolean).join(' | '));
  } else {
    console.log(html);
  }
  process.exit(0);
}

/* ================================================================
   1. 渲染冒烟：每个「页 × 身份 × 场景」组合都要渲染得出来
   ================================================================ */
section('渲染冒烟');
let combos = 0;
const renderBad = [];
PAGES.forEach(function (pair) {
  ROLES.forEach(function (role) {
    SCENES.forEach(function (scene) {
      combos++;
      const html = render(pair[0], pair[1], role, scene);
      const bad = [];
      if (html.indexOf('undefined') >= 0) bad.push('undefined');
      if (html.indexOf('NaN') >= 0) bad.push('NaN');
      if (html.indexOf('[object Object]') >= 0) bad.push('[object Object]');
      if (bad.length) renderBad.push(pair[0] + '/' + role + '/' + scene + '：' + bad.join('、'));
    });
  });
});
ok('全部 ' + combos + ' 种「页 × 身份 × 场景」渲染无 undefined / NaN / [object Object]',
  renderBad.length === 0, renderBad.slice(0, 8).join('; '));

section('页面齐备');
PAGES.forEach(function (pair) {
  ok('页面「' + pair[0] + '」有渲染实现', typeof pages[pair[0]] === 'function');
});
eq('页面总数', Object.keys(pages).length, 14);

section('搜索五态');
const sDefault = render('search', {}, 'user', 'default');
hasNot('默认态：没有历史时，不渲染「最近搜过」这一块', sDefault, '最近搜过');
hasNot('默认态：没有历史时，不写「还没有搜索记录」这类提示语', sDefault, '还没有搜索记录');
hasNot('默认态：没有「大家常搜」热词（不统计别人的搜索）', sDefault, '大家常搜');
hasNot('默认态：不出现任何热词入口', sDefault, 'search-hot');
has('默认态：有联想面板', sDefault, '猜你想搜');
has('默认态：联想词标明来源是本机历史与已收录内容', sDefault, '取自本机历史与已收录内容');
has('默认态：有「最近更新」', sDefault, '最近更新');
hasNot('默认态：还没提交查询，不出现结果计数', sDefault, '找到 ');

const keepQ = LBC.q, keepS = LBC.searched;
LBC.q = '洗发水'; LBC.searched = true;
const sResult = render('search', {}, 'user', 'default');
has('结果态：出现命中计数', sResult, '找到 ');
has('结果态：出现命中词', sResult, '洗发水');
LBC.q = '这个词库里肯定没有zzz';
const sNone = render('search', {}, 'user', 'default');
has('无结果态：出现「没找到」', sNone, '没找到');
has('无结果态：给出清空筛选的出口', sNone, '清空筛选');
LBC.q = keepQ; LBC.searched = keepS;

const sTimeout = render('search', {}, 'user', 'timeout');
has('超时态：明确说超时', sTimeout, '检索超时');
has('超时态：给重试出口', sTimeout, '重新检索');
const sLoading = render('search', {}, 'user', 'loading');
has('加载中：骨架屏占位', sLoading, 'c-skel');

/* 可见文本：把标签连同属性一起去掉。
   「复制链接」按钮的 data-url 里本来就该带完整外链，
   不可见的外链不是问题，可见的外链才是。 */
function visibleText (html) {
  return html.replace(/<[^>]+>/g, ' ');
}

section('搜索历史：只存本机，不上传');

/* 历史落在本机存储：写进去、读回来，键名与小程序端一致 */
const histSnap = LBC.hist.slice();
LBC.clearHist();
eq('清空后历史为空', LBC.hist.length, 0);
LBC.pushHist('洗发水 成分');
LBC.pushHist('快递 赔付');
eq('记两条历史', LBC.hist.length, 2);
eq('最近一条排在最前', LBC.hist[0], '快递 赔付');
LBC.pushHist('洗发水 成分');
eq('重复搜索不产生重复项', LBC.hist.length, 2);
eq('重复搜索把它挪到最前', LBC.hist[0], '洗发水 成分');
for (let i = 0; i < 12; i++) LBC.pushHist('词' + i);
ok('历史上限 8 条', LBC.hist.length <= 8, '实际 ' + LBC.hist.length);
eq('空查询不记入历史', (LBC.pushHist(''), LBC.hist.some(function (h) { return h === ''; })), false);
/* 存储键名与实际写入（沙箱里没有 localStorage 时退化成内存，不报错） */
eq('历史存储键名固定', LBC.HIST_KEY, 'betterlife_search_hist');
LBC.clearHist();
LBC.hist = histSnap;

/* 联想词只从本机历史 + 已收录内容里取，不依赖任何「别人搜过什么」 */
const histKeep = LBC.hist.slice();
LBC.hist = ['本机历史专用词'];
const sHist = render('search', {}, 'user', 'default');
has('有历史时渲染「最近搜过」', visibleText(sHist), '最近搜过');
has('有历史时说明只存在本机', visibleText(sHist), '只存在本机');
has('有历史时提供清空入口', sHist, 'hist-clear');
LBC.input = '';
const sSuggest = render('search', {}, 'user', 'default');
has('联想面板取自本机历史', sSuggest.slice(sSuggest.indexOf('data-suggest')), '本机历史专用词');
LBC.input = '洗发';
const sSuggest2 = render('search', {}, 'user', 'default');
has('联想面板按输入从已收录内容里匹配', sSuggest2.slice(sSuggest2.indexOf('data-suggest')), '怎么挑洗发水不踩雷');
hasNot('联想面板不出现「热门」「大家都在搜」这类说法', sSuggest2.slice(sSuggest2.indexOf('data-suggest')), '热门');
LBC.input = '';
LBC.hist = histKeep;

section('溯源结构');
const dUser = render('detail', { id: 1 }, 'user', 'default');
has('详情页：要点上写依据摘要', dUser, '依据 2 条 · 丁香医生、B站');
has('详情页：依据默认折叠，有展开入口', dUser, '展开看来源');
has('详情页：依据卡写明「为什么信它」', dUser, '为什么信它');
has('详情页：给出去向映射页的入口', dUser, '查看要点与依据的对应关系');
hasNot('详情页：不插「星标是收藏」这类首次引导浮层', visibleText(dUser), '顶栏的星标是收藏');
hasNot('详情页：不再整段另起「依据来源」区', dUser, '依据来源');
hasNot('详情页：可见文本里不出现完整外链', visibleText(dUser), 'http');

const sUser = render('source', { id: 1 }, 'user', 'default');
has('来源页：按「依据 i/N」映射', sUser, '依据 1/3');
has('来源页：写明依据总数', sUser, '3 条依据');
has('来源页：写明一条依据同时支撑哪些要点', sUser, '同时支撑：');
hasNot('来源页：依据全文不在这里重复', sUser, '为什么信它');
hasNot('来源页：可见文本里不出现完整外链', visibleText(sUser), 'http');
has('来源页：只显域名', sUser, 'dxy.com');

section('立场贴纸：颜色 + 符号 + 文字三个通道');
has('推荐贴纸带符号', LBC.sticker('good'), '✓');
has('推荐贴纸带文字', LBC.sticker('good'), '推荐');
has('避雷贴纸带符号', LBC.sticker('bad'), '✕');
has('中立贴纸用破折号', LBC.sticker('neutral'), '—');
has('中立贴纸带文字', LBC.sticker('neutral'), '中立');
hasNot('中立贴纸不用问号', LBC.sticker('neutral'), '?');
hasNot('避雷贴纸不用问号', LBC.sticker('bad'), '?');
let allStickers = '';
LB.experiences.forEach(function (e) {
  e.points.forEach(function (p) { allStickers += LBC.sticker(p.s); });
});
hasNot('全库贴纸里没有问号', allStickers, '?');

section('数据层：状态级断言');

/* 投票必须按经验隔离：在 A 上投票，不能让 B 显示「已投」 */
const expA = LB.expById(1), expB = LB.expById(2);
const aUseful = expA.useful, bUseful = expB.useful, aNot = expA.notUseful;
LBC.vote(expA, 'up');
ok('在 A 上投票后 A 计 +1', expA.useful === aUseful + 1);
ok('在 A 上投票不影响 B 的计数', expB.useful === bUseful);
ok('在 A 上投票不改变 B 的投票状态', LBC.votedUseful(expB, 'user') === false);
ok('在 A 上投票后 A 标记为已投', LBC.votedUseful(expA, 'user') === true);
LBC.vote(expA, 'down');
ok('改投时先撤掉旧票', expA.useful === aUseful);
ok('改投后记为「没用」', LBC.votedNotUseful(expA, 'user') === true);
ok('改投后「有用」标记清掉', LBC.votedUseful(expA, 'user') === false);
LBC.vote(expA, 'down');
ok('再点一次取消投票', expA.notUseful === aNot);
ok('管理员身份不算「已投」', LBC.votedUseful(expA, 'admin') === false);

/* 反馈处理：只有「只回话」必须写回复，护栏落在数据层 */
const fb = LB.feedbacks[0];
const fbStatus = fb.status;
LBC.openFb(fb.id); LBC.pickFb('replied');
ok('只回话但不写内容 → 数据层拒绝', LBC.submitFb(fb.id, '') === false);
ok('拒绝后反馈状态不变', fb.status === fbStatus);
LBC.pickFb('accepted');
ok('采纳不强制写理由', LBC.submitFb(fb.id, '') === true);
ok('采纳后状态落库', fb.status === 'accepted');
fb.status = fbStatus;

/* 发布前校验：三类拦截都必须在数据层 */
ok('空标题被拦', LBC.publishCheck({ title: '', summary: 's', points: [{}], sources: [{}] }).indexOf('标题') >= 0);
ok('空结论被拦', LBC.publishCheck({ title: 't', summary: '', points: [{}], sources: [{}] }).indexOf('结论') >= 0);
ok('没有要点被拦', LBC.publishCheck({ title: 't', summary: 's', points: [], sources: [{}] }).indexOf('要点') >= 0);
ok('没有依据被拦', LBC.publishCheck({ title: 't', summary: 's', points: [{}], sources: [] }).indexOf('依据') >= 0);
ok('依据没挂要点被拦', LBC.publishCheck({ title: 't', summary: 's', points: [{}], sources: [{ pointIds: [] }] }).indexOf('依据') >= 0);
eq('内容齐全时放行', LBC.publishCheck({ title: 't', summary: 's', points: [{}], sources: [{ pointIds: [1] }] }), '');

/* 改动数据后要能还原，别让后面的断言拿到脏数据 */
function withExp (expId, fn) {
  const e = LB.expById(expId);
  const snap = JSON.parse(JSON.stringify(e));
  try { return fn(e); } finally {
    e.points = snap.points; e.sources = snap.sources; e.tags = snap.tags;
    e.title = snap.title; e.summary = snap.summary; e.body = snap.body;
    e.status = snap.status; e.updatedAt = snap.updatedAt;
  }
}

/* 删要点必须连带清掉依据上的引用，不留悬空 id */
withExp(1, function (e) {
  const pt = e.points[0];
  const ref = e.sources.filter(function (s) { return s.pointIds.indexOf(pt.id) >= 0; })[0];
  ok('前提：被删要点确实被依据引用', !!ref);
  const nPoints = e.points.length;
  LBC.removePoint(e.id, pt.id);
  ok('删要点后要点数 -1', e.points.length === nPoints - 1);
  ok('删要点后依据上的引用被清掉', ref.pointIds.indexOf(pt.id) < 0);
});

/* 统计必须实时派生，不能是启动时的快照 */
const draftExp = LB.drafts()[0];
ok('前提：有一条草稿可发布', !!draftExp);
const pubBefore = LB.stats().published;
withExp(draftExp.id, function (e) {
  e.status = 'published';
  eq('发布后统计实时变化', LB.stats().published, pubBefore + 1);
});

/* 同名标签要能跨领域存在，定位时按 (cat, name) 走 */
const t1 = LB.tagsOf(1).filter(function (t) { return t.name === '清洁'; })[0];
const t3 = LB.tagsOf(3).filter(function (t) { return t.name === '清洁'; })[0];
ok('领域 1 有「清洁」标签', !!t1);
ok('领域 3 也有「清洁」标签', !!t3);
ok('同名标签在不同领域是两条记录', !!(t1 && t3 && t1.id !== t3.id));

/* 收藏按身份隔离 */
const adminFavIds = LBC.favList('admin').map(function (e) { return e.id; });
const target = LB.published().filter(function (e) { return adminFavIds.indexOf(e.id) < 0; })[0];
LBC.setFav(target.id, true, 'user');
ok('普通用户的收藏里出现了这条', LBC.favList('user').some(function (e) { return e.id === target.id; }));
ok('管理员的收藏里没有同一条', !LBC.favList('admin').some(function (e) { return e.id === target.id; }));

/* 全文检索 + 搜索关键词（替代原来那张全局别名表） */
ok('数据层不再有全局别名表', LB.synonyms === undefined);
ok('每条经验都有 keywords 字段', LB.experiences.every(function (e) { return Array.isArray(e.keywords); }));
ok('关键词最多 3 个', LB.experiences.every(function (e) { return e.keywords.length <= 3; }));
const hitByKw = LBC.searchAll('洗头水');
ok('关键词生效：「洗头水」能搜到洗发水那条', hitByKw.some(function (h) { return h.expId === 1; }));
ok('命中原因如实写成「命中关键词」', hitByKw.some(function (h) { return h.hit.indexOf('命中关键词') === 0; }));
ok('关键词不出现在读者侧页面上',
  visibleText(render('detail', { id: 1 }, 'user', 'default')).indexOf('洗头水') < 0);
ok('搜索命中「洗发水」', LBC.searchAll('洗发水').length > 0);
ok('搜索命中的是 exp 1', LBC.searchAll('洗发水').some(function (h) { return h.expId === 1; }));
eq('陌生词搜不到', LBC.searchAll('zzzz不存在的词').length, 0);
eq('空查询返回空数组', LBC.searchAll('').length, 0);

section('同色：一条经验在任何页面都是同一个颜色');
function cardColors (html) {
  const map = {};
  const re = /class="c-card c-note (s-[a-z]+)"[^>]*data-id="(\d+)"/g;
  let m;
  while ((m = re.exec(html))) map[m[2]] = m[1];
  return map;
}
const cHome = cardColors(render('home', {}, 'user', 'default'));
const cSearch = cardColors(render('search', {}, 'user', 'default'));
const cFav = cardColors(render('favorites', {}, 'user', 'default'));
function sameColor (a, b) {
  const ids = Object.keys(a).filter(function (id) { return b[id]; });
  return ids.length > 0 && ids.every(function (id) { return a[id] === b[id]; });
}
ok('同一条经验跨页面同色（首页 × 搜索）', sameColor(cHome, cSearch));
ok('同一条经验跨页面同色（首页 × 收藏夹）', sameColor(cHome, cFav));

section('口径守护（写进文档的口径必须有断言守着）');
const READER = ['home', 'category', 'search', 'detail', 'source', 'favorites', 'feedback', 'inbox', 'about'];
const readerHtml = {};
READER.forEach(function (page) {
  const def = PAGES.filter(function (x) { return x[0] === page; })[0];
  readerHtml[page] = render(page, def[1], 'user', 'default');
  hasNot('读者侧「' + page + '」页不出现「管理员」', readerHtml[page], '管理员');
  hasNot('读者侧「' + page + '」页不出现「复核」', readerHtml[page], '复核');
});
const COLLOQUIAL = ['点一下看为什么', '寄出反馈', '贴出去', '该知道的事', '不会拿去做别的'];
COLLOQUIAL.forEach(function (w) {
  const hit = READER.filter(function (page) { return readerHtml[page].indexOf(w) >= 0; });
  ok('读者侧界面文案不出现口语词「' + w + '」', hit.length === 0, '出现在：' + hit.join('、'));
});

section('读者侧通知位');
const myFb = LB.myFeedbacks('user')[0];
ok('前提：演示数据里有普通用户提交的反馈', !!myFb);
if (myFb) {
  const st = myFb.status, sn = myFb.seen;
  myFb.status = 'replied'; myFb.seen = false;
  has('「我的反馈」出现「反馈已处理」通知位',
    render('inbox', {}, 'user', 'default'), '反馈已处理');
  myFb.status = st; myFb.seen = sn;
}

section('收藏夹：筛选与搜索');

const favAll = LBC.favList('user');
ok('前提：普通用户有若干收藏', favAll.length >= 3, '实际 ' + favAll.length);
const favCats = [];
favAll.forEach(function (e) { if (favCats.indexOf(e.cat) < 0) favCats.push(e.cat); });
ok('前提：收藏跨多个领域，筛选才有意义', favCats.length >= 2, '实际 ' + favCats.length);

const favBase = render('favorites', {}, 'user', 'default');
has('收藏夹有搜索框', favBase, 'data-fav-q');
has('收藏夹有领域筛选', favBase, 'data-act="fav-cat"');
has('收藏夹的领域只列收藏里有的', favBase, 'data-act="fav-cat" data-cat="' + favCats[0] + '"');
hasNot('收藏夹不列没有收藏的领域', favBase,
  'data-act="fav-cat" data-cat="' + [1,2,3,4,5,6,7,8,9].filter(function (c) {
    return favCats.indexOf(c) < 0;
  })[0] + '"');

/* 按领域收窄：结果必须都属于该领域，且比全量少 */
LBC.favCat = favCats[0];
const favCatPage = render('favorites', {}, 'user', 'default');
const catIds = cardColors(favCatPage);
ok('按领域筛选后只剩该领域的卡',
  Object.keys(catIds).length > 0 && Object.keys(catIds).every(function (id) {
    var e = LB.expById(Number(id));
    return e && e.cat === favCats[0];
  }));
ok('按领域筛选后条数变少', Object.keys(catIds).length <= favAll.length);
has('筛选时写「找到 N 张」并说明总收藏数', visibleText(favCatPage), '共收藏 ' + favAll.length);

/* 搜索：命中标题里的词，并把命中词高亮 */
LBC.favCat = 0;
/* 命中词会被 <mark> 包起来，所以不能用整条标题做断言 —— 标题在 HTML 里已被高亮标签切开。
   改成按卡片 data-id 断言：只剩这一条，且命中词被高亮。 */
/* 用「洗发水」这种只可能命中一条的词，避免「怎么」这类高频词把断言变成没意义的全量。
   命中词会被 <mark> 包起来，所以按卡片 data-id 断言，不用整条标题。 */
LBC.favQ = '洗发水';
const favSearch = render('favorites', {}, 'user', 'default');
has('收藏夹搜索命中这条', favSearch, 'data-id="1"');
has('收藏夹搜索把命中词高亮', favSearch, '<mark>洗发水');
const favSearchIds = Object.keys(cardColors(favSearch));
eq('收藏夹搜索只留命中项', favSearchIds.length, 1);

/* 搜索关键词也参与收藏夹搜索：否则同一个词在全局搜得到、在收藏里搜不到。
   演示数据里带关键词的 exp1 默认不在收藏里，先临时收藏它。 */
LBC.setFav(1, true, 'user');
LBC.favQ = '洗头水';
const favKw = render('favorites', {}, 'user', 'default');
has('收藏夹搜索能用关键词命中', favKw, '怎么挑洗发水不踩雷');
hasNot('收藏夹不把关键词显示出来', visibleText(favKw), '洗头水');
LBC.setFav(1, false, 'user');

/* 筛不到：文案要与「空收藏夹」区分，并给清空出口 */
LBC.favQ = 'zzz这个词肯定没有';
const favNone = render('favorites', {}, 'user', 'default');
has('筛不到时写「没有符合条件的收藏」', favNone, '没有符合条件的收藏');
has('筛不到时给清空筛选的出口', favNone, 'fav-clear');
hasNot('筛不到时不写「收藏夹是空的」', favNone, '收藏夹是空的');
LBC.favQ = '';
LBC.favCat = 0;

section('管理端');
const adminList = render('admin-list', {}, 'admin', 'default');
has('管理列表有「＋ 新建经验」主动作', adminList, '新建经验');
has('管理列表有待办：待确认内容', adminList, '待确认内容');
has('管理列表有待办：待处理反馈', adminList, '待处理反馈');
has('管理列表有待办：来源信息待补', adminList, '来源信息待补');
hasNot('管理列表不再出现「标签与别名」', visibleText(adminList), '别名');
const adminTags2 = render('admin-tags', {}, 'admin', 'default');
hasNot('标签页不再有别名表区块', visibleText(adminTags2), '别名');
hasNot('标签页不再有别名表区块（数据校验）', adminTags2, 'synonyms');
const adminEdit = render('admin-edit', { id: 1 }, 'admin', 'default');
has('已发布经验上写「撤回发布」', adminEdit, '撤回发布');
hasNot('不再出现「先存草稿」这个说法', adminEdit, '先存草稿');

section('CSS 静态检查');
const css = fs.readFileSync(abs('design/assets/dir-c.css'), 'utf8');
const searchDefs = (css.match(/^\.c-search\s*\{/gm) || []).length;
ok('.c-search 只定义一次（曾经有两份，后者覆盖前者）', searchDefs === 1, '实际 ' + searchDefs + ' 处');

/* 楷体只留给装饰性批注：适用 / 为什么信它 / 页面引言。
   meta 级（12–13px）一律无衬线 —— 楷体在安卓多数机型落不到 Kaiti。 */
const ALLOW_HAND = /c-point-a|c-strip-n|c-hand/;
const cssRules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
const handMeta = cssRules.filter(function (r) {
  const body = r.slice(r.indexOf('{'));
  const sel = r.slice(0, r.indexOf('{')).trim();
  if (body.indexOf('var(--hand)') < 0) return false;
  if (ALLOW_HAND.test(sel)) return false;
  const m = body.match(/font-size:\s*([\d.]+)px/);
  return m && parseFloat(m[1]) <= 13.5;
});
ok('meta 级（≤13.5px）文字不使用楷体', handMeta.length === 0,
  handMeta.map(function (r) { return r.split('{')[0].trim(); }).join(' | '));

ok('热区用 ::after 撑开（不改视觉密度）', css.indexOf('.c-pill::after') >= 0 && css.indexOf('.c-chip.tap::after') >= 0);
ok('小按钮热区扩到 40×40', /\.c-act\s*\{[^}]*width:\s*40px/.test(css));
const handBlock = (css.match(/--hand:[^;]+;/) || [''])[0];
ok('楷体栈含安卓 / Linux 回退', /Noto Serif CJK SC|Source Han Serif SC|serif/.test(handBlock), handBlock);

const lowAlpha = [];
css.split('\n').forEach(function (l) {
  const m = l.match(/color:\s*rgba\([^)]*?,\s*(0?\.\d+|[01](?:\.\d+)?)\s*\)/);
  if (m && parseFloat(m[1]) < 0.55) lowAlpha.push(l.trim());
});
ok('没有低透明度文字色（彩色底上会读不清）', lowAlpha.length === 0, lowAlpha.join(' | '));

section('对比度复算（WCAG，改色之后必须重新实测）');
function lum (hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map(function (i) {
    const v = parseInt(h.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio (a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const TOKEN = {};
const tokenRe = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
let tm;
while ((tm = tokenRe.exec(css))) TOKEN[tm[1]] = tm[2];

const NOTE_BG = ['paper', 'paper-2', 'card', 's-lemon', 's-mint', 's-peach', 's-sky',
  's-lilac', 's-cream', 's-wheat', 's-slate', 's-coral'];
const INK = ['ink', 'ink-2', 'ink-3', 'good-ink', 'bad-ink', 'neutral-ink', 'link-ink'];
const inkTable = [];
INK.forEach(function (ink) {
  let min = 99, bgMin = '';
  NOTE_BG.forEach(function (bg) {
    if (!TOKEN[ink] || !TOKEN[bg]) return;
    const r = ratio(TOKEN[ink], TOKEN[bg]);
    if (r < min) { min = r; bgMin = bg; }
  });
  inkTable.push(ink + ' ' + min.toFixed(2) + ':1（' + bgMin + '）');
  ok('正文级文字 ' + ink + ' 在任意便签底上 ≥ 4.5:1', min >= 4.5,
    '最低 ' + min.toFixed(2) + ':1（底色 ' + bgMin + '）');
});
console.log('   正文级文字最低对比度：' + inkTable.join(' / '));

['good', 'bad', 'neutral'].forEach(function (k) {
  const r = ratio('#ffffff', TOKEN[k]);
  ok('贴纸底色 ' + k + ' 配白字 ≥ 5.3:1', r >= 5.3, '实测 ' + r.toFixed(2) + ':1');
});

/* ---------- 汇总 ---------- */
console.log('\n' + '='.repeat(58));
console.log('通过 ' + passed + ' 项，失败 ' + failures.length + ' 项');
if (failures.length) {
  console.log('\n失败明细：');
  failures.forEach(function (f, i) { console.log('  ' + (i + 1) + '. ' + f); });
  process.exit(1);
}
console.log('全部通过。');
