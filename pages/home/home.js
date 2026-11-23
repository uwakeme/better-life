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

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return Promise.all([
      api.getCategories(),
      api.listExperiences({ size: 100 })
    ]).then(function (res) {
      var cats = res[0].categories || [];
      var list = res[1].items || [];
      /* 领域计数由数据派生 */
      var counts = {};
      for (var i = 0; i < list.length; i++) {
        var cid = list[i].categoryId;
        counts[cid] = (counts[cid] || 0) + 1;
      }
      var catItems = [];
      for (var j = 0; j < cats.length; j++) {
        catItems.push({
          id: cats[j].id,
          name: cats[j].name,
          icon: cats[j].icon,
          desc: cats[j].desc,
          count: counts[cats[j].id] || 0
        });
      }
      self.setData({
        loading: false,
        source: res[0].source || 'demo',
        categories: catItems,
        raw: list,
        total: list.length
      });
      self.applySort();
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  /** 排序在原始数据上做，排序完再转成视图模型 */
  applySort: function () {
    var list = (this.data.raw || []).slice();
    if (this.data.sort === 'fav') {
      list.sort(function (a, b) { return (b.favoriteCount || 0) - (a.favoriteCount || 0); });
    } else {
      list.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    }
    var cards = [];
    for (var i = 0; i < list.length; i++) cards.push(view.cardView(list[i]));
    this.setData({ cards: cards });
  },

  setSort: function (e) {
    this.setData({ sort: e.currentTarget.dataset.k });
    this.applySort();
  },

  goSearch: function () {
    wx.switchTab({ url: '/pages/search/search' });
  },

  goCategory: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/category/category?categoryId=' + id });
  },

  goAllCats: function () {
    this.setData({ showAllCats: !this.data.showAllCats });
  },

  openExp: function (e) {
    var id = e.detail.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  retry: function () {
    this.load();
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
