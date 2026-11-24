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
var format = require('../../../utils/format');

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
    total: 0,
    page: 1,
    size: 10,
    hasMore: false,
    loadingMore: false,
    categories: [],
    q: '',
    cat: 0,
    /* 状态筛选 —— 服务端 listForAdmin 本来就支持 status，
       之前界面上没有入口，管理员只能自己一条条翻。 */
    status: '',
    statusOptions: [
      { id: '', name: '全部状态' },
      { id: 'published', name: '已发布' },
      { id: 'draft', name: '草稿' },
      { id: 'archived', name: '已归档' }
    ],
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

  onShow: function () {
    if (this.data.allowed) this.setData({ allowed: role.canManage() });
  },

  onReachBottom: function () {
    this.nextPage();
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
    return Promise.all([this.loadList(false), this.loadStats()]);
  },

  loadStats: function () {
    var self = this;
    return api.getStats().then(function (stats) {
      self.setData({ stats: stats });
    }).catch(function () { /* 指标失败不遮挡可重试的经验列表 */ });
  },

  loadList: function (append, targetPage) {
    var self = this;
    if (append && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) {
      return Promise.resolve();
    }
    var page = targetPage || (append ? this.data.page + 1 : 1);
    var seq = (this.listSeq || 0) + 1;
    this.listSeq = seq;
    this.setData(append ? {
      loadingMore: true, error: ''
    } : {
      loading: true, loadingMore: false, error: '', page: page, items: [], total: 0, hasMore: false
    });
    return api.listAdminExperiences({
      q: this.data.q,
      cat: this.data.cat,
      status: this.data.status,
      page: page,
      size: this.data.size
    }).then(function (res) {
      if (seq !== self.listSeq) return;
      var list = res.items || [];
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
          updatedAt: format.date(e.updatedAt) || '',
          pointCount: Number(e.pointCount) || 0,
          sourceCount: Number(e.sourceCount) || 0,
          tagLine: (e.tagNames || []).join(' · ')
        });
      }
      var total = typeof res.total === 'number' ? res.total : 0;
      var currentPage = Number(res.page) || page;
      var size = Number(res.size) || self.data.size;
      self.setData({
        loading: false,
        loadingMore: false,
        items: append ? self.data.items.concat(items) : items,
        total: total,
        page: currentPage,
        size: size,
        hasMore: typeof res.hasMore === 'boolean' ? res.hasMore : (currentPage * size < total)
      });
    }).catch(function (err) {
      if (seq !== self.listSeq) return;
      self.setData({
        loading: false,
        loadingMore: false,
        error: (err && err.message) || '网络不太顺畅，没连上'
      });
    });
  },

  prevPage: function () {
    if (this.data.page > 1 && !this.data.loading && !this.data.loadingMore) {
      this.loadList(false, this.data.page - 1);
    }
  },

  nextPage: function () {
    this.loadList(true);
  },

  onQ: function (e) {
    this.setData({ q: e.detail.value });
  },

  search: function () {
    this.loadList(false);
  },

  setCat: function (e) {
    this.setData({ cat: Number(e.currentTarget.dataset.id || 0) });
    this.loadList(false);
  },

  setStatus: function (e) {
    this.setData({ status: String(e.currentTarget.dataset.id || '') });
    this.loadList(false);
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

  /**
   * 删除一条经验
   *
   * ⚠️ 不可撤销 —— 经验、要点、依据、检索索引会一起消失。
   *    所以必须先弹确认，并把「会一起消失」写清楚，不能只问一句「确定吗」。
   */
  remove: function (e) {
    var self = this;
    var id = Number(e.currentTarget.dataset.id);
    var title = e.currentTarget.dataset.title || '这条经验';
    wx.showModal({
      title: '删除经验',
      content: '确定删除「' + title + '」？这条经验连同它的要点、依据与检索索引都会一并消失，无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        api.deleteExperience(id).then(function () {
          wx.showToast({ title: '已删除', icon: 'none' });
          self.load();
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        });
      }
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
    if (this.data.items.length) this.loadList(true);
    else this.loadList(false, this.data.page || 1);
  }
});
