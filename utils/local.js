/**
 * 本地演示数据 provider
 *
 * 职责：后端不可用时提供同形状的数据，让整套流程离线可跑（设计文档 §5.2 数据层与来源分离）。
 * 关键约束：
 *   1. 返回结构必须与服务端一致 —— 页面只认结构，不认来源。
 *   2. 如实上报来源：本地数据一律标 source='demo'，检索 mode 不许说成 hybrid。
 *   3. 演示场景（10 个）在这里生效：切场景等于切这里的返回。
 * 约定：小程序运行时不写可选链与空值合并。
 */
var config = require('../config/index');
var storage = require('./storage');
var searchUtil = require('./search');

var DATA_CATEGORIES = require('../data/categories.json');
var DATA_EXPERIENCES = require('../data/experiences.json');
var DATA_FEEDBACKS = require('../data/feedbacks.json');

/* ---------- 演示场景 ---------- */
var SCENES = ['default', 'vector', 'keyword', 'demo', 'empty', 'disputed', 'loading', 'timeout', 'anon', 'offline'];

/** 演示场景的中文名（开发面板用；界面里不出现英文枚举） */
var SCENE_LABELS = {
  default: '默认',
  vector: '语义检索',
  keyword: '关键词检索',
  demo: '降级提示',
  empty: '空结果',
  disputed: '争议内容',
  loading: '加载延迟',
  timeout: '检索超时',
  anon: '未登录',
  offline: '断网'
};

function scene () {
  var s = storage.get(config.sceneKey);
  if (SCENES.indexOf(s) >= 0) return s;
  return 'default';
}

function setScene (s) {
  if (SCENES.indexOf(s) < 0) return scene();
  storage.set(config.sceneKey, s);
  return s;
}

/* ---------- 本机状态：收藏 / 投票 / 新反馈 / 管理端编辑 ---------- */
function loadState () {
  var s = storage.getJson(config.localStateKey, null);
  if (s && typeof s === 'object') {
    if (!s.favorites) s.favorites = {};
    if (!s.votes) s.votes = {};
    if (!s.feedbacks) s.feedbacks = [];
    if (!s.overrides) s.overrides = {};
    if (!s.newTags) s.newTags = [];
    return s;
  }
  return { favorites: {}, votes: {}, feedbacks: [], overrides: {}, newTags: [] };
}

function saveState (s) {
  storage.setJson(config.localStateKey, s);
  return s;
}

/* ---------- 数据视图 ---------- */

/** 领域 */
function allCategories () {
  return DATA_CATEGORIES.categories;
}

function allTags () {
  var base = DATA_CATEGORIES.tags.map(function (t) {
    return { id: t.id, categoryId: t.categoryId, name: t.name };
  });
  var st = loadState();
  base = base.concat(st.newTags);
  return base;
}

/** 经验：叠加管理端编辑的覆盖字段 */
function allExperiences () {
  var st = loadState();
  var out = [];
  for (var i = 0; i < DATA_EXPERIENCES.length; i++) {
    var e = DATA_EXPERIENCES[i];
    var ov = st.overrides[e.id];
    if (ov) {
      var merged = {};
      for (var k in e) {
        if (Object.prototype.hasOwnProperty.call(e, k)) merged[k] = e[k];
      }
      for (var k2 in ov) {
        if (Object.prototype.hasOwnProperty.call(ov, k2)) merged[k2] = ov[k2];
      }
      out.push(merged);
    } else {
      out.push(e);
    }
  }
  return out;
}

function published () {
  return allExperiences().filter(function (e) { return e.status === 'published'; });
}

function expById (id) {
  var list = allExperiences();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].id) === String(id)) return list[i];
  }
  return null;
}

/** 争议场景：把一条经验标成有争议，让详情页的争议提示能被看见 */
function applyScene (exp) {
  if (scene() !== 'disputed') return exp;
  if (!exp) return exp;
  var copy = {};
  for (var k in exp) {
    if (Object.prototype.hasOwnProperty.call(exp, k)) copy[k] = exp[k];
  }
  copy.confidence = 'disputed';
  return copy;
}

function categoryOf (catId) {
  var list = allCategories();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === Number(catId)) return list[i];
  }
  return null;
}

function catName (catId) {
  var cat = categoryOf(catId);
  return cat ? cat.name : '';
}

