/**
 * 收藏夹
 *
 * 职责：列出我收藏的经验，支持按领域筛选与两种排序。
 * 口径：收藏是本机与服务端同步的一条线，列表读收藏接口，不在本地猜。
 */
var api = require('../../utils/api');
var view = require('../../utils/view');
var role = require('../../utils/role');

Page({
  data: {
    loading: true,
    error: '',
    cards: [],
    total: 0,
    categories: [],
    catId: 0,
    sort: 'added',
    isAdmin: false,
    empty: false
  },

  onLoad: function () {
    this.setData({ isAdmin: role.isAdmin() });
    this.loadCats();
    this.load();
  },

  loadCats: function () {
    var self = this;
    return api.getCategories().then(function (res) {
      var cats = res.categories || [];
      var counts = {};
      var list = res.tags || [];
      for (var i = 0; i < list.length; i++) {
        counts[list[i].categoryId] = true;
      }
      var items = [];
      for (var j = 0; j < cats.length; j++) {
        if (!counts[cats[j].id]) continue;
        items.push({ id: cats[j].id, name: cats[j].name });
      }
      self.setData({ categories: items });
    }).catch(function () { /* 筛选项拿不到不影响列表 */ });
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return api.listFavorites({
      categoryId: this.data.catId || undefined,
      sort: this.data.sort
    }).then(function (res) {
      var items = res.items || [];
      var cards = [];
      for (var i = 0; i < items.length; i++) cards.push(view.cardView(items[i]));
      self.setData({
        loading: false,
        cards: cards,
        total: res.total || items.length,
        empty: !items.length
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  setCat: function (e) {
    var id = Number(e.currentTarget.dataset.id || 0);
    this.setData({ catId: this.data.catId === id ? 0 : id });
    this.load();
  },

  setSort: function (e) {
    this.setData({ sort: e.currentTarget.dataset.k });
    this.load();
  },

  openExp: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  goSearch: function () {
    wx.switchTab({ url: '/pages/search/search' });
  },

  retry: function () {
    this.load();
  }
});
