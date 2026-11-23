/**
 * 要点便签
 *
 * 职责：渲染一条要点 —— 立场贴纸 + 标题，展开后给理由、适用条件，
 * 以及**该要点挂着的依据卡**（依据全文只在详情页出现一次）。
 */
Component({
  properties: {
    point: { type: Object, value: {} }
  },

  data: {
    open: false
  },

  methods: {
    onToggle: function () {
      this.setData({ open: !this.data.open });
      this.triggerEvent('toggle', { open: this.data.open, id: this.data.point.id });
    },
    onCopy: function (e) {
      this.triggerEvent('copy', { url: e.detail.url });
    }
  }
});
