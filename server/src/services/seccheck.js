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
const { fetchWithTimeout } = require('../lib/http');

/** 当前是不是「没真跑审核」的降级状态 */
function isSkipped () {
  return config.seccheckMode !== 'real' || !wechat.isConfigured();
}

/** 官方要求正文不超过 2500 字（超出会被判参数非法） */
const MAX_TEXT_LENGTH = 2500;

/**
 * 文本审核
 *
 * 官方协议（api_msgseccheck）：
 *   请求体 { content, version: 2, scene: 2, openid }
 *   ⚠️ 字段名是 content，不是 msg；
 *   ⚠️ openid 必填，且必须是近两小时访问过小程序的真实用户 ——
 *      写死 'feedback' 会让请求参数不合法。
 *   返回 { errcode, errmsg, result: { suggest, label } }
 *   ⚠️ errcode=0 只代表「调用成功」，还要看 result.suggest：
 *      risky（违规）/ review（需人工复核）/ pass（通过）。
 *
 * @param {string} text 待检测文本
 * @param {string} openid 提交者 openid（必须是真实用户）
 * @returns {{ok: boolean, code: string, message: string}}
 */
async function checkText (text, openid) {
  const content = String(text || '');
  if (!content.trim()) return { ok: true };
  if (content.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: '内容太长了，请控制在 ' + MAX_TEXT_LENGTH + ' 字以内'
    };
  }
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
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: content,
        version: 2,
        scene: 2,
        openid: String(openid || '')
      })
    });
    const body = await res.json();
    const errcode = body ? body.errcode : -1;
    /* errcode 不为 0 —— 接口本身出错（openid 不合法 40003 / 访问超时 61010 等）。
       这不是「内容违规」，是「没查成」，要如实说服务不可用，别谎称内容有问题。 */
    if (errcode !== 0) {
      console.error('[seccheck] msgSecCheck 调用失败 errcode=' + errcode +
        ' errmsg=' + ((body && body.errmsg) || '') + ' openid=' + openid);
      return {
        ok: false,
        code: 'CONTENT_REJECTED',
        message: '内容安全服务暂时不可用，请稍后再试'
      };
    }
    /* errcode=0 之后才看结论 */
    const suggest = String((body && body.result && body.result.suggest) || '');
    if (suggest === 'pass') return { ok: true };
    if (suggest === 'risky') {
      return {
        ok: false,
        code: 'CONTENT_REJECTED',
        message: '内容未通过安全检查，请修改后再提交'
      };
    }
    /* review = 疑似但需要人工复核。
       口径：反馈本身就是要人工处理的（§4.3），所以落到待处理队列，
       由管理员看内容判断，而不是在这里直接拒掉读者。 */
    if (suggest === 'review') {
      return { ok: true, review: true, traceId: (body && body.trace_id) || '' };
    }
    return { ok: false, code: 'CONTENT_REJECTED', message: '内容安全结论异常，请稍后重试' };
  } catch (e) {
    console.error('[seccheck] msgSecCheck 请求异常：' + (e && e.message ? e.message : e));
    return { ok: false, code: 'CONTENT_REJECTED', message: '内容安全服务暂时不可用，请稍后再试' };
  }
}

/**
 * 多媒体异步审核
 *
 * 官方协议（api_mediacheckasync）：
 *   请求体 { media_url, media_type: 2, version: 2, scene: 2, openid }
 *   ⚠️ 只有 media_url，没有 media_id ——
 *      media_url 必须是检测服务器能下载到的地址。
 *      之前把 media_id 塞进 media_url，送审必失败。
 *   返回 { errcode, errmsg, trace_id }，结论靠异步回调。
 *
 * @param {string} mediaUrl 可下载的图片地址
 * @param {string} openid 提交者 openid
 * @returns {{ok: boolean, traceId: string, skipped: boolean}}
 */
