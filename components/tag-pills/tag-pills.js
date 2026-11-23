/**
 * 筛选片组
 *
 * 职责：渲染一组可点的筛选标签。
 * 口径（设计文档 §2.4）：二级标签筛选是**单选** —— 一次只看一个标签，再点一次取消。
 * 不做多选是因为多选很容易组合出空结果，读者会以为这个领域是空的。
 */
Component({
  properties: {
    /** [{ id, name }] */
    items: { type: Array, value: [] },
    /** 当前选中的 id，0 表示全部 */
    value: { type: Number, value: 0 },
    /** 小标题（可空） */
    label: { type: String, value: '' },
    /** 横向滚动（放不下的标签） */
    scroll: { type: Boolean, value: false }
  },

  methods: {
    onPick: function (e) {
      var id = Number(e.currentTarget.dataset.id || 0);
      var next = this.data.value === id ? 0 : id;
      this.triggerEvent('change', { value: next });
    }
  }
});
