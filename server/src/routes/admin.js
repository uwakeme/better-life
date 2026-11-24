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
const { fail, assertId } = require('../middleware/error');

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
    ok(res, { items: list.items, total: list.total, page: list.page, size: list.size });
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
    const exp = await expDao.getById(assertId(req.params.id));
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
    const current = await expDao.getById(assertId(req.params.id));
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
      /* ⚠️ 缺省一律取当前值 —— 之前 points/sources/tagIds 缺省是空数组，
         对草稿 PUT 只传 title，实测要点 2→0、依据 1→0、标签 2→0，
         内容被静默清空（已发布经验有发布校验挡着，草稿没有）。 */
      tagIds: payload.tagIds !== undefined ? payload.tagIds : (current.tagIds || []),
      points: payload.points !== undefined ? payload.points : (current.points || []),
      sources: payload.sources !== undefined ? payload.sources : (current.sources || [])
    });
    ok(res, { ok: true, id: out.id, hint: out.hint });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/admin/experiences/:id
 * ⚠️ 之前查了 getById 但没用返回值 —— 删一条不存在的经验也返回 200，
 *    调用方以为删掉了。删库与清索引也分成了两条独立语句，
 *    中间失败会留下孤儿索引文档。现在同一个事务里做完。
 */
router.delete('/api/admin/experiences/:id', async function (req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!isValidId(id)) throw fail('NOT_FOUND', '这条经验不存在');
    const existing = await expDao.getById(id);
    if (!existing) throw fail('NOT_FOUND', '这条经验不存在');
    await expService.remove(id);
    ok(res, { ok: true });
  } catch (e) {
    next(e);
  }
});

/** id 必须是正整数 —— 非法 id 返回 404，不进数据库（§P1-14） */
function isValidId (id) {
  return Number.isInteger(id) && id > 0;
}

/** POST /api/admin/experiences/:id/publish */
router.post('/api/admin/experiences/:id/publish', async function (req, res, next) {
  try {
    const out = await expService.publish(req.params.id);
    ok(res, { ok: true, id: out.id, hint: out.hint });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/admin/experiences/:id/unpublish
 * ⚠️ 之前根本没查存在性 —— 下线一条不存在的经验也返回 200。
 */
router.post('/api/admin/experiences/:id/unpublish', async function (req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!isValidId(id)) throw fail('NOT_FOUND', '这条经验不存在');
    const out = await expService.unpublish(id);
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
    /* 标签要归属某个领域 ——
       数据库列本身可空（ON DELETE SET NULL），
       但业务上标签脱离领域没有意义，所以缺领域时直接说清楚，
       别让数据库抛一个看不懂的约束错误 */
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
    ok(res, { ok: out.failed === 0, documents: out.documents, experiences: out.experiences, failed: out.failed });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/admin/stats —— 库内指标（全部由数据派生，不写死）
 *
 * ⚠️ 之前是「把全部经验拉进内存再数」——
 *    listForAdmin({ size: 1000 }) 会被 limit 截到 200，
 *    库里 214 条时统计就报 200。现在改成 SQL 聚合，数多少是多少。
 */
router.get('/api/admin/stats', async function (req, res, next) {
  try {
    /* 用 CASE WHEN 计数而不是 count(*) FILTER (WHERE …) ——
       pg-mem 会忽略 FILTER 里的条件（每行都算进去），两个后端行为必须一致。 */
    const expCounts = await db.queryOne(
      "SELECT count(*) AS total, " +
      "sum(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published, " +
      "sum(CASE WHEN status <> 'published' THEN 1 ELSE 0 END) AS drafts " +
      'FROM experiences'
    );
    const pointCount = await db.queryOne('SELECT count(*) AS n FROM points');
    const sourceCount = await db.queryOne('SELECT count(*) AS n FROM sources');
    const tagCount = await db.queryOne('SELECT count(*) AS n FROM tags');
    const pendingFeedback = await db.queryOne(
      "SELECT count(*) AS n FROM feedbacks WHERE status = 'pending'"
    );
    /* 依据元信息缺口：缺作者或缺平台的依据条数 */
    const sourceMetaGap = await db.queryOne(
      "SELECT count(*) AS n FROM sources WHERE author = '' OR platform = ''"
    );
    /* 待复核：健康 / 钱财 / 办事维权三个领域里，已发布但没有下次复核日期的
       —— 按领域 slug 判断，不写死数字 id（数字 id 与种子顺序绑定，换个种子就错） */
    const reviewCats = await db.query(
      "SELECT id FROM categories WHERE slug IN ('health', 'money', 'rights')"
    );
    const reviewIds = reviewCats.rows.map(function (r) { return Number(r.id); });
    let needReview = 0;
    if (reviewIds.length) {
      const row = await db.queryOne(
        "SELECT count(*) AS n FROM experiences WHERE status = 'published' " +
        'AND next_review_at IS NULL AND category_id IN (' + reviewIds.join(',') + ')'
      );
      needReview = Number(row ? row.n : 0);
    }
    /* 缺索引的已发布经验 —— 索引失败的痕迹要让管理员看得见（§7.9） */
    const missingIndex = await sdDao.listMissingIndex();

    const total = Number(expCounts && expCounts.total ? expCounts.total : 0);
    const published = Number(expCounts && expCounts.published ? expCounts.published : 0);
    ok(res, {
      experiences: total,
      published: published,
      drafts: Number(expCounts && expCounts.drafts ? expCounts.drafts : 0),
      points: Number(pointCount ? pointCount.n : 0),
      sources: Number(sourceCount ? sourceCount.n : 0),
      tags: Number(tagCount ? tagCount.n : 0),
      pendingFeedback: Number(pendingFeedback ? pendingFeedback.n : 0),
      needReview: needReview,
      sourceMetaGap: Number(sourceMetaGap ? sourceMetaGap.n : 0),
      missingIndex: missingIndex.length
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