function catSlug (catId) {
  var cat = categoryOf(catId);
  return cat ? cat.slug : '';
}

function demoRole () {
  var value = storage.get(config.roleKey);
  if (value === 'admin' || value === 'user') return value;
  return config.devRole === 'admin' ? 'admin' : 'user';
}

function pagination (list, opts) {
  var o = opts || {};
  var size = Math.max(1, Math.min(20, parseInt(o.size, 10) || 20));
  var page = Math.max(1, parseInt(o.page, 10) || 1);
  var total = list.length;
  var start = (page - 1) * size;
  return {
    items: list.slice(start, start + size),
    page: page,
    size: size,
    total: total,
    hasMore: start + size < total
  };
}

/** 标签名列表 */
function tagNames (e) {
  var tags = allTags();
  var names = [];
  for (var i = 0; i < (e.tagIds || []).length; i++) {
    for (var j = 0; j < tags.length; j++) {
      if (tags[j].id === e.tagIds[i]) { names.push(tags[j].name); break; }
    }
  }
  if (!names.length) names = e.tagNames || [];
  return names;
}

/* ---------- 场景门禁 ---------- */

/** 需要登录的操作在「未登录」场景下拒绝 */
function requireLogin (promise) {
  if (scene() === 'anon') {
    return Promise.reject({ code: 'UNAUTHORIZED', message: '需要登录后才能继续' });
  }
  return promise;
}

/** 网络失败场景 */
function failIfOffline () {
  if (scene() === 'offline') {
    return Promise.reject({ code: 'NETWORK', message: '网络不太顺畅，没连上' });
  }
  return null;
}

/** 检索超时场景 */
function failIfTimeout () {
  if (scene() === 'timeout') {
    return Promise.reject({ code: 'TIMEOUT', message: '检索超时了，请重新检索' });
  }
  return null;
}

/** 加载中场景：延迟一小会儿，让骨架屏能被看见 */
function delayIfLoading (promise) {
  if (scene() !== 'loading') return promise;
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      promise.then(resolve, reject);
    }, 900);
  });
}

/* ---------- 读接口 ---------- */

function getCategories () {
  var off = failIfOffline();
  if (off) return off;
  return delayIfLoading(Promise.resolve({
    categories: allCategories(),
    tags: allTags(),
    source: 'demo'
  }));
}

/**
 * 列表：categoryId / tagId / stance / page / size
 * stance 是要点级字段，筛选含义是「这条经验至少有一条该立场的要点」（设计文档 §8.1）
 */
function listExperiences (opts) {
  var off = failIfOffline();
  if (off) return off;
  var o = opts || {};
  var list = published();
  if (o.categoryId) {
    list = list.filter(function (e) { return e.categoryId === Number(o.categoryId); });
  }
  if (o.tagId) {
    list = list.filter(function (e) { return (e.tagIds || []).indexOf(Number(o.tagId)) >= 0; });
  }
  if (o.stance) {
    list = list.filter(function (e) {
      var pts = e.points || [];
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].stance === o.stance) return true;
      }
      return false;
    });
  }
  if (scene() === 'empty') list = [];
  list = list.slice().sort(function (a, b) {
    if (o.sort === 'fav') {
      var diff = (b.favoriteCount || 0) - (a.favoriteCount || 0);
      if (diff) return diff;
    }
    var byDate = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    return byDate || (b.id - a.id);
  });
  var paged = pagination(list, o);
  var items = paged.items.map(function (e) {
    return {
      id: e.id,
      title: e.title,
      summary: e.summary,
      categoryId: e.categoryId,
      categorySlug: catSlug(e.categoryId),
      categoryName: catName(e.categoryId),
      updatedAt: e.updatedAt,
      confidence: e.confidence,
      points: e.points,
      tagNames: tagNames(e),
      favoriteCount: e.favoriteCount,
      usefulCount: e.usefulCount,
      notUsefulCount: e.notUsefulCount
    };
  });
  return delayIfLoading(Promise.resolve({
    items: items, page: paged.page, size: paged.size, total: paged.total,
    hasMore: paged.hasMore, source: 'demo'
  }));
}

