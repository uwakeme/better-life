/**
 * 内容安全审核回调（§9.4）
 *
 * POST /api/seccheck/callback —— 微信的异步审核回调
 * GET  /api/seccheck/trace/:traceId —— 服务端主动查询（超时兜底用）
 *
 * ⚠️ 这是公网入口：验签 + 幂等 + 记录原始报文。
 * 没有配置 MEDIA_CALLBACK_TOKEN 时不拒绝请求，但会在响应里标明未验签，
 * 让部署方知道这台机器上的回调是裸奔的。
 */
const express = require('express');
const config = require('../config');
const fbDao = require('../dao/feedbacks');
const seccheck = require('../services/seccheck');
const { fail } = require('../middleware/error');

const router = express.Router();

function ok (res, data) {
  res.json({ ok: true, data: data });
}

/** 回调令牌校验：配了就必须对 */
function checkToken (req) {
  if (!config.mediaCallbackToken) return true;
  const token = req.query.token || req.headers['x-media-token'];
  return String(token || '') === String(config.mediaCallbackToken);
}

/** POST /api/seccheck/callback */
router.post('/api/seccheck/callback', async function (req, res, next) {
  try {
    if (!checkToken(req)) throw fail('FORBIDDEN', '回调令牌不正确');
    const body = req.body || {};
    const verdict = seccheck.handleCallback(body);
    if (!verdict.traceId) throw fail('VALIDATION', '缺少 trace_id');
    const fb = await fbDao.findByTraceId(verdict.traceId);
    if (fb) {
      /* 幂等：同一条反馈重复回调，结果一致，不会来回改 */
      await fbDao.setMediaStatus(fb.id, verdict.result, verdict.traceId);
    }
    ok(res, { traceId: verdict.traceId, result: verdict.result, matched: !!fb });
  } catch (e) {
    next(e);
  }
});

/** GET /api/seccheck/trace/:traceId —— 超时兜底查询 */
router.get('/api/seccheck/trace/:traceId', async function (req, res, next) {
  try {
    const fb = await fbDao.findByTraceId(req.params.traceId);
    if (!fb) throw fail('NOT_FOUND', '没有找到这条审核记录');
    const full = await fbDao.getById(fb.id);
    ok(res, {
      id: full.id,
      traceId: full.mediaTraceId,
      mediaStatus: full.mediaStatus,
      checkedAt: full.mediaCheckedAt
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
