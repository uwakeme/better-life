/* ==========================================================================
   方向 C · 便签墙 —— 公共零件 + 首页 / 领域详情 / 搜索

   本轮（2026-11-23 · 审查报告 v2 落地）改了什么：
   ① 搜索页补齐五个状态：默认 / 输入中 / 结果 / 无结果 / 超时。
      原来只画了「已有查询、已有结果」这一种，最容易流失的四个瞬间全留给实现阶段。
   ② 搜索筛选折叠成一行，首屏不再被 10 个领域 pill 占掉约 300px。
   ③ 便签颜色按经验 id 固定 —— 同一张卡在首页、搜索页、收藏夹里是同一个颜色。
      原来按列表序号取色，同一条经验换个页面就换颜色，用户会读成分类。
   ④ 领域页统一按 updated_at 排序，补「全部」标签出口，空态文案按场景分开。
   ⑤ 首页品牌区二次进入收成单行 slogan，删掉与搜索框重复的手写引导，总数只留一处。
   ⑥ 中立立场不再用问号：问号在用户眼里是「不确定 / 存疑」，
      中立是「因人而异」；问号留给「有争议」。立场贴纸补上文字（颜色 + 符号 + 文字三通道）。

   两条老口径（2026-11-20 审核修订）：
   ① 立场贴纸只出现在「要点」上（设计文档 §2.3）。经验本身有好有坏，
      一条经验里有 1 条避雷要点就把整张卡贴成红 ✕，读者会误读成
      「这条经验是避雷」—— 所以经验卡只写「N 推荐 · M 避雷」这种计数。
   ② 首页首屏要能见到结论：领域从九宫格压成横向一条，首屏留得下经验卡。
   ========================================================================== */
