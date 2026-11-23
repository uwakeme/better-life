/**
 * 唯一后端出口
 *
 * 职责：所有 wx.request 只能出现在这个文件里（设计文档 §5.2 单一后端出口）。
 * 换后端只改这里，页面不受影响。
 * 约定：失败一律 reject 一个 { code, message }，code 取值见 utils/api.js。
 */
var config = require('../config/index');
var auth = require('./auth');

/**
 * 发一次请求
 * @param {string} method  GET / POST / PUT / DELETE
 * @param {string} path    接口路径，如 /api/categories
 * @param {object} data    请求体
 * @param {object} options 可选项 { timeout }
 */
function request (method, path, data, options) {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || wx === null || typeof wx.request !== 'function') {
      reject({ code: 'NETWORK', message: '当前环境不支持网络请求' });
      return;
    }
    var opt = options || {};
    var header = { 'content-type': 'application/json' };
    var token = auth.getToken();
    if (token) header.Authorization = 'Bearer ' + token;

    wx.request({
      url: config.apiBaseUrl + path,
      method: method,
      data: data || {},
      header: header,
      timeout: opt.timeout || config.requestTimeout,
      success: function (res) {
        var status = res.statusCode;
        if (status >= 200 && status < 300) {
          var body = res.data || {};
          if (body.ok) {
            resolve(body.data);
          } else {
            var err = body.error || {};
            reject({ code: err.code || 'SERVER', message: err.message || '服务返回异常' });
          }
        } else {
          reject({ code: 'HTTP', message: '服务返回 ' + status, status: status });
        }
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '';
        if (msg.indexOf('timeout') >= 0) {
          reject({ code: 'TIMEOUT', message: '请求超时，请稍后重试' });
        } else {
          reject({ code: 'NETWORK', message: '网络不太顺畅，没连上' });
        }
      }
    });
  });
}

function get (path, query, options) {
  var qs = '';
  if (query) {
    var parts = [];
    for (var k in query) {
      if (!Object.prototype.hasOwnProperty.call(query, k)) continue;
      var v = query[k];
      if (v === undefined || v === null || v === '') continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    if (parts.length) qs = '?' + parts.join('&');
  }
  return request('GET', path + qs, null, options);
}

function post (path, data, options) {
  return request('POST', path, data, options);
}

function put (path, data, options) {
  return request('PUT', path, data, options);
}

function del (path, data, options) {
  return request('DELETE', path, data, options);
}

/**
 * 上传一个本地文件（反馈附图用）
 * 临时文件路径不能直接送内容安全审核 —— 审核接口只认 media_id，
 * 所以先传到自己服务器，由服务器换成 media_id（设计文档 §9.4）。
 */
function upload (filePath, options) {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || wx === null || typeof wx.uploadFile !== 'function') {
      reject({ code: 'NETWORK', message: '当前环境不支持文件上传' });
      return;
    }
    var opt = options || {};
    var header = {};
    var token = auth.getToken();
    if (token) header.Authorization = 'Bearer ' + token;
    wx.uploadFile({
      url: config.apiBaseUrl + (opt.path || '/api/upload'),
      filePath: filePath,
      name: opt.name || 'file',
      header: header,
      timeout: opt.timeout || config.requestTimeout,
      success: function (res) {
        var status = res.statusCode;
        if (status >= 200 && status < 300) {
          var body = {};
          try { body = JSON.parse(res.data || '{}'); } catch (e) { body = {}; }
          if (body.ok) {
            resolve(body.data);
          } else {
            var err = body.error || {};
            reject({ code: err.code || 'SERVER', message: err.message || '服务返回异常' });
          }
        } else {
          reject({ code: 'HTTP', message: '服务返回 ' + status, status: status });
        }
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '';
        if (msg.indexOf('timeout') >= 0) {
          reject({ code: 'TIMEOUT', message: '上传超时，请稍后重试' });
        } else {
          reject({ code: 'NETWORK', message: '图片没能上传成功' });
        }
      }
    });
  });
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del,
  upload: upload
};
