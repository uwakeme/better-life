/* ==========================================================================
   方向 C · 便签墙 —— 收藏夹 / 反馈提交 / 我的反馈 / 管理四页

   本轮（2026-11-23 · 审查报告 v2 落地）改了什么：
   ① 管理端补「待办」区：待确认内容 / 待处理反馈 / 来源信息待补，三项都由数据派生。
   ② 管理列表加「＋ 新建经验」主动作，编辑器补空白新建态与字段级编辑
      （要点标题/理由/适用条件、依据标题/URL/平台/类型/作者/日期、删除、排序、预览）。
   ③ 领域改成选择器（原来长得像输入框却只能看）。
   ④ 已发布经验上的「先存草稿」改叫「撤回发布」—— 那个按钮的语义本来就是下架。
   ⑤ 反馈闭环：反馈卡能跳到关联经验 / 直接编辑；标「采纳」后能一键去改内容，
      改完保存即回写「已采纳」；读者侧有「反馈已处理」的通知位。
   ⑥ 反馈表单的已选类型与已写内容存进状态层，加图触发整页重渲染不再清空。
   ⑦ 管理标签页的改名 / 新增改成真能操作。
      别名表已删：搜索的同义召回改由「经验里的搜索关键词」承担（见 ⑨）。
      那张全局字典要单独维护、还容易指向内容里根本没有的词 —— 实测 4 条里 2 条零命中、1 条是子串冗余。
   ⑨ 编辑器补「搜索关键词」字段：别人可能怎么问，写作时顺手填 0-3 个。
   ⑧ 我的反馈加状态筛选；收藏夹加排序。

   2026-11-20 审核修订的老口径：
   ① 反馈提交页是真操作 —— 选类型、写内容、寄出，真的落一条进数据。
   ② 反馈只有「处理」一个主动作：结论三选一 + 可选回复，一次提交落库。
   ③ 护栏落在数据层：只有「只回话」必填回复，采纳 / 不采纳不强制写理由。
   ========================================================================== */
