/**
 * 需登录接口（Bearer token）
 *
 * 职责：我的信息、收藏、投票、我的反馈。
 * 口径：
 *   1. 只有普通用户能投票 —— 管理员不给自己写的内容投票（§6.2）。
 *   2. 只有普通用户能提交反馈 —— 管理员发现问题直接改内容（§4.3）。
 *   3. 「我的反馈」只返回自己的 —— 反馈仅管理员可见，但读者也只能看自己的（§4.3）。
 */
const express = require('express');
const config = require('../config');
const usersDao = require('../dao/users');
const fbDao = require('../dao/feedbacks');
const expDao = require('../dao/experiences');
const fbService = require('../services/feedbacks');
const { requireAuth, userKey, rateLimit } = require('../middleware/auth');
const { fail } = require('../middleware/error');

const router = express.Router();

function ok (res, data) {
  res.json({ ok: true, data: data });
}

/** GET /api/me */
router.get('/api/me', requireAuth, async function (req, res, next) {
  try {
    const favorites = await usersDao.listFavorites(req.user.openid, { size: 500 });
    const mine = await fbDao.listMine(req.user.openid);
    ok(res, {
      user: { openid: req.user.openid, role: req.user.role, nickname: req.user.nickname },
      metrics: {
        favorites: favorites.length,
        myFeedbacks: mine.length
      }
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/me/favorites */
router.get('/api/me/favorites', requireAuth, async function (req, res, next) {
  try {
    const q = req.query || {};
    const items = await usersDao.listFavorites(req.user.openid, {
      size: q.size,
      categoryId: q.categoryId
    });
    /* 收藏列表也要带要点与标签，卡片才显示得对 */
    const ids = items.map(function (i) { return i.id; });
    const pointMap = await expDao.listPointsByExperience(ids);
    const allTags = await require('../dao/catalog').listTags();
    for (const item of items) {
      item.points = pointMap[String(item.id)] || [];
      const names = [];
      for (const t of allTags) {
        if (item.tagIds && item.tagIds.indexOf(t.id) >= 0) names.push(t.name);
      }
      item.tagNames = names;
      item.addedAt = item.favoritedAt;
    }
    ok(res, { items: items, total: items.length });
  } catch (e) {
    next(e);
  }
});

/** POST /api/me/favorites/:id */
router.post('/api/me/favorites/:id', requireAuth, async function (req, res, next) {
  try {
    const exp = await expDao.getById(req.params.id);
    if (!exp) throw fail('NOT_FOUND', '这条经验不存在');
    await usersDao.addFavorite(req.user.openid, exp.id);
    ok(res, { ok: true });
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/me/favorites/:id */
router.delete('/api/me/favorites/:id', requireAuth, async function (req, res, next) {
  try {
    await usersDao.removeFavorite(req.user.openid, req.params.id);
    ok(res, { ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/me/votes/:id
 * body: { useful }
 * 只有普通用户能投 —— 管理员给自己写的内容投票等于自刷计数（§6.2）。
 */
router.post(
  '/api/me/votes/:id',
  requireAuth,
  rateLimit({ windowMs: 60000, max: config.rateLimit.votePerMinute, key: userKey }),
  async function (req, res, next) {
    try {
      if (req.user.role === 'admin') throw fail('FORBIDDEN', '管理员不参与投票');
      const useful = !!(req.body && req.body.useful);
      const exp = await expDao.getById(req.params.id);
      if (!exp || exp.status !== 'published') throw fail('NOT_FOUND', '这条经验不存在或已下线');
      const out = await usersDao.setVote(req.user.openid, exp.id, useful);
      ok(res, {
        ok: true,
        useful: out.useful,
        usefulCount: out.usefulCount,
        notUsefulCount: out.notUsefulCount
      });
    } catch (e) {
      next(e);
    }
  }
);

/** GET /api/me/feedbacks */
router.get('/api/me/feedbacks', requireAuth, async function (req, res, next) {
  try {
    const items = await fbDao.listMine(req.user.openid);
    ok(res, { items: items });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/feedbacks
 * body: { targetType, targetId?, kind, content, images? }
 * 只有普通用户能提交（§4.3）。
 */
router.post(
  '/api/feedbacks',
  requireAuth,
  rateLimit({ windowMs: 60000, max: 10, key: userKey }),
  async function (req, res, next) {
    try {
      if (req.user.role === 'admin') throw fail('FORBIDDEN', '管理员不提交反馈，发现问题直接改内容');
      const fb = await fbService.submit(req.user.openid, req.body || {});
      ok(res, fb);
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
