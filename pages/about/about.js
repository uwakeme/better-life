/**
 * 关于与隐私
 *
 * 职责：说明这个库是什么、内容怎么来的、数据怎么用。
 * 口径：隐私走官方协议（wx.openPrivacyContract），不自己写协议正文；
 * 读者侧不出现角色名（设计文档 §4.3 / §13.4）。
 */
Page({
  data: {
    privacyAvailable: false
  },

  onLoad: function () {
    /* 隐私协议能不能开，由基础库决定 */
    var ok = false;
    if (typeof wx !== 'undefined' && wx !== null && typeof wx.openPrivacyContract === 'function') {
      ok = true;
    }
    this.setData({ privacyAvailable: ok });
  },

  openPrivacy: function () {
    if (!this.data.privacyAvailable) {
      wx.showToast({ title: '当前环境不支持查看隐私指引', icon: 'none' });
      return;
    }
    wx.openPrivacyContract({
      fail: function () {
        wx.showToast({ title: '隐私指引暂时无法打开', icon: 'none' });
      }
    });
  }
});