(function () {
  'use strict';
  var B = window.LB_DIRS;
  var LB = window.LB, LBC = window.LBC;

  var KIND_ORDER = ['correction', 'supplement', 'question', 'suggestion'];
  /* 每类反馈给一句例子：原来四个标签并排，用户不知道该选哪个 */
  var KIND_DESC = {
    correction: '内容与事实不符，或者已经过时了',
    supplement: '这条说得不全，漏了一个前提或另一种做法',
    question: '照着做了，但还有地方不确定',
    suggestion: '这个库本身可以做得更好'
  };
  var FB_STATUS = { pending: '待处理', accepted: '已采纳', replied: '已回复', ignored: '已忽略' };
  var MY_STATUS = { pending: '等回复', accepted: '已采纳', replied: '已回复', ignored: '没采纳' };

  /* 管理端搜索的匹配规则（应用层过滤，见 LBC.adminQ / LBC.fbQ 的说明） */
  function matchExp (e, q) {
    if (!q) return true;
    var s = String(q).toLowerCase();
    var cat = LB.catById(e.cat);
    var hay = [e.title, e.summary, (e.tags || []).join(' '), cat ? cat.name : ''].join(' ').toLowerCase();
    return hay.indexOf(s) >= 0;
  }
  function matchFb (f, q) {
    if (!q) return true;
    var s = String(q).toLowerCase();
    var e = f.targetId ? LB.expById(f.targetId) : null;
    var hay = [f.content, f.author || '', e ? e.title : '', LB.feedbackKindLabel[f.kind] || ''].join(' ').toLowerCase();
    return hay.indexOf(s) >= 0;
  }

  /* 图片的两种视觉状态（设计文档 §9.4）：
     用户侧 —— 审核中只显示占位、不显示图本身；未通过不展示图，
     但用户写的文字照常留在「我的反馈」里（图片没过审 ≠ 整条反馈作废）。
     管理侧 —— 管理员就是审的人，图要看得见，另标审核状态。 */
  function fbImagesView (f, side) {
    if (!f.images || !f.images.length) return '';
    var st = f.mediaStatus || 'none';
    if (side === 'user') {
      if (st === 'checking') {
        /* 三张图要显示成三个「审核中」占位 —— 原来合并成一个，
           读者会以为只传了一张 */
        return '<span class="c-fb-imgs">' + f.images.map(function () {
          return '<span class="c-fb-img checking"><span class="c-fb-img-t">审核中</span></span>';
        }).join('') + '</span>';
      }
      if (st === 'rejected') {
        return '<span class="c-fb-imgs">' + f.images.map(function () {
          return '<span class="c-fb-img rejected"><span class="c-fb-img-t">图片未通过审核</span></span>';
        }).join('') + '</span>';
      }
      return '<span class="c-fb-imgs">' + f.images.map(function (im) {
        return '<span class="c-fb-img"><img class="c-fb-img-pic" src="' + im.uri +
          '" alt="' + LB.esc(im.name || '') + '"></span>';
      }).join('') + '</span>';
    }
    var label = st === 'checking' ? '审核中' : st === 'rejected' ? '未通过' : st === 'passed' ? '已通过' : '';
    return '<span class="c-fb-imgs">' + f.images.map(function (im) {
      return '<span class="c-fb-img ' + st + '"><img class="c-fb-img-pic" src="' + im.uri +
        '" alt="' + LB.esc(im.name || '') + '">' +
        (label ? '<span class="c-fb-img-tag">' + label + '</span>' : '') + '</span>';
    }).join('') + '</span>';
  }

  /* ---------- 收藏夹 ---------- */
  /* 收藏夹内的匹配：标题 / 结论 / 标签 / 领域 / 搜索关键词。
     关键词也参与匹配 —— 否则全局搜「洗头水」能搜到，收藏夹里搜同一个词却搜不到。
     但关键词不展示（读者侧不出现这个字段）。 */
  function matchFav (e, q) {
    if (!q) return true;
    var s = String(q).toLowerCase();
    var cat = LB.catById(e.cat);
    var hay = [e.title, e.summary, (e.tags || []).join(' '), (e.keywords || []).join(' '),
      cat ? cat.name : ''].join(' ').toLowerCase();
    return hay.indexOf(s) >= 0;
  }

  B.c.pages.favorites = function (ctx) {
    var all = LBC.favList(ctx.role);
    var q = LBC.favQ || '';
    var catId = Number(LBC.favCat) || 0;
    /* 领域 pill 只列「收藏里真的有的」领域 —— 摆 9 个领域里 8 个点进去空着，
       用户会以为收藏丢了。 */
    var catsInUse = [];
    all.forEach(function (e) { if (catsInUse.indexOf(e.cat) < 0) catsInUse.push(e.cat); });
    var list = all.filter(function (e) {
      if (catId && e.cat !== catId) return false;
      return matchFav(e, q);
    });
    var filtering = !!(q || catId);

    var h = LBC.back('返回');
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">我的收藏</div>' +
      '<div class="c-head-s">你收藏过的便签都在这里，可按领域收窄或直接搜。</div></div>';

    /* 有收藏才显示搜索与筛选：空收藏夹摆一个搜索框只会让人以为搜一下就有了 */
    if (all.length) {
      h += '<div class="c-searchbar">' +
        '<input class="c-searchbar-in" data-fav-q value="' + LB.esc(q) + '" placeholder="搜收藏的标题、结论或关键词">' +
        '<button class="c-btn" data-act="fav-search">搜索</button></div>';

      if (catsInUse.length > 1) {
        h += '<div class="c-pills"><span class="c-pills-label">领域</span>' +
          '<button class="c-pill' + (catId ? '' : ' on') + '" data-act="fav-cat" data-cat="">全部</button>' +
          catsInUse.map(function (cid) {
            var c = LB.catById(cid);
            return '<button class="c-pill' + (catId === cid ? ' on' : '') + '" data-act="fav-cat" data-cat="' + cid + '">' +
              LB.esc(c ? c.name : '未归类') + '</button>';
          }).join('') + '</div>';
      }

      /* 排序与领域是两个轴，分两组摆 —— 并排亮着会让人以为能叠加 */
      h += '<div class="c-pills"><span class="c-pills-label">排序</span>' +
        '<button class="c-pill' + (LBC.favSort === 'added' ? ' on' : '') + '" data-act="fav-sort" data-k="added">收藏时间</button>' +
        '<button class="c-pill' + (LBC.favSort === 'updated' ? ' on' : '') + '" data-act="fav-sort" data-k="updated">更新时间</button>' +
        '</div>';
    }

    if (all.length) {
      h += '<div class="c-sec-h"><div class="c-sec-h-t">' +
        (filtering ? '找到 ' + list.length + ' 张' : list.length + ' 张') +
        '<span class="c-sec-h-s">' +
          (filtering ? '共收藏 ' + all.length + ' 张' : '点击即可查看结论') + '</span></div></div>';
    }

    if (ctx.scenario === 'empty') {
      h += LBC.empty('还没收藏过', '在便签上点击收藏，即可保存至此。',
        '<button class="c-btn" data-nav="page" data-page="home">前往便签墙</button>');
    } else if (!all.length) {
      h += LBC.empty('收藏夹是空的', '在便签右上角点星标就能收藏。',
        '<button class="c-btn" data-nav="page" data-page="home">前往便签墙</button>');
    } else if (!list.length) {
      /* 筛出来是空的，和「一张都没收藏」是两件事，文案要分开 */
      var catName = catId ? (LB.catById(catId) || {}).name : '';
      h += LBC.empty('没有符合条件的收藏',
        q
          ? '收藏里没有含「' + q + '」的便签' + (catName ? '（当前只看「' + catName + '」）' : '') + '。换个词，或清掉筛选。'
          : '「' + catName + '」下还没有收藏。',
        '<button class="c-btn" data-act="fav-clear">清空筛选</button>');
    } else {
      var terms = q ? q.split(/\s+/).filter(Boolean) : [];
      h += '<div class="c-list">' +
        list.map(function (e, i) { return LBC.card(e, i, '', terms); }).join('') + '</div>';
    }
    return h;
  };

  /* ---------- 反馈提交 ---------- */
  B.c.pages.feedback = function (ctx) {
    var exp = ctx.params.id ? LB.expById(Number(ctx.params.id)) : null;
    var h = LBC.back('返回');
    /* 管理员不提交反馈：内容都是他自己写的，有问题直接改就行 */
    if (ctx.role !== 'user') {
      h += LBC.empty('管理员无需提交反馈',
        '反馈是用户向管理员提交的渠道。如有修改意见，可直接编辑内容。',
        '<button class="c-btn pri" data-nav="page" data-page="admin-edit">去改内容</button>');
      return h;
    }
    var kinds = exp ? KIND_ORDER : ['suggestion', 'correction', 'question'];
    var picked = LBC.fbKind;
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">' + (exp ? '这张便签哪里有问题？' : '对经验库提出意见') + '</div>' +
      '<div class="c-head-s">' + (exp ? LB.esc(exp.title) : '关于经验库本身，均可提出意见。') + '</div></div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">反馈类型<span class="c-sec-h-s">请选择一项</span></div></div>';
    h += '<div class="c-pills">' + kinds.map(function (k) {
      return '<button class="c-pill' + (picked === k ? ' on' : '') + '" data-act="fb-kind" data-kind="' + k + '">' +
        LB.feedbackKindLabel[k] + '</button>';
    }).join('') + '</div>';
    /* 每类反馈给一句例子：四个标签并排摆着，用户不知道该选哪个 */
    h += '<div class="c-kind-desc">' +
      (picked ? (LB.feedbackKindLabel[picked] + '：' + KIND_DESC[picked]) :
        '例：内容写错了选「纠错」；漏了前提选「补充说明」；有疑问选「提问」；对库本身有想法选「建议」。') +
      '</div>';

    h += '<div class="c-form">' +
      '<div class="c-field"><div class="c-field-l"><span class="req">＊</span>具体描述</div>' +
      '<textarea class="c-textarea" data-fb-content placeholder="例如你的发质、使用的产品、在什么情况下不适用…">' +
      LB.esc(LBC.fbContent) + '</textarea></div>' +
      '<div class="c-field"><div class="c-field-l">图片（最多 3 张）</div>' +
      '<div class="c-imgs">' +
      LBC.fbImages.map(function (im, i) {
        return '<span class="c-img">' +
          '<img class="c-img-pic" src="' + im.uri + '" alt="' + LB.esc(im.name || '') + '">' +
          '<button class="c-img-x" data-act="fb-del-img" data-i="' + i + '">×</button></span>';
      }).join('') +
      (LBC.fbImages.length >= 3
        ? '<span class="c-img-max">已达 3 张上限</span>'
        : '<button class="c-img-add" data-act="fb-add-img">＋ 拍照 / 从相册选</button>') +
      '</div>' +
      '<div class="c-field-in" style="font-size:12.5px;color:var(--ink-3)">提交后图片需经内容安全审核，通过前显示「审核中」。</div>' +
      '</div>' +
    '</div>';

    h += '<div class="c-notice">提交的内容仅经验库维护者可见，不会展示在其他用户的页面上。提交前将经过内容安全审核。</div>';
    h += '<span data-fb-hint style="display:none;margin:0 16px;font-size:12.5px;color:var(--bad-ink)"></span>';
    h += '<div class="c-actions" style="padding-top:16px">' +
      '<button class="c-btn" style="flex:1;justify-content:center" data-act="fb-cancel-form">取消</button>' +
      '<button class="c-btn pri" style="flex:2;justify-content:center" data-act="fb-send" data-id="' +
        (exp ? exp.id : '') + '">提交反馈</button></div>';
    return h;
  };

  /* ---------- 我的反馈 ---------- */
  B.c.pages.inbox = function (ctx) {
    var mine = LB.myFeedbacks(ctx.role);
    var h = LBC.back('返回');
    /* 管理员不提交反馈，这里没有他要寄的东西；用户提的在「反馈盒」 */
    if (ctx.role !== 'user') {
      h += LBC.empty('管理员无需提交反馈',
        '反馈是用户向管理员提交的渠道 —— 用户提交的反馈可在「反馈盒」中处理。',
        '<button class="c-btn pri" data-nav="page" data-page="admin-feedback">去反馈盒</button>');
      return h;
    }
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">我提交的</div>' +
      '<div class="c-head-s">仅显示你本人提交的反馈及其处理进度。</div></div>';

    /* 通知位：反馈被回复了，读者得有一个地方知道。
       反馈是产品里唯一的纠错通道，没有这个闭环，用户提完就走了。 */
    var notice = LBC.noticeCount('user');
    if (notice) {
      h += '<div class="c-notice notice-new">有 ' + notice + ' 条反馈已处理，回复已列在下方。</div>';
    }

    h += '<div style="padding:2px 16px 0"><button class="c-btn pri" data-nav="page" data-page="feedback">' +
      LB.icon('plus') + '再写一条</button></div>';

    /* 状态筛选：原来只能看全部，条目一多就找不到「还在等回复的那条」 */
    var fk = LBC.myFbFilter || 'all';
    h += '<div class="c-pills c-pills-row">' +
      [['all', '全部'], ['pending', '等回复'], ['accepted', '已采纳'], ['replied', '已回复'], ['ignored', '没采纳']].map(function (x) {
        return '<button class="c-pill' + (fk === x[0] ? ' on' : '') + '" data-act="myfb-filter" data-key="' + x[0] + '">' +
          x[1] + '</button>';
      }).join('') + '</div>';

    var shown = mine.filter(function (f) { return fk === 'all' || f.status === fk; });

    h += '<div class="c-sec-h"><div class="c-sec-h-t">' + shown.length + ' 条' +
      '<span class="c-sec-h-s">处理进展会通过回复告知</span></div></div>';
    if (ctx.scenario === 'empty' && !shown.length) {
      h += LBC.empty('尚未提交反馈', '点击上方「再写一条」，或在任意便签上点击「反馈」。');
    } else if (!shown.length) {
      h += LBC.empty('这个状态下没有反馈', '换一个状态看看，或点击上方「再写一条」。',
        '<button class="c-btn" data-act="myfb-filter" data-key="all">看全部</button>');
    } else {
      h += '<div class="c-list">';
      shown.forEach(function (f, i) {
        var e = f.targetId ? LB.expById(f.targetId) : null;
        h += '<div class="c-card c-note ' + LBC.colorOf(e || { id: f.id }) + '" style="cursor:default">' +
          '<span class="c-card-t" style="font-size:15px">' + LB.esc(e ? e.title : '关于经验库的反馈') + '</span>' +
          '<span class="c-card-s">' + LB.esc(f.content) + '</span>' +
          fbImagesView(f, 'user') +
          '<span class="c-card-m"><span class="c-chip">' + LB.feedbackKindLabel[f.kind] + '</span>' +
          '<span class="c-chip">' + (MY_STATUS[f.status] || f.status) + '</span>' +
          '<span>' + f.createdAt + '</span></span>' +
          (f.reply ? '<span class="c-card-s" style="margin-top:8px;color:var(--good-ink)">回复：' + LB.esc(f.reply) + '</span>' : '') +
          '</div>';
      });
      h += '</div>';
    }
    return h;
  };

  /* ---------- 管理 · 列表 ---------- */
  /* 需要「下次确认」日期的领域（设计文档 §13.1：健康 / 钱财 / 维权类必填） */
  var REVIEW_CATS = [5, 6, 7];

  B.c.pages['admin-list'] = function (ctx) {
    if (ctx.role === 'user') return LBC.denied();
    var s = LB.stats();
    var h = LBC.back('返回');
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">内容管理</div>' +
      '<div class="c-head-s">经验、要点、依据、标签与反馈均在此页管理。</div></div>';

    h += '<div class="c-metrics">' +
      '<div class="c-metric"><div class="c-metric-n">' + s.published + '</div><div class="c-metric-l">已发布</div></div>' +
      '<div class="c-metric"><div class="c-metric-n">' + s.drafts + '</div><div class="c-metric-l">草稿</div></div>' +
      '<div class="c-metric"><div class="c-metric-n">' + s.points + '</div><div class="c-metric-l">要点</div></div>' +
      '<div class="c-metric"><div class="c-metric-n">' + s.sources + '</div><div class="c-metric-l">依据</div></div>' +
    '</div>';

    /* 待办区：设计文档承诺了「待确认」「索引重试」，页面上原来没有。
       三项都由数据派生，不是写死的数字。 */
    h += '<div class="c-sec-h"><div class="c-sec-h-t">待办<span class="c-sec-h-s">需要处理的事</span></div></div>';
    h += '<div class="c-entry-list">' +
      entry('clock', '待确认内容', s.needReview + ' 条', 'admin-list', 'review') +
      entry('inbox', '待处理反馈', s.pendingFeedback + ' 条', 'admin-feedback') +
      entry('link', '来源信息待补', s.sourceMetaGap + ' 条', 'admin-list', 'meta') +
    '</div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">工具<span class="c-sec-h-s">管理员可见</span></div></div>';
    h += '<div class="c-entry-list">' +
      '<button class="c-entry c-entry-pri" data-nav="page" data-page="admin-edit">' +
        LB.icon('plus') + '<span class="c-entry-n">新建经验</span>' +
        '<span class="c-entry-c">结论 · 要点 · 依据</span>' + LB.icon('chevron') + '</button>' +
      entry('settings', '标签', '标签 ' + s.tags + ' 个', 'admin-tags') +
      '<button class="c-entry" data-act="reindex">' +
        LB.icon('search') + '<span class="c-entry-n">重建搜索索引</span>' +
        '<span class="c-entry-c">全量 / 单条</span>' + LB.icon('chevron') + '</button>' +
    '</div>';

    /* 管理端搜索：搜标题、结论、标签、领域（应用层过滤） */
    h += '<div class="c-searchbar c-searchbar-admin">' +
      '<input class="c-searchbar-in" data-admin-q value="' + LB.esc(LBC.adminQ) + '" placeholder="搜索标题、结论或标签">' +
      '<button class="c-btn" data-act="admin-search">搜索</button></div>';
    if (LBC.adminQ) {
      h += '<div class="c-filter-bar"><span>当前搜索：' + LB.esc(LBC.adminQ) + '</span>' +
        '<span class="c-chip tap" data-act="admin-clear">清空搜索</span></div>';
    }

    var todo = LBC.adminTodo || '';

    /* 待办：来源信息待补 —— 列出缺作者或平台的依据 */
    if (todo === 'meta') {
      h += '<div class="c-sec-h"><div class="c-sec-h-t">来源信息待补' +
        '<span class="c-sec-h-s">缺作者或平台，溯源信息不完整</span></div></div>';
      var gaps = [];
      LB.experiences.forEach(function (e) {
        e.sources.forEach(function (src) {
          if (!src.author || !src.platform) gaps.push({ exp: e, src: src });
        });
      });
      if (!gaps.length) {
        h += LBC.empty('没有待补的来源', '每条依据都有平台与作者。');
      } else {
        h += '<div class="c-list">' + gaps.map(function (g) {
          return '<div class="c-card c-note ' + LBC.colorOf(g.exp) + '" style="cursor:default">' +
            '<span class="c-card-t" style="font-size:15px">' + LB.esc(g.src.t) + '</span>' +
            '<span class="c-card-s">' + LB.esc(g.exp.title) + '</span>' +
            '<span class="c-card-m"><span class="c-chip">' +
            (g.src.platform ? LB.esc(g.src.platform) : '缺平台') + '</span><span class="c-chip">' +
            (g.src.author ? LB.esc(g.src.author) : '缺作者') + '</span></span>' +
            '<span style="display:flex;gap:8px;margin-top:10px">' +
            '<button class="c-btn" data-nav="admin-edit" data-id="' + g.exp.id + '">编辑这条</button></span>' +
            '</div>';
        }).join('') + '</div>';
      }
      h += '<div style="padding:2px 16px 6px"><button class="c-btn" data-act="todo-clear">返回全部内容</button></div>';
      return h;
    }

    /* 草稿是真实数据，不是写死的一张卡 */
    var drafts = LB.drafts().filter(function (e) { return matchExp(e, LBC.adminQ); });
    if (drafts.length) {
      h += '<div class="c-sec-h"><div class="c-sec-h-t">草稿 ' + drafts.length + ' 条' +
        '<span class="c-sec-h-s">尚未发布</span></div></div>';
      h += '<div class="c-list">' + drafts.map(function (e, i) {
        return '<button class="c-card c-note s-slate" data-nav="admin-edit" data-id="' + e.id + '">' +
          '<span class="c-card-t" style="font-size:15px">' + LB.esc(e.title || '（未命名）') + '</span>' +
          '<span class="c-card-s">' + LB.esc(e.summary || '还没有写结论') + '</span>' +
          '<span class="c-card-m"><span class="c-chip">草稿</span>' +
          '<span>' + e.points.length + ' 条要点 · ' + e.sources.length + ' 条依据</span>' +
          '<span>更新 ' + LB.ago(e.updatedAt) + '</span></span></button>';
      }).join('') + '</div>';
    }

    var pub = LB.published().filter(function (e) { return matchExp(e, LBC.adminQ); });
    /* 待确认：到了该确认而没确认的内容，单独列出来 */
    if (todo === 'review') {
      pub = pub.filter(function (e) {
        return REVIEW_CATS.indexOf(e.cat) >= 0 && !e.nextReview;
      });
    }
    if (LBC.adminQ && !pub.length && !drafts.length) {
      h += LBC.empty('没有匹配的经验', '请更换关键词，或清空搜索条件。');
      return h;
    }
    h += '<div class="c-sec-h"><div class="c-sec-h-t">' +
      (todo === 'review' ? '待确认内容' : '已发布经验') +
      '<span class="c-sec-h-s">共 ' + pub.length +
      (LBC.adminQ ? ' / ' + LB.published().length : '') + ' 条</span></div></div>';
    if (!pub.length) {
      h += LBC.empty('没有待确认的内容', '健康、钱财、办事维权三类需要设置「下次确认」日期。');
      return h;
    }
    h += '<div class="c-list">' +
      pub.map(function (e, i) { return LBC.card(e, i + 2); }).join('') +
    '</div>';
    if (todo === 'review') {
      h += '<div style="padding:2px 16px 6px"><button class="c-btn" data-act="todo-clear">返回全部内容</button></div>';
    }
    return h;

    function entry (icon, name, count, page, todoKey) {
      return '<button class="c-entry" data-nav="page" data-page="' + page + '"' +
        (todoKey ? ' data-act="todo-open" data-todo="' + todoKey + '"' : '') + '>' +
        LB.icon(icon) + '<span class="c-entry-n">' + name + '</span>' +
        '<span class="c-entry-c">' + count + '</span>' + LB.icon('chevron') + '</button>';
    }
  };

  /* ---------- 管理 · 编辑 ---------- */
  /* 新建经验：先落一条空草稿，id 记下来，之后的编辑都作用在它身上。
     不这么做的话，「新建」按钮点下去还是打不开一张白纸。 */
  function ensureBlank () {
    if (LBC.blankId) {
      var exist = LB.expById(LBC.blankId);
      if (exist) return exist;
    }
    var maxId = 0;
    LB.experiences.forEach(function (e) { if (e.id > maxId) maxId = e.id; });
    var blank = {
      id: maxId + 1, cat: LB.categories[0].id, status: 'draft',
      title: '', summary: '', body: '',
      conf: 'normal', reviewed: LB.today, nextReview: null,
      views: 0, favs: 0, useful: 0, notUseful: 0, updatedAt: LB.today,
      tags: [], keywords: [], points: [], sources: []
    };
    LB.experiences.push(blank);
    LBC.blankId = blank.id;
    return blank;
  }

  B.c.pages['admin-edit'] = function (ctx) {
    if (ctx.role === 'user') return LBC.denied();
    var exp = ctx.params.id ? LB.expById(Number(ctx.params.id)) : null;
    if (!exp) exp = ensureBlank();
    var h = LBC.back('返回');

    /* 预览：读者侧看到的样子，和详情页复用同一段渲染 */
    if (LBC.previewId === exp.id) {
      h += '<div class="c-preview-bar"><span>预览中 · 下面是读者看到的样子</span>' +
        '<button class="c-chip tap" data-act="preview-off">退出预览</button></div>';
      h += B.c.pages.detail({ page: 'detail', params: { id: exp.id }, scenario: ctx.scenario, role: 'user' });
      return h;
    }

    var isNew = !exp.title && !exp.points.length && !exp.sources.length;

    /* 反馈闭环：从反馈盒点「去改这条」进来时，顶部说明这条内容对应哪条反馈，
       保存后即可回写处理结论。 */
    if (LBC.fbLink) {
      var fb = LBC.fbOf(LBC.fbLink);
      if (fb) {
        h += '<div class="c-fb-banner">' +
          '<div class="c-fb-banner-t">正在处理反馈 #' + fb.id + '</div>' +
          '<div class="c-fb-banner-c">' + LB.esc(fb.content) + '</div>' +
          '<button class="c-btn pri" data-act="fb-save-done" data-id="' + fb.id + '">保存并标记已采纳</button>' +
          '<button class="c-btn" data-act="fb-link-cancel">取消</button></div>';
      }
    }

    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">' + (isNew ? '新建一条经验' : '编辑这条经验') + '</div>' +
      '<div class="c-head-s">结论置于顶部，要点与依据逐条录入。</div></div>';

    h += '<div style="padding:2px 16px 0;display:flex;gap:8px">' +
      '<button class="c-btn" data-act="preview-on" data-id="' + exp.id + '">预览读者侧效果</button></div>';

    h += '<div class="c-form">' +
      /* 领域原来长得像输入框却只能看 —— 改成真的能选的选择器 */
      '<div class="c-field"><div class="c-field-l"><span class="req">＊</span>哪个领域</div>' +
      '<div class="c-pills c-pills-inline">' + LB.categories.map(function (c) {
        return '<button class="c-pill' + (exp.cat === c.id ? ' on' : '') + '" data-act="set-cat" data-id="' + c.id +
          '" data-exp="' + exp.id + '">' + LB.esc(c.name) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="c-field"><div class="c-field-l"><span class="req">＊</span>标题（写成一个问题或一个判断）</div>' +
      '<input class="c-input big" data-act="title-edit" data-id="' + exp.id + '" value="' + LB.esc(exp.title) + '"></div>' +
      '<div class="c-field"><div class="c-field-l"><span class="req">＊</span>结论（一句话，先说结论）</div>' +
      '<textarea class="c-input one" data-act="summary-edit" data-id="' + exp.id + '">' + LB.esc(exp.summary) + '</textarea></div>' +
      '<div class="c-field"><div class="c-field-l">补充说明</div>' +
      '<textarea class="c-input" data-act="body-edit" data-id="' + exp.id + '">' + LB.esc(exp.body || '') + '</textarea></div>' +
      /* 搜索关键词：替换掉原来那张全局「别名表」。
         它解决的是「用户用的词和标题里的词不一样」（洗头水 / 洗发水），
         最合适的维护位置就是写作当下，而不是另开一页维护一份会过期的字典。 */
      '<div class="c-field"><div class="c-field-l">搜索关键词（可选，最多 3 个）</div>' +
      '<input class="c-input" data-act="keywords-edit" data-id="' + exp.id + '" value="' +
        LB.esc((exp.keywords || []).join('、')) + '" placeholder="别人可能怎么问，用「、」分隔，例如：洗头水、洗发露">' +
      '<div style="margin-top:6px;font-size:12.5px;color:var(--ink-3);line-height:1.7">' +
        '只影响搜索召回，不出现在读者侧页面上。</div></div>' +
    '</div>';

    /* 要点：标题 / 理由 / 适用条件 / 立场 / 排序 / 删除 全部可编辑 */
    h += '<div class="c-sec-h"><div class="c-sec-h-t">要点 ' + exp.points.length + ' 条' +
      '<span class="c-sec-h-s">每条要点都要能判定立场</span></div></div>';
    h += '<div class="c-form">';
    exp.points.forEach(function (p, i) {
      var refs = exp.sources.filter(function (s) { return s.pointIds.indexOf(p.id) >= 0; }).length;
      h += '<div class="c-blk c-blk-edit">' +
        '<div class="c-blk-h"><span class="c-blk-n">' + (i + 1) + '</span>' +
        '<input class="c-blk-t c-blk-in" data-act="point-title" data-id="' + p.id + '" value="' + LB.esc(p.t) + '">' +
        '<button class="c-pick tap" data-act="stance" data-id="' + p.id + '">' + LBC.stanceRow(p.s) + '</button>' +
        '</div>' +
        '<div class="c-blk-b">' +
        '<div class="c-field"><div class="c-field-l">理由</div>' +
        '<textarea class="c-input one" data-act="point-detail" data-id="' + p.id + '">' + LB.esc(p.d) + '</textarea></div>' +
        '<div class="c-field"><div class="c-field-l">适用条件</div>' +
        '<input class="c-input" data-act="point-applies" data-id="' + p.id + '" value="' + LB.esc(p.a || '') + '"></div>' +
        '<div class="c-blk-ops">' +
        '<span class="c-chip">关联依据 ' + refs + ' 条</span>' +
        '<button class="c-chip tap" data-act="point-up" data-id="' + p.id + '">上移</button>' +
        '<button class="c-chip tap" data-act="point-down" data-id="' + p.id + '">下移</button>' +
        '<button class="c-chip tap c-chip-bad" data-act="point-del" data-id="' + p.id + '">删除</button>' +
        '</div></div></div>';
    });
    h += '<button class="c-btn" data-act="add-point" data-id="' + exp.id + '">＋ 再加一条要点</button></div>';

    /* 依据：标题 / 链接 / 平台 / 类型 / 作者 / 日期 / 引用理由 / 支撑要点 全部可编辑 */
    h += '<div class="c-sec-h"><div class="c-sec-h-t">依据 ' + exp.sources.length + ' 条' +
      '<span class="c-sec-h-s">需指定其所支撑的要点</span></div></div>';
    h += '<div class="c-form">';
    exp.sources.forEach(function (s, i) {
      h += '<div class="c-blk c-blk-edit">' +
        '<div class="c-blk-h"><span class="c-blk-n">' + (i + 1) + '</span>' +
        '<input class="c-blk-t c-blk-in" data-act="src-title" data-id="' + s.id + '" value="' + LB.esc(s.t) + '">' +
        '</div>' +
        '<div class="c-blk-b">' +
        '<div class="c-field"><div class="c-field-l">链接</div>' +
        '<input class="c-input" data-act="src-url" data-id="' + s.id + '" value="' + LB.esc(s.url) + '"></div>' +
        '<div class="c-field"><div class="c-field-l">平台 / 类型 / 作者 / 日期</div>' +
        '<div class="c-grid2">' +
        '<input class="c-input" data-act="src-platform" data-id="' + s.id + '" value="' + LB.esc(s.platform) + '" placeholder="平台">' +
        '<select class="c-input" data-act="src-type" data-id="' + s.id + '">' +
        Object.keys(LB.sourceTypeLabel).map(function (k) {
          return '<option value="' + k + '"' + (s.type === k ? ' selected' : '') + '>' +
            LB.sourceTypeLabel[k] + '</option>';
        }).join('') + '</select>' +
        '<input class="c-input" data-act="src-author" data-id="' + s.id + '" value="' + LB.esc(s.author || '') + '" placeholder="作者 / 栏目">' +
        '<input class="c-input" data-act="src-date" data-id="' + s.id + '" value="' + LB.esc(s.date || '') + '" placeholder="日期">' +
        '</div></div>' +
        '<div class="c-field"><div class="c-field-l">为什么信它</div>' +
        '<input class="c-fb-input" data-act="note-edit" data-id="' + s.id + '" value="' + LB.esc(s.note) + '"></div>' +
        '<div style="margin-top:7px">' + exp.points.map(function (p) {
          var on = s.pointIds.indexOf(p.id) >= 0;
          return '<button class="c-pick tap' + (on ? ' on' : '') + '" data-act="link-point" data-id="' + s.id +
            '" data-point="' + p.id + '">' + (on ? '✓ ' : '＋ ') + '支撑：' + LB.esc(p.t) + '</button>';
        }).join('') + '</div>' +
        '<div class="c-blk-ops">' +
        '<button class="c-chip tap" data-act="src-up" data-id="' + s.id + '">上移</button>' +
        '<button class="c-chip tap" data-act="src-down" data-id="' + s.id + '">下移</button>' +
        '<button class="c-chip tap c-chip-bad" data-act="src-del" data-id="' + s.id + '">删除</button>' +
        '</div>' +
        '</div></div>';
    });
    h += '<button class="c-btn" data-act="add-source" data-id="' + exp.id + '">＋ 再加一条依据</button></div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">标签<span class="c-sec-h-s">最多 4 个</span></div></div>';
    h += '<div class="c-pills">' + exp.tags.map(function (t) {
      return '<span class="c-pill on">' + LB.esc(t) + '</span>';
    }).join('') + '<button class="c-pill" data-act="add-tag" data-id="' + exp.id + '">＋ 加标签</button></div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">时效<span class="c-sec-h-s">过期需提醒</span></div></div>';
    h += '<div class="c-form"><div class="c-blk"><div class="c-blk-b">' +
      '更新于：' + exp.updatedAt + '<br>最后确认：' + (exp.reviewed || '未填写') +
      '<br>建议下次确认：' + (exp.nextReview || '未设置') +
      '<br>可信度：' + (exp.conf === 'high' ? '高' : exp.conf === 'disputed' ? '有争议' : '常规') +
      '<br>状态：' + (exp.status === 'draft' ? '草稿' : '已发布') + '</div></div></div>';

    h += '<span data-publish-hint style="display:none;margin:0 16px;font-size:12.5px;color:var(--bad-ink)"></span>';
    /* 已发布经验上的按钮不能叫「先存草稿」—— 那个动作的语义是下架，
       叫法不改，管理员会以为只是存了个草稿。 */
    h += '<div class="c-actions" style="padding-top:16px">';
    if (exp.status === 'published') {
      h += '<button class="c-btn" style="flex:1;justify-content:center" data-act="unpublish" data-id="' + exp.id + '">' +
        (LBC.confirmUnpublish === exp.id ? '确认撤回发布' : '撤回发布') + '</button>' +
        '<button class="c-btn" style="flex:1;justify-content:center" data-act="save-draft" data-id="' + exp.id + '">存草稿</button>';
    } else {
      h += '<button class="c-btn" style="flex:1;justify-content:center" data-act="save-draft" data-id="' + exp.id + '">存草稿</button>';
    }
    h += '<button class="c-btn pri" style="flex:1;justify-content:center" data-act="publish" data-id="' + exp.id + '">发布</button></div>';
    return h;
  };

  /* ---------- 管理 · 标签 ---------- */
  B.c.pages['admin-tags'] = function (ctx) {
    if (ctx.role === 'user') return LBC.denied();
    var h = LBC.back('返回');
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">标签</div>' +
      '<div class="c-head-s">标签归属于领域，用来归类与筛选。搜索用的「别人可能怎么问」写在每条经验里，不在这里维护。</div></div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">二级标签 ' + LB.tags.length + ' 个' +
      '<span class="c-sec-h-s">按领域分组</span></div></div>';
    LB.categories.forEach(function (c) {
      var tags = LB.tagsOf(c.id);
      if (!tags.length) return;
      h += '<div class="c-form"><div class="c-field-l" style="margin-top:6px">' + LB.esc(c.name) + '</div>' +
        '<div>' + tags.map(function (t) {
          var n = LB.expsOfCat(c.id, true).filter(function (e) {
            return e.tags.indexOf(t.name) >= 0;
          }).length;
          /* 改名是真能改的：点一下就地编辑，不是弹一句「演示」 */
          if (LBC.tagEdit === t.id) {
            return '<span class="c-edit-row">' +
              '<input class="c-input c-input-inline" data-act="tag-rename-save" data-id="' + t.id +
                '" value="' + LB.esc(t.name) + '">' +
              '<button class="c-chip tap" data-act="tag-rename-save" data-id="' + t.id + '">保存</button>' +
              '<button class="c-chip tap" data-act="tag-edit-cancel">取消</button></span>';
          }
          return '<button class="c-pick tap" data-act="tag-rename" data-id="' + t.id + '">' +
            LB.esc(t.name) + ' · ' + n + ' 条</button>';
        }).join('') + '</div></div>';
    });

    /* 新增标签：原来点了只提示一句「要选所属领域（演示）」 */
    h += '<div class="c-form"><div class="c-field-l" style="margin-top:10px">新增标签</div>' +
      '<div class="c-edit-row">' +
      '<input class="c-input c-input-inline" data-act="new-tag-name" placeholder="标签名称">' +
      '<select class="c-input c-input-inline" data-act="new-tag-cat">' +
      LB.categories.map(function (c) {
        return '<option value="' + c.id + '">' + LB.esc(c.name) + '</option>';
      }).join('') + '</select>' +
      '<button class="c-btn" data-act="add-tagdef">添加</button></div></div>';

    /* 别名表已删：它要单独维护一份全局字典，还容易指向内容里没有的词。
       搜索的同义召回改由「经验里的搜索关键词」承担（见编辑器）。 */
    return h;
  };

  /* ---------- 管理 · 反馈 ---------- */
  B.c.pages['admin-feedback'] = function (ctx) {
    if (ctx.role === 'user') return LBC.denied();
    var list = LB.feedbacks;
    var st = FB_STATUS;
    var kind = LB.feedbackKindLabel;
    var OUTCOME = [
      { v: 'accepted', t: '采纳', d: '内容按这条改了' },
      { v: 'ignored', t: '不采纳', d: '内容不改' },
      { v: 'replied', t: '只回话', d: '答复了，内容不用改' }
    ];
    var picked = OUTCOME.filter(function (o) { return o.v === LBC.fbPick; })[0];
    var filterKey = LBC.fbFilter || 'all';
    /* 按 status 一一对应，互斥，而且每个状态都能筛到 */
    var shown = list.filter(function (f) {
      if (filterKey !== 'all' && f.status !== filterKey) return false;
      return matchFb(f, LBC.fbQ);
    });
    var h = LBC.back('返回');
    h += '<div class="c-head" style="padding-top:10px">' +
      '<div class="c-head-t" style="font-size:23px">反馈盒</div>' +
      '<div class="c-head-s">仅管理员可见。若公开给其他用户，则不再只是权限开关的问题。</div></div>';

    h += '<div class="c-searchbar c-searchbar-admin">' +
      '<input class="c-searchbar-in" data-fb-q value="' + LB.esc(LBC.fbQ) + '" placeholder="搜索反馈内容、提交人或关联经验">' +
      '<button class="c-btn" data-act="fb-search">搜索</button></div>';
    if (LBC.fbQ) {
      h += '<div class="c-filter-bar"><span>当前搜索：' + LB.esc(LBC.fbQ) + '</span>' +
        '<span class="c-chip tap" data-act="fb-clear">清空搜索</span></div>';
    }

    /* 五个状态横排在 375px 下会折两行，改成单行横滑 */
    h += '<div class="c-pills c-pills-row">' +
      [['all', '全部'], ['pending', '待处理'], ['accepted', '已采纳'], ['replied', '已回复'], ['ignored', '已忽略']].map(function (p) {
        return '<button class="c-pill' + (filterKey === p[0] ? ' on' : '') + '" data-act="fb-filter" data-key="' +
          p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div>';

    h += '<div class="c-sec-h"><div class="c-sec-h-t">' + shown.length + ' 条' +
      '<span class="c-sec-h-s">' + list.filter(function (f) { return f.status === 'pending'; }).length + ' 条待处理</span></div></div>';
    if (ctx.scenario === 'empty' || !shown.length) {
      h += LBC.empty('盒子空了', '所有反馈都处理完了。');
    } else {
      h += '<div class="c-list">';
      shown.forEach(function (f, i) {
        var e = f.targetId ? LB.expById(f.targetId) : null;
        h += '<div class="c-card c-note ' + LBC.colorOf(e || { id: f.id }) + '" style="cursor:default">' +
          '<span class="c-card-t" style="font-size:15px">' + LB.esc(e ? e.title : '关于经验库的反馈') + '</span>' +
          '<span class="c-card-s">' + LB.esc(f.content) + '</span>' +
          fbImagesView(f, 'admin') +
          '<span class="c-card-m"><span class="c-chip">' + (kind[f.kind] || f.kind) + '</span><span>' + f.createdAt + '</span>' +
          '<span>' + LB.esc(f.author) + '</span><span class="c-chip">' + st[f.status] + '</span></span>' +
          (f.reply ? '<span class="c-card-s" style="margin-top:8px;color:var(--good-ink)">曾回复：' + LB.esc(f.reply) + '</span>' : '') +
          '<span style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
          '<button class="c-btn' + (f.status === 'pending' ? ' pri' : '') + '" data-act="fb-open" data-id="' + f.id + '">' +
          (f.status === 'pending' ? '处理' : '重新处理') + '</button>' +
          /* 反馈与内容之间原来没有连线：看到问题，却找不到改的地方 */
          (e ? '<button class="c-btn" data-nav="detail" data-id="' + e.id + '">查看经验</button>' +
            '<button class="c-btn" data-act="fb-edit" data-id="' + f.id + '">编辑这条</button>' : '') +
          '</span>' +
          (LBC.fbOpen === f.id
            ? '<div class="c-fb-panel">' +
              '<div class="c-field-l">处理方式</div>' +
              '<div class="c-fb-choices">' +
                OUTCOME.map(function (o) {
                  return '<button class="c-pill' + (LBC.fbPick === o.v ? ' on' : '') + '" data-act="fb-pick" data-id="' + f.id +
                    '" data-outcome="' + o.v + '">' + o.t + '</button>';
                }).join('') +
              '</div>' +
              '<div class="c-fb-legend" data-fb-legend>' +
                (picked ? picked.t + '：' + picked.d : '请选择处理方式') + '</div>' +
              '<div class="c-fb-tip">采纳与不采纳无需填写理由；选择「只回话」时必须填写回复。</div>' +
              /* 标了「采纳」却没改内容，这条反馈就只是被关掉了 ——
                 采纳要有下一步：去把内容改了。 */
              (LBC.fbPick === 'accepted' && e
                ? '<div class="c-fb-next">采纳即意味着内容按这条改了。' +
                  '<button class="c-btn pri" data-act="fb-edit" data-id="' + f.id + '">去改这条经验</button></div>'
                : '') +
              '<div class="c-field" style="margin-top:10px"><div class="c-field-l">回复（选择「只回话」时必填）</div>' +
              '<input class="c-fb-input" data-fb-input placeholder="写给用户的话…"></div>' +
              '<span class="c-fb-hint" data-fb-hint></span>' +
              '<div style="display:flex;gap:8px;margin-top:10px">' +
              '<button class="c-btn pri" data-act="fb-submit" data-id="' + f.id + '">提交</button>' +
              '<button class="c-btn" data-act="fb-cancel">取消</button></div>' +
              '</div>'
            : '') +
          '</div>';
      });
      h += '</div>';
    }
    return h;
  };

  /* ---------- 交互：反馈提交 / 标签管理 / 管理端搜索 / 编辑器 ---------- */
  var origAfterRender = B.c.afterRender;
  B.c.afterRender = function (root, nav) {
    if (origAfterRender) origAfterRender(root, nav);

    root.addEventListener('click', function (ev) {
      /* 收藏夹排序 */
      var favSort = ev.target.closest('[data-act="fav-sort"]');
      if (favSort) {
        LBC.favSort = favSort.getAttribute('data-k');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 我的反馈的状态筛选 */
      var myFbFilter = ev.target.closest('[data-act="myfb-filter"]');
      if (myFbFilter) {
        LBC.myFbFilter = myFbFilter.getAttribute('data-key');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 管理端待办 */
      var todoOpen = ev.target.closest('[data-act="todo-open"]');
      if (todoOpen) {
        LBC.adminTodo = todoOpen.getAttribute('data-todo');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var todoClear = ev.target.closest('[data-act="todo-clear"]');
      if (todoClear) {
        LBC.adminTodo = '';
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 预览 / 退出预览 */
      var prevOn = ev.target.closest('[data-act="preview-on"]');
      if (prevOn) {
        LBC.previewId = Number(prevOn.getAttribute('data-id'));
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var prevOff = ev.target.closest('[data-act="preview-off"]');
      if (prevOff) {
        LBC.previewId = 0;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 领域选择器 */
      var setCat = ev.target.closest('[data-act="set-cat"]');
      if (setCat) {
        var catExp = LB.expById(Number(setCat.getAttribute('data-exp')));
        var catId = Number(setCat.getAttribute('data-id'));
        if (catExp) { catExp.cat = catId; catExp.updatedAt = LB.today; }
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 反馈表单：选类型（状态存起来，加图重渲染不会丢） */
      var kindBtn = ev.target.closest('[data-act="fb-kind"]');
      if (kindBtn) {
        LBC.fbKind = kindBtn.getAttribute('data-kind');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var cancelForm = ev.target.closest('[data-act="fb-cancel-form"]');
      if (cancelForm) {
        LBC.fbKind = '';
        LBC.fbContent = '';
        LBC.fbImages = [];
        if (nav && nav.back) nav.back();
        return;
      }
      /* 反馈图片：选图 / 删图（真能点，最多 3 张） */
      var addImg = ev.target.closest('[data-act="fb-add-img"]');
      if (addImg) {
        if (LBC.fbImages.length >= 3) { LBC.toast('最多 3 张图片'); return; }
        LBC.fbImages.push({ uri: LB.imgUri(LBC.fbImages.length + 1), name: '图片 ' + (LBC.fbImages.length + 1) });
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var delImg = ev.target.closest('[data-act="fb-del-img"]');
      if (delImg) {
        var di = Number(delImg.getAttribute('data-i'));
        if (di >= 0 && di < LBC.fbImages.length) LBC.fbImages.splice(di, 1);
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var sendBtn = ev.target.closest('[data-act="fb-send"]');
      if (sendBtn) {
        var hint = root.querySelector('[data-fb-hint]');
        var area = root.querySelector('[data-fb-content]');
        var content = String(LBC.fbContent || (area ? area.value : '')).trim();
        if (!LBC.fbKind) {
          if (hint) { hint.textContent = '请先选择一项反馈类型。'; hint.style.display = 'block'; }
          return;
        }
        if (!content) {
          if (hint) { hint.textContent = '请具体描述问题，便于尽快处理。'; hint.style.display = 'block'; }
          return;
        }
        var id = sendBtn.getAttribute('data-id');
        var exp = id ? LB.expById(Number(id)) : null;
        LBC.addFeedback({
          targetType: exp ? 'experience' : 'project',
          targetId: exp ? exp.id : null,
          kind: LBC.fbKind,
          content: content,
          images: LBC.fbImages.slice()
        });
        LBC.fbImages = [];
        LBC.fbKind = '';
        LBC.fbContent = '';
        LBC.toast('反馈已提交，可在「我的反馈」查看进展');
        if (nav && nav.go) nav.go('inbox', {});
        return;
      }

      /* 收藏夹：搜索 / 清空 / 按领域收窄 */
      var favSearch = ev.target.closest('[data-act="fav-search"]');
      if (favSearch) {
        var fqi = root.querySelector('[data-fav-q]');
        LBC.favQ = fqi ? String(fqi.value || '').trim() : '';
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var favClear = ev.target.closest('[data-act="fav-clear"]');
      if (favClear) {
        LBC.favQ = '';
        LBC.favCat = 0;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var favCat = ev.target.closest('[data-act="fav-cat"]');
      if (favCat) {
        var fc = Number(favCat.getAttribute('data-cat')) || 0;
        LBC.favCat = LBC.favCat === fc ? 0 : fc;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 管理端搜索：点按钮或回车都算「搜了」 */
      var adminSearch = ev.target.closest('[data-act="admin-search"]');
      if (adminSearch) {
        var ai = root.querySelector('[data-admin-q]');
        LBC.adminQ = ai ? String(ai.value || '').trim() : '';
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var adminClear = ev.target.closest('[data-act="admin-clear"]');
      if (adminClear) {
        LBC.adminQ = '';
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var fbSearch = ev.target.closest('[data-act="fb-search"]');
      if (fbSearch) {
        var fi = root.querySelector('[data-fb-q]');
        LBC.fbQ = fi ? String(fi.value || '').trim() : '';
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var fbClear = ev.target.closest('[data-act="fb-clear"]');
      if (fbClear) {
        LBC.fbQ = '';
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 反馈盒筛选 */
      var filterBtn = ev.target.closest('[data-act="fb-filter"]');
      if (filterBtn) {
        LBC.fbFilter = filterBtn.getAttribute('data-key');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 重建索引：给个反馈，不跳回本页 */
      var reindex = ev.target.closest('[data-act="reindex"]');
      if (reindex) {
        LBC.toast('已开始重建索引（演示数据，无实际索引）');
        return;
      }
      /* 反馈 → 编辑器：标了采纳就得真的把内容改了 */
      var fbEdit = ev.target.closest('[data-act="fb-edit"]');
      if (fbEdit) {
        var fe = LBC.fbOf(fbEdit.getAttribute('data-id'));
        if (fe && fe.targetId) {
          LBC.fbLink = fe.id;
          if (nav && nav.go) nav.go('admin-edit', { id: fe.targetId });
        }
        return;
      }
      var fbLinkCancel = ev.target.closest('[data-act="fb-link-cancel"]');
      if (fbLinkCancel) {
        LBC.fbLink = 0;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var fbSaveDone = ev.target.closest('[data-act="fb-save-done"]');
      if (fbSaveDone) {
        var done = LBC.fbOf(fbSaveDone.getAttribute('data-id'));
        if (done) {
          done.status = 'accepted';
          done.reply = done.reply || '已核实并更新内容。';
          done.repliedAt = LB.today;
          if (done.targetId) {
            var de = LB.expById(done.targetId);
            if (de) de.updatedAt = LB.today;
          }
          LBC.fbLink = 0;
          LBC.toast('内容已更新，反馈标记为「已采纳」');
          if (nav && nav.go) nav.go('admin-feedback', {});
        }
        return;
      }
      /* 编辑器：立场切换 / 加要点 / 加依据 / 加标签 */
      var stance = ev.target.closest('[data-act="stance"]');
      if (stance) {
        var exp2 = LBC.findPoint(stance.getAttribute('data-id'));
        if (exp2) {
          var p = exp2.point;
          p.s = p.s === 'good' ? 'bad' : p.s === 'bad' ? 'neutral' : 'good';
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }
      var addPoint = ev.target.closest('[data-act="add-point"]');
      if (addPoint) {
        var e1 = LB.expById(Number(addPoint.getAttribute('data-id')));
        if (e1) {
          e1.points.push({ id: e1.id * 100 + e1.points.length + 1, experienceId: e1.id, s: 'neutral',
            t: '新要点（尚未填写理由）', d: '', a: '' });
          e1.updatedAt = LB.today;
          LBC.toast('已添加要点，理由与适用条件尚未填写');
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }
      var addSource = ev.target.closest('[data-act="add-source"]');
      if (addSource) {
        var e2 = LB.expById(Number(addSource.getAttribute('data-id')));
        if (e2) {
          e2.sources.push({ id: e2.id * 1000 + e2.sources.length + 1, experienceId: e2.id, pointIds: [],
            t: '新依据（尚未填写链接）', url: '', type: 'article', platform: '', author: '', date: '', note: '' });
          e2.updatedAt = LB.today;
          LBC.toast('已添加依据，请指定其所支撑的要点');
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }
      var addTag = ev.target.closest('[data-act="add-tag"]');
      if (addTag) {
        var e3 = LB.expById(Number(addTag.getAttribute('data-id')));
        if (e3 && e3.tags.length < 4) {
          var pool = LB.tagsOf(e3.cat);
          for (var i = 0; i < pool.length; i++) {
            if (e3.tags.indexOf(pool[i].name) < 0) { e3.tags.push(pool[i].name); break; }
          }
          if (nav && nav.rerender) nav.rerender();
        } else {
          LBC.toast('最多 4 个标签');
        }
        return;
      }

      var saveDraft = ev.target.closest('[data-act="save-draft"]');
      if (saveDraft) {
        var e4 = LB.expById(Number(saveDraft.getAttribute('data-id')));
        if (e4) {
          e4.status = 'draft';
          e4.updatedAt = LB.today;
          LBC.toast('已存为草稿，读者侧不可见');
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }
      /* 已发布内容要下架，用词得是「撤回发布」，而且要二次确认 */
      var unpublish = ev.target.closest('[data-act="unpublish"]');
      if (unpublish) {
        var e4b = LB.expById(Number(unpublish.getAttribute('data-id')));
        if (!e4b) return;
        if (LBC.confirmUnpublish !== e4b.id) {
          LBC.confirmUnpublish = e4b.id;
          LBC.toast('撤回后读者侧将不再显示该内容，请再次点击确认');
          if (nav && nav.rerender) nav.rerender();
          return;
        }
        e4b.status = 'draft';
        e4b.updatedAt = LB.today;
        LBC.confirmUnpublish = 0;
        LBC.toast('已撤回发布，读者侧不再显示');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var publish = ev.target.closest('[data-act="publish"]');
      if (publish) {
        var e5 = LB.expById(Number(publish.getAttribute('data-id')));
        if (!e5) return;
        /* 发布前校验（设计文档 §6.3 的完整性断言）：
           判定放在数据层 LBC.publishCheck —— 界面只负责把提示显示得友好。 */
        var bad = LBC.publishCheck(e5);
        if (bad) {
          LBC.toast(bad);
          var ph = root.querySelector('[data-publish-hint]');
          if (ph) { ph.textContent = bad; ph.style.display = 'block'; }
          return;
        }
        e5.status = 'published';
        e5.updatedAt = LB.today;
        LBC.confirmUnpublish = 0;
        LBC.toast('已发布，读者侧可查看');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      /* 要点：排序与删除。删要点必须同时把别的依据里的引用剔掉，
         否则「这条依据支撑第 3 条要点」会指向一条已经不存在的要点。 */
      var pointUp = ev.target.closest('[data-act="point-up"]');
      if (pointUp) { LBC.movePoint(pointUp.getAttribute('data-id'), -1); if (nav && nav.rerender) nav.rerender(); return; }
      var pointDown = ev.target.closest('[data-act="point-down"]');
      if (pointDown) { LBC.movePoint(pointDown.getAttribute('data-id'), 1); if (nav && nav.rerender) nav.rerender(); return; }
      var pointDel = ev.target.closest('[data-act="point-del"]');
      if (pointDel) {
        var pd = LBC.findPoint(pointDel.getAttribute('data-id'));
        /* 删除走数据层：连带清掉依据上的引用，不留悬空 id */
        if (pd && LBC.removePoint(pd.exp.id, pd.point.id)) {
          LBC.toast('已删除要点，并清理了依据上的关联');
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }
      /* 依据：排序与删除 */
      var srcUp = ev.target.closest('[data-act="src-up"]');
      if (srcUp) { LBC.moveSource(srcUp.getAttribute('data-id'), -1); if (nav && nav.rerender) nav.rerender(); return; }
      var srcDown = ev.target.closest('[data-act="src-down"]');
      if (srcDown) { LBC.moveSource(srcDown.getAttribute('data-id'), 1); if (nav && nav.rerender) nav.rerender(); return; }
      var srcDel = ev.target.closest('[data-act="src-del"]');
      if (srcDel) {
        var sd = LBC.findSource(srcDel.getAttribute('data-id'));
        if (sd && LBC.removeSource(sd.exp.id, sd.src.id)) {
          LBC.toast('已删除依据');
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }
      /* 依据勾选支撑哪条要点 —— 设计文档 §2.2 的核心数据结构 */
      var linkPoint = ev.target.closest('[data-act="link-point"]');
      if (linkPoint) {
        var sid = Number(linkPoint.getAttribute('data-id'));
        var pid = Number(linkPoint.getAttribute('data-point'));
        var src = null;
        LB.experiences.forEach(function (e) {
          e.sources.forEach(function (s) { if (s.id === sid) src = s; });
        });
        if (src) {
          var idx = src.pointIds.indexOf(pid);
          if (idx >= 0) src.pointIds.splice(idx, 1); else src.pointIds.push(pid);
          LBC.toast(idx >= 0 ? '已取消该依据对要点的支撑' : '该依据现已关联此要点');
          if (nav && nav.rerender) nav.rerender();
        }
        return;
      }

      /* 标签页：改名 / 新增，原来全是弹一句「演示」 */
      var tagRename = ev.target.closest('[data-act="tag-rename"]');
      if (tagRename) {
        LBC.tagEdit = Number(tagRename.getAttribute('data-id'));
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var tagEditCancel = ev.target.closest('[data-act="tag-edit-cancel"]');
      if (tagEditCancel) {
        LBC.tagEdit = 0;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var tagRenameSave = ev.target.closest('[data-act="tag-rename-save"]');
      if (tagRenameSave) {
        var tid = Number(tagRenameSave.getAttribute('data-id'));
        var tin = root.querySelector('input[data-act="tag-rename-save"][data-id="' + tid + '"]');
        var newName = tin ? String(tin.value || '').trim() : '';
        var tag = null;
        LB.tags.forEach(function (t) { if (t.id === tid) tag = t; });
        if (tag && newName && newName !== tag.name) {
          var oldName = tag.name;
          tag.name = newName;
          /* 改名要同步经验上的标签，否则经验上还挂着旧名字 */
          LB.experiences.forEach(function (e) {
            var k = e.tags.indexOf(oldName);
            if (k >= 0) e.tags[k] = newName;
          });
          LBC.toast('标签已改名，相关经验同步更新');
        }
        LBC.tagEdit = 0;
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var addTagDef = ev.target.closest('[data-act="add-tagdef"]');
      if (addTagDef) {
        var nameIn = root.querySelector('[data-act="new-tag-name"]');
        var catIn = root.querySelector('[data-act="new-tag-cat"]');
        var nm = nameIn ? String(nameIn.value || '').trim() : '';
        var cid = catIn ? Number(catIn.value) : (LB.categories[0] && LB.categories[0].id);
        if (!nm) { LBC.toast('请先填写标签名称'); return; }
        var dup = LB.tags.filter(function (t) { return t.cat === cid && t.name === nm; });
        if (dup.length) { LBC.toast('该领域下已有同名标签'); return; }
        var maxT = 0;
        LB.tags.forEach(function (t) { if (t.id > maxT) maxT = t.id; });
        LB.tags.push({ id: maxT + 1, name: nm, cat: cid });
        LBC.toast('已新增标签「' + nm + '」');
        if (nav && nav.rerender) nav.rerender();
        return;
      }
    });

    /* 搜索框回车即搜 —— 键盘也能用，不用非得点按钮 */
    root.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      /* 收藏夹搜索框：回车即搜 */
      var fqIn = ev.target.closest('[data-fav-q]');
      if (fqIn) {
        LBC.favQ = String(fqIn.value || '').trim();
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var aq = ev.target.closest('[data-admin-q]');
      if (aq) {
        LBC.adminQ = String(aq.value || '').trim();
        if (nav && nav.rerender) nav.rerender();
        return;
      }
      var fq = ev.target.closest('[data-fb-q]');
      if (fq) {
        LBC.fbQ = String(fq.value || '').trim();
        if (nav && nav.rerender) nav.rerender();
        return;
      }
    });

    /* 反馈表单：写的文字存在状态层。加图会整页重渲染，
       只放 DOM 里的话，选好的类型和写了一半的内容都会被清空。 */
    root.addEventListener('input', function (ev) {
      var ta = ev.target.closest('[data-fb-content]');
      if (ta) LBC.fbContent = String(ta.value || '');
    });

    /* 依据的引用理由、结论、标题、补充说明，以及要点与依据的各个字段都可以直接改 */
    root.addEventListener('change', function (ev) {
      var input = ev.target.closest('[data-act="note-edit"]');
      if (input) {
        var sid = Number(input.getAttribute('data-id'));
        var val = String(input.value || '').trim();
        LB.experiences.forEach(function (e) {
          e.sources.forEach(function (s) { if (s.id === sid) s.note = val; });
        });
        LBC.toast('引用理由改了');
        return;
      }
      /* 结论先行是这个库的核心承诺，管理员最常改的就是结论 —— 编辑器不能只读 */
      var tIn = ev.target.closest('[data-act="title-edit"]');
      if (tIn) { setExpField(tIn, 'title', '标题改了'); return; }
      var sIn = ev.target.closest('[data-act="summary-edit"]');
      if (sIn) { setExpField(sIn, 'summary', '结论改了'); return; }
      var bIn = ev.target.closest('[data-act="body-edit"]');
      if (bIn) { setExpField(bIn, 'body', '补充说明改了'); return; }
      /* 搜索关键词：用「、」或逗号分隔，最多 3 个；空着就是不做同义召回 */
      var kwIn = ev.target.closest('[data-act="keywords-edit"]');
      if (kwIn) {
        var kexp = LB.expById(Number(kwIn.getAttribute('data-id')));
        var parts = String(kwIn.value || '').split(/[、,，\s]+/).filter(Boolean).slice(0, 3);
        if (kexp) {
          kexp.keywords = parts;
          kexp.updatedAt = LB.today;
          LBC.toast(parts.length ? '关键词：' + parts.join('、') : '已清空关键词');
        }
        return;
      }

      /* 要点字段 */
      var ptTitle = ev.target.closest('[data-act="point-title"]');
      if (ptTitle) { setPointField(ptTitle, 't', '要点标题改了'); return; }
      var ptDetail = ev.target.closest('[data-act="point-detail"]');
      if (ptDetail) { setPointField(ptDetail, 'd', '要点理由改了'); return; }
      var ptApplies = ev.target.closest('[data-act="point-applies"]');
      if (ptApplies) { setPointField(ptApplies, 'a', '适用条件改了'); return; }

      /* 依据字段 */
      var sTitle = ev.target.closest('[data-act="src-title"]');
      if (sTitle) { setSrcField(sTitle, 't', '依据标题改了'); return; }
      var sUrl = ev.target.closest('[data-act="src-url"]');
      if (sUrl) { setSrcField(sUrl, 'url', '链接改了'); return; }
      var sPlat = ev.target.closest('[data-act="src-platform"]');
      if (sPlat) { setSrcField(sPlat, 'platform', '平台改了'); return; }
      var sType = ev.target.closest('[data-act="src-type"]');
      if (sType) { setSrcField(sType, 'type', '类型改了'); return; }
      var sAuthor = ev.target.closest('[data-act="src-author"]');
      if (sAuthor) { setSrcField(sAuthor, 'author', '作者改了'); return; }
      var sDate = ev.target.closest('[data-act="src-date"]');
      if (sDate) { setSrcField(sDate, 'date', '日期改了'); return; }
    });

    function setExpField (el, key, msg) {
      var eid = Number(el.getAttribute('data-id'));
      var exp = LB.expById(eid);
      if (!exp) return;
      exp[key] = String(el.value || '').trim();
      exp.updatedAt = LB.today;
      LBC.toast(msg);
    }
    function setPointField (el, key, msg) {
      var pid = Number(el.getAttribute('data-id'));
      var hit = LBC.findPoint(pid);
      if (!hit) return;
      hit.point[key] = String(el.value || '').trim();
      hit.exp.updatedAt = LB.today;
      LBC.toast(msg);
    }
    function setSrcField (el, key, msg) {
      var sid = Number(el.getAttribute('data-id'));
      var hit = LBC.findSource(sid);
      if (!hit) return;
      hit.src[key] = String(el.value || '').trim();
      hit.exp.updatedAt = LB.today;
      LBC.toast(msg);
    }
  };

})();












