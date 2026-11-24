/**
 * 客户端行为自检
 *
 * 职责：把「小程序端最容易回退的几处行为」钉成断言。
 *   1. 错误码透传 —— 服务端返回的 401/404/429 必须原样到达上层
 *   2. 写操作不回落演示数据（读接口仍回落）
 *   3. 立场筛选的 id → 立场值映射
 *   4. 领域页标签筛选不取 res[1]
 *   5. 日期格式与相对时间的基准
 *   6. 正式包自动关闭开发面板与演示回落
 *   7. 投票取消时界面如实回显
 *
 * 做法：桩掉 wx.* 与存储，原样加载仓库里的 utils/*.js 与页面 JS 执行。
 * 探针只读仓库，不改任何文件。
 *
 * 用法：node scripts/verify-client-behavior.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const kit = require('./_kit');

let currentGroup = '';
const results = [];

function group (name) {
  currentGroup = name;
  kit.group(name);
}
function check (name, condition, detail) {
  kit.check(name, condition, detail);
}
function eq (name, actual, expected) {
  kit.eq(name, actual, expected);
}

/* ---------- 桩：wx 运行时 ---------- */

let wxState = {
  requestHandler: null,
  storage: {},
  toast: [],
  loginCode: 'mock-code',
  chooseMediaHandler: null
};

function makeWx () {
  return {
    getAccountInfoSync: function () {
      return { miniProgram: { envVersion: 'develop' } };
    },
    getSystemInfoSync: function () {
      return { windowWidth: 375, windowHeight: 667 };
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 6, height: 32, bottom: 38, left: 282, right: 369, width: 87 };
    },
    request: function (opt) {
      if (wxState.requestHandler) return wxState.requestHandler(opt);
      opt.fail({ errMsg: 'request:fail no handler' });
    },
    uploadFile: function (opt) {
      opt.fail({ errMsg: 'uploadFile:fail no handler' });
    },
    login: function (opt) {
      opt.success({ code: wxState.loginCode });
    },
    getFileSystemManager: function () {
      return {
        readFile: function (opt) {
          opt.success({ data: 'aGVsbG8=' });
        }
      };
    },
    setStorageSync: function (k, v) { wxState.storage[k] = v; },
    getStorageSync: function (k) {
      return Object.prototype.hasOwnProperty.call(wxState.storage, k) ? wxState.storage[k] : '';
    },
    removeStorageSync: function (k) { delete wxState.storage[k]; },
    showToast: function (opt) { wxState.toast.push(opt.title); },
    showModal: function (opt) { if (opt.success) opt.success({ confirm: true }); },
    navigateTo: function () {},
    switchTab: function () {},
    navigateBack: function () {},
    redirectTo: function () {},
    stopPullDownRefresh: function () {},
    chooseMedia: function (opt) {
      if (wxState.chooseMediaHandler) return wxState.chooseMediaHandler(opt);
      if (opt.success) opt.success({ tempFiles: [] });
    }
  };
}

/* ---------- 模块加载 ---------- */

const moduleCache = {};

function resolvePath (relPath, p) {
  let key = p.startsWith('.') ? path.normalize(path.join(path.dirname(relPath), p)) : p;
  if (key.indexOf('.js') < 0) key += '.js';
  return key.replace(/\\/g, '/');
}

function loadModule (relPath) {
  const abs = path.join(ROOT, relPath);
  /* JSON 数据文件直接解析，不当 JS 跑 */
  if (abs.slice(-5) === '.json') {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  }
  /* ⚠️ 必须缓存 —— api.js 与 auth.js 互相 require，
     不缓存会加载出两份实例，登录态存进 A 实例、业务调用读的是 B 实例。 */
  if (moduleCache[relPath]) return moduleCache[relPath].exports;
  const src = fs.readFileSync(abs, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module: module,
    exports: module.exports,
    require: function (p) { return loadModule(resolvePath(relPath, p)); },
    console: console,
    wx: makeWx(),
    Date: Date, Math: Math, JSON: JSON, Promise: Promise, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, Error: Error,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat
  };
  vm.createContext(sandbox);
  /* 先占位再执行 —— 循环 require 时拿到的是同一个对象 */
  moduleCache[relPath] = module;
  vm.runInContext(src, sandbox, { filename: abs });
  return module.exports;
}

/* ---------- 加载页面 ---------- */

