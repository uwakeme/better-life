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
var format = require('../../utils/format');
var role = require('../../utils/role');
var share = require('../../utils/share');

/** 需要额外免责提示的领域：健康、钱财、办事维权（§2.5） */
var DISCLAIMER_SLUGS = {
  health: '本条内容属于健康常识，不构成医疗建议。身体不适请及时就医，用药请遵医嘱。',
  money: '本条内容提供的是常见做法参考。涉及金额较大或法律关系时，请以合同与官方口径为准。',
  rights: '本条内容整理的是常见处理路径。具体维权方案请结合合同与证据，必要时咨询专业机构。'
};

function disclaimerFor (exp) {
  if (exp.categorySlug && DISCLAIMER_SLUGS[exp.categorySlug]) {
    return DISCLAIMER_SLUGS[exp.categorySlug];
  }
  var legacy = { 5: 'health', 6: 'money', 7: 'rights' };
  var slug = legacy[Number(exp.categoryId || 0)];
  return DISCLAIMER_SLUGS[slug] || '';
}

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
      var tagNames = exp.tagNames || res.tags || [];
      var tagLine = tagNames.join(' · ');
      /* 投票态与收藏态由详情接口直接给 ——
         之前 voted 永远是空、收藏态要另外拉整个收藏列表才知道。 */
      var myVote = res.myVote;
      self.setData({
        tagLine: tagLine,
        loading: false,
        experience: exp,
        points: views,
        related: related,
        sourceCount: sources.length,
        usefulCount: res.usefulCount || exp.usefulCount || 0,
        notUsefulCount: res.notUsefulCount || exp.notUsefulCount || 0,
        starred: !!res.starred,
        voted: myVote === true ? 'up' : (myVote === false ? 'down' : ''),
        disclaimer: disclaimerFor(exp),
        disputed: exp.confidence === 'disputed',
        updatedLine: exp.updatedAt ? ('更新于 ' + format.date(exp.updatedAt) + ' · 内容可能随时间变化') : '内容可能随时间变化'
      });
    }).catch(function (err) {
      var code = err && err.code;
      if (code === 'NOT_FOUND') {
        self.setData({ loading: false, offline: true });
        return;
      }
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
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
    this.doVote(this.data.id, useful);
  },

  doVote: function (id, useful) {
    var self = this;
    return api.vote(id, useful).then(function (res) {
      /* 用服务端返回的实际投票态回显 ——
         再点一次同一个是取消投（服务端返回 useful=null），
         之前不管怎样都显示「已记为有用」，票被取消了界面还在说记上了。 */
      var now = (res && typeof res.useful === 'boolean') ? res.useful : null;
      self.setData({
        voted: now === true ? 'up' : (now === false ? 'down' : ''),
        usefulCount: (res && res.usefulCount) || 0,
        notUsefulCount: (res && res.notUsefulCount) || 0
      });
      wx.showToast({ title: now === null ? '已取消投票' : (now ? '已记为有用' : '已记为没用'), icon: 'none' });
    }).catch(function (err) {
      wx.showToast({ title: '未生效，请稍后重试', icon: 'none' });
    });
  },

  /* ---------- 反馈（管理员不提交） ---------- */

  goFeedback: function () {
    if (!role.canSubmitFeedback()) {
      wx.showToast({ title: '管理员直接修改内容即可', icon: 'none' });
      return;
    }
    /* 带上标题 —— 不带的话反馈页一直显示「（当前经验）」，
       读者不知道自己在反馈哪一条。 */
    var title = (this.data.experience && this.data.experience.title) || '';
    wx.navigateTo({
      url: '/pages/feedback/feedback?targetType=experience&targetId=' + this.data.id +
        '&title=' + encodeURIComponent(title)
    });
  },

  /* ---------- 分享 ---------- */

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
