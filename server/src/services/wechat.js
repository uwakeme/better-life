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
  const res = await fetch(url);
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
  const res = await fetch(url);
  const body = await res.json();
  if (!body || !body.openid) {
    const e = new Error('登录失败：' + ((body && body.errcode) || res.status));
    e.code = 'WECHAT_AUTH';
    throw e;
  }
  return { openid: body.openid, unionid: body.unionid || '', sessionKey: body.session_key || '', dev: false };
}

/**
 * 上传图片素材，换 media_id
 * 内容安全审核只认 media_id，所以反馈附图必须先过这一道（§9.4）。
 * @param {Buffer} buffer 图片内容
 * @param {string} filename 文件名（决定微信把它存成什么类型的素材）
 */
async function uploadImage (buffer, filename) {
  const token = await getAccessToken();
  if (!token) {
    /* 本地自检：没有微信环境，直接把本地路径当 media_id 之外的东西返回 */
    return { mediaId: '', url: '', dev: true };
  }
  const url = config.wechatApiBase + '/cgi-bin/media/uploadimg?access_token=' + encodeURIComponent(token);
  const form = new FormData();
  form.append('media', new Blob([buffer], { type: 'image/png' }), filename || 'image.png');
  const res = await fetch(url, { method: 'POST', body: form });
  const body = await res.json();
  if (!body || !body.url) {
    const e = new Error('图片上传失败：' + ((body && body.errcode) || res.status));
    e.code = 'UPLOAD_FAILED';
    throw e;
  }
  /* uploadimg 只给 url；送审要用 media_id，所以再走一次 media/uploadmaterial */
  const matForm = new FormData();
  matForm.append('media', new Blob([buffer], { type: 'image/png' }), filename || 'image.png');
  matForm.append('type', 'image');
  const matRes = await fetch(
    config.wechatApiBase + '/cgi-bin/media/uploadmaterial?access_token=' + encodeURIComponent(token),
    { method: 'POST', body: matForm }
  );
  const matBody = await matRes.json();
  return {
    mediaId: (matBody && matBody.media_id) || '',
    url: body.url || '',
    dev: false
  };
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
