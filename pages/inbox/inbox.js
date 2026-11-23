/**
 * 我的反馈
 *
 * 职责：列出我提交过的反馈及处理状态（仅自己可见）。
 * 口径（设计文档 §4.3）：
 *   1. 只给普通用户 —— 管理员不提交反馈，管理员那边只有「反馈盒」。
 *   2. 读者侧图片分三种状态：审核中只显示占位、不显示图片本身；
 *      未通过不展示图片，但用户写的文字照常留着。
 */
var api = require('../../utils/api');
var role = require('../../utils/role');
var format = require('../../utils/format');

Page({
  data: {
    isAdmin: false,
    loading: true,
    error: '',
    items: [],
    empty: false
  },

  onLoad: function () {
    this.setData({ isAdmin: role.isAdmin() });
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return api.listMyFeedbacks().then(function (res) {
      var list = res.items || [];
      var items = [];
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        items.push({
          id: f.id,
          kindLabel: format.FEEDBACK_KIND_LABEL[f.kind] || '反馈',
          statusLabel: format.FEEDBACK_STATUS_LABEL[f.status] || '待处理',
          status: f.status,
          content: f.content || '',
          reply: f.reply || '',
          createdAt: f.createdAt || '',
          mediaStatus: f.mediaStatus || 'none',
          mediaLabel: format.MEDIA_STATUS_LABEL[f.mediaStatus] || '',
          targetType: f.targetType || 'project'
        });
      }
      self.setData({ loading: false, items: items, empty: !items.length });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  goNewFeedback: function () {
    wx.navigateTo({ url: '/pages/feedback/feedback?targetType=project' });
  },

  goAdminFeedback: function () {
    wx.redirectTo({ url: '/pages/admin/feedback/feedback' });
  },

  retry: function () {
    this.load();
  }
});
