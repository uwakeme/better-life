/**
 * 全局配置
 *
 * 职责：后端地址、请求超时、演示模式与开发面板开关、存储 key。
 * 约定：运行时不做目录 index 解析，所以引用一律写 require('../config/index')。
 * §11：这是微信小程序的已知坑 —— require('../config') 会报 module 'config.js' is not defined。
 */

/**
 * 当前是不是正式包
 *
 * ⚠️ devPanel 与 demoFallback 之前是写死的 true，只靠人工记得在发版前改掉。
 *    带着默认值上线，再叠加「写操作回落演示数据」，
 *    所有写入都可能悄悄变成演示数据。
 *    现在按 envVersion 自动判断：release 一律关闭这两个开关。
 */
function isRelease () {
  if (typeof wx === 'undefined' || wx === null ||
      typeof wx.getAccountInfoSync !== 'function') {
    /* 取不到环境信息时按正式包处理 —— 宁可少一个开发面板，不要把演示数据发给读者 */
    return true;
  }
  try {
    var info = wx.getAccountInfoSync();
    var env = info && info.miniProgram ? info.miniProgram.envVersion : '';
    return env === 'release';
  } catch (e) {
    return true;
  }
}

var RELEASE = isRelease();

module.exports = {
  /** 后端地址；域名未备案前，客户端会自动回落到本地演示数据 */
  apiBaseUrl: 'https://better-life.uwakeme.top',

  /** 单次请求超时（毫秒） */
  requestTimeout: 8000,

  /** 运行环境标记：release / trial / develop */
  env: RELEASE ? 'release' : 'dev',

  /**
   * 开发模式面板：打开后「我的」页底部出现身份切换与演示场景切换。
   * 正式包必须置 false —— 该面板带角色名，读者侧不允许出现。
   * 正式包自动关闭，不用靠人工记得改。
   */
  devPanel: !RELEASE,

  /**
   * 后端不可用时是否回落本地演示数据（回落时页面会如实标注数据来源）。
   * 正式包自动关闭 —— 正式包回落到演示数据，读者会看到假内容。
   */
  demoFallback: !RELEASE,

  /**
   * 开发期默认身份：没手动切过身份时用它。
   * 正式包必须是 'user' —— 管理员入口只对管理员渲染。
   * 预览管理端时改成 'admin' 可以直接进，不用先点开发面板。
   */
  devRole: 'user',

  /** 存储 key */
  searchHistoryKey: 'betterlife_search_hist',
  tokenKey: 'betterlife_token',
  localStateKey: 'betterlife_local_state',
  roleKey: 'betterlife_dev_role',
  sceneKey: 'betterlife_dev_scene',

  /** 搜索历史最多保留条数（§3.5） */
  searchHistoryMax: 8,

  /** 反馈最多附图张数（§9.4） */
  feedbackImageMax: 3
};
