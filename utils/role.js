/**
 * 角色与权限判定
 *
 * 职责：把「谁能做什么」收在一处，页面不再各自判断。
 * 三层校验（设计文档 §9.2）：前端隐藏只是体验，中间件与数据层还会再查一次角色。
 * 口径：管理员不提交反馈（§4.3）、只有普通用户能投票（§6.2）。
 */
var config = require('../config/index');
var storage = require('./storage');

/** 当前角色：管理员 / 普通用户 */
function currentRole () {
  var role = storage.get(config.roleKey);
  if (role === 'admin' || role === 'user') return role;
  /* 没手动切过身份时，用配置里的开发期默认值（正式包固定是 user） */
  if (config.devRole === 'admin' || config.devRole === 'user') return config.devRole;
  return 'user';
}

function setRole (role) {
  if (role !== 'admin' && role !== 'user') return currentRole();
  storage.set(config.roleKey, role);
  return role;
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
