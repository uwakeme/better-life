/**
 * 我的
 *
 * 职责：收藏夹入口、我的反馈（仅普通用户）、管理入口（仅管理员）、关于与隐私，
 * 以及开发模式面板（身份切换 + 演示场景切换）。
 * 口径（设计文档 §3.2 / §4.3 / §14 D13）：
 *   1. 管理员不提交反馈 —— 管理员视角下不出现「我的反馈」入口。
 *   2. 身份行只在本人就是管理员时才显示；普通用户看不到任何角色标签。
 *   3. 头像与名称用统一的默认形象，不取真实头像昵称。
 */
var api = require('../../utils/api');
var role = require('../../utils/role');
var config = require('../../config/index');

Page({
  data: {
    isAdmin: false,
    favorites: 0,
    myFeedbacks: 0,
    total: 0,
    devPanel: false,
    scenes: [],
    scene: 'default',
    loading: true,
    error: ''
  },

  onLoad: function () {
    this.setData({
      isAdmin: role.isAdmin(),
      devPanel: !!config.devPanel,
      scenes: api.sceneList(),
      scene: api.currentScene()
    });
    this.load();
  },

  onShow: function () {
    /* 身份可能在开发面板里改过，回到本页要同步 */
    this.setData({
      isAdmin: role.isAdmin(),
      scene: api.currentScene()
    });
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return Promise.all([
      api.getMine(),
      api.listExperiences({ size: 1 })
    ]).then(function (res) {
      var m = res[0].metrics || {};
      self.setData({
        loading: false,
        favorites: m.favorites || 0,
        myFeedbacks: m.myFeedbacks || 0,
        total: res[1].total || 0
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  goFavorites: function () {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },

  goInbox: function () {
    wx.navigateTo({ url: '/pages/inbox/inbox' });
  },

  goAdmin: function () {
    wx.navigateTo({ url: '/pages/admin/list/list' });
  },

  goAbout: function () {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  /* ---------- 开发模式面板 ---------- */

  switchRole: function (e) {
    var r = e.currentTarget.dataset.role;
    if (r !== 'admin' && r !== 'user') return;
    role.setRole(r);
    this.setData({ isAdmin: role.isAdmin() });
    wx.showToast({ title: r === 'admin' ? '已切换为管理员' : '已切换为普通用户', icon: 'none' });
  },

  switchScene: function (e) {
    var k = e.currentTarget.dataset.scene;
    api.setScene(k);
    this.setData({ scene: api.currentScene() });
  }
});
