/**
 * 微信接口封装
 *
 * 职责：access_token 缓存、code2session、素材上传。
 * 约定：
 *   1. AppSecret 只从环境变量读，不进代码、不进日志。
 *   2. 没配 AppID/Secret 时，本地自检走 dev 分支返回假数据 ——
 *      但 health 接口会如实标注「微信接口未配置」。
 */
const config = require('../config');
const { fetchWithTimeout } = require('../lib/http');

let cachedToken = null;
let cachedAt = 0;
const TOKEN_TTL = 7200 * 1000;

function configured () {
  return !!(config.wechatAppid && config.wechatSecret);
}

/** 取 access_token（带缓存） */
async function getAccessToken () {
  if (!configured()) return null;
  if (cachedToken && Date.now() - cachedAt < TOKEN_TTL) return cachedToken;
  const url = config.wechatApiBase + '/cgi-bin/token?grant_type=client_credential' +
    '&appid=' + encodeURIComponent(config.wechatAppid) +
    '&secret=' + encodeURIComponent(config.wechatSecret);
  const res = await fetchWithTimeout(url);
  const body = await res.json();
  if (!body || !body.access_token) {
    const e = new Error('取 access_token 失败：' + ((body && body.errcode) || res.status));
    e.code = 'WECHAT_AUTH';
    throw e;
  }
  cachedToken = body.access_token;
  cachedAt = Date.now();
  return cachedToken;
}

/**
 * code 换 openid
 * 本地自检没有微信环境时，返回一个稳定的假 openid（按 code 派生），
 * 这样自检能跑通「登录 → 带 token 访问」的完整链路。
 */
async function code2Session (code) {
  if (!configured()) {
    const fake = 'dev-' + String(code || 'anon').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    return { openid: fake, unionid: '', sessionKey: '', dev: true };
  }
  const url = config.wechatApiBase + '/sns/jscode2session?appid=' +
    encodeURIComponent(config.wechatAppid) +
    '&secret=' + encodeURIComponent(config.wechatSecret) +
    '&js_code=' + encodeURIComponent(String(code || '')) +
    '&grant_type=authorization_code';
  const res = await fetchWithTimeout(url);
  const body = await res.json();
  if (!body || !body.openid) {
    const e = new Error('登录失败：' + ((body && body.errcode) || res.status));
    e.code = 'WECHAT_AUTH';
    throw e;
  }
  return { openid: body.openid, unionid: body.unionid || '', sessionKey: body.session_key || '', dev: false };
}

/**
 * 上传图片素材，换一个可下载的 url
 *
 * ⚠️ 用的是 media/uploadimg —— 它返回的 url 是公网可访问的，
 *    正好是 mediaCheckAsync 需要的 media_url（官方只认 media_url，没有 media_id）。
 *    之前还多调一次 media/uploadmaterial 去换 media_id，
 *    那个接口是给永久素材用的，既多余又送不了审。
 *
 * @param {Buffer} buffer 图片内容
 * @param {string} filename 文件名
 */
async function uploadImage (buffer, filename) {
  const token = await getAccessToken();
  if (!token) {
    /* 本地自检：没有微信环境，返回空 url —— 服务端不会假装已经过审 */
    return { mediaId: '', url: '', dev: true };
  }
  const url = config.wechatApiBase + '/cgi-bin/media/uploadimg?access_token=' + encodeURIComponent(token);
  const form = new FormData();
  form.append('media', new Blob([buffer], { type: 'image/png' }), filename || 'image.png');
  const res = await fetchWithTimeout(url, { method: 'POST', body: form });
  const body = await res.json();
  if (!body || !body.url) {
    const e = new Error('图片上传失败：' + ((body && body.errcode) || res.status));
    e.code = 'UPLOAD_FAILED';
    throw e;
  }
  return { mediaId: '', url: body.url, dev: false };
}

function isConfigured () {
  return configured();
}

module.exports = {
  getAccessToken: getAccessToken,
  code2Session: code2Session,
  uploadImage: uploadImage,
  isConfigured: isConfigured
};
