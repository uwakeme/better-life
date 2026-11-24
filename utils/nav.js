/**
 * 自定义导航的几何计算
 *
 * 职责：算出胶囊按钮的位置，页面据此避让（设计文档 §14 D12）。
 * 背景：全站自定义导航，页面自己的按钮只能排在胶囊左边。
 * 真机几何：胶囊约 87x32，位于右上角（y 6-38px，x 282-369px）。
 * 兜底：预览运行时可能没有 getMenuButtonBoundingClientRect，用静态几何顶上。
 */

/** 静态兜底几何（375px 宽机型） */
var FALLBACK = { top: 24, height: 32, left: 282, right: 369, bottom: 56 };

function capsule () {
  if (typeof wx !== 'undefined' && wx !== null &&
      typeof wx.getMenuButtonBoundingClientRect === 'function') {
    try {
      var r = wx.getMenuButtonBoundingClientRect();
      if (r && r.width && r.height) {
        return {
          top: r.top,
          height: r.height,
          bottom: r.top + r.height,
          left: r.left,
          right: r.left + r.width,
          width: r.width
        };
      }
    } catch (e) {
      /* 落回静态几何 */
    }
  }
  return FALLBACK;
}

/** 顶栏内容区高度：胶囊底部 + 一点留白 */
function barHeight () {
  var c = capsule();
  return Math.max(44, c.bottom + 6);
}

/**
 * 屏幕宽度
 *
 * ⚠️ wx.getSystemInfoSync 是已废弃的同步 API ——
 *    新基础库优先用 wx.getWindowInfo，老的再退回 getSystemInfoSync，
 *    都没有就用 375 兜底。
 */
function screenWidth () {
  var w = 0;
  if (typeof wx !== 'undefined' && wx !== null) {
    try {
      if (typeof wx.getWindowInfo === 'function') {
        var win = wx.getWindowInfo();
        if (win && win.windowWidth) w = win.windowWidth;
      }
    } catch (e) {
      /* 落到老 API */
    }
    if (!w && typeof wx.getSystemInfoSync === 'function') {
      try {
        var old = wx.getSystemInfoSync();
        if (old && old.windowWidth) w = old.windowWidth;
      } catch (e) {
        /* 用默认宽度 */
      }
    }
  }
  return w || 375;
}

/** 顶栏右侧要留出的宽度，页面自己的动作按钮不能压上去 */
function reserveRight () {
  var c = capsule();
  var screenW = screenWidth();
  return Math.max(88, screenW - c.left + 8);
}

module.exports = {
  capsule: capsule,
  barHeight: barHeight,
  reserveRight: reserveRight,
  screenWidth: screenWidth
};
