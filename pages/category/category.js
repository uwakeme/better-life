/**
 * 领域详情页
 *
 * 职责：该领域下的经验列表 + 二级标签单选筛选。
 * 口径（设计文档 §2.4）：标签筛选是单选 —— 一次只看一个标签，再点一次取消；
 * 不做多选是因为多选很容易组合出空结果，读者会以为这个领域是空的。
 */
var api = require('../../utils/api');
var view = require('../../utils/view');

Page({
  data: {
    loading: true,
    error: '',
    source: '',
    categoryId: 0,
    categoryName: '',
    categoryDesc: '',
    tags: [],
    tagId: 0,
    cards: [],
    total: 0,
    page: 1,
    size: 10,
    hasMore: false,
    loadingMore: false
  },

  onLoad: function (query) {
    var cid = Number(query && query.categoryId ? query.categoryId : 0);
    var tid = Number(query && query.tagId ? query.tagId : 0);
    this.setData({ categoryId: cid, tagId: tid });
    this.load();
  },

  onReachBottom: function () {
    this.loadList(true);
  },

  load: function () {
    return Promise.all([this.loadCats(), this.loadList(false)]);
  },

  loadCats: function () {
    var self = this;
    return api.getCategories().then(function (res) {
      var cats = res.categories || [];
      var allTags = res.tags || [];
      var name = '';
      var desc = '';
      for (var i = 0; i < cats.length; i++) {
        if (cats[i].id === self.data.categoryId) {
          name = cats[i].name;
          desc = cats[i].description || cats[i].desc || '';
        }
      }
      var mine = [];
      for (var j = 0; j < allTags.length; j++) {
        if (allTags[j].categoryId === self.data.categoryId) {
          mine.push({ id: allTags[j].id, name: allTags[j].name });
        }
      }
      self.setData({
        source: res.source || 'demo',
        categoryName: name,
        categoryDesc: desc,
        tags: mine
      });
    }).catch(function () { /* 领域信息失败不影响经验列表 */ });
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
      categoryId: this.data.categoryId,
      tagId: this.data.tagId || undefined,
      page: page,
      size: this.data.size
    }).then(function (res) {
      if (seq !== self.listSeq) return;
      var fresh = [];
      var list = res.items || [];
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

  /** 单选筛选：再点一次取消 */
  onTag: function (e) {
    var id = Number(e.detail.value || 0);
    this.setData({ tagId: id });
    this.applyFilter();
  },

  applyFilter: function () {
    return this.loadList(false);
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
