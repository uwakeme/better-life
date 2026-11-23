/**
 * 依据来源页
 *
 * 职责：**要点 ↔ 依据 映射视图** —— 按要点分组，每条依据标出它同时支撑哪些要点
 * （设计文档 §3.4）。这一页回答「这些出处各自在支撑什么」，
 * 与详情页分工不重复：详情页回答「这条结论的出处是什么」。
 */
var api = require('../../utils/api');
var view = require('../../utils/view');

Page({
  data: {
    loading: true,
    error: '',
    experienceId: 0,
    title: '',
    groups: [],
    total: 0
  },

  onLoad: function (query) {
    this.setData({ experienceId: Number(query && query.experienceId ? query.experienceId : 0) });
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return Promise.all([
      api.getExperience(this.data.experienceId),
      api.listSources(this.data.experienceId)
    ]).then(function (res) {
      var exp = res[0].experience || {};
      var groups = view.sourceGroups(exp.points || [], exp.sources || []);
      var total = 0;
      for (var i = 0; i < groups.length; i++) total += groups[i].sources.length;
      self.setData({
        loading: false,
        title: exp.title || '',
        groups: groups,
        total: total
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  retry: function () {
    this.load();
  }
});