(function () {
  'use strict';
  var LB = window.LB;

  var B = (window.LB_DIRS = window.LB_DIRS || {});
  B.c = B.c || {
    id: 'c', name: 'C · 便签墙',
    tag: '暖粉纸 · 多色便签 · 粗黑标题+楷书批注 · 大圆角硬阴影 · 贴纸式骨架',
    pages: {}, afterRender: null
  };
  B.c.pages = B.c.pages || {};

  var COLORS = ['s-lemon', 's-mint', 's-peach', 's-sky', 's-lilac', 's-cream', 's-wheat', 's-slate'];
  /* 立场符号：颜色 + 符号 + 文字，三个通道都不靠单一颜色。
     中立用破折号 —— 问号留给「存疑 / 有争议」，那才是问号在用户心里的意思。 */
  var SYM = { good: '✓', bad: '✕', neutral: '—' };
  var STANCE_CLASS = { good: 'c-stance-good', bad: 'c-stance-bad', neutral: 'c-stance-neutral' };
  /* 联想面板的空态：本地没有可匹配的标题 / 标签时，别给一个空盒子 */
  var SUGGEST_NONE = '本地内容里没有匹配的词，直接按「搜索」试试。';

  /* 搜索页不统计「大家常搜」—— 那要把所有人的搜索词记到服务端，
     既多一份要维护、要脱敏的数据，又和 "只记本机历史" 的口径打架。
     所以默认态只给两样东西：用户自己的历史（存在本机）+ 最近收录的内容。

     输入过程中的联想词同样不依赖任何搜索记录：
     从本地已有的经验标题与标签里就地匹配（内容本来就已经拉到本地了）。 */
  function localSuggestions (input) {
    var q = String(input || '').trim().toLowerCase();
    var out = [];
    var push = function (s) {
      s = String(s || '').trim();
      if (s && out.indexOf(s) < 0 && out.length < 6) out.push(s);
    };
    /* 先给用户自己搜过的词（本机历史），再给库里的标签、标题 */
    LBC.hist.forEach(push);
    LB.published().forEach(function (e) {
      (e.tags || []).forEach(function (t) {
        if (!q || t.toLowerCase().indexOf(q) >= 0) push(t);
      });
    });
    LB.published().forEach(function (e) {
      if (!q || e.title.toLowerCase().indexOf(q) >= 0) push(e.title);
    });
    return out;
  }

  /* ---------- 收藏：原型内的本地状态，按身份分开（切身份不该带着收藏数走） ---------- */
  var favState = {};
  function baseFavIds () {
    return LB.experiences.filter(function (e) { return e.favs > 100; }).slice(0, 5)
      .map(function (e) { return e.id; });
  }

  var LBC = {
    /* 领域便签簇按顺序取色（9 个领域固定，顺序固定，不会变） */
    color: function (i) { return COLORS[i % COLORS.length]; },
    /* 经验卡按 id 取色：同一条经验在任何页面都是同一个颜色。
       原来按「列表里的第几个」取色 —— 同一条经验在首页是柠檬色、
       在搜索页是天蓝色、在详情页又变桃色，颜色不承载任何信息，
       却被用户读成分类或状态。 */
    colorOf: function (exp) {
      var id = exp && exp.id ? exp.id : 0;
      return COLORS[id % COLORS.length];
    },
    sticker: function (k, small) {
      var label = LB.stance[k] ? LB.stance[k].short : k;
      return '<span class="c-sticker ' + k + (small ? ' sm' : '') + '">' +
        '<span class="c-sticker-sym">' + SYM[k] + '</span>' +
        '<span class="c-sticker-t">' + label + '</span></span>';
    },
    stanceRow: function (k) {
      return '<span class="c-stance-row ' + (STANCE_CLASS[k] || '') + '">' +
        '<span class="c-dot ' + k + '"></span>' + LB.stance[k].label + '</span>';
    },
    tabbar: function (active, role) {
      var items = [
        { id: 'home', label: '首页', icon: 'grid' },
        { id: 'search', label: '找经验', icon: 'search' },
        { id: 'mine', label: '我的', icon: 'user' }
      ];
      /* 红点只给有待回复反馈的那个身份 —— 管理员自己不会等回复 */
      var badge = LBC.noticeCount(role || 'user');
      return '<div class="c-tabbar">' + items.map(function (it) {
        return '<button class="c-tab' + (it.id === active ? ' on' : '') +
          '" data-nav="page" data-page="' + it.id + '">' + LB.icon(it.icon) +
          '<span>' + it.label + (it.id === 'mine' && badge ? '<i class="c-tab-dot"></i>' : '') + '</span></button>';
      }).join('') + '</div>';
    },
    back: function (label) {
      return '<button class="c-back" data-nav="back">' + LB.icon('back') + (label || '返回') + '</button>';
    },
    /* 经验卡：没有立场贴纸，只给计数（口径见文件头） */
    card: function (exp, i, hit, terms) {
      var cat = LB.catById(exp.cat);
      var good = exp.points.filter(function (p) { return p.s === 'good'; }).length;
      var bad = exp.points.filter(function (p) { return p.s === 'bad'; }).length;
      var draft = exp.status === 'draft';
      return '<button class="c-card c-note ' + LBC.colorOf(exp) + '" data-nav="detail" data-id="' + exp.id + '">' +
        (hit ? '<span class="c-chip" style="margin-bottom:8px;display:inline-block">' + LB.esc(hit) + '</span>' : '') +
        '<span class="c-card-t">' + LB.hl(exp.title, terms) + '</span>' +
        '<span class="c-card-s">' + LB.hl(exp.summary, terms) + '</span>' +
        '<span class="c-card-m"><span class="c-chip">' + LB.esc(cat.name) + '</span>' +
          (draft ? '<span class="c-chip">草稿</span>' : '') +
          '<span>' + good + ' 推荐 · ' + bad + ' 避雷</span>' +
          '<span>更新 ' + LB.ago(exp.updatedAt) + '</span></span>' +
        '</button>';
    },
    empty: function (t, s, btn) {
      return '<div class="c-empty"><div class="c-empty-t">' + t + '</div>' +
        '<div class="c-empty-s">' + s + '</div>' +
        (btn ? '<span class="c-empty-b">' + btn + '</span>' : '') + '</div>';
    },
    /* 骨架屏：列表页用占位便签，不用转圈（设计文档 §3.5） */
    skeleton: function (n, cls) {
      var h = '<div class="c-list c-skel-list">';
      for (var i = 0; i < n; i++) {
        h += '<div class="c-skel c-note ' + (cls || '') + '">' +
          '<span class="c-skel-l w60"></span>' +
          '<span class="c-skel-l w90"></span>' +
          '<span class="c-skel-l w45"></span></div>';
      }
      return h + '</div>';
    },
    /* 联想候选：供搜索页渲染与输入时就地更新共用一份逻辑 */
    suggest: function (input) { return localSuggestions(input); },
    suggestHtml: function (input) {
      var list = localSuggestions(input);
      if (!list.length) return '<div class="c-suggest-none">' + SUGGEST_NONE + '</div>';
      return list.map(function (s) {
        return '<button class="c-suggest-i" data-act="search-suggest" data-q="' + LB.esc(s) + '">' +
          LB.icon('search') + '<span>' + LB.esc(s) + '</span></button>';
      }).join('');
    },
    isFav: function (id, role) {
      var r = role || 'admin';
      if (favState[r] && Object.prototype.hasOwnProperty.call(favState[r], id)) return !!favState[r][id];
      return baseFavIds().indexOf(Number(id)) >= 0;
    },
    setFav: function (id, on, role) {
      var r = role || 'admin';
      favState[r] = favState[r] || {};
      favState[r][id] = on ? LB.today : false;
      return !!favState[r][id];
    },
    favList: function (role) {
      var r = role || 'admin';
      var list = LB.experiences.filter(function (e) {
        if (e.status !== 'published') return false;
        return LBC.isFav(e.id, r);
      });
      /* 收藏夹排序：按收藏时间（新收藏在前）还是按更新时间，交给用户选 */
      if (LBC.favSort === 'updated') {
        list.sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
      } else {
        list.sort(function (a, b) {
          var ta = favState[r] && favState[r][a.id] ? String(favState[r][a.id]) : '';
          var tb = favState[r] && favState[r][b.id] ? String(favState[r][b.id]) : '';
          if (ta === tb) return a.updatedAt < b.updatedAt ? 1 : -1;
          return ta < tb ? 1 : -1;
        });
      }
      return list;
    },
    /* 投票：轻量计数，和反馈分开（设计文档 §2.3 —— 投票不携带文字）。
       投票是「某个用户对某条经验」的一次动作，所以状态必须按经验 id 存。
       之前用一个全局单值：在 A 上投了票，进 B 页面也显示「已投」，
       在 B 上再点一次反而把 B 的计数减掉 —— 用户的票还留在 A 上，却看不出来。 */
    voteState: {},
    votedUseful: function (exp, role) {
      if (role !== 'user') return false;
      return LBC.voteState[exp.id] === 'up';
    },
    votedNotUseful: function (exp, role) {
      if (role !== 'user') return false;
      return LBC.voteState[exp.id] === 'down';
    },
    vote: function (exp, dir) {
      var cur = LBC.voteState[exp.id];
      if (cur === dir) {
        LBC.voteState[exp.id] = null;
        if (dir === 'up') exp.useful = Math.max(0, exp.useful - 1);
        else exp.notUseful = Math.max(0, exp.notUseful - 1);
        return null;
      }
      if (cur === 'up') exp.useful = Math.max(0, exp.useful - 1);
      if (cur === 'down') exp.notUseful = Math.max(0, exp.notUseful - 1);
      LBC.voteState[exp.id] = dir;
      if (dir === 'up') exp.useful = exp.useful + 1;
      else exp.notUseful = exp.notUseful + 1;
      return dir;
    },
    /* 管理端处理反馈：结论 + 可选回复一次提交（设计文档 §8.2 PATCH { status, reply }） */
    fbOpen: 0,
    fbPick: '',
    fbOf: function (id) {
      var hit = null;
      LB.feedbacks.forEach(function (x) { if (x.id === Number(id)) hit = x; });
      return hit;
    },
    openFb: function (id) { LBC.fbOpen = Number(id); LBC.fbPick = ''; },
    pickFb: function (o) { LBC.fbPick = o; },
    closeFb: function () { LBC.fbOpen = 0; LBC.fbPick = ''; },
    submitFb: function (id, reply) {
      var f = LBC.fbOf(id);
      if (!f || !LBC.fbPick) return false;
      /* 只有「只回话」必须写回复 —— 采纳 / 不采纳不强制写理由。
         护栏放在数据层而不是只靠界面拦：界面拦住了不代表别的入口拦得住。 */
      if (LBC.fbPick === 'replied' && !String(reply || '').trim()) return false;
      f.status = LBC.fbPick;
      f.reply = reply || '';
      f.repliedAt = LB.today;
      LBC.fbOpen = 0;
      LBC.fbPick = '';
      return true;
    },
    /* 提交反馈（读者侧 → 管理员）：真的落一条进数据，「我的反馈」立刻能看到 */
    addFeedback: function (payload) {
      var maxId = 0;
      LB.feedbacks.forEach(function (f) { if (f.id > maxId) maxId = f.id; });
      var imgs = payload.images || [];
      var f = {
        id: maxId + 1,
        targetType: payload.targetType,
        targetId: payload.targetId || null,
        kind: payload.kind,
        content: payload.content || '',
        status: 'pending',
        reply: '',
        createdAt: LB.today,
        author: payload.author || '周小满',
        openid: LB.userFor('user').openid,
        /* 带图的反馈走异步审核：先落库、图片标「审核中」，
           结论等微信回调（设计文档 §9.4）。没带图就是 none。 */
        images: imgs.map(function (im, i) {
          return { id: maxId * 100 + i + 1, uri: im.uri, name: im.name || ('图片 ' + (i + 1)) };
        }),
        mediaStatus: imgs.length ? 'checking' : 'none'
      };
      LB.feedbacks.unshift(f);
      return f;
    },
    /* 管理端搜索：管理·列表与反馈盒各一个搜索框。应用层过滤就够 ——
       30 条量级不值得为它开后端检索接口，而且管理端搜的是标题 / 结论这种精确字段。 */
    adminQ: '',
    fbQ: '',
    /* 反馈提交页暂存的图片（还没提交，离开页面即丢弃） */
    fbImages: [],
    /* 反馈表单的已选类型与已写内容：存在这里而不是只存在 DOM 里，
       加图会触发整页重渲染，只放 DOM 就会被清空。 */
    fbKind: '',
    fbContent: '',
    /* 首页经验流的排序规则：recent 按更新时间 updated_at，favs 按收藏数 */
    sort: 'recent',
    setSort: function (k) { LBC.sort = k; },
    /* 收藏夹排序 / 筛选 / 搜索。
       收藏多了以后只有排序不够用 —— 还得能按领域收窄、按词找。 */
    favSort: 'added',
    favCat: 0,
    favQ: '',
    /* 领域页的二级标签筛选（单选口径见设计文档 §2.4：标签挂在领域下） */
    tagFilter: {},
    toggleTag: function (catId, tagName) {
      if (!tagName || LBC.tagFilter[catId] === tagName) delete LBC.tagFilter[catId];
      else LBC.tagFilter[catId] = tagName;
    },
    /* 搜索页的筛选：领域一组、立场一组，两组互不干扰 */
    searchCat: '',
    searchStance: '',
    setSearchCat: function (v) { LBC.searchCat = LBC.searchCat === v ? '' : v; },
    setSearchStance: function (v) { LBC.searchStance = LBC.searchStance === v ? '' : v; },
    /* 搜索页自己的状态：输入内容、是否提交过、历史。
       这几个不该在换页时被清掉 —— 用户搜了一半切走再回来，
       词还在，才叫搜索页。 */
    input: '',
    q: '',
    searched: false,
    /* 搜索历史只存在用户本机，不上传、不参与任何统计。
       小程序端对应 wx.setStorageSync('search_hist') / wx.getStorageSync；
       原型里落在 localStorage，键名与小程序端保持一致。 */
    HIST_KEY: 'betterlife_search_hist',
    HIST_MAX: 8,
    hist: [],
    loadHist: function () {
      try {
        if (typeof localStorage === 'undefined') return LBC.hist;
        var raw = localStorage.getItem(LBC.HIST_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) LBC.hist = arr.slice(0, LBC.HIST_MAX);
      } catch (e) { /* 隐私模式 / 配额满：退化成内存历史，不影响搜索 */ }
      return LBC.hist;
    },
    saveHist: function () {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LBC.HIST_KEY, JSON.stringify(LBC.hist.slice(0, LBC.HIST_MAX)));
        }
      } catch (e) { /* 同上：存不进去也要能用 */ }
      return LBC.hist;
    },
    /* 记一条历史：只记提交过的查询，输入过程中的中间词不记 */
    pushHist: function (q) {
      q = String(q || '').trim();
      if (!q) return LBC.hist;
      var i = LBC.hist.indexOf(q);
      if (i >= 0) LBC.hist.splice(i, 1);
      LBC.hist.unshift(q);
      if (LBC.hist.length > LBC.HIST_MAX) LBC.hist.length = LBC.HIST_MAX;
      return LBC.saveHist();
    },
    clearHist: function () {
      LBC.hist = [];
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(LBC.HIST_KEY);
      } catch (e) { /* 同上 */ }
      return LBC.hist;
    },
    showFilters: false,
    /* 首页二次进入：品牌区收成单行 slogan */
    homeSeen: false,
    /* 首页「全部 9 个领域」展开 */
    showAllCats: false,
    /* 是否已登录（未登录场景下收藏 / 投票 / 反馈要给出登录引导） */
    login: true,
    /* 我的页的通知位：有反馈被处理过，给读者一个提示位 */
    noticeCount: function (role) {
      if (role !== 'user') return 0;
      return LB.myFeedbacks('user').filter(function (f) {
        return f.status !== 'pending' && !f.seen;
      }).length;
    },
    /* 发布前校验（设计文档 §6.3 的完整性断言）。
       判定放在数据层，界面只负责把提示显示得友好 ——
       校验只写在某个点击分支里，换个入口就能绕过。 */
    publishCheck: function (exp) {
      if (!exp) return '内容不存在。';
      if (!String(exp.title || '').trim()) return '标题不能为空。';
      if (!String(exp.summary || '').trim()) return '结论不能为空。';
      if (!exp.points.length) return '尚未填写要点，请先补充。';
      if (!exp.sources.length) return '至少需要 1 条依据，发布前请补充。';
      for (var i = 0; i < exp.sources.length; i++) {
        if (!exp.sources[i].pointIds.length) return '存在未关联要点的依据，请先为其指定所支撑的要点。';
      }
      return '';
    },
    /* 删要点要连带清掉依据上的引用，否则会留下悬空 id（设计文档 §6.2） */
    removePoint: function (expId, pointId) {
      var exp = LB.expById(Number(expId));
      if (!exp) return false;
      var idx = -1, i;
      for (i = 0; i < exp.points.length; i++) {
        if (exp.points[i].id === Number(pointId)) idx = i;
      }
      if (idx < 0) return false;
      var p = exp.points.splice(idx, 1)[0];
      exp.sources.forEach(function (s) {
        var k = s.pointIds.indexOf(p.id);
        if (k >= 0) s.pointIds.splice(k, 1);
      });
      exp.updatedAt = LB.today;
      return true;
    },
    removeSource: function (expId, srcId) {
      var exp = LB.expById(Number(expId));
      if (!exp) return false;
      var idx = -1, i;
      for (i = 0; i < exp.sources.length; i++) {
        if (exp.sources[i].id === Number(srcId)) idx = i;
      }
      if (idx < 0) return false;
      exp.sources.splice(idx, 1);
      exp.updatedAt = LB.today;
      return true;
    },
    /* 按要点 id / 依据 id 反查所属的经验 —— 管理端编辑器靠它定位字段归属 */
    findPoint: function (pointId) {
      var hit = null;
      LB.experiences.forEach(function (e) {
        e.points.forEach(function (p) { if (p.id === Number(pointId)) hit = { exp: e, point: p }; });
      });
      return hit;
    },
    findSource: function (srcId) {
      var hit = null;
      LB.experiences.forEach(function (e) {
        e.sources.forEach(function (s) { if (s.id === Number(srcId)) hit = { exp: e, src: s }; });
      });
      return hit;
    },
    /* 上移 / 下移：只换顺序，不动内容 */
    movePoint: function (pointId, dir) {
      var exp = null, pt = null;
      LB.experiences.forEach(function (e) {
        e.points.forEach(function (p) { if (p.id === Number(pointId)) { exp = e; pt = p; } });
      });
      if (!exp) return false;
      var arr = exp.points, i = arr.indexOf(pt), j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return false;
      arr[i] = arr[j]; arr[j] = pt;
      exp.updatedAt = LB.today;
      return true;
    },
    moveSource: function (srcId, dir) {
      var exp = null, src = null;
      LB.experiences.forEach(function (e) {
        e.sources.forEach(function (s) { if (s.id === Number(srcId)) { exp = e; src = s; } });
      });
      if (!exp) return false;
      var arr = exp.sources, i = arr.indexOf(src), j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return false;
      arr[i] = arr[j]; arr[j] = src;
      exp.updatedAt = LB.today;
      return true;
    },
    /* 全文检索：按标题 / 结论 / 要点 / 标签 / **搜索关键词** 做 token 匹配。
       关键词是「别人可能怎么问」（洗头水 → 洗发水），挂在经验上随内容维护，
       不再维护一张全局别名表 —— 那张表要单独记得更新，还容易指向内容里没有的词。 */
    searchAll: function (q) {
      var terms = String(q || '').trim().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      var out = [];
      LB.published().forEach(function (e) {
        var kw = (e.keywords || []).join(' ');
        var hay = [e.title, e.summary, e.body || '', kw, e.tags.join(' ')].concat(
          e.points.map(function (p) { return p.t + ' ' + p.d + ' ' + (p.a || ''); })
        ).join(' ').toLowerCase();
        var all = terms.every(function (t) { return hay.indexOf(t.toLowerCase()) >= 0; });
        if (!all) return;
        /* 命中原因要如实说：只靠关键词命中的，别写成「命中标题」 */
        var kwTerms = terms.filter(function (t) {
          return kw.toLowerCase().indexOf(t.toLowerCase()) >= 0;
        });
        /* 只列出真正命中的那个词，不把整串关键词铺在结果卡上 */
        out.push({
          expId: e.id,
          hit: kwTerms.length === terms.length
            ? '命中关键词：' + kwTerms.join('、')
            : '命中标题、结论或要点'
        });
      });
      return out;
    },
    /* 换页时清掉页内临时状态，避免面板/筛选残留到别的页 */
    resetTransient: function () {
      LBC.fbOpen = 0;
      LBC.fbPick = '';
      LBC.fbFilter = '';
      LBC.tagFilter = {};
      LBC.adminQ = '';
      LBC.fbQ = '';
      LBC.fbImages = [];
      LBC.fbKind = '';
      LBC.fbContent = '';
      LBC.showFilters = false;
      LBC.showAllCats = false;
      LBC.favQ = '';
      LBC.favCat = 0;
    },
    toast: function (msg) { /* 由 afterRender 注入真实实现 */ },
    /* 复制链接：个人主体配不了业务域名，web-view 打开外链这条路封死，
       所以外链一律走「复制 + 去浏览器打开」（设计文档 §3.2 / §16） */
    copy: function (text) {
      var done = function () {
        LBC.toast('链接已复制，请前往浏览器打开');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
          return;
        }
      } catch (e) { /* 预览环境可能没有剪贴板权限，落到下面的兜底 */ }
      done();
    },
    /* 普通用户碰到管理页时的样子 */
    denied: function () {
      return '<div class="c-head" style="padding-top:10px">' +
        '<div class="c-head-t" style="font-size:22px">这个页面只有管理员能进</div>' +
        '<div class="c-head-s">当前为普通用户视角。权限校验分三层：' +
        '前端不渲染管理入口仅是第一层，服务端中间件与数据层仍会再次校验角色。</div></div>' +
        '<div style="padding:6px 16px 0"><button class="c-btn" data-nav="page" data-page="mine">回到「我的」</button></div>' +
        '<div class="c-notice">仅隐藏按钮并不足够 —— 前端隐藏属于体验优化，而非安全机制。</div>';
    }
  };
  window.LBC = LBC;

  /* 启动时把本机历史读进来 —— 历史是用户自己的记录，刷新页面、重开小程序都还在。
     小程序端这一步是 wx.getStorageSync，原型里是 localStorage。 */
  LBC.loadHist();

  /* ---------- 首页 ---------- */
  B.c.pages.home = function (ctx) {
    var isEmpty = ctx.scenario === 'empty';
    var isLoading = ctx.scenario === 'loading';
    var published = isEmpty ? [] : LB.published();
    var h = '';

    /* 品牌区：二次进入收成一行 —— 首页是回访入口，用户不是每次都要读一遍介绍 */
    if (LBC.homeSeen) {
      h += '<div class="c-head c-head-slim">' +
        '<div class="c-head-t">生活经验便签墙</div>' +
        '<div class="c-head-s">搜得到、看得懂、查得到出处。</div></div>';
    } else {
      h += '<div class="c-head">' +
        '<span class="c-doodle">📌</span>' +
        '<div class="c-head-t">生活经验<br>便签墙</div>' +
        '<div class="c-head-s">把我踩过的坑、看过的测评，整理成一张张可检索的便签。每张都写明了结论，也标注了参考来源。</div>' +
        '</div>';
    }

    h += '<div class="c-search" data-nav="page" data-page="search">' +
      LB.icon('search') + '<span class="c-search-t">搜成分、流程、维权…</span>' +
      '<span class="c-search-go">' + LB.icon('chevron') + '</span></div>';

    /* 领域区不再重复总数 —— 「共 N 张便签」在下面的便签区已经写过一次，
       同一个数字在首屏出现两次会让人以为是两套口径。 */
    h += '<div class="c-sec-h"><div class="c-sec-h-t">九个领域</div></div>';
    h += '<div class="c-rail">' + LB.categories.map(function (c, i) {
      var n = isEmpty ? 0 : LB.expsOfCat(c.id).length;
      return '<button class="c-cat c-note ' + LBC.color(i) + '" data-nav="category" data-id="' + c.id + '">' +
        '<span class="c-cat-num">' + (i + 1) + '</span>' +
        '<span class="c-cat-i">' + LB.icon(c.icon) + '</span>' +
        '<span class="c-cat-n">' + LB.esc(c.name) + '</span>' +
        '<span class="c-cat-c">' + n + ' 张便签</span></button>';
    }).join('') +
      /* 横滑只能露 3 个，末尾给一张「全部」卡，用户才知道还有 6 个没露出来 */
      '<button class="c-cat c-cat-all" data-act="all-cats">' +
        '<span class="c-cat-i">' + LB.icon('grid') + '</span>' +
        '<span class="c-cat-n">全部 ' + LB.categories.length + ' 个领域</span>' +
        '<span class="c-cat-c">' + (isEmpty ? 0 : published.length) + ' 张便签</span></button>' +
      '</div>';

    if (LBC.showAllCats) {
      h += '<div class="c-allcats">' + LB.categories.map(function (c, i) {
        var n = isEmpty ? 0 : LB.expsOfCat(c.id).length;
        return '<button class="c-allcat c-note ' + LBC.color(i) + '" data-nav="category" data-id="' + c.id + '">' +
          '<span class="c-cat-n">' + LB.esc(c.name) + '</span>' +
          '<span class="c-cat-c">' + n + ' 张便签</span></button>';
      }).join('') + '</div>';
    }

    /* 一面墙，一份列表：区别只在排序规则 */
    var sortKey = LBC.sort;
    var list = published.slice().sort(function (a, b) {
      if (sortKey === 'favs') return b.favs - a.favs;
      if (a.updatedAt === b.updatedAt) return 0;
      return a.updatedAt < b.updatedAt ? 1 : -1; /* 新的在前 */
    });

    h += '<div class="c-sec-h"><div class="c-sec-h-t">墙上的便签' +
      '<span class="c-sec-h-s">共 ' + list.length + ' 张</span></div></div>';
    h += '<div class="c-pills">' +
      '<button class="c-pill' + (sortKey === 'recent' ? ' on' : '') + '" data-sort="recent">最近更新</button>' +
      '<button class="c-pill' + (sortKey === 'favs' ? ' on' : '') + '" data-sort="favs">收藏最多</button>' +
    '</div>';
    if (isLoading) {
      h += LBC.skeleton(3);
    } else if (!list.length) {
      /* 空态要给出口，否则用户只能回上一页干瞪眼 */
      h += LBC.empty('墙上还空着', '这里还没有收录任何便签。可以先去搜索页找找看。',
        '<button class="c-btn" data-nav="page" data-page="search">去搜索经验</button>');
    } else {
      h += '<div class="c-list">' + list.map(function (e, i) { return LBC.card(e, i); }).join('') + '</div>';
    }

    h += LBC.tabbar('home', ctx.role);
    return h;
  };

  /* ---------- 领域详情 ---------- */
  B.c.pages.category = function (ctx) {
    var cat = LB.catById(Number(ctx.params.id) || 1);
    LBC.currentCat = cat.id;
    var isEmpty = ctx.scenario === 'empty';
    var isLoading = ctx.scenario === 'loading';
    var picked = LBC.tagFilter[cat.id] || '';
    var list = isEmpty ? [] : LB.expsOfCat(cat.id);
    /* 排序口径与首页统一按 updated_at —— 同一批内容在两个页面里
       顺序不一样，用户会以为其中一个是乱的。 */
    list = list.slice().sort(function (a, b) {
      if (a.updatedAt === b.updatedAt) return 0;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
    if (picked) {
      list = list.filter(function (e) { return e.tags.indexOf(picked) >= 0; });
    }
    var h = LBC.back('回到便签墙');
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:24px">' + LB.esc(cat.name) + '</div>' +
      '<div class="c-head-s">' + LB.esc(cat.desc) + '</div></div>';

    /* 标签筛选要有「全部」出口 —— 选中一个标签之后，用户得有路退回来 */
    h += '<div class="c-pills"><span class="c-pills-label">二级标签（点击筛选，再次点击取消）</span>' +
      '<button class="c-pill' + (!picked ? ' on' : '') + '" data-act="tag-clear">全部</button>' +
      LB.tagsOf(cat.id).map(function (t) {
        return '<button class="c-pill' + (picked === t.name ? ' on' : '') + '" data-tag="' + LB.esc(t.name) + '">' +
          LB.esc(t.name) + '</button>';
      }).join('') + '</div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">' + list.length + ' 张便签' +
      '<span class="c-sec-h-s">' + (picked ? '标签：' + LB.esc(picked) : '点击查看结论与依据') + '</span></div></div>';
    if (isLoading) {
      h += LBC.skeleton(2);
    } else if (!list.length) {
      /* 空态文案按场景分开：没有内容与「筛完没结果」是两件事，
         原来的两个分支写的是同一句话，用户不知道该换标签还是该离开。 */
      var noContent = !picked && !LB.expsOfCat(cat.id).length;
      h += noContent
        ? LBC.empty('这个领域还在筹备', '目前还没有收录到内容，补充后会出现在这里。',
            '<button class="c-btn" data-nav="page" data-page="home">回到便签墙</button>')
        : LBC.empty(picked ? '该标签下暂无便签' : '该领域暂无便签',
            picked ? '这个标签下还没有内容，换一个标签或看全部。' : '这个领域暂时没有内容，换一个领域看看。',
            '<button class="c-btn" data-act="tag-clear">查看该领域全部便签</button>');
    } else {
      h += '<div class="c-list">' + list.map(function (e, i) { return LBC.card(e, i); }).join('') + '</div>';
    }
    return h;
  };

  /* ---------- 搜索 ---------- */
  /* 搜索页的五个状态（设计文档 §3.5 要求加载 / 空 / 错误三态）：
     默认（历史 + 热词 + 最近更新）→ 输入中（联想）→ 结果 → 无结果 → 超时。
     原来只画了「结果」一种，等于把最容易流失的四个瞬间留给实现阶段。
     检索逻辑在 LBC.searchAll（数据层）。 */

  B.c.pages.search = function (ctx) {
    var S = LB.searchDemo;
    var mode = ctx.scenario === 'keyword' ? 'keyword'
      : ctx.scenario === 'vector' ? 'vector'
      : ctx.scenario === 'demo' ? 'degraded' : 'hybrid';
    var timedOut = ctx.scenario === 'timeout';
    var isLoading = ctx.scenario === 'loading';
    var demoMode = mode === 'keyword' || mode === 'vector' || mode === 'degraded';
    var h = '';

    /* 真的能打字：搜索页原来是一个假的搜索条，点进去只能看结果 */
    h += '<div class="c-searchbar">' +
      '<span class="c-searchbar-ic">' + LB.icon('search') + '</span>' +
      '<input class="c-searchbar-in" data-search-in value="' + LB.esc(LBC.input) +
        '" placeholder="搜成分、流程、维权…">' +
      '<button class="c-searchbar-x" data-act="search-clear" aria-label="清空"' +
        (LBC.input ? '' : ' style="display:none"') + '>×</button>' +
      '<button class="c-btn pri" data-act="search-go">搜索</button></div>';

    /* 联想面板：打字过程中给候选词，不写搜索历史。
       候选词只从本机历史与本地已有的标题 / 标签里取 —— 不查任何「别人搜过什么」。 */
    h += '<div class="c-suggest" data-suggest hidden>' +
      '<div class="c-suggest-t">猜你想搜<span class="c-suggest-s">取自本机历史与已收录内容</span></div>' +
      LBC.suggestHtml(LBC.input) +
      '<div class="c-suggest-tip">按「搜索」或回车提交。输入过程中的词不会记进历史。</div>' +
      '</div>';

    /* 超时：按错误处理，不按「没找到」处理（设计文档 §3.5 / §7.7） */
    if (timedOut) {
      h += '<div class="c-state c-state-err">' +
        '<div class="c-state-t">检索超时了</div>' +
        '<div class="c-state-s">服务端没有在预期时间内返回结果。已输入的内容保留着，可以直接重试。</div>' +
        '<div class="c-state-b"><button class="c-btn pri" data-act="search-retry">重新检索</button>' +
        '<button class="c-btn" data-act="search-clear">清空输入</button></div></div>';
      h += LBC.tabbar('search', ctx.role);
      return h;
    }

    /* 加载中：骨架屏 */
    if (isLoading) {
      h += '<div class="c-sec-h"><div class="c-sec-h-t">正在检索<span class="c-sec-h-s">请稍候</span></div></div>';
      h += LBC.skeleton(3);
      h += LBC.tabbar('search', ctx.role);
      return h;
    }

    /* 默认态：还没提交过任何查询 —— 用户第一眼要看到「这里能搜什么」。
       只有「本机历史 + 最近收录」两块，没有「大家常搜」：
       那个功能要求把所有人的搜索词汇总到服务端，需要多存一份数据并做脱敏，
       而它带来的价值只是几个入口词 —— 不值得。 */
    if (!LBC.searched && !demoMode) {
      /* 没有历史就整块不渲染 —— 空着写一句「还没有搜索记录，搜过之后会留在这里」
         只是拿界面解释机制，用户第一次进来看到的应该是有内容的东西（最近更新）。 */
      if (LBC.hist.length) {
        h += '<div class="c-sec-h"><div class="c-sec-h-t">最近搜过' +
          '<span class="c-sec-h-s">只存在本机，不上传</span></div></div>';
        h += '<div class="c-chips">' + LBC.hist.map(function (q) {
          return '<button class="c-chip tap" data-act="search-hist" data-q="' + LB.esc(q) + '">' +
            LB.icon('clock') + LB.esc(q) + '</button>';
        }).join('') + '<button class="c-chip tap" data-act="hist-clear">清空</button></div>';
      }

      h += '<div class="c-sec-h"><div class="c-sec-h-t">最近更新<span class="c-sec-h-s">先看看新收录了什么</span></div></div>';
      h += '<div class="c-list">' + LB.published().slice().sort(function (a, b) {
        return a.updatedAt < b.updatedAt ? 1 : -1;
      }).slice(0, 3).map(function (e, i) { return LBC.card(e, i); }).join('') + '</div>';
      h += LBC.tabbar('search', ctx.role);
      return h;
    }

    /* 结果态 */
    var items = demoMode
      ? S.items.map(function (it) { return { expId: it.expId, hit: it.hit }; })
      : LBC.searchAll(LBC.q);

    /* 筛选折叠成一行：10 个领域 pill 折三行，首屏只露得下 2 条结果 */
    var active = [];
    if (LBC.searchCat) active.push('领域：' + LBC.searchCat);
    if (LBC.searchStance) active.push(LBC.searchStance === 'good' ? '含推荐' : LBC.searchStance === 'bad' ? '含避雷' : '含中立');
    h += '<div class="c-filter-row">' +
      '<button class="c-pill' + (LBC.showFilters ? ' on' : '') + '" data-act="filter-toggle">' +
      LB.icon('filter') + '筛选' + (active.length ? ' ' + active.length : '') + '</button>' +
      (active.length ? '<span class="c-filter-now">' + active.join(' · ') + '</span>' +
        '<span class="c-chip tap" data-act="clear-filters">清空</span>' : '') +
      '</div>';

    if (LBC.showFilters) {
      h += '<div class="c-filter-panel">';
      h += '<div class="c-pills"><span class="c-pills-label">领域</span>' +
        '<button class="c-pill' + (LBC.searchCat === '' ? ' on' : '') + '" data-scat="">全部领域</button>' +
        LB.categories.map(function (c) {
          return '<button class="c-pill' + (LBC.searchCat === c.name ? ' on' : '') + '" data-scat="' +
            LB.esc(c.name) + '">' + LB.esc(c.name) + '</button>';
        }).join('') + '</div>';
      h += '<div class="c-pills"><span class="c-pills-label">立场</span>' +
        '<button class="c-pill' + (LBC.searchStance === 'good' ? ' on' : '') + '" data-sstance="good">含推荐</button>' +
        '<button class="c-pill' + (LBC.searchStance === 'bad' ? ' on' : '') + '" data-sstance="bad">含避雷</button>' +
        '<button class="c-pill' + (LBC.searchStance === 'neutral' ? ' on' : '') + '" data-sstance="neutral">含中立</button>' +
        '</div></div>';
    }

    /* 只在检索能力变化时提示，正常状态不占版面（设计文档 §7.7） */
    if (mode === 'keyword') {
      h += '<div class="c-notice warn">语义检索暂不可用，现在只按关键词找。结果可能不完整。</div>';
    } else if (mode === 'degraded') {
      h += '<div class="c-notice">当前为演示数据，检索结果为固定样例，并非实际检索结果。</div>';
    } else if (mode === 'vector') {
      h += '<div class="c-notice">关键词检索未命中，以下为语义匹配结果。</div>';
    }

    if (LBC.searchCat) {
      items = items.filter(function (it) {
        var e = LB.expById(it.expId);
        return e && LB.catById(e.cat).name === LBC.searchCat;
      });
    }
    if (LBC.searchStance) {
      items = items.filter(function (it) {
        var e = LB.expById(it.expId);
        if (!e) return false;
        return e.points.some(function (p) { return p.s === LBC.searchStance; });
      });
    }

    var terms = LBC.q.trim().split(/\s+/).filter(Boolean);
    h += '<div class="c-sec-h"><div class="c-sec-h-t">' +
      (items.length ? '找到 ' + items.length + ' 张' : '没找到') +
      /* 耗时是工程指标，不是给读者看的 —— 放在演示数据场景里，别占正常页面的位置 */
      (mode === 'degraded' ? '<span class="c-sec-h-s">用了 ' + S.tookMs + ' 毫秒</span>' : '') +
      '</div></div>';

    if (!items.length) {
      h += LBC.empty('没找到对应的便签', '换个说法再试一次，或清掉筛选条件。',
        '<button class="c-btn" data-act="clear-filters">清空筛选</button>');
    } else {
      h += '<div class="c-list">' + items.map(function (it, i) {
        var e = LB.expById(it.expId);
        var hit = mode === 'keyword' ? '关键词命中' : (mode === 'vector' ? '仅语义匹配' : it.hit);
        return LBC.card(e, i + 1, hit, terms);
      }).join('') + '</div>';
    }
    h += LBC.tabbar('search', ctx.role);
    return h;
  };
})();
