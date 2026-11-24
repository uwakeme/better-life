/**
 * 出站 HTTP 封装
 *
 * 职责：给所有出站 fetch 加超时。
 *
 * 为什么要：微信接口与 embedding 服务一旦挂住（网络黑洞、服务端不返回），
 *   fetch 会永远挂着 —— 搜索和发布请求就一直转圈，用户看到的是「卡住」，
 *   不是错误。超时是这类调用唯一的兜底。
 *
 * 约定：超时抛出的错误带 code = 'UPSTREAM_TIMEOUT'，
 *   对外怎么说是调用方的事（内部错误不直接回给客户端）。
 */
const config = require('../config');

/**
 * 带超时的 fetch
 * @param {string} url
 * @param {object} [options] fetch 选项（method / headers / body …）
 * @param {number} [timeoutMs] 覆盖默认超时（毫秒）
 * @returns {Promise<Response>} 响应体已读完，读取阶段也受同一超时约束
 */
async function fetchWithTimeout (url, options, timeoutMs) {
  const opts = options || {};
  const ms = timeoutMs || config.outboundTimeoutMs;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(function () { controller.abort(); }, ms);
    /* 定时器不能拖住进程退出 */
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
  try {
    const finalOpts = controller
      ? Object.assign({}, opts, { signal: controller.signal })
      : opts;
    const res = await fetch(url, finalOpts);
    if (res.status === 204 || res.status === 205 || res.status === 304) return res;
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers
    });
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
      const e = new Error('上游服务超时（' + ms + 'ms）');
      e.code = 'UPSTREAM_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  fetchWithTimeout: fetchWithTimeout
};
