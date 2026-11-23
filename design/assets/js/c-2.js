/* ==========================================================================
   方向 C · 便签墙 —— 经验详情 / 依据来源 / 我的 / 关于与隐私

   本轮（2026-11-23 · 审查报告 v2 落地）改了什么：
   ① 溯源改成「要点内联折叠依据」：默认显示「依据 2 条 · 丁香医生、B站」，
      展开就地看来源卡。详情页不再把全部依据整段列一遍，
      依据来源页改成「要点 ↔ 依据」映射视图 —— 同一批依据不再在两处各写一遍全文。
   ② 立场贴纸补文字（颜色 + 符号 + 文字三个通道），中立符号由 ? 改为 —。
   ③ 详情页操作条改成吸底：投票 / 反馈原本在要点、依据、相关经验之后，
      长页面要滚很久才够得着。
   ④ 「我的」页的入口改成真的能跳转（原来点了只展开一段「关于」文案）；
      指标与入口不再重复同一个数字；管理入口收敛成一个。
   ⑤ 隐私与关于合并成一页：隐私走官方协议入口，不自己写一段当协议。
   ⑥ 补上「内容已下线 / 不存在」「未登录」「操作失败」三类状态。

   三处老口径（2026-11-20 审核修订）：
   ① 「依据挂要点」要真的能点开 —— 要点里的「N 条依据」能就地展开对应依据。
   ② 外链不能跳转：个人主体的小程序配不了业务域名，web-view 打开外链这条路
      是封死的。所以一律「复制链接 + 提示去浏览器打开」（设计文档 §3.2 / §16）。
   ③ 健康类内容加免责条，「我的」页给隐私指引入口（设计文档 §16 第 3、5 条）。
   ========================================================================== */