function getExperience (id) {
  var off = failIfOffline();
  if (off) return off;
  var e = expById(id);
  if (!e) return Promise.reject({ code: 'NOT_FOUND', message: '这条经验不存在或已下线' });
  if (e.status !== 'published') {
    return Promise.reject({ code: 'NOT_FOUND', message: '这条经验已下线' });
  }
  if (scene() === 'empty') {
    return Promise.reject({ code: 'NOT_FOUND', message: '这条经验不存在或已下线' });
  }
  var exp = applyScene(e);
  var slug = exp.categorySlug || catSlug(exp.categoryId);
  var categoryName = exp.categoryName || catName(exp.categoryId);
  if (!exp.categorySlug || !exp.categoryName) {
    var copy = {};
    for (var key in exp) {
      if (Object.prototype.hasOwnProperty.call(exp, key)) copy[key] = exp[key];
    }
    copy.categorySlug = slug;
    copy.categoryName = categoryName;
    exp = copy;
  }
  return delayIfLoading(Promise.resolve({
    experience: exp,
    categorySlug: slug,
    points: exp.points,
    sources: exp.sources,
    tags: tagNames(exp),
    related: relatedOf(exp.id, 3),
    usefulCount: exp.usefulCount,
    notUsefulCount: exp.notUsefulCount,
    source: 'demo'
  }));
}

/** 相关经验：同领域优先，标签重叠兜底（设计文档 §14 D9） */
function relatedOf (expId, limit) {
  var e = expById(expId);
  if (!e) return [];
  var list = published();
  var same = list.filter(function (x) {
    return x.id !== e.id && x.categoryId === e.categoryId;
  });
  var overlap = list.filter(function (x) {
    if (x.id === e.id || x.categoryId === e.categoryId) return false;
    var a = x.tagIds || [], b = e.tagIds || [];
    for (var i = 0; i < a.length; i++) {
      if (b.indexOf(a[i]) >= 0) return true;
    }
    return false;
  });
  return same.concat(overlap).slice(0, limit || 3).map(function (x) {
    return {
      id: x.id, title: x.title, summary: x.summary,
      categoryId: x.categoryId, categorySlug: catSlug(x.categoryId), categoryName: catName(x.categoryId),
      updatedAt: x.updatedAt, points: x.points, tagNames: tagNames(x)
    };
  });
}

/** 来源清单，按要点分组（要点 ↔ 依据 映射视图） */
function listSources (experienceId) {
  var off = failIfOffline();
  if (off) return off;
  var e = expById(experienceId);
  if (!e) return Promise.reject({ code: 'NOT_FOUND', message: '这条经验不存在' });
  var groups = [];
  for (var i = 0; i < (e.points || []).length; i++) {
    var p = e.points[i];
    var srcs = (e.sources || []).filter(function (s) {
      return (s.pointIds || []).indexOf(p.id) >= 0;
    });
    groups.push({
      pointId: p.id,
      pointTitle: p.title,
      stance: p.stance,
      sources: srcs
    });
  }
  /* ⚠️ 之前比服务端少一个 sources 字段 ——
     两边返回结构不一致，页面换个数据源就可能取不到值。 */
  return delayIfLoading(Promise.resolve({ groups: groups, sources: e.sources || [], source: 'demo' }));
}

/* ---------- 检索 ---------- */

/**
 * 本地检索：纯关键词路。
 * mode 如实上报 —— 本地这份数据没有向量索引，说成 hybrid 就是撒谎。
 */
