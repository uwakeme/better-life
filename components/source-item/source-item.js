/**
 * 依据条目
 *
 * 职责：渲染一条依据 —— 标题、平台 / 作者 / 日期、引用理由，以及链接处理。
 * 链接一律「复制链接 + 提示去浏览器打开」：个人主体配不了业务域名，
 * web-view 打开外链这条路封死（设计文档 §11 / §16 第 8 条）。
 */
Component({
  properties: {
    source: { type: Object, value: {} },
    /** 紧凑模式（详情页要点内联） */
    compact: { type: Boolean, value: false }
  },

  methods: {
    onCopy: function () {
      var url = this.data.source.url;
      if (!url) return;
      wx.setClipboardData({
        data: url,
        success: function () {
          wx.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none', duration: 2200 });
        },
        fail: function () {
          wx.showToast({ title: '复制失败，请手动长按选择', icon: 'none' });
        }
      });
      this.triggerEvent('copy', { url: url });
    }
  }
});
