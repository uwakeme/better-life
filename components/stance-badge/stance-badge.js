/**
 * 立场贴纸
 *
 * 职责：把「推荐 / 避雷 / 中立」同时用颜色、符号、文字三个通道表达。
 * 三个通道缺一不可 —— 只靠颜色，色弱用户与黑白截图都会失效（设计文档 §2.3）。
 * 中立用破折号不用问号：问号留给「有争议」。
 */
Component({
  properties: {
    stance: { type: Object, value: { tone: 'neutral', sym: '—', text: '中立' } },
    sm: { type: Boolean, value: false }
  }
});
