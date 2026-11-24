/**
 * 首页
 *
 * 职责：九个领域入口 + 经验流（最近更新 / 收藏最多两种排法）。
 * 口径：
 *   1. 首页只给「最近更新 / 收藏最多」两个贴纸切排序 —— 一份列表两种排法，不分两段（原型 §2）。
 *   2. 领域计数由数据派生，不写死。
 *   3. 数据来自演示数据时顶部如实提示，不把样例包装成真实内容。
 */
var api = require('../../utils/api');
var view = require('../../utils/view');

Page({
  data: {
    loading: true,
    error: '',
    source: '',
    categories: [],
    sort: 'updated',
    cards: [],
    total: 0,
    page: 1,
    size: 10,
    hasMore: false,
    loadingMore: false,
    /* 「全部领域」面板的展开状态 —— wxml 有引用 */
    showAllCats: false
  },

  onLoad: function () {
    this.load();
  },

  onPullDownRefresh: function () {
    this.load().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    this.loadList(true);
  },

  load: function () {
    var self = this;
    var cats = this.data.categories.length ? Promise.resolve(null) : this.loadCats();
    return Promise.all([cats, this.loadList(false)]);
  },

  loadCats: function () {
    var self = this;
    return api.getCategories().then(function (res) {
      var cats = res.categories || [];
      var catItems = [];
      for (var j = 0; j < cats.length; j++) {
        catItems.push({
          id: cats[j].id,
          name: cats[j].name,
          icon: cats[j].icon,
          desc: cats[j].description || cats[j].desc || '',
          count: cats[j].experienceCount || 0
        });
      }
      self.setData({ categories: catItems });
    }).catch(function () { /* 领域入口失败不影响经验流 */ });
  },

  loadList: function (append) {
    var self = this;
    if (append && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) {
      return Promise.resolve();
    }
    var page = append ? this.data.page + 1 : 1;
    var seq = (this.listSeq || 0) + 1;
    this.listSeq = seq;
    this.setData(append ? {
      loadingMore: true, error: ''
    } : {
      loading: true, loadingMore: false, error: '', page: 1, cards: [], total: 0, hasMore: false
    });
    return api.listExperiences({
      sort: this.data.sort,
      page: page,
      size: this.data.size
    }).then(function (res) {
      if (seq !== self.listSeq) return;
      var list = res.items || [];
      var fresh = [];
      for (var i = 0; i < list.length; i++) fresh.push(view.cardView(list[i]));
      var total = typeof res.total === 'number' ? res.total : 0;
      var currentPage = Number(res.page) || page;
      var size = Number(res.size) || self.data.size;
      self.setData({
        loading: false,
        loadingMore: false,
        cards: append ? self.data.cards.concat(fresh) : fresh,
        total: total,
        page: currentPage,
        size: size,
        hasMore: typeof res.hasMore === 'boolean' ? res.hasMore : (currentPage * size < total),
        source: res.source || 'demo'
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

  setSort: function (e) {
    this.setData({ sort: e.currentTarget.dataset.k });
    this.loadList(false);
  },

  goSearch: function () {
    wx.switchTab({ url: '/pages/search/search' });
  },

  goCategory: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/category/category?categoryId=' + id });
  },

  /** 展开「全部领域」面板 —— 面板本身是完整功能，之前只是没有入口 */
  goAllCats: function () {
    this.setData({ showAllCats: !this.data.showAllCats });
  },

  openExp: function (e) {
    var id = e.detail.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  retry: function () {
    this.loadList(!!this.data.cards.length);
  },

  goHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onShareAppMessage: function () {
    return {
      title: '生活经验库 · 查一条用得上的经验',
      path: '/pages/home/home'
    };
  }
});
