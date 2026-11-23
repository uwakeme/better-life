/**
 * 唯一取数入口
 *
 * 职责：页面只调这里，不直接调 wx.request，也不直接读 data/*.json。
 * 链路：先走后端（utils/cloud.js），失败回落本地演示数据（utils/local.js）。
 * 两条路返回同一种结构，页面只认结构；来源通过 source 字段如实上报。
 *
 * 回落规则：
 *   - 网络/超时/5xx → 回落演示数据（并在返回值里标 source='demo'）
 *   - 鉴权/权限/不存在/内容审核不通过 → 原样抛出，不拿演示数据冒充真实结果
 */
var cloud = require('./cloud');
var local = require('./local');
var config = require('../config/index');

/** 这些错误是「真错误」，不能用演示数据顶替 */
function isBusinessError (err) {
  if (!err || !err.code) return false;
  var c = err.code;
  return c === 'UNAUTHORIZED' || c === 'FORBIDDEN' || c === 'NOT_FOUND' ||
    c === 'CONTENT_REJECTED' || c === 'RATE_LIMITED' || c === 'VALIDATION';
}

function mark (data, source) {
  if (data && typeof data === 'object' && !data.source) data.source = source;
  return data;
}

/**
 * 组合一次调用：后端优先，失败回落
 * @param {function} remote 走后端的调用
 * @param {function} localCall 走本地演示数据的调用
 */
function withFallback (remote, localCall) {
  return function () {
    var args = arguments;
    var runLocal = function () {
      return Promise.resolve().then(function () {
        return localCall.apply(null, args);
      }).then(function (data) {
        return mark(data, 'demo');
      });
    };
    if (!config.demoFallback) {
      return remote.apply(null, args).then(function (data) {
        return mark(data, 'server');
      });
    }
    return remote.apply(null, args).then(function (data) {
      return mark(data, 'server');
    }).catch(function (err) {
      if (isBusinessError(err)) throw err;
      return runLocal();
    });
  };
}

/* ---------- 公开接口 ---------- */

function login (code) {
  return withFallback(
    function () { return cloud.post('/api/auth/login', { code: code }); },
    function () { return local.login(code); }
  )();
}

var getCategories = withFallback(
  function () { return cloud.get('/api/categories'); },
  function () { return local.getCategories(); }
);

var listExperiences = withFallback(
  function (opts) { return cloud.get('/api/experiences', opts); },
  function (opts) { return local.listExperiences(opts); }
);

var getExperience = withFallback(
  function (id) { return cloud.get('/api/experiences/' + id); },
  function (id) { return local.getExperience(id); }
);

var listSources = withFallback(
  function (id) { return cloud.get('/api/experiences/' + id + '/sources'); },
  function (id) { return local.listSources(id); }
);

var search = withFallback(
  function (body) { return cloud.post('/api/search', body); },
  function (body) { return local.search(body); }
);

var getHealth = withFallback(
  function () { return cloud.get('/api/health'); },
  function () {
    return Promise.resolve({
      dataSource: 'demo',
      vectorStore: 'memory',
      embeddingModel: 'local-bigram-hash',
      semantic: false
    });
  }
);

/* ---------- 需登录接口 ---------- */

var getMine = withFallback(
  function () { return cloud.get('/api/me'); },
  function () { return local.getMine(); }
);

var listFavorites = withFallback(
  function (opts) { return cloud.get('/api/me/favorites', opts); },
  function (opts) { return local.listFavorites(opts); }
);

var addFavorite = withFallback(
  function (id) { return cloud.post('/api/me/favorites/' + id); },
  function (id) { return local.addFavorite(id); }
);

var removeFavorite = withFallback(
  function (id) { return cloud.del('/api/me/favorites/' + id); },
  function (id) { return local.removeFavorite(id); }
);

var vote = withFallback(
  function (id, useful) { return cloud.post('/api/me/votes/' + id, { useful: useful }); },
  function (id, useful) { return local.vote(id, useful); }
);

var submitFeedback = withFallback(
  function (body) { return cloud.post('/api/feedbacks', body); },
  function (body) { return local.submitFeedback(body); }
);

