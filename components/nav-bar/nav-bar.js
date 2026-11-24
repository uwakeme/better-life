/**
 * 自定义导航条
 *
 * 职责：渲染返回 / 标题 / 右侧动作位，并按微信胶囊的几何避让。
 * 全站自定义导航（设计文档 §14 D12），所以每个页面都要用它。
 */
var nav = require('../../utils/nav');

Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: true },
    showShare: { type: Boolean, value: false },
    showStar: { type: Boolean, value: false },
    starred: { type: Boolean, value: false },
    /** 胶囊避让的额外留白（px） */
    reserve: { type: Number, value: 0 }
  },

  data: {
    barHeight: 44,
    rightReserve: 96
  },

  lifetimes: {
    attached: function () {
      this.setData({
        barHeight: nav.barHeight(),
        rightReserve: nav.reserveRight() + this.data.reserve
      });
    }
  },

  methods: {
    onBack: function () {
      this.triggerEvent('back');
      /* 页面栈只有一页时（从分享卡直接进详情页）navigateBack 会失败，
         兜底回首页，别让「返回」按钮点了没反应。 */
      wx.navigateBack({
        delta: 1,
        fail: function () {
          wx.switchTab({ url: '/pages/home/home' });
        }
      });
    },
    onShare: function () {
      this.triggerEvent('share');
    },
    onStar: function () {
      this.triggerEvent('star');
    }
  }
});
