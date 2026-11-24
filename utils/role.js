/**
 * 角色与权限判定
 *
 * 职责：把「谁能做什么」收在一处，页面不再各自判断。
 * 三层校验（设计文档 §9.2）：前端隐藏只是体验，中间件与数据层还会再查一次角色。
 * 口径：管理员不提交反馈（§4.3）、只有普通用户能投票（§6.2）。
 */
var config = require('../config/index');
var storage = require('./storage');

/** 服务端身份优先；本地身份只服务没有服务端登录态的演示场景。 */
function currentRole () {
  var auth = require('./auth');
  var user = auth.currentUser();
  if (user && (user.role === 'admin' || user.role === 'user')) return user.role;
  if (auth.isLogged() || !config.devPanel) return 'user';
  var demoRole = storage.get(config.roleKey);
  if (demoRole === 'admin' || demoRole === 'user') return demoRole;
  if (config.devRole === 'admin' || config.devRole === 'user') return config.devRole;
  return 'user';
}

function setRole (role) {
  if (role !== 'admin' && role !== 'user') return currentRole();
  if (config.devPanel) storage.set(config.roleKey, role);
  return currentRole();
}

function isAdmin () {
  return currentRole() === 'admin';
}

/** 投票只对普通用户开放 —— 管理员不给自己写的内容投票 */
function canVote () {
  return !isAdmin();
}

/** 反馈只给普通用户提交 —— 管理员发现问题直接改内容 */
function canSubmitFeedback () {
  return !isAdmin();
}

/** 管理页是否渲染入口（真正的拦截在服务端与数据层） */
function canManage () {
  return isAdmin();
}

module.exports = {
  currentRole: currentRole,
  setRole: setRole,
  isAdmin: isAdmin,
  canVote: canVote,
  canSubmitFeedback: canSubmitFeedback,
  canManage: canManage
};
