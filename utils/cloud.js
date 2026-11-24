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
          /* ⚠️ 业务错误码必须从响应体里读出来。
             之前这里一律 reject({ code: 'HTTP' })，把服务端的
             UNAUTHORIZED / NOT_FOUND / RATE_LIMITED / CONTENT_REJECTED 全丢了，
             上层分不清「没登录」和「服务坏了」，只能回落演示数据 ——
             结果真后端上的写入全被演示数据冒充。 */
          reject(parseError(res, status));
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

/**
 * 从错误响应里取出真实的业务错误码
 * 服务端的错误包固定是 { ok:false, error:{ code, message } }，
 * 4xx 才是业务错误（401/403/404/422/429），5xx 才是服务端故障。
 */
function parseError (res, status) {
  var body = res && res.data;
  var err = (body && body.error) || {};
  var code = err.code || '';
  if (!code) {
    /* 没有错误包 —— 按状态码归类，别一律当 HTTP 丢掉语义 */
    if (status === 401) code = 'UNAUTHORIZED';
    else if (status === 403) code = 'FORBIDDEN';
    else if (status === 404) code = 'NOT_FOUND';
    else if (status === 429) code = 'RATE_LIMITED';
    else if (status >= 500) code = 'SERVER';
    else code = 'HTTP';
  }
  return {
    code: code,
    message: err.message || ('服务返回 ' + status),
    status: status
  };
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
 * PATCH —— 管理端处理反馈走这个动词。
 * ⚠️ 之前没写这个方法，api.js 里 cloud.patch(...) 直接是 undefined，
 *    调用就抛 TypeError —— 服务端模式下「处理反馈」根本发不出去。
 */
function patch (path, data, options) {
  return request('PATCH', path, data, options);
}

/**
 * 上传一个本地文件（反馈附图用）
 *
 * 走 base64 的 JSON，而不是 wx.uploadFile 的 multipart：
 *   - 服务端只要 express.json 就能收，不用额外装 multipart 解析器
 *     （依赖刻意只留 express + pg，见设计文档 §5.4）；
 *   - 送审要的是可下载的 url，服务端拿到字节后转给微信 uploadimg 换 url，
 *     正好就是 mediaCheckAsync 要的 media_url（设计文档 §9.4）。
 *
 * 临时文件路径不能直接送审 —— 审核服务器下载不到本机路径。
 */
function upload (filePath, options) {
  var opt = options || {};
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || wx === null ||
        typeof wx.getFileSystemManager !== 'function') {
      reject({ code: 'NETWORK', message: '当前环境不支持文件上传' });
      return;
    }
    var fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (res) {
        var data = (res && res.data) || '';
        if (!data) {
          reject({ code: 'VALIDATION', message: '图片读取失败，请重新选择' });
          return;
        }
        request('POST', opt.path || '/api/upload', {
          data: data,
          filename: opt.name || filePath.split('/').pop() || 'image.png'
        }, opt).then(resolve, reject);
      },
      fail: function () {
        reject({ code: 'VALIDATION', message: '图片读取失败，请重新选择' });
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
  patch: patch,
  upload: upload
};
