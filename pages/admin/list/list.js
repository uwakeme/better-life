/**
 * 管理-列表
 *
 * 职责：管理端的总入口 —— 经验列表（含草稿）、反馈盒、标签管理，
 * 以及一眼能看到的库内指标。
 * 口径（设计文档 §3.2 / §14 D11）：
 *   1. 搜索在应用层做，不开后端检索 —— 管理端要的是精确命中，不是语义召回。
 *   2. 指标全部由数据派生，不写死。
 *   3. 非管理员进来只说明「这一页只有管理员能进」，不给任何操作。
 */
var api = require('../../../utils/api');
var role = require('../../../utils/role');

var STATUS_LABEL = {
  published: '已发布',
  draft: '草稿',
  archived: '已归档'
};

Page({
  data: {
    allowed: false,
    loading: true,
    error: '',
    stats: null,
    items: [],
    categories: [],
    q: '',
    cat: 0,
    goHome: false
  },

  onLoad: function () {
    if (!role.canManage()) {
      this.setData({ allowed: false });
      return;
    }
    this.setData({ allowed: true });
    this.loadCats();
    this.load();
  },

  loadCats: function () {
    var self = this;
    return api.getCategories().then(function (res) {
      var cats = res.categories || [];
      var items = [];
      for (var i = 0; i < cats.length; i++) {
        items.push({ id: cats[i].id, name: cats[i].name });
      }
      self.setData({ categories: items });
    }).catch(function () { /* 筛选项拿不到不影响列表 */ });
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return Promise.all([
      api.listAdminExperiences({ q: this.data.q, cat: this.data.cat }),
      api.getStats()
    ]).then(function (res) {
      var list = res[0].items || [];
      var items = [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        items.push({
          id: e.id,
          title: e.title,
          summary: e.summary,
          categoryName: e.categoryName,
          status: e.status,
          statusLabel: STATUS_LABEL[e.status] || e.status,
          updatedAt: e.updatedAt,
          pointCount: (e.points || []).length,
          sourceCount: (e.sources || []).length,
          tagLine: (e.tagNames || []).join(' · ')
        });
      }
      self.setData({ loading: false, items: items, stats: res[1] });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  onQ: function (e) {
    this.setData({ q: e.detail.value });
  },

  search: function () {
    this.load();
  },

  setCat: function (e) {
    this.setData({ cat: Number(e.currentTarget.dataset.id || 0) });
    this.load();
  },

  newExp: function () {
    wx.navigateTo({ url: '/pages/admin/edit/edit' });
  },

  edit: function (e) {
    wx.navigateTo({ url: '/pages/admin/edit/edit?id=' + e.currentTarget.dataset.id });
  },

  togglePublish: function (e) {
    var self = this;
    var id = Number(e.currentTarget.dataset.id);
    var action = e.currentTarget.dataset.act;
    var call = action === 'publish' ? api.publishExperience(id) : api.unpublishExperience(id);
    return call.then(function () {
      wx.showToast({ title: action === 'publish' ? '已发布' : '已下线', icon: 'none' });
      self.load();
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '未生效，请稍后重试', icon: 'none' });
    });
  },

  goInbox: function () {
    wx.navigateTo({ url: '/pages/admin/feedback/feedback' });
  },

  goTags: function () {
    wx.navigateTo({ url: '/pages/admin/tags/tags' });
  },

  backHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  },

  retry: function () {
    this.load();
  }
});