function search (opts) {
  var off = failIfOffline();
  if (off) return off;
  var to = failIfTimeout();
  if (to) return to;

  var o = opts || {};
  var q = searchUtil.normalize(o.query);
  var started = Date.now();
  if (!q) {
    return delayIfLoading(Promise.resolve({
      query: o.query || '', mode: 'keyword', tookMs: 0, items: [], source: 'demo'
    }));
  }

  var list = published();
  if (o.categoryIds && o.categoryIds.length) {
    list = list.filter(function (e) { return o.categoryIds.indexOf(e.categoryId) >= 0; });
  }
  if (o.stance) {
    list = list.filter(function (e) {
      var pts = e.points || [];
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].stance === o.stance) return true;
      }
      return false;
    });
  }
  if (scene() === 'empty') list = [];

  var scored = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var score = 0;
    var matchedOn = [];
    var lowerTitle = String(e.title).toLowerCase();
    var lowerSummary = String(e.summary).toLowerCase();
    if (lowerTitle.indexOf(q) >= 0) { score += 3; matchedOn.push('title'); }
    if (lowerSummary.indexOf(q) >= 0) { score += 2; matchedOn.push('summary'); }
    var pts = e.points || [];
    for (var p = 0; p < pts.length; p++) {
      var pt = pts[p];
      var t = String(pt.title).toLowerCase();
      var d = String(pt.detail || '').toLowerCase();
      if (t.indexOf(q) >= 0) { score += 3; matchedOn.push('point:' + pt.title); }
      else if (d.indexOf(q) >= 0) { score += 1; matchedOn.push('point:' + pt.title); }
    }
    var kws = e.keywords || [];
    for (var k = 0; k < kws.length; k++) {
      if (String(kws[k]).toLowerCase().indexOf(q) >= 0) {
        score += 2;
        matchedOn.push('keyword:' + kws[k]);
      }
    }
    var names = tagNames(e);
    for (var n = 0; n < names.length; n++) {
      if (String(names[n]).toLowerCase().indexOf(q) >= 0) { score += 1; matchedOn.push('tag:' + names[n]); }
    }
    if (score > 0) scored.push({ e: e, score: score, matchedOn: matchedOn });
  }

  scored.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.e.id - b.e.id;
  });

  var limit = o.limit || 20;
  var items = scored.slice(0, limit).map(function (s) {
    return {
      experience: {
        id: s.e.id,
        title: s.e.title,
        summary: s.e.summary,
        categoryId: s.e.categoryId,
        categorySlug: catSlug(s.e.categoryId),
        categoryName: catName(s.e.categoryId),
        updatedAt: s.e.updatedAt,
        confidence: s.e.confidence
      },
      score: s.score,
      matchedOn: s.matchedOn,
      highlights: { summary: searchUtil.highlight(s.e.summary, [q]) }
    };
  });

  var mode = 'keyword';
  if (scene() === 'vector') mode = 'vector';
  if (scene() === 'demo') mode = 'degraded';

  return delayIfLoading(Promise.resolve({
    query: o.query || '',
    mode: mode,
    tookMs: Date.now() - started,
    items: items,
    source: 'demo'
  }));
}

/* ---------- 我的 ---------- */

function getMine () {
  var off = failIfOffline();
  if (off) return off;
  var st = loadState();
  var favCount = 0;
  for (var k in st.favorites) {
    if (Object.prototype.hasOwnProperty.call(st.favorites, k)) favCount++;
  }
  var myFb = st.feedbacks.length;
  return delayIfLoading(Promise.resolve({
    user: { role: demoRole() },
    metrics: { favorites: favCount, myFeedbacks: myFb },
    source: 'demo'
  }));
}

