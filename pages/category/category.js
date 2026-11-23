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
    total: 0
  },

  onLoad: function (query) {
    var cid = Number(query && query.categoryId ? query.categoryId : 0);
    var tid = Number(query && query.tagId ? query.tagId : 0);
    this.setData({ categoryId: cid, tagId: tid });
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return Promise.all([
      api.getCategories(),
      api.listExperiences({ categoryId: this.data.categoryId, size: 100 })
    ]).then(function (res) {
      var cats = res[0].categories || [];
      var allTags = res[0].tags || [];
      var name = '';
      var desc = '';
      for (var i = 0; i < cats.length; i++) {
        if (cats[i].id === self.data.categoryId) {
          name = cats[i].name;
          desc = cats[i].desc;
        }
      }
      /* 本领域的二级标签 */
      var mine = [];
      for (var j = 0; j < allTags.length; j++) {
        if (allTags[j].categoryId === self.data.categoryId) {
          mine.push({ id: allTags[j].id, name: allTags[j].name });
        }
      }
      var list = res[1].items || [];
      var cards = [];
      for (var k = 0; k < list.length; k++) cards.push(view.cardView(list[k]));
      self.setData({
        loading: false,
        source: res[0].source || 'demo',
        categoryName: name,
        categoryDesc: desc,
        tags: mine,
        cards: cards,
        total: list.length
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  /** 单选筛选：再点一次取消 */
  onTag: function (e) {
    var id = Number(e.detail.value || 0);
    this.setData({ tagId: id });
    this.applyFilter();
  },

  applyFilter: function () {
    var self = this;
    this.setData({ loading: true });
    api.listExperiences({
      categoryId: this.data.categoryId,
      tagId: this.data.tagId,
      size: 100
    }).then(function (res) {
      var list = res[1].items || [];
      var cards = [];
      for (var i = 0; i < list.length; i++) cards.push(view.cardView(list[i]));
      self.setData({ loading: false, cards: cards, total: list.length });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
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
