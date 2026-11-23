/**
 * life-better 生活经验库 · 小程序入口
 *
 * 职责：启动时读全局配置、初始化登录态、注册全局错误兜底。
 * 页面不直接在这里取数 —— 取数只走 utils/api.js。
 */
var config = require('./config/index');
var auth = require('./utils/auth');

App({
  globalData: {
    /** 当前用户（未登录时为 null） */
    user: null,
    /** 数据来源标记：server | demo，由 utils/api.js 回填 */
    source: 'demo'
  },

  onLaunch: function () {
    // 静默恢复登录态：浏览完全公开，登录只是为了让收藏 / 投票 / 反馈可用。
    auth.restore().then(function (user) {
      this.globalData.user = user;
    }.bind(this));
  },

  onError: function (msg) {
    // 运行时异常兜底：不在这里吞错误，只记录，避免整页白屏无从排查。
    console.error('[life-better] runtime error:', msg);
  },

  onPageNotFound: function (res) {
    console.error('[life-better] page not found:', res.path);
  },

  /** 当前生效的配置，供页面读取 devPanel 等开关 */
  config: config
});