function listFavorites (opts) {
  var off = failIfOffline();
  if (off) return off;
  var st = loadState();
  var list = published().filter(function (e) {
    return !!st.favorites[e.id];
  });
  var o = opts || {};
  if (o.categoryId) {
    list = list.filter(function (e) { return e.categoryId === Number(o.categoryId); });
  }
  if (o.q) {
    var q = String(o.q).toLowerCase();
    list = list.filter(function (e) {
      return String(e.title).toLowerCase().indexOf(q) >= 0 ||
        String(e.summary).toLowerCase().indexOf(q) >= 0;
    });
  }
  if (scene() === 'empty') list = [];
  if (o.sort === 'updated') {
    list = list.slice().sort(function (a, b) {
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  } else {
    list = list.slice().sort(function (a, b) {
      return String(st.favorites[b.id]).localeCompare(String(st.favorites[a.id]));
    });
  }
  var paged = pagination(list, o);
  var items = paged.items.map(function (e) {
    return {
      id: e.id, title: e.title, summary: e.summary,
      categoryId: e.categoryId, categorySlug: catSlug(e.categoryId), categoryName: catName(e.categoryId),
      updatedAt: e.updatedAt, points: e.points, tagNames: tagNames(e),
      favoriteCount: e.favoriteCount, usefulCount: e.usefulCount, notUsefulCount: e.notUsefulCount,
      addedAt: st.favorites[e.id]
    };
  });
  return delayIfLoading(Promise.resolve({
    items: items, page: paged.page, size: paged.size, total: paged.total,
    hasMore: paged.hasMore, source: 'demo'
  }));
}

function addFavorite (id) {
  var off = failIfOffline();
  if (off) return off;
  return requireLogin(Promise.resolve().then(function () {
    var st = loadState();
    st.favorites[id] = new Date().toISOString();
    saveState(st);
    return { ok: true, source: 'demo' };
  }));
}

function removeFavorite (id) {
  var off = failIfOffline();
  if (off) return off;
  return requireLogin(Promise.resolve().then(function () {
    var st = loadState();
    delete st.favorites[id];
    saveState(st);
    return { ok: true, source: 'demo' };
  }));
}

/** 投票：取消投 / 改投，两个计数都要改对（设计文档 §6.2） */
function vote (id, useful) {
  var off = failIfOffline();
  if (off) return off;
  return requireLogin(Promise.resolve().then(function () {
    var st = loadState();
    /* 取消投的语义：再点一次同一个 = 取消 */
    var before = st.votes[id];
    var now = (before === !!useful) ? null : !!useful;
    if (now === null) delete st.votes[id];
    else st.votes[id] = now;
    saveState(st);
    var e = expById(id);
    /* ⚠️ 之前直接返回经验里的原始计数，不反映这次投票 ——
       界面上的数字与服务端的算法对不上。
       现在按 votes 里的实际票数重数一遍（与服务端同一口径）。 */
    var votes = st.votes || {};
    var usefulCount = 0;
    var notUsefulCount = 0;
    for (var key in votes) {
      if (!Object.prototype.hasOwnProperty.call(votes, key)) continue;
      if (String(key) !== String(id)) continue;
      if (votes[key]) usefulCount++;
      else notUsefulCount++;
    }
    var base = e ? Number(e.usefulCount || 0) : 0;
    var baseBad = e ? Number(e.notUsefulCount || 0) : 0;
    /* 演示态没有真实的 votes 表，用「种子计数 + 本机票」近似 */
    usefulCount = base + usefulCount;
    notUsefulCount = baseBad + notUsefulCount;
    return { ok: true, useful: now, usefulCount: usefulCount, notUsefulCount: notUsefulCount, source: 'demo' };
  }));
}

/** 提交反馈 */
function submitFeedback (payload) {
  var off = failIfOffline();
  if (off) return off;
  var p = payload || {};
  if (!p.kind) return Promise.reject({ code: 'VALIDATION', message: '请选择反馈类型' });
  if (!p.content || !String(p.content).trim()) {
    return Promise.reject({ code: 'VALIDATION', message: '请填写反馈内容' });
  }
  var images = p.images || [];
  if (images.length > config.feedbackImageMax) {
    return Promise.reject({ code: 'VALIDATION', message: '最多只能附 ' + config.feedbackImageMax + ' 张图片' });
  }
  return requireLogin(Promise.resolve().then(function () {
    var st = loadState();
    var fb = {
      id: 100 + st.feedbacks.length,
      targetType: p.targetType || 'project',
      targetId: p.targetId == null ? null : p.targetId,
      kind: p.kind,
      content: p.content,
      status: 'pending',
      reply: '',
      repliedAt: null,
      createdAt: new Date().toISOString().slice(0, 10),
      author: '我',
      openid: 'demo-user',
      mediaStatus: images.length ? 'checking' : 'none',
      images: images.map(function (im, i) {
        return { mediaId: 'local-' + i, url: im.url || '', name: im.name || '' };
      })
    };
    st.feedbacks.push(fb);
    saveState(st);
    return fb;
  }));
}

/**
 * 把处理结论的覆盖值合并回反馈列表
 * 处理一条反馈不会去改种子数据（那会写进模块级常量），
 * 结论记在本机存储的 feedbackOverrides 里，读取时合并回来。
 */
function applyFeedbackOverrides (list, st) {
  var ov = (st && st.feedbackOverrides) || {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var f = list[i];
    var patch = ov[String(f.id)];
    if (!patch) { out.push(f); continue; }
    var merged = {};
    for (var key in f) {
      if (Object.prototype.hasOwnProperty.call(f, key)) merged[key] = f[key];
    }
    for (var k2 in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k2)) merged[k2] = patch[k2];
    }
    out.push(merged);
  }
  return out;
}