(function () {
  'use strict';
  var B = window.LB_DIRS;
  var LB = window.LB, LBC = window.LBC;

  /* 健康领域的免责条（设计文档 §16 第 3 条：健康领域只做生活经验与科普） */
  var HEALTH_CATS = [5];

  /* 场景：未登录 / 网络失败 —— 收藏与投票不能「点了就成功」 */
  function stateOf (ctx) {
    if (ctx.scenario === 'anon') return 'anon';
    if (ctx.scenario === 'offline') return 'offline';
    return 'ok';
  }

  /* 依据摘要：默认状态下要点上只写「依据 N 条 · 平台A、平台B」，
     展开才给完整来源卡 —— 读者一眼知道这条结论有没有出处，不必先跳走。 */
  function sourceSummary (exp, p) {
    var refs = exp.sources.filter(function (s) { return s.pointIds.indexOf(p.id) >= 0; });
    var plats = [];
    refs.forEach(function (s) { if (plats.indexOf(s.platform) < 0 && s.platform) plats.push(s.platform); });
    return {
      count: refs.length,
      text: refs.length ? ('依据 ' + refs.length + ' 条 · ' + plats.join('、')) : '暂无依据'
    };
  }

  /* 单条依据卡（详情页内联用的完整形态：标题 / 平台 / 为什么信它 / 支撑要点 / 链接） */
  function sourceCard (s, compact) {
    var pts = LB.pointsOfSource(s);
    return '<div class="c-strip">' +
      '<div class="c-strip-t">' + LB.esc(s.t) + '</div>' +
      '<div class="c-strip-m">' + LB.esc(s.platform) + ' · ' + (LB.sourceTypeLabel[s.type] || s.type) +
        (s.author ? ' · ' + LB.esc(s.author) : '') + ' · ' + s.date + '</div>' +
      (compact ? '' : '<div class="c-strip-n">为什么信它：' + LB.esc(s.note) + '</div>') +
      '<div style="margin-top:7px">' + pts.map(function (p) {
        return '<span class="c-pick">支撑：' + LB.esc(p.t) + '</span>';
      }).join('') + '</div>' +
      '<div class="c-strip-link">' + LB.icon('link') + '<span>' + LB.esc(LB.host(s.url)) + '</span></div>' +
      '<button class="c-copy" data-act="copy" data-url="' + LB.esc(s.url) + '">复制链接</button>' +
      '</div>';
  }

  B.c.pages.detail = function (ctx) {
    var exp = LB.expById(Number(ctx.params.id) || 1);
    var h = '';

    /* 内容不存在 / 已下线：分享出去的链接可能指向一条被撤回的内容，
       这时候不能白屏，也不能报「网络错误」。 */
    if (!exp) {
      h += LBC.back('返回');
      h += '<div class="c-state c-state-err">' +
        '<div class="c-state-t">这条内容已经不在了</div>' +
        '<div class="c-state-s">它可能已被撤回或下架。可以回便签墙看看其它内容。</div>' +
        '<div class="c-state-b"><button class="c-btn pri" data-nav="page" data-page="home">回到便签墙</button>' +
        '<button class="c-btn" data-nav="page" data-page="search">去搜索</button></div></div>';
      return h;
    }

    var cat = LB.catById(exp.cat);
    var disputed = ctx.scenario === 'disputed' || exp.conf === 'disputed';
    var isUser = ctx.role === 'user';
    var st = stateOf(ctx);

    /* 顶栏：返回 + 收藏 + 分享。
       微信胶囊按钮固定在右上角，页面自己的操作按钮只能排在它左边。 */
    var favOn = LBC.isFav(exp.id, ctx.role);
    h += '<div class="c-topbar">' + LBC.back('返回') +
      '<span class="c-topbar-a">' +
        '<button class="c-act" data-act="fav" data-id="' + exp.id + '" aria-pressed="' +
          (favOn ? 'true' : 'false') + '" aria-label="' + (favOn ? '取消收藏' : '收藏') +
          '" title="' + (favOn ? '取消收藏' : '收藏') + '">' +
          LB.icon('star') + '</button>' +
        '<button class="c-act" data-act="share" aria-label="分享" title="分享">' + LB.icon('share') + '</button>' +
      '</span></div>';

    /* 分享卡：原来只画了落地路径，卡片样式没定。冷启动进入时没有返回栈，
       页面上的「返回」会变成「回首页」—— 这件事要写清楚。 */
    h += '<div class="c-share-tip">' +
      '<div class="c-sharecard">' +
        '<div class="c-sharecard-cat">' + LB.esc(cat.name) + '</div>' +
        '<div class="c-sharecard-t">' + LB.esc(exp.title) + '</div>' +
        '<div class="c-sharecard-s">' + LB.esc(exp.summary) + '</div>' +
        '<div class="c-sharecard-f">生活经验便签墙</div>' +
      '</div>' +
      '<div class="c-sharecard-note">好友从分享卡片冷启动进入时没有返回栈，此时页面上的「返回」会变成「回首页」。</div>' +
      '<div class="c-sharecard-path">落地路径：<span class="c-mono">pages/detail/detail?id=' + exp.id + '</span></div>' +
      '</div>';

    /* 健康类免责条 */
    if (HEALTH_CATS.indexOf(cat.id) >= 0) {
      h += '<div class="c-disclaimer">健康类内容仅供参考，不能替代医生的诊断。' +
        '身体不适请及时就医，请勿仅依据本库自行判断。</div>';
    }

    h += '<div class="c-detail-head">' +
      '<span class="c-detail-cat">' + LB.esc(cat.name) + ' · ' + LB.esc(exp.tags.join(' / ')) + '</span>' +
      '<div class="c-detail-t">' + LB.esc(exp.title) + '</div>' +
      '<div class="c-detail-s">' + LB.esc(exp.summary) + '</div>' +
      (exp.body ? '<div class="c-detail-b">' + LB.esc(exp.body) + '</div>' : '') +
      '<div class="c-detail-m"><span>更新于 ' + exp.updatedAt + '</span>' +
        '<span class="c-fav-n">' + exp.favs + ' 人收藏</span><span>看过 ' + exp.views + ' 次</span></div>' +
      '</div>';

    /* 设计文档 §2.5：读者侧只留一个日期 —— 更新日期 + 「内容可能随时间变化」 */
    h += '<div class="c-rev">内容可能随时间变化。如有异议，欢迎提交反馈。</div>';

    if (disputed) {
      h += '<div class="c-notice warn">这张便签存在争议 —— 有反馈指出其在部分情况下并不适用。以下每条要点均标注了适用条件，请留意。</div>';
    }

    /* 要点：立场贴纸（颜色 + 符号 + 文字）+ 依据摘要 + 展开后的理由与来源卡。
       依据默认只给摘要，点开就地看 —— 不用跳到第二个页面才知道有没有出处。 */
    h += '<div class="c-sec-h"><div class="c-sec-h-t">要点 ' + exp.points.length + ' 条' +
      '<span class="c-sec-h-s">点要点看理由与依据</span></div></div>';
    h += '<div class="c-points">';
    exp.points.forEach(function (p, i) {
      var sum = sourceSummary(exp, p);
      h += '<div class="c-point c-note ' + LBC.colorOf(exp) + '" data-point="' + p.id + '">' +
        '<div class="c-point-h">' +
          LBC.sticker(p.s) +
          '<span class="c-point-n">' + (i + 1) + '.</span>' +
          '<span class="c-point-t">' + LB.esc(p.t) + '</span>' +
        '</div>' +
        '<div class="c-point-sum" data-act="point-open">' +
          '<span>' + LB.esc(sum.text) + '</span>' +
          '<span class="c-point-sum-x">' + (sum.count ? '展开看来源' : '尚无来源') + '</span>' +
        '</div>' +
        '<div class="c-point-b">' +
          '<div class="c-point-d">' + LB.esc(p.d) + '</div>' +
          (p.a ? '<div class="c-point-a">适用：' + LB.esc(p.a) + '</div>' : '') +
          (sum.count
            ? '<div class="c-point-src">' + exp.sources.filter(function (s) {
                return s.pointIds.indexOf(p.id) >= 0;
              }).map(function (s) { return sourceCard(s, false); }).join('') + '</div>'
            : '<div class="c-point-none">这条要点还没有关联依据，发布前需要补上。</div>') +
        '</div></div>';
    });
    h += '</div>';

    /* 依据不在这页再写一遍全文 —— 只给一条入口去看「要点 ↔ 依据」的对应关系 */
    h += '<div class="c-sec-h"><div class="c-sec-h-t">依据 ' + exp.sources.length + ' 条' +
      '<span class="c-sec-h-s">每条都挂在具体要点上</span></div></div>';
    h += '<div style="padding:2px 16px 6px"><button class="c-btn" data-nav="source" data-id="' + exp.id + '">' +
      LB.icon('list') + '查看要点与依据的对应关系</button></div>';

    /* 相关经验：同领域优先，标签重叠次之（设计文档 §8.1 的 /related 接口） */
    var related = LB.relatedOf(exp.id, 3);
    if (related.length) {
      var sameCat = related.every(function (e) { return e.cat === exp.cat; });
      h += '<div class="c-sec-h"><div class="c-sec-h-t">相关经验' +
        '<span class="c-sec-h-s">' + (sameCat ? '同一领域下的其他便签' : '标签相近的其他便签') + '</span></div></div>';
      h += '<div class="c-list">' + related.map(function (e, i) { return LBC.card(e, i + 4); }).join('') + '</div>';
    }

    /* 操作条改成吸底：投票 / 反馈原本排在要点、依据、相关经验之后，
       长页面要滚很久才够得着。管理员不投票、不提交反馈，但可以直接编辑。 */
    h += '<div class="c-actions c-actions-sticky">' +
      (isUser
        ? '<button class="c-btn' + (LBC.votedUseful(exp, ctx.role) ? ' on' : '') + '" data-act="vote" data-id="' + exp.id +
            '" data-dir="up">' + LB.icon('thumbsup') + '有用 ' + exp.useful + '</button>' +
          '<button class="c-btn' + (LBC.votedNotUseful(exp, ctx.role) ? ' on' : '') + '" data-act="vote" data-id="' + exp.id +
            '" data-dir="down">' + LB.icon('thumbdown') + '没用 ' + exp.notUseful + '</button>' +
          '<span class="c-grow"></span>' +
          '<button class="c-btn pri" data-nav="feedback" data-id="' + exp.id + '">反馈</button>'
        : '<button class="c-btn pri" data-nav="admin-edit" data-id="' + exp.id + '">' +
          LB.icon('edit') + '编辑这条经验</button>') +
      '</div>';
    return h;
  };

  /* ---------- 依据来源：改成「要点 ↔ 依据」映射视图 ----------
     原来这页把依据全文又写了一遍，和详情页重复三处。
     现在详情页内联给全文，这里只给对应关系：哪条要点由哪几条依据支撑、
     每条依据还支撑着别的哪几条要点。 */
  B.c.pages.source = function (ctx) {
    var exp = LB.expById(Number(ctx.params.id) || 1);
    var h = LBC.back('返回');
    if (!exp) {
      h += '<div class="c-state c-state-err"><div class="c-state-t">这条内容已经不在了</div>' +
        '<div class="c-state-s">它可能已被撤回或下架。</div>' +
        '<div class="c-state-b"><button class="c-btn pri" data-nav="page" data-page="home">回到便签墙</button></div></div>';
      return h;
    }
    var srcs = LB.sourcesOfExp(exp.id);
    var anchor = ctx.params.point ? Number(ctx.params.point) : 0;
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:22px">依据与要点的对应关系</div>' +
      '<div class="c-head-s">每条依据都标注了它支撑哪几条要点 —— 来源的完整说明在经验详情页展开要点即可看到。</div>' +
      '</div>';

    if (ctx.scenario === 'empty' || !srcs.length) {
      h += LBC.empty('还没贴依据', '该经验尚缺依据，发布前请补充。');
      return h;
    }

    h += '<div class="c-sec-h"><div class="c-sec-h-t">' + srcs.length + ' 条依据' +
      '<span class="c-sec-h-s">来自 ' + LB.esc(exp.title) + '</span></div></div>';
    h += '<div class="c-map">';
    exp.points.forEach(function (p, i) {
      var refs = exp.sources.filter(function (s) { return s.pointIds.indexOf(p.id) >= 0; });
      h += '<div class="c-map-group' + (anchor === p.id ? ' anchor' : '') + '" data-point-id="' + p.id + '">' +
        '<div class="c-map-p">' +
          LBC.sticker(p.s, true) +
          '<span class="c-map-pn">' + (i + 1) + '.</span>' +
          '<span class="c-map-pt">' + LB.esc(p.t) + '</span>' +
          '<span class="c-map-pc">' + refs.length + ' 条依据</span>' +
        '</div>';
      if (!refs.length) {
        h += '<div class="c-map-empty">这条要点还没有关联依据。</div>';
      }
      refs.forEach(function (s) {
        var idx = exp.sources.indexOf(s) + 1;
        var others = LB.pointsOfSource(s).filter(function (x) { return x.id !== p.id; });
        h += '<div class="c-strip c-strip-compact">' +
          '<span class="c-strip-badge">依据 ' + idx + '/' + exp.sources.length + '</span>' +
          '<div class="c-strip-t">' + LB.esc(s.t) + '</div>' +
          '<div class="c-strip-m">' + LB.esc(s.platform) + ' · ' + (LB.sourceTypeLabel[s.type] || s.type) +
            (s.author ? ' · ' + LB.esc(s.author) : '') + ' · ' + s.date + '</div>' +
          (others.length
            ? '<div class="c-strip-also">同时支撑：' + others.map(function (x) {
                return '<button class="c-pick tap" data-act="point-jump" data-point="' + x.id + '">' +
                  LB.esc(x.t) + '</button>';
              }).join('') + '</div>'
            : '') +
          '<div class="c-strip-link">' + LB.icon('link') + '<span>' + LB.esc(LB.host(s.url)) + '</span></div>' +
          '<button class="c-copy" data-act="copy" data-url="' + LB.esc(s.url) + '">复制链接</button>' +
          '</div>';
      });
      h += '</div>';
    });
    h += '</div>';
    return h;
  };

  /* ---------- 关于与隐私 ----------
     隐私说明不自写一段当协议：真机上走 wx.openPrivacyContract 打开官方协议；
     这里给出说明与入口位置，让「隐私指引有入口」这件事在设计稿上成立。 */
  B.c.pages.about = function (ctx) {
    var h = LBC.back('返回');
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">关于这个经验库</div>' +
      '<div class="c-head-s">一个由个人维护的生活经验库：内容逐条录入，每条均标注来源。</div></div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">这个库怎么用</div></div>';
    h += '<div class="c-form"><div class="c-blk"><div class="c-blk-b">' +
      '· 每条经验先给结论，再给可判定立场的要点，最后是挂在要点上的依据。<br>' +
      '· 依据链接需要复制到浏览器打开 —— 小程序受业务域名限制，无法直接跳转外部链接。<br>' +
      '· 内容可能随时间变化，页面上会标注更新时间。发现内容有误，欢迎提交反馈。' +
      '</div></div></div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">隐私保护指引<span class="c-sec-h-s">官方协议</span></div></div>';
    h += '<div class="c-form"><div class="c-blk"><div class="c-blk-b">' +
      '本小程序会记录你的微信标识，用于登录与收藏，不会用于其他用途。' +
      '你提交的反馈仅经验库维护者可见，不会展示在其他用户的页面上。' +
      '<div style="margin-top:10px"><button class="c-btn" data-act="privacy">打开微信官方隐私保护指引</button></div>' +
      '<div class="c-field-in" style="margin-top:8px">真机上这一项调用 wx.openPrivacyContract，' +
      '打开的是平台公示的隐私协议，而不是本页这段说明。</div>' +
      '</div></div></div>';
    return h;
  };

  /* ---------- 我的 ---------- */
  B.c.pages.mine = function (ctx) {
    var isAdmin = ctx.role !== 'user';
    var u = LB.userFor(ctx.role);
    var myFb = LB.myFeedbacks(ctx.role);
    var inboxFb = LB.feedbacksFor(ctx.role);
    var pending = inboxFb.filter(function (f) { return f.status === 'pending'; }).length;
    var h = '';

    /* 未登录：收藏与投票都要账号，先说清楚再让用户登录 */
    if (ctx.scenario === 'anon') {
      h += '<div class="c-state"><div class="c-state-t">登录后可以收藏和提交反馈</div>' +
        '<div class="c-state-s">阅读无需登录；收藏、投票与反馈需要登录后使用。</div>' +
        '<div class="c-state-b"><button class="c-btn pri" data-act="login">登录</button></div></div>';
      h += LBC.tabbar('mine', ctx.role);
      return h;
    }

    h += '<div class="c-me">' +
      '<span class="c-me-av">' + LB.esc(u.avatarText) + '</span>' +
      '<span><span class="c-me-n">' + LB.esc(u.nickname) + '</span>' +
      /* 普通用户不需要知道自己是什么角色，也不该看到「管理员」这种说法；只有管理员才显示身份 */
      (isAdmin ? '<span class="c-me-s">管理员 · 收藏与反馈由我处理</span>' : '') + '</span></div>';

    /* 指标只放总数：「我的反馈」是「收到反馈」的子集，
       并排摆两个数会让人以为它们是不同口径。入口行不再重复同一个数字。 */
    h += '<div class="c-metrics ' + (isAdmin ? 'c3' : 'c2') + '">' +
      '<div class="c-metric"><div class="c-metric-n">' + LBC.favList(ctx.role).length + '</div><div class="c-metric-l">收藏</div></div>' +
      (isAdmin
        ? '<div class="c-metric"><div class="c-metric-n">' + inboxFb.length + '</div><div class="c-metric-l">收到反馈</div></div>' +
          '<div class="c-metric"><div class="c-metric-n">' + LB.stats().published + '</div><div class="c-metric-l">已发布</div></div>'
        : '<div class="c-metric"><div class="c-metric-n">' + myFb.length + '</div><div class="c-metric-l">我的反馈</div></div>') +
    '</div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">我的<span class="c-sec-h-s">' +
      (isAdmin ? '收藏过的便签' : '收藏与反馈记录') + '</span></div></div>';
    /* 「我的」页只留 收藏夹 / 我的反馈（设计文档 §3.2 的口径）：
       写反馈是「我的反馈」的下一个动作，不单独占一个入口。
       管理员不提交反馈 —— 内容都是他自己写的，有问题直接改就行。 */
    var notice = LBC.noticeCount(ctx.role);
    h += '<div class="c-entry-list">' +
      entry('bookmark', '收藏夹', '', 'favorites') +
      (isAdmin ? '' : entry('inbox', '我的反馈', notice ? (notice + ' 条有新回复') : '', 'inbox', notice)) +
    '</div>';

    /* 管理入口只在 role=admin 时渲染，且只留一个 —— 管理列表页做唯一首页。
       原来这里有 3 个入口，和管理列表页的 4 个工具两套并存，
       而且两边集合还不一致（标签页只在一处有）。 */
    if (isAdmin) {
      h += '<div class="c-sec-h"><div class="c-sec-h-t">管理<span class="c-sec-h-s">仅管理员可见</span></div></div>';
      h += '<div class="c-entry-list">' +
        entry('settings', '内容管理', LB.categories.length + ' 个领域 · ' + LB.stats().tags + ' 个标签', 'admin-list') +
        '</div>';
    }

    h += '<div class="c-sec-h"><div class="c-sec-h-t">其他<span class="c-sec-h-s">信息与说明</span></div></div>';
    h += '<div class="c-entry-list">' +
      entry('doc', '关于与隐私', '', 'about') +
      '</div>';
    h += '<div style="height:10px"></div>';
    h += LBC.tabbar('mine', ctx.role);
    return h;

    function entry (icon, name, count, page, dot) {
      return '<button class="c-entry" data-nav="page" data-page="' + page + '">' +
        LB.icon(icon) + '<span class="c-entry-n">' + name + '</span>' +
        (dot ? '<span class="c-entry-dot"></span>' : '') +
        '<span class="c-entry-c">' + count + '</span>' + LB.icon('chevron') + '</button>';
    }
  };

  /* ---------- 交互：所有 data-act 都在这里统一处理 ---------- */
  B.c.afterRender = function (root, nav) {
    /* 轻提示由外壳注入 */
    LBC.toast = function (msg) {
      if (nav && nav.toast) nav.toast(msg);
    };
    var scene = root.getAttribute('data-scenario');

    root.addEventListener('click', function (ev) {
      /* 首页经验流的排序切换 */
      var sortBtn = ev.target.closest('[data-sort]');
      if (sortBtn) {
        LBC.setSort(sortBtn.getAttribute('data-sort'));
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 首页「全部 9 个领域」：横滑只能露 3 个，其余的在这里一次看完 */
      var allCats = ev.target.closest('[data-act="all-cats"]');
      if (allCats) {
        LBC.showAllCats = !LBC.showAllCats;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 领域页的二级标签筛选 */
      var tagBtn = ev.target.closest('[data-tag]');
      if (tagBtn) {
        LBC.toggleTag(LBC.currentCat || 1, tagBtn.getAttribute('data-tag'));
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var tagClear = ev.target.closest('[data-act="tag-clear"]');
      if (tagClear) {
        LBC.toggleTag(LBC.currentCat || 1, '');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 搜索页：提交 / 清空 / 历史 / 联想。
         历史只写本机（LBC.pushHist），不发服务端 —— 搜索页没有「大家常搜」，
         也就没有任何「记录别人搜了什么」的通道。 */
      var searchGo = ev.target.closest('[data-act="search-go"], [data-act="search-retry"]');
      if (searchGo) {
        LBC.q = LBC.input;
        LBC.searched = true;
        LBC.pushHist(LBC.q);
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 清空本机搜索历史：只动这台设备上的记录 */
      var histClear = ev.target.closest('[data-act="hist-clear"]');
      if (histClear) {
        LBC.clearHist();
        LBC.toast('已清空这台设备上的搜索记录');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var searchClear = ev.target.closest('[data-act="search-clear"]');
      if (searchClear) {
        LBC.input = '';
        LBC.q = '';
        LBC.searched = false;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 点历史项 / 联想项即搜。历史项本来就在列表里，重复提交时要把它挪到最前 */
      var searchPick = ev.target.closest('[data-act="search-hist"], [data-act="search-suggest"]');
      if (searchPick) {
        LBC.input = searchPick.getAttribute('data-q') || '';
        LBC.q = LBC.input;
        LBC.searched = true;
        LBC.pushHist(LBC.q);
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var filterToggle = ev.target.closest('[data-act="filter-toggle"]');
      if (filterToggle) {
        LBC.showFilters = !LBC.showFilters;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 搜索页的领域 / 立场筛选 */
      var scat = ev.target.closest('[data-scat]');
      if (scat) {
        LBC.setSearchCat(scat.getAttribute('data-scat'));
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var sstance = ev.target.closest('[data-sstance]');
      if (sstance) {
        LBC.setSearchStance(sstance.getAttribute('data-sstance'));
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 清空筛选：筛出空结果时，得有一条明路走回去 */
      var clearFilters = ev.target.closest('[data-act="clear-filters"]');
      if (clearFilters) {
        LBC.searchCat = '';
        LBC.searchStance = '';
        if (nav && nav.rerender) nav.rerender();
        return;
      }

      /* 管理端处理反馈：打开面板 / 选结论 / 提交 / 取消 */
      var fbOpenBtn = ev.target.closest('[data-act="fb-open"]');
      if (fbOpenBtn) {
        LBC.openFb(Number(fbOpenBtn.getAttribute('data-id')));
        if (nav && nav.rerender) nav.rerender();
        var f = LBC.fbOf(LBC.fbOpen);
        var input = root.querySelector('[data-fb-input]');
        if (f && input) input.value = f.reply || '';
        return;
      }
      var fbPickBtn = ev.target.closest('[data-act="fb-pick"]');
      if (fbPickBtn) {
        LBC.pickFb(fbPickBtn.getAttribute('data-outcome'));
        Array.prototype.forEach.call(root.querySelectorAll('[data-act="fb-pick"]'), function (x) {
          x.classList.toggle('on', x === fbPickBtn);
        });
        var legend = root.querySelector('[data-fb-legend]');
        var picked = legend && legend.textContent;
        if (legend) {
          var map = { accepted: '采纳：内容按这条改了', ignored: '不采纳：内容不改', replied: '只回话：答复了，内容不用改' };
          legend.textContent = map[LBC.fbPick] || picked;
        }
        return;
      }
      var fbCancelBtn = ev.target.closest('[data-act="fb-cancel"]');
      if (fbCancelBtn) {
        LBC.closeFb();
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var fbSubmitBtn = ev.target.closest('[data-act="fb-submit"]');
      if (fbSubmitBtn) {
        var fbId = Number(fbSubmitBtn.getAttribute('data-id'));
        var box = root.querySelector('[data-fb-input]');
        var text = box ? String(box.value || '').trim() : '';
        var hint = root.querySelector('[data-fb-hint]');
        if (!LBC.fbPick) {
          if (hint) { hint.textContent = '请先选择一种处理方式。'; hint.style.display = 'block'; }
          return;
        }
        if (LBC.fbPick === 'replied' && !text) {
          if (hint) { hint.textContent = '已选择「只回话」，请填写回复内容。'; hint.style.display = 'block'; }
          return;
        }
        if (LBC.submitFb(fbId, text) && nav && nav.rerender) nav.rerender();
        return;
      }
      /* 复制链接：个人主体配不了业务域名，外链只能复制后去浏览器打开。
         这一步要放在要点展开之前 —— 复制按钮在展开后的依据卡里。 */
      var copyBtn = ev.target.closest('[data-act="copy"]');
      if (copyBtn) {
        LBC.copy(copyBtn.getAttribute('data-url'));
        return;
      }
      /* 来源页 → 跳到对应要点组 */
      var jumpBtn = ev.target.closest('[data-act="point-jump"]');
      if (jumpBtn) {
        var pid = jumpBtn.getAttribute('data-point');
        var target = root.querySelector('[data-point-id="' + pid + '"]');
        if (target) {
          target.classList.add('anchor');
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      /* 要点展开 / 收起（理由 + 适用条件 + 依据） */
      var pointOpen = ev.target.closest('[data-act="point-open"]');
      if (pointOpen) {
        var ptEl = pointOpen.closest('.c-point');
        if (ptEl) {
          var opened = ptEl.classList.toggle('open');
          /* 按钮上的说法要跟着状态变 —— 展开后还写「展开看来源」，
             用户会以为没点开。 */
          var tag = ptEl.querySelector('.c-point-sum-x');
          if (tag && (tag.textContent === '展开看来源' || tag.textContent === '收起来源')) {
            tag.textContent = opened ? '收起来源' : '展开看来源';
          }
        }
        return;
      }
      var pointEl = ev.target.closest('.c-point');
      if (pointEl) {
        pointEl.classList.toggle('open');
        return;
      }
      /* 收藏星标：本地状态，收藏夹与「我的」同步跟着变 */
      var favBtn = ev.target.closest('[data-act="fav"]');
      if (favBtn) {
        if (scene === 'anon') { LBC.toast('请先登录后再收藏'); return; }
        if (scene === 'offline') { LBC.toast('网络不太顺畅，操作未生效，请稍后重试'); return; }
        var id = Number(favBtn.getAttribute('data-id'));
        var role = root.getAttribute('data-role') || 'admin';
        var on = LBC.setFav(id, !LBC.isFav(id, role), role);
        favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        favBtn.setAttribute('title', on ? '取消收藏' : '收藏');
        favBtn.setAttribute('aria-label', on ? '取消收藏' : '收藏');
        /* 收藏数跟着变：收藏夹和「我的」页的计数会变，详情页的「N 人收藏」也得变，
           否则同一个动作在两个页面上呈现两个数字 */
        var favExp = LB.expById(id);
        if (favExp) {
          favExp.favs = Math.max(0, favExp.favs + (on ? 1 : -1));
          var favN = root.querySelector('.c-fav-n');
          if (favN) favN.textContent = favExp.favs + ' 人收藏';
        }
        return;
      }
      /* 分享：展示分享卡与落地路径 */
      var shareBtn = ev.target.closest('[data-act="share"]');
      if (shareBtn) {
        var tip = root.querySelector('.c-share-tip');
        if (tip) tip.classList.toggle('on');
        return;
      }
      /* 隐私指引：真机上打开微信官方协议 */
      var privacyBtn = ev.target.closest('[data-act="privacy"]');
      if (privacyBtn) {
        LBC.toast('真机上此处打开微信官方隐私保护指引');
        return;
      }
      /* 登录引导 */
      var loginBtn = ev.target.closest('[data-act="login"]');
      if (loginBtn) {
        LBC.toast('真机上此处调用 wx.login 静默登录');
        return;
      }
      /* 投票：轻量计数，和反馈分开。未登录与失败都要有明确反馈，不能「点了就成功」 */
      var voteBtn = ev.target.closest('[data-act="vote"]');
      if (voteBtn) {
        if (scene === 'anon') { LBC.toast('请先登录后再投票'); return; }
        if (scene === 'offline') { LBC.toast('网络不太顺畅，投票未生效，请稍后重试'); return; }
        var vId = Number(voteBtn.getAttribute('data-id'));
        var vExp = LB.expById(vId);
        var dir = voteBtn.getAttribute('data-dir');
        if (vExp) {
          LBC.vote(vExp, dir);
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }
    });

    /* 搜索框：打字时更新输入内容并弹出联想面板（不重渲染，避免输入焦点丢失） */
    root.addEventListener('input', function (ev) {
      var el = ev.target.closest('[data-search-in]');
      if (!el) return;
      LBC.input = String(el.value || '');
      var box = root.querySelector('[data-suggest]');
      if (box) {
        box.hidden = !LBC.input.length;
        /* 候选词依赖输入内容，所以要就地换掉列表项 ——
           整页重渲染会把输入焦点弄丢，用户打一个字就得重新点回输入框。 */
        var items = box.querySelectorAll('[data-act="search-suggest"], .c-suggest-none');
        for (var i = 0; i < items.length; i++) items[i].remove();
        var tip = box.querySelector('.c-suggest-tip');
        if (tip) tip.insertAdjacentHTML('beforebegin', LBC.suggestHtml(LBC.input));
      }
      var x = root.querySelector('[data-act="search-clear"]');
      if (x) x.style.display = LBC.input.length ? '' : 'none';
    });

    /* 回车即搜 —— 键盘也能用，不用非得点按钮 */
    root.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var el = ev.target.closest('[data-search-in]');
      if (!el) return;
      ev.preventDefault();
      LBC.q = String(el.value || '');
      LBC.searched = true;
      LBC.pushHist(LBC.q);
      if (nav && nav.rerender) nav.rerender();
    });
  };
})();






