/* ==========================================================================
   better-life 原型工作台 · 运行时
   职责：页签 / 场景切换 / 渲染 / 导航栈。
   视觉方向已定为「C · 便签墙」，外壳不再承担多方向并排对比的职责，
   因此对比装置（★候选 / 独立浏览 / 三列排版）一并摘掉。
   ========================================================================== */
(function () {
  'use strict';

  var PAGES = [
    { id: 'home',         label: '首页',       group: '浏览', params: {} },
    { id: 'category',     label: '领域详情',   group: '浏览', params: { id: 1 } },
    { id: 'search',       label: '搜索',       group: '浏览', params: {} },
    { id: 'detail',       label: '经验详情',   group: '浏览', params: { id: 1 } },
    { id: 'source',       label: '依据来源',   group: '浏览', params: { id: 1 } },
    { id: 'mine',         label: '我的',       group: '浏览', params: {} },
    { id: 'favorites',    label: '收藏夹',     group: '浏览', params: {} },
    { id: 'feedback',     label: '反馈提交',   group: '个人', params: { id: 1 } },
    { id: 'inbox',        label: '我的反馈',   group: '个人', params: {} },
    { id: 'admin-list',   label: '管理·列表',  group: '管理', params: {} },
    { id: 'admin-edit',   label: '管理·编辑',  group: '管理', params: { id: 1 } },
    { id: 'admin-tags',   label: '管理·标签',  group: '管理', params: {} },
    { id: 'admin-feedback', label: '管理·反馈', group: '管理', params: {} },
    { id: 'about',         label: '关于与隐私', group: '个人', params: {} }
  ];

  /* 场景 = 全局演示状态。
     检索模式三档对应设计文档 §7.7 的 mode 字段（vector / keyword / degraded），
     加上默认、空中、争议三个内容状态；
     2026-11-23 补了四类状态场景：加载中 / 检索超时 / 未登录 / 网络失败 ——
     设计文档 §3.5 要求每个取数页面都有加载与错误态，
     收藏与投票也要有未登录与失败的处理（B-6 / B-7）。 */
  var SCENES = [
    { id: 'default',   label: '默认' },
    { id: 'vector',    label: '仅语义' },
    { id: 'keyword',   label: '关键词降级' },
    { id: 'demo',      label: '演示数据' },
    { id: 'empty',     label: '空状态' },
    { id: 'disputed',  label: '存在争议' },
    { id: 'loading',   label: '加载中' },
    { id: 'timeout',   label: '检索超时' },
    { id: 'anon',      label: '未登录' },
    { id: 'offline',   label: '网络失败' }
  ];

  var TAB_PAGES = { home: 1, search: 1, mine: 1 };

  /* 身份：管理员 / 普通用户 —— 用来验证设计文档 §9.2 的前端权限渲染 */
  var ROLES = [
    { id: 'admin', label: '管理员' },
    { id: 'user',  label: '普通用户' }
  ];

  var state = { page: 'home', scenario: 'default', role: 'admin' };
  var cols = {};

  /* ---------- 渲染 ---------- */
  function baseEntry () {
    var p = PAGES.filter(function (x) { return x.id === state.page; })[0] || PAGES[0];
    return { page: p.id, params: p.params };
  }

  /* 换页时清掉页内临时状态（展开的面板、选中的标签等），避免状态跨页泄漏 */
  function resetTransient () {
    if (window.LBC && typeof window.LBC.resetTransient === 'function') window.LBC.resetTransient();
  }

  function renderCol (col) {
    var dir = col.dir;
    var entry = col.stack.length ? col.stack[col.stack.length - 1] : baseEntry();
    var ctx = {
      page: entry.page,
      params: entry.params || {},
      scenario: state.scenario,
      role: state.role,
      F: window.LB,
      go: col.go,
      back: col.back,
      reset: col.reset
    };

    var screen = col.el.querySelector('.lb-screen');
    var fn = dir.pages[entry.page];
    if (!fn) {
      screen.innerHTML = '<div class="wb-missing">该页面未实现：' + entry.page + '</div>';
      return;
    }
    /* 同一页内的重渲染（投票、展开、筛选）保留滚动位置，换页才回顶部 */
    var samePage = col.lastPage === entry.page;
    var prevTop = screen.scrollTop;
    screen.setAttribute('data-role', ctx.role);
    screen.setAttribute('data-scenario', ctx.scenario);
    screen.innerHTML = fn(ctx);
    screen.scrollTop = samePage ? prevTop : 0;
    col.lastPage = entry.page;

    var crumb = col.el.querySelector('.wb-crumb');
    if (col.stack.length) {
      crumb.classList.add('on');
      crumb.querySelector('.crumb-text').textContent = '已钻取到：' + pageLabel(entry.page);
    } else {
      crumb.classList.remove('on');
    }
  }

  function pageLabel (id) {
    var p = PAGES.filter(function (x) { return x.id === id; })[0];
    return p ? p.label : id;
  }

  function renderAll () {
    Object.keys(cols).forEach(function (k) { renderCol(cols[k]); });
  }

  /* ---------- 顶部页签 ---------- */
  function buildPageTabs () {
    var host = document.getElementById('pageTabs');
    var html = '';
    PAGES.forEach(function (p) {
      html += '<button class="wb-tab" role="tab" data-page="' + p.id + '" aria-selected="' +
        (p.id === state.page ? 'true' : 'false') + '">' + p.label + '</button>';
    });
    host.innerHTML = html;
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('.wb-tab');
      if (!b) return;
      state.page = b.getAttribute('data-page');
      Array.prototype.forEach.call(host.querySelectorAll('.wb-tab'), function (x) {
        x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      });
      syncCrumbLabel();
      resetTransient();
      Object.keys(cols).forEach(function (k) { cols[k].stack = []; renderCol(cols[k]); });
    });
  }

  /* ---------- 场景切换 ---------- */
  function buildSceneTabs () {
    var host = document.getElementById('sceneTabs');
    var html = '<span class="wb-scenes-label">场景</span>';
    SCENES.forEach(function (s) {
      html += '<button class="wb-scene" data-scene="' + s.id + '" aria-pressed="' +
        (s.id === state.scenario) + '">' + s.label + '</button>';
    });
    host.innerHTML = html;
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-scene]');
      if (!b) return;
      state.scenario = b.getAttribute('data-scene');
      Array.prototype.forEach.call(host.querySelectorAll('[data-scene]'), function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      /* 场景是全局开关：切场景回到当前页签，不保留钻取 */
      resetTransient();
      Object.keys(cols).forEach(function (k) { cols[k].stack = []; renderCol(cols[k]); });
    });
  }

  /* ---------- 身份切换 ---------- */
  function buildRoleTabs () {
    var host = document.getElementById('roleTabs');
    var html = '<span class="wb-scenes-label">身份</span>';
    ROLES.forEach(function (r) {
      html += '<button class="wb-scene" data-role="' + r.id + '" aria-pressed="' +
        (r.id === state.role ? 'true' : 'false') + '">' + r.label + '</button>';
    });
    host.innerHTML = html;
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-role]');
      if (!b) return;
      state.role = b.getAttribute('data-role');
      Array.prototype.forEach.call(host.querySelectorAll('[data-role]'), function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      /* 换身份等于换了个用户，回到当前页签重新渲染 */
      resetTransient();
      Object.keys(cols).forEach(function (k) { cols[k].stack = []; renderCol(cols[k]); });
    });
  }

  /* ---------- 渲染区 ---------- */
  function buildGrid () {
    var grid = document.getElementById('grid');
    var dirs = Object.keys(window.LB_DIRS || {});
    var html = '';
    dirs.forEach(function (id) {
      var d = window.LB_DIRS[id];
      html +=
        '<section class="wb-col dir-' + id + '" data-dir="' + id + '">' +
          '<div class="wb-colhead">' +
            '<div class="wb-colname">' + d.name + '</div>' +
            '<div class="wb-coltag">' + d.tag + '</div>' +
          '</div>' +
          '<div class="wb-crumb"><button class="crumb-back"></button><span class="crumb-text"></span></div>' +
          '<div class="phone">' +
            '<div class="lb-status">' +
              '<span class="st-time">9:41</span>' +
              '<span class="st-r">' +
                '<svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor" aria-hidden="true">' +
                  '<rect x="0" y="6" width="3" height="4" rx="1"/><rect x="4.3" y="4" width="3" height="6" rx="1"/>' +
                  '<rect x="8.6" y="1.6" width="3" height="8.4" rx="1"/><rect x="12.9" y="0" width="3" height="10" rx="1" opacity=".4"/>' +
                '</svg>' +
                '<svg width="15" height="10" viewBox="0 0 15 10" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
                  '<path d="M1 3.4a9 9 0 0 1 13 0"/><path d="M3.4 6a6 6 0 0 1 8.2 0"/><circle cx="7.5" cy="8.6" r=".9" fill="currentColor" stroke="none"/>' +
                '</svg>' +
                '<svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">' +
                  '<rect x=".6" y=".6" width="18" height="9.8" rx="2.6"/><rect x="2.2" y="2.2" width="12.6" height="6.6" rx="1.4" fill="currentColor" stroke="none" opacity=".9"/>' +
                  '<path d="M20.2 4v3" stroke-linecap="round"/>' +
                '</svg>' +
              '</span>' +
            '</div>' +
            '<div class="lb-capsule" title="微信胶囊按钮占位：真机上这里是「···」与「⊙」，页面自己的按钮不能压上去">' +
              '<span class="cap-dots">···</span><span class="cap-circle">⊙</span>' +
            '</div>' +
            '<div class="lb-screen"></div>' +
            '<div class="c-toast" data-toast></div>' +
          '</div>' +
        '</section>';
    });
    grid.innerHTML = html;

    dirs.forEach(function (id) {
      var el = grid.querySelector('.wb-col[data-dir="' + id + '"]');
      var col = { id: id, dir: window.LB_DIRS[id], el: el, stack: [] };
      cols[id] = col;

      /* 导航函数挂在列对象上：页签点击与页内钻取共用同一套栈 */
      col.go = function (page, params) {
        params = params || {};
        /* 首页二次进入：品牌区收成单行 slogan（首页是回访入口，
           用户不是每次都要读一遍介绍） */
        var cur = col.stack.length ? col.stack[col.stack.length - 1] : baseEntry();
        if (cur.page === 'home' && page !== 'home' && window.LBC) window.LBC.homeSeen = true;
        resetTransient();
        if (TAB_PAGES[page]) col.stack = [{ page: page, params: params }];
        else col.stack.push({ page: page, params: params });
        renderCol(col);
      };
      col.back = function () { resetTransient(); col.stack.pop(); renderCol(col); };
      col.reset = function () { resetTransient(); col.stack = []; renderCol(col); };

      /* 方向自定义交互只绑定一次，避免每次重渲染叠加监听器 */
      var screenEl = el.querySelector('.lb-screen');
      if (col.dir.afterRender) {
        try {
          col.dir.afterRender(screenEl, {
            go: function (p, pr) { col.go(p, pr); },
            back: function () { col.back(); },
            rerender: function () { renderCol(col); },
            toast: function (msg) {
              var t = el.querySelector('[data-toast]');
              if (!t) return;
              t.textContent = msg;
              t.classList.add('on');
              if (t._timer) clearTimeout(t._timer);
              t._timer = setTimeout(function () { t.classList.remove('on'); }, 2200);
            }
          });
        } catch (e) { console.error(e); }
      }

      el.querySelector('.crumb-back').addEventListener('click', function () {
        resetTransient();
        col.stack = [];
        renderCol(col);
      });
    });

    /* 导航：统一由 data-nav 驱动 */
    grid.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-nav]');
      if (!t) return;
      var colEl = t.closest('.wb-col');
      if (!colEl) return;
      var col = cols[colEl.getAttribute('data-dir')];
      if (!col) return;
      var kind = t.getAttribute('data-nav');
      if (kind === 'back') { col.back(); return; }
      if (kind === 'page') {
        col.go(t.getAttribute('data-page'), {});
      } else {
        var params = {};
        var id = t.getAttribute('data-id');
        if (id) params.id = id;
        var cat = t.getAttribute('data-cat');
        if (cat) params.cat = cat;
        var point = t.getAttribute('data-point');
        if (point) params.point = point;
        var kind2 = t.getAttribute('data-kind');
        if (kind2) params.kind = kind2;
        col.go(kind, params);
      }
    });

    syncCrumbLabel();
  }

  /* 返回条上的按钮指向「当前页签」 */
  function syncCrumbLabel () {
    var label = pageLabel(state.page);
    Array.prototype.forEach.call(document.querySelectorAll('.crumb-back'), function (b) {
      b.textContent = '← 回到「' + label + '」';
    });
  }

  /* ---------- 启动 ---------- */
  function boot () {
    buildPageTabs();
    buildSceneTabs();
    buildRoleTabs();
    buildGrid();
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