var listMyFeedbacks = withFallback(
  function () { return cloud.get('/api/me/feedbacks'); },
  function () { return local.listMyFeedbacks(); }
);

/**
 * 上传反馈附图
 * 后端不可用时保留本地临时路径（演示态），返回的 mediaId 为空 ——
 * 服务端拿到的是空 mediaId，不会假装已经过审。
 */
function uploadImage (filePath) {
  return cloud.upload('/api/upload', { path: filePath }).then(function (data) {
    return { mediaId: (data && data.mediaId) || '', url: (data && data.url) || '' };
  }).catch(function (err) {
    if (isBusinessError(err)) throw err;
    return { mediaId: '', url: filePath, local: true };
  });
}

/* ---------- 管理接口 ---------- */

var listAdminExperiences = withFallback(
  function (opts) { return cloud.get('/api/admin/experiences', opts); },
  function (opts) { return local.listAdminExperiences(opts); }
);

var getAdminExperience = withFallback(
  function (id) { return cloud.get('/api/admin/experiences/' + id); },
  function (id) { return local.listAdminExperiences({}).then(function (r) {
    var items = r.items || [];
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(id)) return items[i];
    }
    var e = { code: 'NOT_FOUND', message: '这条经验不存在' };
    throw e;
  }); }
);

var saveExperience = withFallback(
  function (body) {
    if (body.id) return cloud.put('/api/admin/experiences/' + body.id, body);
    return cloud.post('/api/admin/experiences', body);
  },
  function (body) { return local.saveExperience(body); }
);

var publishExperience = withFallback(
  function (id) { return cloud.post('/api/admin/experiences/' + id + '/publish'); },
  function (id) { return local.publishExperience(id); }
);

var unpublishExperience = withFallback(
  function (id) { return cloud.post('/api/admin/experiences/' + id + '/unpublish'); },
  function (id) { return local.unpublishExperience(id); }
);

var listAdminFeedbacks = withFallback(
  function (opts) { return cloud.get('/api/admin/feedbacks', opts); },
  function (opts) { return local.listAdminFeedbacks(opts); }
);

var resolveFeedback = withFallback(
  function (id, body) { return cloud.patch('/api/admin/feedbacks/' + id, body); },
  function (id, body) { return local.resolveFeedback(id, body); }
);

var listAdminTags = withFallback(
  function () { return cloud.get('/api/admin/tags'); },
  function () { return local.listAdminTags(); }
);

var saveTag = withFallback(
  function (body) {
    if (body.id) return cloud.put('/api/admin/tags/' + body.id, body);
    return cloud.post('/api/admin/tags', body);
  },
  function (body) { return local.saveTag(body); }
);

var removeTag = withFallback(
  function (id) { return cloud.del('/api/admin/tags/' + id); },
  function (id) { return local.removeTag(id); }
);

var getStats = withFallback(
  function () { return cloud.get('/api/admin/stats'); },
  function () { return local.getStats(); }
);

/* ---------- 演示场景（开发面板用） ---------- */

function setScene (s) {
  return local.setScene(s);
}

function currentScene () {
  return local.scene();
}

/** 演示场景列表（含中文名），供开发面板渲染 */
function sceneList () {
  var out = [];
  for (var i = 0; i < local.SCENES.length; i++) {
    var k = local.SCENES[i];
    out.push({ key: k, label: local.SCENE_LABELS[k] || k });
  }
  return out;
}

module.exports = {
  login: login,
  getCategories: getCategories,
  listExperiences: listExperiences,
  getExperience: getExperience,
  listSources: listSources,
  search: search,
  getHealth: getHealth,
  getMine: getMine,
  listFavorites: listFavorites,
  addFavorite: addFavorite,
  removeFavorite: removeFavorite,
  vote: vote,
  submitFeedback: submitFeedback,
  listMyFeedbacks: listMyFeedbacks,
  uploadImage: uploadImage,
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
  setScene: setScene,
  currentScene: currentScene,
  sceneList: sceneList
};
