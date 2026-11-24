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
    page: 1,
    size: 10,
    hasMore: false,
    loadingMore: false,
    categories: [],
    catId: 0,
    sort: 'added',
    isAdmin: false,
    empty: false
  },

  onLoad: function () {
    this.setData({ isAdmin: role.isAdmin() });
    this.load();
  },

  onShow: function () {
    this.setData({ isAdmin: role.isAdmin() });
  },

  onReachBottom: function () {
    this.loadList(true);
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
    return Promise.all([this.loadCats(), this.loadList(false)]);
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
      loading: true, loadingMore: false, error: '', page: 1, cards: [], total: 0, hasMore: false, empty: false
    });
    return api.listFavorites({
      categoryId: this.data.catId || undefined,
      sort: this.data.sort,
      page: page,
      size: this.data.size
    }).then(function (res) {
      if (seq !== self.listSeq) return;
      var items = res.items || [];
      var fresh = [];
      for (var i = 0; i < items.length; i++) fresh.push(view.cardView(items[i]));
      var cards = append ? self.data.cards.concat(fresh) : fresh;
      var total = typeof res.total === 'number' ? res.total : 0;
      var currentPage = Number(res.page) || page;
      var size = Number(res.size) || self.data.size;
      self.setData({
        loading: false,
        loadingMore: false,
        cards: cards,
        total: total,
        page: currentPage,
        size: size,
        hasMore: typeof res.hasMore === 'boolean' ? res.hasMore : (currentPage * size < total),
        empty: !cards.length,
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

  setCat: function (e) {
    var id = Number(e.currentTarget.dataset.id || 0);
    this.setData({ catId: this.data.catId === id ? 0 : id });
    this.loadList(false);
  },

  setSort: function (e) {
    this.setData({ sort: e.currentTarget.dataset.k });
    this.loadList(false);
  },

  openExp: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  goSearch: function () {
    wx.switchTab({ url: '/pages/search/search' });
  },

  retry: function () {
    this.loadList(!!this.data.cards.length);
  }
});
