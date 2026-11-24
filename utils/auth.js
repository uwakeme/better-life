/**
 * 登录态
 *
 * 职责：存取 token、静默登录、恢复登录态。
 * 口径（设计文档 §9.1）：浏览完全公开，不触发登录；
 * 只有收藏、投票、反馈才需要账号，登录是静默的，不打断阅读。
 * token 由服务端自签（HMAC），payload 里带 openid + role + 过期时间（§8.4）。
 */
var config = require('../config/index');
var storage = require('./storage');

var token = null;
var user = null;

/** 当前是否有登录态 */
function isLogged () {
  return !!token;
}

/** 取当前用户（未登录为 null） */
function currentUser () {
  return user;
}

/**
 * 恢复登录态
 * 后端不可用时返回 null —— 页面据此显示登录引导，而不是假装已登录。
 */
function restore () {
  return new Promise(function (resolve) {
    var saved = storage.get(config.tokenKey);
    if (!saved) { resolve(null); return; }
    token = saved;
    user = storage.getJson('betterlife_user', null);
    resolve(user);
  });
}

/** 写入登录结果 */
function setSession (t, u) {
  token = t || null;
  user = u || null;
  if (token) storage.set(config.tokenKey, token);
  if (user) storage.setJson('betterlife_user', user);
  return user;
}

/** 清除登录态 */
function clear () {
  token = null;
  user = null;
  storage.remove(config.tokenKey);
  storage.remove('betterlife_user');
}

/** 拿 token（供 utils/cloud.js 拼 Authorization 头） */
function getToken () {
  return token;
}

/**
 * 静默登录：wx.login 拿 code → 交给 api.js 换 token。
 * 登录失败不抛错 —— 登录只是让收藏/投票/反馈可用，失败时页面走登录引导。
 *
 * ⚠️ 只有真的换到服务端 token 才写登录态。
 *    之前 api.js 的 login 失败会回落到 local.login（假 token 'demo-token'），
 *    那个假 token 被当登录态存下来，界面上看起来「已登录」，
 *    但服务端一律 401 —— 现在假 token 一律不写入登录态。
 */
function login () {
  return new Promise(function (resolve) {
    if (typeof wx === 'undefined' || wx === null || typeof wx.login !== 'function') {
      resolve(null);
      return;
    }
    wx.login({
      success: function (res) {
        if (!res || !res.code) { resolve(null); return; }
        var api = require('./api');
        api.login(res.code).then(function (data) {
          if (!data || !data.token) { resolve(null); return; }
          /* source === 'demo' 说明这次没连上服务端，拿到的是演示态的假凭证 */
          if (data.source === 'demo') { resolve(null); return; }
          resolve(setSession(data.token, data.user));
        }).catch(function () { resolve(null); });
      },
      fail: function () { resolve(null); }
    });
  });
}

/**
 * 确保有登录态 —— 所有写操作走它。
 * 没 token 就静默登录一次；有 token 直接用。
 * @returns {Promise<object|null>} 当前用户，登录不了返回 null
 */
function ensureLogin () {
  if (token) {
    return Promise.resolve(user);
  }
  return login();
}

module.exports = {
  isLogged: isLogged,
  currentUser: currentUser,
  restore: restore,
  setSession: setSession,
  clear: clear,
  getToken: getToken,
  login: login,
  ensureLogin: ensureLogin
};
