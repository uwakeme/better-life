/**
 * 页面状态视图
 *
 * 职责：统一渲染加载中 / 出错 / 空 / 未登录 / 无权限 六种状态（设计文档 §3.5）。
 * 加载中用占位便签骨架屏，不用转圈。
 */
Component({
  properties: {
    /** loading | error | empty | anon | forbidden | offline */
    type: { type: String, value: 'empty' },
    title: { type: String, value: '' },
    text: { type: String, value: '' },
    actionText: { type: String, value: '' }
  },

  methods: {
    onAction: function () {
      this.triggerEvent('action');
    }
  }
});
