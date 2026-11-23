/**
 * 经验详情页
 *
 * 职责：展示一条经验的结论、要点（依据内联折叠）、相关经验，
 * 并常驻底部操作条（投票 / 反馈 / 收藏 / 分享）。
 * 口径（设计文档 §3.2 / §3.4 / §4.3 / §10）：
 *   1. 要点默认折叠，展开后就地给出「为什么」「适用条件」和该要点挂着的依据卡 ——
 *      依据全文只在详情页出现一次，页面底部不再整段罗列全部依据。
 *   2. 操作条吸底，长页面不用滚很久才够得着投票与反馈。
 *   3. 管理员不提交反馈（§4.3）—— 管理员视角下不渲染「反馈」按钮。
 *   4. 只有普通用户能投票（§6.2）。
 *   5. 分享落地即本页（§10.1）。
 */
var api = require('../../utils/api');
var view = require('../../utils/view');
var role = require('../../utils/role');
var auth = require('../../utils/auth');
var share = require('../../utils/share');

/** 需要额外免责提示的领域：健康、钱财、办事维权（§2.5） */
var DISCLAIMER_CATS = {
  5: '本条内容属于健康常识，不构成医疗建议。身体不适请及时就医，用药请遵医嘱。',
  6: '本条内容提供的是常见做法参考。涉及金额较大或法律关系时，请以合同与官方口径为准。',
  7: '本条内容整理的是常见处理路径。具体维权方案请结合合同与证据，必要时咨询专业机构。'
};

Page({
  data: {
    loading: true,
    error: '',
    offline: false,
    id: 0,
    experience: null,
    points: [],
    related: [],
    sourceCount: 0,
    tagLine: '',
    usefulCount: 0,
    notUsefulCount: 0,
    starred: false,
    voted: '',
    disclaimer: '',
    disputed: false,
    updatedLine: '',
    isAdmin: false
  },

  onLoad: function (query) {
    var id = Number(query && query.id ? query.id : 0);
    this.setData({ id: id, isAdmin: role.isAdmin() });
    this.load();
  },

  onShow: function () {
    /* 从编辑页返回时，管理员改过的内容要能看出来 */
    this.setData({ isAdmin: role.isAdmin() });
  },

  load: function () {
    var self = this;
    var id = this.data.id;
    this.setData({ loading: true, error: '', offline: false });
    return api.getExperience(id).then(function (res) {
      var exp = res.experience || {};
      var points = exp.points || [];
      var sources = exp.sources || [];
      var views = [];
      for (var i = 0; i < points.length; i++) {
        views.push(view.pointView(points[i], sources, i));
      }
      var related = [];
      var rel = res.related || [];
      for (var j = 0; j < rel.length; j++) {
        related.push(view.cardView(rel[j]));
      }
      var catId = Number(exp.categoryId || 0);
      var tagNames = exp.tagNames || res.tags || [];
      var tagLine = tagNames.join(' · ');
      self.setData({
        tagLine: tagLine,
        loading: false,
        experience: exp,
        points: views,
        related: related,
        sourceCount: sources.length,
        usefulCount: res.usefulCount || exp.usefulCount || 0,
        notUsefulCount: res.notUsefulCount || exp.notUsefulCount || 0,
        disclaimer: DISCLAIMER_CATS[catId] || '',
        disputed: exp.confidence === 'disputed',
        updatedLine: exp.updatedAt ? ('更新于 ' + exp.updatedAt + ' · 内容可能随时间变化') : '内容可能随时间变化'
      });
      self.syncStar();
    }).catch(function (err) {
      var code = err && err.code;
      if (code === 'NOT_FOUND') {
        self.setData({ loading: false, offline: true });
        return;
      }
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  /** 收藏态：收藏列表里有没有这一条 */
  syncStar: function () {
    var self = this;
    var id = this.data.id;
    return api.listFavorites({ size: 200 }).then(function (res) {
      var items = res.items || [];
      var hit = false;
      for (var i = 0; i < items.length; i++) {
        if (Number(items[i].id) === Number(id)) { hit = true; break; }
      }
      self.setData({ starred: hit });
    }).catch(function () {
      /* 拉不到收藏列表不影响阅读，收藏态保持原样 */
    });
  },

  retry: function () {
    this.load();
  },

  goHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  },

  goSearch: function () {
    wx.switchTab({ url: '/pages/search/search' });
  },

  goSource: function () {
    wx.navigateTo({ url: '/pages/source/source?experienceId=' + this.data.id });
  },

  openRelated: function (e) {
    var id = e.detail.id;
    wx.redirectTo({ url: '/pages/detail/detail?id=' + id });
  },

  /* ---------- 收藏（乐观更新，失败回滚） ---------- */

  onStar: function () {
    var self = this;
    var id = this.data.id;
    var next = !this.data.starred;
    this.setData({ starred: next });
    var call = next ? api.addFavorite(id) : api.removeFavorite(id);
    return call.then(function () {
      wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' });
    }).catch(function (err) {
      self.setData({ starred: !next });
      if (err && err.code === 'UNAUTHORIZED') {
        self.loginThen(function () {
          self.onStar();
        });
        return;
      }
      wx.showToast({ title: '未生效，请稍后重试', icon: 'none' });
    });
  },

  /* ---------- 投票（只有普通用户能投） ---------- */

  onVote: function (e) {
    if (!role.canVote()) {
      wx.showToast({ title: '管理员不参与投票', icon: 'none' });
      return;
    }
    var useful = e.currentTarget.dataset.v === 'up';
    this.doVote(this.data.id, useful, 0);
  },

  doVote: function (id, useful, retry) {
    var self = this;
    return api.vote(id, useful).then(function (res) {
      self.setData({
        voted: useful ? 'up' : 'down',
        usefulCount: res.usefulCount || 0,
        notUsefulCount: res.notUsefulCount || 0
      });
      wx.showToast({ title: useful ? '已记为有用' : '已记为没用', icon: 'none' });
    }).catch(function (err) {
      if (err && err.code === 'UNAUTHORIZED' && retry === 0) {
        self.loginThen(function () { self.doVote(id, useful, 1); });
        return;
      }
      wx.showToast({ title: '未生效，请稍后重试', icon: 'none' });
    });
  },

  /* ---------- 反馈（管理员不提交） ---------- */

  goFeedback: function () {
    if (!role.canSubmitFeedback()) {
      wx.showToast({ title: '管理员直接修改内容即可', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/feedback/feedback?targetType=experience&targetId=' + this.data.id
    });
  },

  /* ---------- 分享 ---------- */

  loginThen: function (fn) {
    return auth.login().then(function (u) {
      if (!u) {
        wx.showToast({ title: '登录未完成，请稍后再试', icon: 'none' });
        return;
      }
      fn();
    });
  },

  onShareAppMessage: function () {
    return share.detailShare(this.data.experience);
  },

  onShareTimeline: function () {
    var exp = this.data.experience || {};
    return {
      title: exp.title || '生活经验库',
      query: 'id=' + this.data.id
    };
  }
});