function loadPage (relPath) {
  let pageDef = null;
  const abs = path.join(ROOT, relPath);
  const src = fs.readFileSync(abs, 'utf8');
  const sandbox = {
    Page: function (def) { pageDef = def; },
    Component: function () {},
    App: function () {},
    require: function (p) { return loadModule(resolvePath(relPath, p)); },
    console: console,
    wx: makeWx(),
    getApp: function () { return { globalData: {} }; },
    Date: Date, Math: Math, JSON: JSON, Promise: Promise, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, Error: Error,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: abs });
  return pageDef;
}

/** 起一个页面实例（带 setData） */
function instantiate (def) {
  const page = Object.assign({}, def);
  page.data = JSON.parse(JSON.stringify(def.data || {}));
  page.setData = function (patch) {
    for (const k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      const parts = k.split('.');
      let target = page.data;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        target = target[key];
      }
      target[parts[parts.length - 1]] = patch[k];
    }
  };
  return page;
}

function resetState () {
  wxState = {
    requestHandler: null, storage: {}, toast: [], loginCode: 'mock-code',
    chooseMediaHandler: null
  };
  Object.keys(moduleCache).forEach(function (k) { delete moduleCache[k]; });
}

/* ---------- 用例 ---------- */

function testErrorCodes () {
  group('错误码透传');
  resetState();
  const cloud = loadModule('utils/cloud.js');
  const cases = [
    [401, 'UNAUTHORIZED', '请先登录'],
    [404, 'NOT_FOUND', '这条经验不存在'],
    [429, 'RATE_LIMITED', '太频繁了'],
    [403, 'FORBIDDEN', '没有权限']
  ];
  let chain = Promise.resolve();
  for (const c of cases) {
    chain = chain.then(function () {
      wxState.requestHandler = function (opt) {
        opt.success({
          statusCode: c[0],
          data: { ok: false, error: { code: c[1], message: c[2] } }
        });
      };
      return cloud.get('/api/me').then(function () {
        check(c[0] + ' 不该 resolve', false, '居然 resolve 了');
      }).catch(function (err) {
        eq(c[0] + ' 的错误码原样透传', err.code, c[1]);
        eq(c[0] + ' 的错误消息也带过来', err.message, c[2]);
      });
    });
  }
  return chain.then(function () {
    /* 没有错误包时按状态码归类，别一律当 HTTP */
    wxState.requestHandler = function (opt) {
      opt.success({ statusCode: 401, data: '' });
    };
    return cloud.get('/api/me').catch(function (err) {
      eq('没有错误包时按状态码归类', err.code, 'UNAUTHORIZED');
    });
  }).then(function () {
    /* 网络不通与超时是另一类，不能当业务错误 */
    wxState.requestHandler = function (opt) {
      opt.fail({ errMsg: 'request:fail timeout' });
    };
    return cloud.get('/api/me').catch(function (err) {
      eq('超时的错误码', err.code, 'TIMEOUT');
    });
  });
}

