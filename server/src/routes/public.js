/**
 * 公开接口（无需登录）
 *
 * 职责：登录、健康检查、目录、经验读取、依据读取、素材上传。
 * 口径：浏览完全公开 —— 第一次进小程序不用登录也能看全部内容（§4.4 / §9.1）。
 */
const express = require('express');
const config = require('../config');
const catalogDao = require('../dao/catalog');
const expDao = require('../dao/experiences');
const usersDao = require('../dao/users');
const tokenUtil = require('../services/token');
const wechat = require('../services/wechat');
const vectorStore = require('../services/vector-store');
const embedding = require('../services/embedding');
const seccheck = require('../services/seccheck');
const { fail } = require('../middleware/error');

const router = express.Router();

/** 统一响应包（§8.4） */
function ok (res, data) {
  res.json({ ok: true, data: data });
}

/**
 * POST /api/auth/login
 * 无需带 token —— 登录本身就是拿 token 的那一步（§8.1 / §8.2 的说明）。
 */
router.post('/api/auth/login', async function (req, res, next) {
  try {
    const code = req.body && req.body.code;
    if (!code) throw fail('VALIDATION', '缺少登录凭证');
    const session = await wechat.code2Session(code);

    /* 管理员名单：环境变量里的 openid 直接提权 */
    const isAdmin = config.adminOpenids.indexOf(session.openid) >= 0;
    const user = await usersDao.upsertUser(session.openid, {
      unionid: session.unionid,
      role: isAdmin ? 'admin' : 'user'
    });
    if (isAdmin && user.role !== 'admin') {
      await usersDao.setRole(session.openid, 'admin');
      user.role = 'admin';
    }
    const token = tokenUtil.sign({ openid: user.openid, role: user.role });
    ok(res, {
      token: token,
      user: { openid: user.openid, role: user.role, nickname: user.nickname }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/health
 * 如实报告降级状态：向量库实现、embedding 模型、语义是否可用、审核是否真跑。
 */
router.get('/api/health', async function (req, res) {
  ok(res, {
    status: 'ok',
    dataSource: config.dataSource,
    vectorStore: vectorStore.current(),
    embeddingModel: config.embedding.model,
    embeddingProvider: config.embedding.provider,
    semantic: vectorStore.semanticAvailable(),
    seccheckMode: seccheck.isSkipped() ? 'dev-skip' : 'real',
    wechatConfigured: wechat.isConfigured()
  });
});

/** GET /api/categories —— 一级领域 + 二级标签树 */
router.get('/api/categories', async function (req, res, next) {
  try {
    const categories = await catalogDao.listCategories();
    const tags = await catalogDao.listTags();
    ok(res, { categories: categories, tags: tags });
  } catch (e) {
    next(e);
  }
});

/** GET /api/tags */
router.get('/api/tags', async function (req, res, next) {
  try {
    const tags = await catalogDao.listTags();
    ok(res, { items: tags, total: tags.length });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/experiences
 * query: categoryId / tagId / stance / page / size
 * stance 是要点级字段 —— 含义是「这条经验至少有一条该立场的要点」（§8.1）。
 */
router.get('/api/experiences', async function (req, res, next) {
  try {
    const q = req.query || {};
    const list = await expDao.listPublished({
      categoryId: q.categoryId,
      tagId: q.tagId,
      stance: q.stance,
      page: q.page,
      size: q.size
    });
    /* 列表要带要点，卡片要显示「N 推荐 · M 避雷」（§2.3） */
    const ids = list.items.map(function (i) { return i.id; });
    const pointMap = await expDao.listPointsByExperience(ids);
    for (const item of list.items) {
      item.points = pointMap[String(item.id)] || [];
      item.tagNames = item.tagNames || [];
    }
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

/** GET /api/experiences/:id */
router.get('/api/experiences/:id', async function (req, res, next) {
  try {
    const exp = await expDao.getById(req.params.id);
    if (!exp || exp.status !== 'published') throw fail('NOT_FOUND', '这条经验不存在或已下线');
    const related = await expDao.listRelated(exp.id, 3);
    expDao.incrView(exp.id).catch(function () { /* 浏览计数失败不影响阅读 */ });
    ok(res, {
      experience: exp,
      points: exp.points,
      sources: exp.sources,
      tags: exp.tagNames,
      related: related,
      usefulCount: exp.usefulCount,
      notUsefulCount: exp.notUsefulCount
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/experiences/:id/related */
router.get('/api/experiences/:id/related', async function (req, res, next) {
  try {
    const related = await expDao.listRelated(req.params.id, 3);
    ok(res, { items: related });
  } catch (e) {
    next(e);
  }
});

/** GET /api/experiences/:id/sources —— 要点 ↔ 依据映射 */
router.get('/api/experiences/:id/sources', async function (req, res, next) {
  try {
    const exp = await expDao.getById(req.params.id);
    if (!exp) throw fail('NOT_FOUND', '这条经验不存在');
    const groups = [];
    for (const p of exp.points) {
      const sources = [];
      for (const s of exp.sources) {
        if (expDao.sourceCoversPoint(s, p.id)) sources.push(s);
      }
      groups.push({ pointId: p.id, pointTitle: p.title, stance: p.stance, sources: sources });
    }
    ok(res, { groups: groups, sources: exp.sources });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/upload —— 反馈附图上传，换 media_id
 * 内容安全审核只认 media_id，临时路径不能直接送审（§9.4）。
 */
router.post('/api/upload', async function (req, res, next) {
  try {
    const raw = req.body && req.body.data;
    if (!raw) throw fail('VALIDATION', '缺少文件内容');
    const buffer = Buffer.from(String(raw), 'base64');
    const name = (req.body && req.body.filename) || 'image.png';
    const out = await wechat.uploadImage(buffer, name);
    ok(res, { mediaId: out.mediaId, url: out.url });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
