/**
 * 检索接口
 *
 * POST /api/search
 * body: { query, categoryIds?, stance?, limit? }
 * 限流：每次都要调 embedding，有真金白银的成本 —— 30 次/分钟（§8.4）。
 */
const express = require('express');
const config = require('../config');
const searchService = require('../services/search');
const { requireAuth, userKey } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

function ok (res, data) {
  res.json({ ok: true, data: data });
}

router.post(
  '/api/search',
  rateLimit({ windowMs: 60000, max: config.rateLimit.searchPerMinute, key: userKey }),
  async function (req, res, next) {
    try {
      const body = req.body || {};
      const out = await searchService.search(body);
      ok(res, out);
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
