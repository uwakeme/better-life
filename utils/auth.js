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
          resolve(setSession(data.token, data.user));
        }).catch(function () { resolve(null); });
      },
      fail: function () { resolve(null); }
    });
  });
}

module.exports = {
  isLogged: isLogged,
  currentUser: currentUser,
  restore: restore,
  setSession: setSession,
  clear: clear,
  getToken: getToken,
  login: login
};