function listMyFeedbacks () {
  var off = failIfOffline();
  if (off) return off;
  var st = loadState();
  var mine = DATA_FEEDBACKS.filter(function (f) { return f.openid === 'demo-user'; })
    .concat(st.feedbacks);
  mine = applyFeedbackOverrides(mine, st);
  if (scene() === 'empty') mine = [];
  return delayIfLoading(Promise.resolve({ items: mine, source: 'demo' }));
}

/* ---------- 管理端 ---------- */

function listAdminExperiences (opts) {
  var off = failIfOffline();
  if (off) return off;
  var o = opts || {};
  var list = allExperiences();
  if (o.cat) {
    list = list.filter(function (e) { return e.categoryId === Number(o.cat); });
  }
  if (o.q) {
    var q = String(o.q).toLowerCase();
    list = list.filter(function (e) {
      return String(e.title).toLowerCase().indexOf(q) >= 0 ||
        String(e.summary).toLowerCase().indexOf(q) >= 0 ||
        tagNames(e).join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  if (o.status && o.status !== 'all') {
    list = list.filter(function (e) { return e.status === o.status; });
  }
  if (scene() === 'empty') list = [];
  list = list.slice().sort(function (a, b) {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || (b.id - a.id);
  });
  var paged = pagination(list, o);
  var items = paged.items.map(function (e) {
    return {
      id: e.id, title: e.title, summary: e.summary,
      categoryId: e.categoryId, categorySlug: catSlug(e.categoryId), categoryName: catName(e.categoryId),
      status: e.status, confidence: e.confidence,
      updatedAt: e.updatedAt, reviewedAt: e.reviewedAt, nextReviewAt: e.nextReviewAt,
      points: e.points, sources: e.sources, tagNames: tagNames(e), tagIds: e.tagIds,
      keywords: e.keywords, body: e.body
    };
  });
  return delayIfLoading(Promise.resolve({
    items: items, page: paged.page, size: paged.size, total: paged.total,
    hasMore: paged.hasMore, source: 'demo'
  }));
}

function getAdminExperience (id) {
  var off = failIfOffline();
  if (off) return off;
  var e = expById(id);
  if (!e) return Promise.reject({ code: 'NOT_FOUND', message: '这条经验不存在' });
  var copy = {};
  for (var key in e) {
    if (Object.prototype.hasOwnProperty.call(e, key)) copy[key] = e[key];
  }
  copy.categorySlug = catSlug(e.categoryId);
  return delayIfLoading(Promise.resolve(copy));
}

/**
 * 发布前校验 —— 护栏落在数据层（设计文档 §4.1）
 * 每条依据都必须关联至少一条要点，否则不让发。
 */
function validateExperience (exp) {
  var errors = [];
  var e = exp || {};
  if (!e.title || !String(e.title).trim()) errors.push('标题不能为空');
  var points = e.points || [];
  var sources = e.sources || [];
  if (!points.length) errors.push('尚未填写要点，请先补充。');
  if (!sources.length) errors.push('至少需要 1 条依据，发布前请补充。');
  for (var i = 0; i < sources.length; i++) {
    if (!sources[i].pointIds || !sources[i].pointIds.length) {
      errors.push('存在未关联要点的依据，请先为其指定所支撑的要点。');
      break;
    }
  }
  return errors;
}

function saveExperience (payload) {
  var off = failIfOffline();
  if (off) return off;
  var p = payload || {};
  return Promise.resolve().then(function () {
    var st = loadState();
    var id = p.id;
    if (!id) {
      id = 900 + Object.keys(st.overrides).length;
      st.overrides[id] = {
        id: id,
        slug: 'exp-' + id,
        categoryId: p.categoryId || 1,
        categoryName: catName(p.categoryId || 1),
        title: p.title || '',
        summary: p.summary || '',
        body: p.body || '',
        keywords: p.keywords || [],
        status: p.status || 'draft',
        confidence: p.confidence || 'normal',
        reviewedAt: p.reviewedAt || new Date().toISOString().slice(0, 10),
        nextReviewAt: p.nextReviewAt || null,
        viewCount: 0, favoriteCount: 0, usefulCount: 0, notUsefulCount: 0,
        updatedAt: new Date().toISOString().slice(0, 10),
        tagNames: p.tagNames || [],
        tagIds: p.tagIds || [],
        points: p.points || [],
        sources: p.sources || []
      };
    } else {
      var cur = st.overrides[id] || expById(id) || {};
      var merged = {};
      for (var k in cur) {
        if (Object.prototype.hasOwnProperty.call(cur, k)) merged[k] = cur[k];
      }
      for (var k2 in p) {
        if (Object.prototype.hasOwnProperty.call(p, k2)) merged[k2] = p[k2];
      }
      merged.updatedAt = new Date().toISOString().slice(0, 10);
      st.overrides[id] = merged;
    }
    saveState(st);
    return { ok: true, id: id, source: 'demo' };
  });
}

function publishExperience (id) {
  var off = failIfOffline();
  if (off) return off;
  return Promise.resolve().then(function () {
    var st = loadState();
    var e = st.overrides[id] || expById(id);
    if (!e) return Promise.reject({ code: 'NOT_FOUND', message: '这条经验不存在' });
    var errors = validateExperience(e);
    if (errors.length) return Promise.reject({ code: 'VALIDATION', message: errors[0], errors: errors });
    if (!st.overrides[id]) st.overrides[id] = { id: id };
    st.overrides[id].status = 'published';
    st.overrides[id].updatedAt = new Date().toISOString().slice(0, 10);
    saveState(st);
    return { ok: true, source: 'demo' };
  });
}

function unpublishExperience (id) {
  var off = failIfOffline();
  if (off) return off;
  return Promise.resolve().then(function () {
    var st = loadState();
    if (!st.overrides[id]) st.overrides[id] = { id: id };
    st.overrides[id].status = 'draft';
    st.overrides[id].updatedAt = new Date().toISOString().slice(0, 10);
    saveState(st);
    return { ok: true, source: 'demo' };
  });
}

function listAdminFeedbacks (opts) {
  var off = failIfOffline();
  if (off) return off;
  var o = opts || {};
  var st = loadState();
  var list = applyFeedbackOverrides(DATA_FEEDBACKS.concat(st.feedbacks), st);
  if (o.status && o.status !== 'all') {
    list = list.filter(function (f) { return f.status === o.status; });
  }
  if (o.q) {
    var q = String(o.q).toLowerCase();
    list = list.filter(function (f) {
      return String(f.content).toLowerCase().indexOf(q) >= 0 ||
        String(f.author).toLowerCase().indexOf(q) >= 0;
    });
  }
  if (scene() === 'empty') list = [];
  return delayIfLoading(Promise.resolve({ items: list, total: list.length, source: 'demo' }));
}

/**
 * 处理反馈：一次提交落 status + reply（设计文档 §4.3 口径调整）
 * 护栏落在数据层 —— 选了「只回话」却没写回复，一律拒绝。
 */
function resolveFeedback (id, payload) {
  var off = failIfOffline();
  if (off) return off;
  var p = payload || {};
  var status = p.status;
  /* ⚠️ 不传 reply = 保留原回复（与服务端同一口径）——
     之前无条件写 reply，改个结论就把写好的回复清成空串了。 */
  var hasReply = p.reply !== undefined && p.reply !== null;
  var reply = hasReply ? String(p.reply) : '';
  if (!status || ['accepted', 'ignored', 'replied'].indexOf(status) < 0) {
    return Promise.reject({ code: 'VALIDATION', message: '先选一个怎么处理这条' });
  }
  if (status === 'replied' && !reply.trim()) {
    return Promise.reject({ code: 'VALIDATION', message: '选了「只回话」，那就写点什么吧' });
  }
  return Promise.resolve().then(function () {
    var st = loadState();
    var list = DATA_FEEDBACKS.concat(st.feedbacks);
    /* ⚠️ 之前直接改种子数据对象（list[i].status = …），
       那个对象是 DATA_FEEDBACKS 里的引用 ——
       改完就写进模块级常量了，退出重进还在。
       现在复制一份再改，改动只落在本机存储里。 */
    var changed = null;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) {
        changed = {};
        for (var key in list[i]) {
          if (Object.prototype.hasOwnProperty.call(list[i], key)) changed[key] = list[i][key];
        }
        changed.status = status;
        if (hasReply) changed.reply = reply;
        changed.repliedAt = new Date().toISOString().slice(0, 10);
        break;
      }
    }
    if (changed) {
      /* 用与经验相同的 overrides 机制记录覆盖值 ——
         读取时会把覆盖值合并回去（见 applyFeedbackOverrides）。 */
      st.feedbackOverrides = st.feedbackOverrides || {};
      st.feedbackOverrides[String(id)] = changed;
      saveState(st);
    }
    return { ok: true, status: status, reply: changed ? changed.reply : reply, source: 'demo' };
  });
}

function listAdminTags () {
  var off = failIfOffline();
  if (off) return off;
  var tags = allTags().map(function (t) {
    return { id: t.id, name: t.name, categoryId: t.categoryId, categoryName: catName(t.categoryId) };
  });
  return delayIfLoading(Promise.resolve({ items: tags, total: tags.length, source: 'demo' }));
}

function saveTag (payload) {
  var off = failIfOffline();
  if (off) return off;
  var p = payload || {};
  if (!p.name || !String(p.name).trim()) {
    return Promise.reject({ code: 'VALIDATION', message: '标签名不能为空' });
  }
  return Promise.resolve().then(function () {
    var st = loadState();
    if (p.id) {
      for (var i = 0; i < st.newTags.length; i++) {
        if (st.newTags[i].id === p.id) {
          st.newTags[i].name = p.name;
          st.newTags[i].categoryId = p.categoryId;
          saveState(st);
          return { ok: true, source: 'demo' };
        }
      }
      return Promise.reject({ code: 'NOT_FOUND', message: '标签不存在' });
    }
    var maxId = 0;
    allTags().forEach(function (t) { if (t.id > maxId) maxId = t.id; });
    st.newTags.push({ id: maxId + 1, name: p.name, categoryId: p.categoryId || 1 });
    saveState(st);
    return { ok: true, source: 'demo' };
  });
}

function removeTag (id) {
  var off = failIfOffline();
  if (off) return off;
  return Promise.resolve().then(function () {
    var st = loadState();
    st.newTags = st.newTags.filter(function (t) { return t.id !== Number(id); });
    saveState(st);
    return { ok: true, source: 'demo' };
  });
}

/** 管理端指标：全部由数据派生，不写死（设计文档 §4.3 口径） */
function getStats () {
  var all = allExperiences();
  var pub = all.filter(function (e) { return e.status === 'published'; });
  var st = loadState();
  var fbs = DATA_FEEDBACKS.concat(st.feedbacks);
  var needReview = pub.filter(function (e) {
    return (e.categoryId === 5 || e.categoryId === 6 || e.categoryId === 7) && !e.nextReviewAt;
  });
  var sourceGap = 0;
  all.forEach(function (e) {
    (e.sources || []).forEach(function (s) {
      if (!s.author || !s.platform) sourceGap++;
    });
  });
  var points = 0, sources = 0;
  pub.forEach(function (e) {
    points += (e.points || []).length;
    sources += (e.sources || []).length;
  });
  return Promise.resolve({
    experiences: all.length,
    published: pub.length,
    drafts: all.length - pub.length,
    points: points,
    sources: sources,
    tags: allTags().length,
    pendingFeedback: fbs.filter(function (f) { return f.status === 'pending'; }).length,
    needReview: needReview.length,
    sourceMetaGap: sourceGap,
    source: 'demo'
  });
}

/** 登录：本地直接给一个演示用户 */
function login (code) {
  return Promise.resolve({
    token: 'demo-token',
    user: { role: demoRole() },
    source: 'demo'
  });
}

module.exports = {
  SCENES: SCENES,
  SCENE_LABELS: SCENE_LABELS,
  scene: scene,
  setScene: setScene,
  getCategories: getCategories,
  listExperiences: listExperiences,
  getExperience: getExperience,
  listSources: listSources,
  search: search,
  getMine: getMine,
  listFavorites: listFavorites,
  addFavorite: addFavorite,
  removeFavorite: removeFavorite,
  vote: vote,
  submitFeedback: submitFeedback,
  listMyFeedbacks: listMyFeedbacks,
  listAdminExperiences: listAdminExperiences,
  getAdminExperience: getAdminExperience,
  saveExperience: saveExperience,
  publishExperience: publishExperience,
  unpublishExperience: unpublishExperience,
  listAdminFeedbacks: listAdminFeedbacks,
  resolveFeedback: resolveFeedback,
  listAdminTags: listAdminTags,
  saveTag: saveTag,
  removeTag: removeTag,
  getStats: getStats,
  login: login,
  validateExperience: validateExperience
};
