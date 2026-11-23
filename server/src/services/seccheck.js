/**
 * 内容安全审核（§9.3 / §9.4）
 *
 * 文本：msgSecCheck（同步）
 * 多媒体：mediaCheckAsync（异步，先给 trace_id，结果靠回调）
 *
 * ⚠️ 带图的反馈不是同步流程：mediaCheckAsync 先返回 trace_id，
 *   反馈先落库、media_status 记 checking，等回调改结论。
 *   写成"审核通过才落库"在这条路径上根本落不了库。
 *
 * 没有凭据时走 dev-skip：直接放行，但 /api/health 会如实标注审核没真跑。
 */
const config = require('../config');
const wechat = require('./wechat');

/** 当前是不是「没真跑审核」的降级状态 */
function isSkipped () {
  return config.seccheckMode !== 'real' || !wechat.isConfigured();
}

/**
 * 文本审核
 * @returns {{ok: boolean, code: string, message: string}}
 */
async function checkText (text) {
  const content = String(text || '');
  if (!content.trim()) return { ok: true };
  if (isSkipped()) return { ok: true, skipped: true };

  let token;
  try {
    token = await wechat.getAccessToken();
  } catch (e) {
    /* 取不到 token 不能静默放行 —— 宁可拒，也不能让没过审的内容进库 */
    return { ok: false, code: 'CONTENT_REJECTED', message: '内容安全服务暂时不可用，请稍后再试' };
  }
  if (!token) return { ok: false, code: 'CONTENT_REJECTED', message: '内容安全服务暂时不可用，请稍后再试' };

  const url = config.wechatApiBase + '/wxa/msg_sec_check?access_token=' + encodeURIComponent(token);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        openid: 'feedback',
        scene: 2,
        version: 2,
        msg: content
      })
    });
    const body = await res.json();
    const errcode = body ? body.errcode : -1;
    if (errcode === 0) return { ok: true };
    return {
      ok: false,
      code: 'CONTENT_REJECTED',
      message: '内容未通过安全检查，请修改后再提交'
    };
  } catch (e) {
    return { ok: false, code: 'CONTENT_REJECTED', message: '内容安全服务暂时不可用，请稍后再试' };
  }
}

/**
 * 多媒体异步审核
 * @returns {{ok: boolean, traceId: string, skipped: boolean}}
 */
async function submitMedia (mediaId) {
  if (!mediaId) return { ok: true, traceId: '', skipped: false };
  if (isSkipped()) {
    return { ok: true, traceId: 'dev-' + mediaId, skipped: true };
  }
  let token;
  try {
    token = await wechat.getAccessToken();
  } catch (e) {
    return { ok: false, traceId: '', skipped: false, message: '内容安全服务暂时不可用' };
  }
  if (!token) return { ok: false, traceId: '', skipped: false, message: '内容安全服务暂时不可用' };

  const url = config.wechatApiBase + '/wxa/media_check_async?access_token=' + encodeURIComponent(token);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        media_url: mediaId,
        media_type: 2,
        version: 2,
        scene: 2,
        openid: 'feedback'
      })
    });
    const body = await res.json();
    if (body && body.trace_id) return { ok: true, traceId: body.trace_id, skipped: false };
    return { ok: false, traceId: '', skipped: false, message: '图片送审失败，请稍后重试' };
  } catch (e) {
    return { ok: false, traceId: '', skipped: false, message: '图片送审失败，请稍后重试' };
  }
}

/**
 * 处理微信的异步审核回调
 * 结论：0 通过；其余为不通过（87014 为具体违规码）。
 * @returns {{ok: boolean, traceId: string, result: string}}
 */
function handleCallback (payload) {
  const body = payload || {};
  const traceId = String(body.trace_id || body.traceId || '');
  const results = body.result || body.results || [];
  let result = 'rejected';
  for (const r of results) {
    const code = Number(r.suggestion !== undefined ? r.suggestion : r.result);
    if (code === 0) result = 'passed';
    else result = 'rejected';
  }
  return { ok: true, traceId: traceId, result: result };
}

module.exports = {
  isSkipped: isSkipped,
  checkText: checkText,
  submitMedia: submitMedia,
  handleCallback: handleCallback
};
