/**
 * 经验卡（列表 / 搜索通用）
 *
 * 职责：把一条经验的视图模型渲染成便签卡。
 * 派生字段（颜色、立场计数、相对时间）由 utils/view.js 算好，这里只渲染。
 */
Component({
  properties: {
    card: { type: Object, value: {} }
  },

  methods: {
    onTap: function () {
      this.triggerEvent('open', { id: this.data.card.id });
    }
  }
});
