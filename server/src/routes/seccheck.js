const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const fbDao = require('../dao/feedbacks');
const seccheck = require('../services/seccheck');
const { fail } = require('../middleware/error');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const CALLBACK_WINDOW_SECONDS = 300;

function ok (res, data) {
  res.json({ ok: true, data: data });
}

function readParam (req, queryName, headerName) {
  if (req.headers[headerName] !== undefined) return req.headers[headerName];
  return req.query[queryName];
}

function sameToken (left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function checkToken (req) {
  if (!config.mediaCallbackToken) return false;
  const timestamp = readParam(req, 'timestamp', 'x-timestamp');
  const nonce = readParam(req, 'nonce', 'x-nonce');
  if (!timestamp || !nonce || String(nonce).length > 128) return false;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > CALLBACK_WINDOW_SECONDS) {
    return false;
  }
  const provided = readParam(req, 'token', 'x-media-token');
  if (provided && sameToken(provided, config.mediaCallbackToken)) return true;
  const signature = readParam(req, 'signature', 'x-signature');
  if (!signature) return false;
  const parts = [String(config.mediaCallbackToken), String(timestamp), String(nonce)].sort();
  const expected = crypto.createHash('sha1').update(parts.join('')).digest('hex');
  return sameToken(String(signature).toLowerCase(), expected);
}

router.post('/api/seccheck/callback', async function (req, res, next) {
  try {
    if (!checkToken(req)) {
      throw fail('FORBIDDEN', config.mediaCallbackToken
        ? '回调校验不通过或时间戳已过期'
        : '服务端没有配置 MEDIA_CALLBACK_TOKEN，媒体审核回调无法接收');
    }
    const body = req.body || {};
    const verdict = seccheck.handleCallback(body);
    if (!verdict.ok) throw fail('VALIDATION', verdict.message || '回调内容无效');
    if (!verdict.traceId) throw fail('VALIDATION', '缺少 trace_id');
    const timestamp = readParam(req, 'timestamp', 'x-timestamp');
    const nonce = readParam(req, 'nonce', 'x-nonce');
    const applied = await db.tx(async function (client) {
      if (!await fbDao.consumeNonce(nonce, client)) {
        throw fail('FORBIDDEN', '回调已处理或 nonce 重复');
      }
      let fb = await fbDao.findByTraceId(verdict.traceId, client);
      if (!fb) {
        await fbDao.savePendingCallback(verdict.traceId, verdict.result, client);
        fb = await fbDao.findByTraceId(verdict.traceId, client);
      }
      if (!fb) return { matched: false, result: null };
      const result = await fbDao.applyMediaVerdict(fb.id, verdict.traceId, verdict.result, client);
      await client.query('DELETE FROM pending_media_callbacks WHERE trace_id = $1', [verdict.traceId]);
      return { matched: true, result: result };
    });
    await Promise.all([
      fbDao.pruneNonces(new Date(Date.now() - 2 * CALLBACK_WINDOW_SECONDS * 1000).toISOString()),
      fbDao.prunePendingCallbacks(new Date(Date.now() - 10 * CALLBACK_WINDOW_SECONDS * 1000).toISOString())
    ]).catch(function () { /* 清理失败不改变已提交结论 */ });
    ok(res, {
      traceId: verdict.traceId,
      result: applied.result ? applied.result.mediaStatus : verdict.result,
      matched: applied.matched
    });
  } catch (e) {
    next(e);
  }
});

router.get('/api/seccheck/trace/:traceId', requireAuth, requireAdmin, async function (req, res, next) {
  try {
    const traceId = String(req.params.traceId || '');
    const fb = await fbDao.findByTraceId(traceId);
    if (!fb) throw fail('NOT_FOUND', '没有找到这条审核记录');
    let full = await fbDao.getById(fb.id);
    let queried = false;
    let message = '';
    if (full.mediaStatus === 'checking') {
      const verdict = await seccheck.queryMedia(traceId);
      queried = true;
      message = verdict.message || '';
      if (verdict.result === 'passed' || verdict.result === 'rejected') {
        await fbDao.applyMediaVerdict(full.id, traceId, verdict.result);
        full = await fbDao.getById(full.id);
      }
    }
    ok(res, {
      id: full.id,
      traceId: traceId,
      mediaStatus: full.mediaStatus,
      checkedAt: full.mediaCheckedAt,
      queried: queried,
      message: message
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