function testWriteNoFallback () {
  group('写操作不回落');
  resetState();
  /* 业务接口一律 401；登录单独放行 */
  wxState.requestHandler = function (opt) {
    if (opt.url.indexOf('/api/auth/login') >= 0) {
      opt.success({ statusCode: 200, data: { ok: true, data: { token: 'mock-token', user: { role: 'user' } } } });
      return;
    }
    opt.success({ statusCode: 401, data: { ok: false, error: { code: 'UNAUTHORIZED', message: '请先登录' } } });
  };
  /* ⚠️ 顺序要紧：先 load api —— 它会把 auth 一起拉进来，
     两者共用同一个缓存实例。顺序反了的话，
     auth 加载时 api 还没加载完，require('./api') 拿到的是空壳。 */
  const api = loadModule('utils/api.js');
  /* 预置登录态 —— ensureLogin 内部要调 api.login，
     那条路走 withFallback，登录 401 会回落演示数据，
     分不清是「登录挂了」还是「写操作回落了」。 */
  loadModule('utils/auth.js').setSession('mock-token', { role: 'user' });

  const writes = [
    ['收藏', function () { return api.addFavorite(2); }],
    ['取消收藏', function () { return api.removeFavorite(2); }],
    ['投票', function () { return api.vote(3, true); }],
    ['提交反馈', function () { return api.submitFeedback({ kind: 'suggestion', content: 'x' }); }],
    ['保存经验', function () { return api.saveExperience({ title: 'x' }); }],
    ['发布', function () { return api.publishExperience(3); }],
    ['下线', function () { return api.unpublishExperience(3); }],
    ['处理反馈', function () { return api.resolveFeedback(1, { status: 'accepted' }); }]
  ];
  let chain = Promise.resolve();
  for (const w of writes) {
    chain = chain.then(function () {
      return w[1]().then(function () {
        check(w[0] + '失败时不该 resolve（说明回落了演示数据）', false, '居然成功了');
      }).catch(function (err) {
        eq(w[0] + '失败抛出的错误码', err.code, 'UNAUTHORIZED');
      });
    }, function (err) {
      /* ⚠️ 这条不该走到 —— withAuth 会把错误转成 reject，
         上面的 catch 会接住。这里只是防止整条链崩掉，
         并把出问题的写操作名字报出来。 */
      check(w[0] + ' 的失败被正确接住', false,
        '未被接住的错误：' + JSON.stringify(err));
    });
  }
  return chain.then(function () {
    /* 读接口仍然回落 —— 这是设计好的行为。
       ⚠️ 但回落只对「网络/超时/5xx」生效：
       401/404 属于业务错误，读接口也一样直接抛出来。
       所以这里让读接口返回 503（服务端故障）才验回落。 */
    wxState.requestHandler = function (opt) {
      if (opt.url.indexOf('/api/auth/login') >= 0) {
        opt.success({ statusCode: 200, data: { ok: true, data: { token: 'mock-token', user: { role: 'user' } } } });
        return;
      }
      opt.success({ statusCode: 503, data: { ok: false, error: { code: 'SERVER', message: '服务异常' } } });
    };
    return api.getCategories().then(function (res) {
      eq('读接口在服务端故障时回落演示数据', res.source, 'demo');
    });
  }).then(function () {
    /* 读接口遇到业务错误（404）不该回落 —— 那是「真的没有」 */
    wxState.requestHandler = function (opt) {
      if (opt.url.indexOf('/api/auth/login') >= 0) {
        opt.success({ statusCode: 200, data: { ok: true, data: { token: 'mock-token', user: { role: 'user' } } } });
        return;
      }
      opt.success({ statusCode: 404, data: { ok: false, error: { code: 'NOT_FOUND', message: '没有这条' } } });
    };
    return api.getCategories().then(function () {
      check('读接口遇到 404 不该回落演示数据', false, '居然回落了');
    }).catch(function (err) {
      eq('读接口遇到 404 抛的是业务错误', err.code, 'NOT_FOUND');
    });
  });
}

function testStanceFilter () {
  group('立场筛选');
  resetState();
  const def = loadPage('pages/search/search.js');
  const page = instantiate(def);
  wxState.requestHandler = function (opt) {
    opt.success({ statusCode: 200, data: { ok: true, data: { items: [], mode: 'keyword' } } });
  };
  page.setData({ q: '洗发水' });
  page.onStance({ detail: { value: 1 } });
  check('选了「含推荐」后 stance 是 good', page.data.stance === 'good', '实际 ' + page.data.stance);
  page.onStance({ detail: { value: 2 } });
  check('选了「含避雷」后 stance 是 bad', page.data.stance === 'bad', '实际 ' + page.data.stance);
  page.onStance({ detail: { value: 3 } });
  check('选了「含中立」后 stance 是 neutral', page.data.stance === 'neutral', '实际 ' + page.data.stance);
  page.onStance({ detail: { value: 0 } });
  check('取消筛选后 stance 是空', page.data.stance === '', '实际 ' + page.data.stance);
  return Promise.resolve();
}

function testCategoryFilter () {
  group('领域页筛选');
  resetState();
  const def = loadPage('pages/category/category.js');
  const page = instantiate(def);
  wxState.requestHandler = function (opt) {
    opt.success({ statusCode: 200, data: { ok: true, data: { items: [], total: 0 } } });
  };
  page.setData({ categoryId: 1, tagId: 3 });
  /* applyFilter 没返回 promise —— 等一小会儿再断言结果 */
  page.applyFilter();
  return new Promise(function (resolve) { setTimeout(resolve, 50); }).then(function () {
    check('标签筛选不报错', !page.data.error, '错误是「' + page.data.error + '」');
  });
}

