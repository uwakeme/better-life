/**
 * 全局配置
 *
 * 职责：后端地址、请求超时、演示模式与开发面板开关、存储 key。
 * 约定：运行时不做目录 index 解析，所以引用一律写 require('../config/index')。
 * §11：这是微信小程序的已知坑 —— require('../config') 会报 module 'config.js' is not defined。
 */
module.exports = {
  /** 后端地址；域名未备案前，客户端会自动回落到本地演示数据 */
  apiBaseUrl: 'https://better-life.uwakeme.top',

  /** 单次请求超时（毫秒） */
  requestTimeout: 8000,

  /** 运行环境标记 */
  env: 'dev',

  /**
   * 开发模式面板：打开后「我的」页底部出现身份切换与演示场景切换。
   * 正式包必须置 false —— 该面板带角色名，读者侧不允许出现。
   */
  devPanel: true,

  /** 后端不可用时是否回落本地演示数据（回落时页面会如实标注数据来源） */
  demoFallback: true,

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
