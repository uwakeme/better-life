/**
 * 管理接口（role=admin）
 *
 * 职责：经验的增改删与发布、标签管理、反馈处理、索引重建、库内指标。
 * 口径：
 *   1. 全部走 requireAuth + requireAdmin —— 中间件查库确认角色（§9.2 第三层）。
 *   2. 管理端的搜索在应用层做，不开后端检索（§14 D11）——
 *      这里的 q 只做 LIKE 精确匹配，要的是命中不是语义召回。
 *   3. 发布前校验与护栏在服务层与数据层，不靠界面拦（§4.1）。
 */
const express = require('express');
const db = require('../db');
const catalogDao = require('../dao/catalog');
const expDao = require('../dao/experiences');
const fbDao = require('../dao/feedbacks');
const sdDao = require('../dao/search-documents');
const expService = require('../services/experiences');
const fbService = require('../services/feedbacks');
const vectorStore = require('../services/vector-store');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { fail } = require('../middleware/error');

const router = express.Router();

function ok (res, data) {
  res.json({ ok: true, data: data });
}

/**
 * 管理端的每个接口都要登录 + 管理员。
 * ⚠️ 路径前缀不能省 —— router.use(fn) 不带路径时会对「所有经过本路由器的请求」
 * 生效，连 /api/nope 这种不存在的接口都会被拦成 401。
 */
router.use('/api/admin', requireAuth, requireAdmin);

/** GET /api/admin/experiences —— 含草稿 */
router.get('/api/admin/experiences', async function (req, res, next) {
  try {
    const q = req.query || {};
    const list = await expDao.listForAdmin({
      q: q.q,
      categoryId: q.cat || q.categoryId,
      status: q.status,
      page: q.page,
      size: q.size
    });
    for (const item of list.items) {
      item.tagIds = await expDao.listTagIds(item.id);
      item.keywords = item.searchKeywords || [];
    }
    ok(res, { items: list.items, total: list.items.length, page: list.page, size: list.size });
  } catch (e) {
    next(e);
  }
});

/** POST /api/admin/experiences —— 新建（默认草稿） */
router.post('/api/admin/experiences', async function (req, res, next) {
  try {
    const payload = req.body || {};
    const out = await expService.save({
      title: payload.title,
      summary: payload.summary,
      body: payload.body,
      categoryId: payload.categoryId,
      searchKeywords: payload.keywords || payload.searchKeywords || [],
      coverUrl: payload.coverUrl,
      status: payload.status || 'draft',
      confidence: payload.confidence || 'normal',
      reviewedAt: payload.reviewedAt,
      nextReviewAt: payload.nextReviewAt,
      tagIds: payload.tagIds || [],
      points: payload.points || [],
      sources: payload.sources || []
    });
    ok(res, { ok: true, id: out.id, hint: out.hint });
  } catch (e) {
    next(e);
  }
});

/** GET /api/admin/experiences/:id */
router.get('/api/admin/experiences/:id', async function (req, res, next) {
  try {
    const exp = await expDao.getById(req.params.id);
    if (!exp) throw fail('NOT_FOUND', '这条经验不存在');
    ok(res, exp);
  } catch (e) {
    next(e);
  }
});