function testDates () {
  group('日期与相对时间');
  resetState();
  const format = loadModule('utils/format.js');
  eq('ISO 时间串截到日期部分', format.date('2026-10-12T00:00:00.000Z'), '2026-10-12');
  eq('已经是 YYYY-MM-DD 的原样返回', format.date('2026-10-12'), '2026-10-12');
  eq('空值返回空串', format.date(''), '');
  eq('演示数据用固定基准日', format.ago('2026-11-19', true), '今天');
  check('服务端数据用真实时间（不会永远是「今天」）',
    format.ago('2026-11-19', false) !== '今天',
    '实际「' + format.ago('2026-11-19', false) + '」');
}

function testReleaseConfig () {
  group('正式包配置');
  resetState();
  const config = loadModule('config/index.js');
  check('开发态开开发面板', config.devPanel === true);
  check('开发态允许回落演示数据', config.demoFallback === true);

  /* 正式包：换掉 wx.getAccountInfoSync 再加载一次 */
  resetState();
  const wxRelease = makeWx();
  wxRelease.getAccountInfoSync = function () {
    return { miniProgram: { envVersion: 'release' } };
  };
  const abs = path.join(ROOT, 'config/index.js');
  const src = fs.readFileSync(abs, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module: module, exports: module.exports,
    require: function () { return {}; },
    console: console, wx: wxRelease,
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, Error: Error
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: abs });
  eq('正式包关闭开发面板', module.exports.devPanel, false);
  eq('正式包关闭演示数据回落', module.exports.demoFallback, false);
  eq('正式包环境标记', module.exports.env, 'release');
}

function testVoteEcho () {
  group('投票回显');
  resetState();
  wxState.requestHandler = function (opt) {
    /* 服务端返回 useful=null = 取消投 */
    opt.success({ statusCode: 200, data: { ok: true, data: { usefulCount: 3, notUsefulCount: 1, useful: null } } });
  };
  const def = loadPage('pages/detail/detail.js');
  const page = instantiate(def);
  page.setData({ id: 1 });
  return page.doVote(1, true, 0).then(function () {
    check('取消投时 voted 清空', page.data.voted === '', '实际「' + page.data.voted + '」');
    check('提示是「已取消投票」', wxState.toast.join('|').indexOf('取消') >= 0,
      '实际提示：' + wxState.toast.join('|'));
  });
}

function testAdminStatusFilter () {
  group('管理端状态筛选');
  resetState();
  const seen = [];
  wxState.requestHandler = function (opt) {
    seen.push(opt.url);
    if (opt.url.indexOf('/api/admin/stats') >= 0) {
      opt.success({ statusCode: 200, data: { ok: true, data: { published: 0, drafts: 0, pendingFeedback: 0, sources: 0, tags: 0 } } });
      return;
    }
    if (opt.url.indexOf('/api/admin/experiences') >= 0) {
      opt.success({ statusCode: 200, data: { ok: true, data: { items: [], total: 0 } } });
      return;
    }
    opt.success({ statusCode: 200, data: { ok: true, data: {} } });
  };
  const def = loadPage('pages/admin/list/list.js');
  const page = instantiate(def);
  page.setData({ allowed: true, q: '', cat: 0, status: '' });
  page.setStatus({ currentTarget: { dataset: { id: 'draft' } } });
  return new Promise(function (resolve) { setTimeout(resolve, 80); }).then(function () {
    check('状态筛选写进页面状态', page.data.status === 'draft', '实际 ' + page.data.status);
    const hit = seen.filter(function (u) {
      return u.indexOf('/api/admin/experiences') >= 0 && u.indexOf('status=draft') >= 0;
    });
    check('请求里带上了 status=draft', hit.length > 0, seen.join(' | '));
  });
}

function testAdminDelete () {
  group('管理端删除入口');
  resetState();
  const seen = [];
  wxState.requestHandler = function (opt) {
    seen.push((opt.method || 'GET') + ' ' + opt.url);
    if (opt.url.indexOf('/api/auth/login') >= 0) {
      opt.success({ statusCode: 200, data: { ok: true, data: { token: 'mock-token', user: { role: 'admin' } } } });
      return;
    }
    opt.success({ statusCode: 200, data: { ok: true, data: {} } });
  };
  const def = loadPage('pages/admin/list/list.js');
  const page = instantiate(def);
  page.setData({ allowed: true, items: [{ id: 7, title: '要删的经验' }] });
  page.remove({ currentTarget: { dataset: { id: 7, title: '要删的经验' } } });
  return new Promise(function (resolve) { setTimeout(resolve, 100); }).then(function () {
    check('发出了 DELETE /api/admin/experiences/:id',
      seen.some(function (u) {
        return u.indexOf('DELETE') >= 0 && u.indexOf('/api/admin/experiences/7') >= 0;
      }),
      seen.join(' | '));
  });
}