async function submitMedia (mediaUrl, openid) {
  const url = String(mediaUrl || '');
  if (!url) return { ok: true, traceId: '', skipped: false };
  if (isSkipped()) {
    return { ok: true, traceId: '', skipped: true };
  }
  let token;
  try {
    token = await wechat.getAccessToken();
  } catch (e) {
    return { ok: false, traceId: '', skipped: false, message: '内容安全服务暂时不可用' };
  }
  if (!token) return { ok: false, traceId: '', skipped: false, message: '内容安全服务暂时不可用' };

  const apiUrl = config.wechatApiBase + '/wxa/media_check_async?access_token=' + encodeURIComponent(token);
  try {
    const res = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        media_url: url,
        media_type: 2,
        version: 2,
        scene: 2,
        openid: String(openid || '')
      })
    });
    const body = await res.json();
    if (body && body.errcode === 0 && body.trace_id) {
      return { ok: true, traceId: body.trace_id, skipped: false };
    }
    console.error('[seccheck] mediaCheckAsync 调用失败 errcode=' + ((body && body.errcode)) +
      ' errmsg=' + ((body && body.errmsg) || ''));
    return { ok: false, traceId: '', skipped: false, message: '图片送审失败，请稍后重试' };
  } catch (e) {
    console.error('[seccheck] mediaCheckAsync 请求异常：' + (e && e.message ? e.message : e));
    return { ok: false, traceId: '', skipped: false, message: '图片送审失败，请稍后重试' };
  }
}

async function queryMedia (traceId) {
  const trace = String(traceId || '');
  if (!trace) return { ok: false, result: 'checking', message: '缺少 trace_id' };
  if (isSkipped()) return { ok: true, result: 'checking', skipped: true };
  let token;
  try {
    token = await wechat.getAccessToken();
  } catch (e) {
    return { ok: false, result: 'checking', message: '内容安全服务暂时不可用' };
  }
  if (!token) return { ok: false, result: 'checking', message: '内容安全服务暂时不可用' };
  try {
    const url = config.wechatApiBase + '/wxa/get_media_check_async_result?access_token=' + encodeURIComponent(token);
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trace_id: trace })
    });
    const body = await res.json();
    if (body && body.errcode === 87014) return { ok: true, result: 'checking' };
    if (!body || body.errcode !== 0) {
      console.error('[seccheck] 媒体审核查询失败 trace=' + trace + ' errcode=' + ((body && body.errcode) || 'unknown'));
      return { ok: false, result: 'checking', message: '审核结果暂时查询失败' };
    }
    return handleCallback({ trace_id: trace, errcode: 0, result: body.result, detail: body.detail });
  } catch (e) {
    console.error('[seccheck] 媒体审核查询异常：' + (e && e.message ? e.message : e));
    return { ok: false, result: 'checking', message: '审核结果暂时查询失败' };
  }
}

/**
 * 处理微信的异步审核回调
 *
 * 官方回调格式（消息推送）：
 *   {
 *     Event: 'wxa_media_check',
 *     trace_id: '...',
 *     errcode: 0,
 *     result: { suggest: 'pass' | 'risky' | 'review', label: 100 },
 *     detail: [ { strategy, errcode, suggest, label, prob } ]
 *   }
 *
 * ⚠️ result 是**对象**不是数组 ——
 *    之前按数组遍历，官方格式的回调一进来就抛
 *    「results is not iterable」，回调入口直接 500。
 *    结论以 result.suggest 为准，detail 是逐策略明细。
 *
 * @returns {{ok: boolean, traceId: string, result: string}}
 */
function handleCallback (payload) {
  const body = payload || {};
  const traceId = String(body.trace_id || body.traceId || '');
  /* 事件类型不对就不是媒体审核回调 */
  const event = String(body.Event || body.event || '');
  if (event && event !== 'wxa_media_check') {
    return { ok: false, traceId: '', result: 'rejected', message: '不是媒体审核回调' };
  }
  /* errcode 不为 0 时结果无效 */
  const errcode = body.errcode === undefined ? 0 : Number(body.errcode);
  if (errcode !== 0) {
    return {
      ok: false,
      traceId: traceId,
      result: 'rejected',
      message: '回调 errcode=' + errcode
    };
  }
  const result = (body.result && typeof body.result === 'object') ? body.result : null;
  const detail = Array.isArray(body.detail) ? body.detail : [];
  let suggest = result && result.suggest ? String(result.suggest) : '';
  if (!suggest && detail.length) {
    const suggestions = detail.map(function (item) { return String((item && item.suggest) || ''); });
    if (suggestions.some(function (item) { return item === 'risky'; })) suggest = 'risky';
    else if (suggestions.some(function (item) { return item === 'review'; })) suggest = 'review';
    else if (suggestions.every(function (item) { return item === 'pass'; })) suggest = 'pass';
  }
  let verdict = 'rejected';
  if (suggest === 'pass') verdict = 'passed';
  else if (suggest === 'review') verdict = 'checking';
  return { ok: true, traceId: traceId, result: verdict, suggest: suggest };
}

module.exports = {
  isSkipped: isSkipped,
  checkText: checkText,
  submitMedia: submitMedia,
  queryMedia: queryMedia,
  handleCallback: handleCallback
};
