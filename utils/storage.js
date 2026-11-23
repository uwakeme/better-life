/**
 * 本机存储封装
 *
 * 职责：把 wx.setStorageSync / getStorageSync / removeStorageSync 收在一处。
 * 为什么要包一层：预览运行时可能处于无痕上下文，直调 wx.setStorageSync 会抛错，
 * 一旦抛错整页就崩 —— 这里 try/catch 回落内存 Map，保证至少不崩。
 * 约定：小程序运行时不写可选链与空值合并（设计文档 §5.2）。
 */
var memory = {};

function hasWxStorage () {
  return typeof wx !== 'undefined' &&
    wx !== null &&
    typeof wx.setStorageSync === 'function';
}

function get (key) {
  if (hasWxStorage()) {
    try {
      var v = wx.getStorageSync(key);
      if (v === '' || v === null || v === undefined) return memory[key];
      return v;
    } catch (e) {
      /* 落到内存 */
    }
  }
  return memory[key];
}

function set (key, value) {
  memory[key] = value;
  if (hasWxStorage()) {
    try {
      wx.setStorageSync(key, value);
    } catch (e) {
      /* 落不了盘就用内存，不影响本次会话 */
    }
  }
  return value;
}

function remove (key) {
  delete memory[key];
  if (hasWxStorage()) {
    try {
      wx.removeStorageSync(key);
    } catch (e) {
      /* 忽略 */
    }
  }
}

function getJson (key, fallback) {
  var raw = get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function setJson (key, value) {
  try {
    set(key, JSON.stringify(value));
  } catch (e) {
    /* 循环引用等异常直接忽略 */
  }
  return value;
}

module.exports = {
  get: get,
  set: set,
  remove: remove,
  getJson: getJson,
  setJson: setJson
};