function testAuthRetry () {
  group('登录过期重试');
  resetState();
  const api = loadModule('utils/api.js');
  loadModule('utils/auth.js').setSession('expired-token', { role: 'user' });
  let attempts = 0;
  let logins = 0;
  wxState.requestHandler = function (opt) {
    if (opt.url.indexOf('/api/auth/login') >= 0) {
      logins++;
      opt.success({ statusCode: 200, data: { ok: true, data: { token: 'fresh-token', user: { role: 'user' } } } });
      return;
    }
    attempts++;
    if (attempts === 1) {
      opt.success({ statusCode: 401, data: { ok: false, error: { code: 'UNAUTHORIZED', message: '登录已过期' } } });
    } else {
      opt.success({ statusCode: 200, data: { ok: true, data: { favoriteCount: 1 } } });
    }
  };
  return api.addFavorite(2).then(function () {
    eq('过期后重新登录一次', logins, 1);
    eq('写请求只重试一次', attempts, 2);
    eq('新令牌已写入登录态', loadModule('utils/auth.js').getToken(), 'fresh-token');
  });
}

function testRoleIdentity () {
  group('角色身份');
  resetState();
  const role = loadModule('utils/role.js');
  const auth = loadModule('utils/auth.js');
  role.setRole('admin');
  check('无服务端登录态时演示角色可用', role.isAdmin());
  auth.setSession('real-token', { role: 'user' });
  role.setRole('admin');
  check('真实用户身份优先于本地演示角色', !role.isAdmin());
}

function testHomePaginationAndStaleResponses () {
  group('首页分页与竞态');
  resetState();
  const def = loadPage('pages/home/home.js');
  const page = instantiate(def);
  const seen = [];
  wxState.requestHandler = function (opt) {
    seen.push(opt.url);
    const match = opt.url.match(/[?&]page=(\d+)/);
    const pageNo = match ? Number(match[1]) : 1;
    opt.success({ statusCode: 200, data: { ok: true, data: {
      items: [{ id: pageNo, title: '第' + pageNo + '条', summary: '结论', updatedAt: '2026-11-20' }],
      total: 11, page: pageNo, size: 10
    } } });
  };
  return page.loadList(false).then(function () {
    check('第一页请求 page=1', /[?&]page=1(?:&|$)/.test(seen[0]), seen[0]);
    check('第一页按总数识别还有下一页', page.data.hasMore);
    return page.loadList(true);
  }).then(function () {
    check('第二页请求 page=2', /[?&]page=2(?:&|$)/.test(seen[1]), seen[1]);
    eq('翻页后追加两条卡片', page.data.cards.length, 2);
    check('第二页后没有更多数据', !page.data.hasMore);
    const pending = [];
    wxState.requestHandler = function (opt) { pending.push(opt); };
    const oldRequest = page.loadList(false);
    const newRequest = page.loadList(false);
    pending[1].success({ statusCode: 200, data: { ok: true, data: {
      items: [{ id: 20, title: '最新结果', summary: '新结论', updatedAt: '2026-11-24' }],
      total: 1, page: 1, size: 10
    } } });
    return newRequest.then(function () {
      pending[0].success({ statusCode: 200, data: { ok: true, data: {
        items: [{ id: 1, title: '过期结果', summary: '旧结论', updatedAt: '2026-11-01' }],
        total: 1, page: 1, size: 10
      } } });
      return oldRequest;
    }).then(function () {
      eq('过期响应不会覆盖最新列表', page.data.cards.length, 1);
      eq('最新列表标题保持不变', page.data.cards[0].title, '最新结果');
    });
  });
}