/** PUT /api/admin/experiences/:id —— 更新 */
router.put('/api/admin/experiences/:id', async function (req, res, next) {
  try {
    const payload = req.body || {};
    const current = await expDao.getById(req.params.id);
    if (!current) throw fail('NOT_FOUND', '这条经验不存在');
    const out = await expService.save({
      id: Number(req.params.id),
      slug: current.slug,
      title: payload.title !== undefined ? payload.title : current.title,
      summary: payload.summary !== undefined ? payload.summary : current.summary,
      body: payload.body !== undefined ? payload.body : current.body,
      categoryId: payload.categoryId || current.categoryId,
      searchKeywords: payload.keywords || payload.searchKeywords || current.searchKeywords || [],
      coverUrl: payload.coverUrl !== undefined ? payload.coverUrl : current.coverUrl,
      status: payload.status || current.status,
      confidence: payload.confidence || current.confidence,
      reviewedAt: payload.reviewedAt || current.reviewedAt,
      nextReviewAt: payload.nextReviewAt !== undefined ? payload.nextReviewAt : current.nextReviewAt,
      tagIds: payload.tagIds || [],
      points: payload.points || [],
      sources: payload.sources || []
    });
    ok(res, { ok: true, id: out.id, hint: out.hint });
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/admin/experiences/:id */
router.delete('/api/admin/experiences/:id', async function (req, res, next) {
  try {
    await expDao.getById(req.params.id);
    await db.query('DELETE FROM experiences WHERE id = $1', [Number(req.params.id)]);
    await sdDao.removeExperience(Number(req.params.id));
    ok(res, { ok: true });
  } catch (e) {
    next(e);
  }
});

/** POST /api/admin/experiences/:id/publish */
router.post('/api/admin/experiences/:id/publish', async function (req, res, next) {
  try {
    const out = await expService.publish(req.params.id);
    ok(res, { ok: true, id: out.id, hint: out.hint });
  } catch (e) {
    next(e);
  }
});

/** POST /api/admin/experiences/:id/unpublish */
router.post('/api/admin/experiences/:id/unpublish', async function (req, res, next) {
  try {
    const out = await expService.unpublish(req.params.id);
    ok(res, { ok: true, id: out.id });
  } catch (e) {
    next(e);
  }
});

/* ---------- 标签 ---------- */

/** GET /api/admin/tags */
router.get('/api/admin/tags', async function (req, res, next) {
  try {
    const tags = await catalogDao.listTags();
    const cats = await catalogDao.listCategories();
    const nameMap = {};
    for (const c of cats) nameMap[String(c.id)] = c.name;
    for (const t of tags) t.categoryName = nameMap[String(t.categoryId)] || '未归类';
    ok(res, { items: tags, total: tags.length });
  } catch (e) {
    next(e);
  }
});

/** POST /api/admin/tags —— 新增 */
router.post('/api/admin/tags', async function (req, res, next) {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw fail('VALIDATION', '标签名不能为空');
    const categoryId = body.categoryId === undefined || body.categoryId === null
      ? null : Number(body.categoryId);
    /* 标签必须归属某个领域（tags.category_id 是 NOT NULL），
       缺领域时直接说清楚，别让数据库抛一个看不懂的约束错误 */
    if (categoryId === null) throw fail('VALIDATION', '请选择这个标签属于哪个领域');
    /* 唯一键是（领域, 名称） */
    const dup = await catalogDao.findByCategoryAndName(categoryId, name);
    if (dup) throw fail('VALIDATION', '这个领域下已经有同名的标签了');
    const slug = body.slug || ('tag-' + Date.now());
    const tag = await catalogDao.insertTag({ categoryId: categoryId, slug: slug, name: name });
    ok(res, { ok: true, id: tag.id });
  } catch (e) {
    next(e);
  }
});

/** PUT /api/admin/tags/:id —— 改名 / 改归属 */
router.put('/api/admin/tags/:id', async function (req, res, next) {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw fail('VALIDATION', '标签名不能为空');
    const current = await catalogDao.getTag(req.params.id);
    if (!current) throw fail('NOT_FOUND', '标签不存在');
    const categoryId = body.categoryId === undefined || body.categoryId === null
      ? current.categoryId : Number(body.categoryId);
    const dup = await catalogDao.findByCategoryAndName(categoryId, name, Number(req.params.id));
    if (dup) throw fail('VALIDATION', '这个领域下已经有同名的标签了');
    const tag = await catalogDao.updateTag(req.params.id, { categoryId: categoryId, name: name });
    ok(res, { ok: true, id: tag.id });
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/admin/tags/:id */
router.delete('/api/admin/tags/:id', async function (req, res, next) {
  try {
    await catalogDao.deleteTag(req.params.id);
    ok(res, { ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 反馈 ---------- */

/** GET /api/admin/feedbacks —— 反馈盒 */
router.get('/api/admin/feedbacks', async function (req, res, next) {
  try {
    const q = req.query || {};
    const items = await fbDao.listForAdmin({
      status: q.status,
      targetType: q.targetType,
      q: q.q,
      size: q.size
    });
    /* 关联经验标题，管理员要一眼知道这条反馈在说什么 */
    const ids = [];
    for (const f of items) {
      if (f.targetType === 'experience' && f.targetId) ids.push(Number(f.targetId));
    }
    const titleMap = {};
    if (ids.length) {
      const res2 = await db.query(
        'SELECT id, title FROM experiences WHERE id IN (' + ids.join(',') + ')'
      );
      for (const r of res2.rows) titleMap[String(r.id)] = r.title;
    }
    for (const f of items) {
      f.targetTitle = f.targetId ? (titleMap[String(f.targetId)] || '') : '';
      f.author = '读者';
    }
    ok(res, { items: items, total: items.length });
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/admin/feedbacks/:id —— 处理（一次提交 status + reply） */
router.patch('/api/admin/feedbacks/:id', async function (req, res, next) {
  try {
    const body = req.body || {};
    const out = await fbService.resolve(req.params.id, body);
    ok(res, { ok: true, status: out.status, reply: out.reply });
  } catch (e) {
    next(e);
  }
});

/* ---------- 索引与指标 ---------- */

/** POST /api/admin/reindex —— body: { scope: 'all' | 'experience', id? } */
router.post('/api/admin/reindex', async function (req, res, next) {
  try {
    const body = req.body || {};
    if (body.scope === 'experience') {
      const out = await expService.reindexOne(body.id);
      ok(res, { ok: true, documents: out.documents });
      return;
    }
    const out = await expService.reindexAll();
    ok(res, { ok: true, documents: out.documents });
  } catch (e) {
    next(e);
  }
});

/** GET /api/admin/stats —— 库内指标（全部由数据派生，不写死） */
router.get('/api/admin/stats', async function (req, res, next) {
  try {
    const all = await expDao.listForAdmin({ size: 1000 });
    const items = all.items;
    const published = items.filter(function (e) { return e.status === 'published'; });
    const tags = await catalogDao.listTags();
    const feedbacks = await fbDao.listForAdmin({ size: 1000 });
    let points = 0;
    let sources = 0;
    let sourceMetaGap = 0;
    let needReview = 0;
    for (const e of items) {
      points += (e.points || []).length;
      sources += (e.sources || []).length;
      for (const s of e.sources || []) {
        if (!s.author || !s.platform) sourceMetaGap++;
      }
      if (e.status === 'published' &&
          (e.categoryId === 5 || e.categoryId === 6 || e.categoryId === 7) &&
          !e.nextReviewAt) needReview++;
    }
    ok(res, {
      experiences: items.length,
      published: published.length,
      drafts: items.length - published.length,
      points: points,
      sources: sources,
      tags: tags.length,
      pendingFeedback: feedbacks.filter(function (f) { return f.status === 'pending'; }).length,
      needReview: needReview,
      sourceMetaGap: sourceMetaGap
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
