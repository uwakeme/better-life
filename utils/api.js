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
var config = require('../config/index');

function getLocal () {
  return require('./local');
}

/** 这些错误是「真错误」，不能用演示数据顶替 */
function isBusinessError (err) {
  if (!err || !err.code) return false;
  var c = err.code;
  return c === 'UNAUTHORIZED' || c === 'FORBIDDEN' || c === 'NOT_FOUND' ||
    c === 'CONTENT_REJECTED' || c === 'RATE_LIMITED' || c === 'VALIDATION';
}

function mark (data, source) {
  if (data && typeof data === 'object' && !data.source) data.source = source;
  /* 列表里的每一项也标上来源 ——
     相对时间要按来源分别用固定基准日（演示）与真实时间（服务端），
     只在外层标一下的话，页面里的每条卡片分不出来。 */
  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    for (var i = 0; i < data.items.length; i++) {
      if (data.items[i] && typeof data.items[i] === 'object' && !data.items[i].source) {
        data.items[i].source = source;
      }
    }
  }
  return data;
}

/**
 * 组合一次调用：后端优先，失败回落
 * @param {function} remote 走后端的调用
 * @param {string|function} localCall 本地演示方法名或独立回落函数，仅开发态调用
 */
function withFallback (remote, localCall) {
  return function () {
    var args = arguments;
    var runLocal = function () {
      return Promise.resolve().then(function () {
        var call = typeof localCall === 'function' ? localCall : getLocal()[localCall];
        if (!call) throw new Error('缺少演示方法：' + localCall);
        return call.apply(null, args);
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

/**
 * 写操作：**不回落**演示数据。
 *
 * ⚠️ 之前收藏 / 投票 / 反馈 / 发布全走 withFallback，
 *    服务端返回 401 时错误码被吞成 HTTP，上层以为「网络不好」，
 *    于是回落到 local.* —— 界面提示「已收藏」「已发布」，
 *    实际上服务端一条记录都没写。数据只落在本机的假数据里。
 *
 * 写操作要么真成功，要么如实报错。演示数据只留给读接口。
 */
function writeOnly (remote) {
  return function () {
    var args = arguments;
    return remote.apply(null, args).then(function (data) {
      return mark(data, 'server');
    });
  };
}

/**
 * 写操作前置：确保已登录。
 * 没 token 就静默登录一次；服务端回 401 说明 token 过期或无效，
 * 这时重登一次再重试 —— token 有 7 天有效期，不能让用户卡在「一直未登录」。
 */
function ensureLogin () {
  var auth = require('./auth');
  return auth.ensureLogin();
}

/** 需要登录的写调用：先确保登录，再发请求 */
function withAuth (remote) {
  return function () {
    var args = arguments;
    var auth = require('./auth');
    var attempt = function (retried) {
      return remote.apply(null, args).catch(function (err) {
        if (!err || err.code !== 'UNAUTHORIZED' || retried) throw err;
        auth.clear();
        return ensureLogin().then(function () {
          return attempt(true);
        });
      });
    };
    return ensureLogin().then(function () {
      return attempt(false);
    });
  };
}

/* ---------- 公开接口 ---------- */

function login (code) {
  return withFallback(
    function () { return cloud.post('/api/auth/login', { code: code }); },
    'login'
  )();
}

var getCategories = withFallback(
  function () { return cloud.get('/api/categories'); },
  'getCategories'
);

var listExperiences = withFallback(
  function (opts) { return cloud.get('/api/experiences', opts); },
  'listExperiences'
);

var getExperience = withFallback(
  function (id) { return cloud.get('/api/experiences/' + id); },
  'getExperience'
);

var listSources = withFallback(
  function (id) { return cloud.get('/api/experiences/' + id + '/sources'); },
  'listSources'
);

var search = withFallback(
  function (body) { return cloud.post('/api/search', body); },
  'search'
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
  function () {
    return cloud.get('/api/me').then(function (data) {
      var auth = require('./auth');
      if (data && data.user && (data.user.role === 'admin' || data.user.role === 'user')) {
        auth.setSession(auth.getToken(), data.user);
      }
      return data;
    });
  },
  'getMine'
);

var listFavorites = withFallback(
  function (opts) { return cloud.get('/api/me/favorites', opts); },
  'listFavorites'
);

var addFavorite = withAuth(
  function (id) { return cloud.post('/api/me/favorites/' + id); }
);

var removeFavorite = withAuth(
  function (id) { return cloud.del('/api/me/favorites/' + id); }
);

var vote = withAuth(
  function (id, useful) { return cloud.post('/api/me/votes/' + id, { useful: useful }); }
);

var submitFeedback = withAuth(
  function (body) { return cloud.post('/api/feedbacks', body); }
);

var listMyFeedbacks = withFallback(
  function () { return cloud.get('/api/me/feedbacks'); },
  'listMyFeedbacks'
);

/**
 * 上传反馈附图
 *
 * ⚠️ 失败必须如实报错，不能回落成「本地临时路径」。
 *    之前失败时返回 { url: 'wxfile://tmp/xxx', local: true }，
 *    页面照样提示「图片已附上」，但那个路径只在提交者自己手机上存在，
 *    管理员在另一台设备上打不开 —— 附图等于没附上。
 */
function uploadImage (filePath) {
  return withAuth(function () {
    return cloud.upload(filePath, { path: '/api/upload' });
  })().then(function (data) {
    return { mediaId: (data && data.mediaId) || '', url: (data && data.url) || '' };
  });
}

/* ---------- 管理接口 ---------- */

var listAdminExperiences = withFallback(
  function (opts) { return cloud.get('/api/admin/experiences', opts); },
  'listAdminExperiences'
);

var getAdminExperience = withFallback(
  function (id) { return cloud.get('/api/admin/experiences/' + id); },
  'getAdminExperience'
);

var saveExperience = withAuth(
  function (body) {
    if (body.id) return cloud.put('/api/admin/experiences/' + body.id, body);
    return cloud.post('/api/admin/experiences', body);
  }
);

var publishExperience = withAuth(
  function (id) { return cloud.post('/api/admin/experiences/' + id + '/publish'); }
);

var unpublishExperience = withAuth(
  function (id) { return cloud.post('/api/admin/experiences/' + id + '/unpublish'); }
);

/* 删除是破坏性操作 —— 界面上必须先二次确认（列表页） */
var deleteExperience = withAuth(
  function (id) { return cloud.del('/api/admin/experiences/' + id); }
);

var listAdminFeedbacks = withFallback(
  function (opts) { return cloud.get('/api/admin/feedbacks', opts); },
  'listAdminFeedbacks'
);

var resolveFeedback = withAuth(
  function (id, body) { return cloud.patch('/api/admin/feedbacks/' + id, body); }
);

var listAdminTags = withFallback(
  function () { return cloud.get('/api/admin/tags'); },
  'listAdminTags'
);

var saveTag = withAuth(
  function (body) {
    if (body.id) return cloud.put('/api/admin/tags/' + body.id, body);
    return cloud.post('/api/admin/tags', body);
  }
);

var removeTag = withAuth(
  function (id) { return cloud.del('/api/admin/tags/' + id); }
);

var getStats = withFallback(
  function () { return cloud.get('/api/admin/stats'); },
  'getStats'
);

/* ---------- 演示场景（开发面板用） ---------- */

function setScene (s) {
  if (!config.devPanel) return 'default';
  return getLocal().setScene(s);
}

function currentScene () {
  if (!config.devPanel) return 'default';
  return getLocal().scene();
}

/** 演示场景列表（含中文名），供开发面板渲染 */
function sceneList () {
  if (!config.devPanel) return [];
  var local = getLocal();
  var out = [];
  for (var i = 0; i < local.SCENES.length; i++) {
    var k = local.SCENES[i];
    out.push({ key: k, label: local.SCENE_LABELS[k] || k });
  }
  return out;
}

module.exports = {
  login: login,
  ensureLogin: ensureLogin,
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
  deleteExperience: deleteExperience,
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