function testSearchStaleResponsesAndHighlights () {
  group('搜索竞态与高亮');
  resetState();
  const page = instantiate(loadPage('pages/search/search.js'));
  const pending = [];
  wxState.requestHandler = function (opt) { pending.push(opt); };
  const oldSearch = page.doSearch('旧查询');
  const newSearch = page.doSearch('新查询');
  pending[1].success({ statusCode: 200, data: { ok: true, data: {
    items: [{ experience: { id: 3, title: '新查询经验', summary: '新查询结论', updatedAt: '2026-11-24' },
      matchedOn: 'title', highlights: { title: [['新查询', true], ['经验', false]] } }],
    total: 1, mode: 'keyword'
  } } });
  return newSearch.then(function () {
    eq('搜索高亮被传到卡片视图', page.data.cards[0].titleParts[0].on, true);
    eq('新查询写入历史', page.data.hist[0], '新查询');
    pending[0].success({ statusCode: 200, data: { ok: true, data: {
      items: [{ experience: { id: 1, title: '旧查询经验', summary: '旧结论', updatedAt: '2026-11-01' }, highlights: {} }],
      total: 1, mode: 'keyword'
    } } });
    return oldSearch;
  }).then(function () {
    eq('旧搜索响应不会覆盖新结果', page.data.cards[0].title, '新查询经验');
    const pendingSearch = page.doSearch('第三查询');
    page.clearInput();
    pending[2].success({ statusCode: 200, data: { ok: true, data: {
      items: [{ experience: { id: 4, title: '不应显示', summary: '' }, highlights: {} }],
      total: 1, mode: 'keyword'
    } } });
    return pendingSearch.then(function () {
      check('清空输入后迟到响应不会恢复结果', !page.data.searched && page.data.cards.length === 0);
    });
  });
}

function testFeedbackSafetyAndUploadLock () {
  group('反馈安全与上传锁');
  resetState();
  loadModule('utils/auth.js').setSession('real-token', { role: 'user' });
  const page = instantiate(loadPage('pages/feedback/feedback.js'));
  page.onLoad({ title: '%E0%A4%A' });
  eq('非法 URI 标题不会抛错', page.data.targetTitle, '%E0%A4%A');
  let pendingUpload = null;
  let chooserCalls = 0;
  wxState.requestHandler = function (opt) {
    if (opt.url.indexOf('/api/upload') >= 0) pendingUpload = opt;
    else opt.success({ statusCode: 200, data: { ok: true, data: {} } });
  };
  wxState.chooseMediaHandler = function () { chooserCalls++; };
  page.uploadAll(['image.png']);
  check('上传期间锁定选图入口', page.data.uploading && chooserCalls === 0);
  page.chooseImage();
  eq('上传期间不会再次打开选图器', chooserCalls, 0);
  return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
    check('上传请求已经发出', !!pendingUpload, page.data.hint);
    check('图片字节提交到上传接口', pendingUpload && pendingUpload.url.indexOf('/api/upload') >= 0,
      pendingUpload && pendingUpload.url);
    page.onUnload();
    pendingUpload.success({ statusCode: 200, data: { ok: true, data: { mediaId: 'media-1', url: 'https://example.com/1.png' } } });
    return Promise.resolve();
  }).then(function () {
    eq('页面退出后迟到上传不会写入图片', page.data.images.length, 0);
  });
}

function testEditorDateClearing () {
  group('编辑日期清空');
  resetState();
  const page = instantiate(loadPage('pages/admin/edit/edit.js'));
  page.setData({ id: 1, title: '标题', summary: '结论', body: '', nextReviewAt: '' });
  eq('清空复审日期时显式提交 null', page.buildPayload().nextReviewAt, null);
}

/* ---------- 入口 ---------- */

const ROOT = path.resolve(__dirname, '..');

testErrorCodes()
  .then(testWriteNoFallback)
  .then(testStanceFilter)
  .then(testCategoryFilter)
  .then(testDates)
  .then(testReleaseConfig)
  .then(testVoteEcho)
  .then(testAdminStatusFilter)
  .then(testAdminDelete)
  .then(testAuthRetry)
  .then(testRoleIdentity)
  .then(testHomePaginationAndStaleResponses)
  .then(testSearchStaleResponsesAndHighlights)
  .then(testFeedbackSafetyAndUploadLock)
  .then(testEditorDateClearing)
  .then(function () {
    const failed = kit.report('客户端行为自检');
    process.exit(failed ? 1 : 0);
  })
  .catch(function (err) {
    console.error('自检崩了（当前分组：' + currentGroup + '）：' +
      (err && err.stack ? err.stack : JSON.stringify(err)));
    process.exit(1);
  });
