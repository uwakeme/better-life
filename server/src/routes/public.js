/**
 * 公开接口（无需登录）
 *
 * 职责：登录、健康检查、目录、经验读取、依据读取、素材上传。
 * 口径：浏览完全公开 —— 第一次进小程序不用登录也能看全部内容（§4.4 / §9.1）。
 */
const express = require('express');
const config = require('../config');
const db = require('../db');
const catalogDao = require('../dao/catalog');
const expDao = require('../dao/experiences');
const usersDao = require('../dao/users');
const uploadedMedia = require('../dao/uploaded-media');
const { decodeBase64Image } = require('../lib/image');
const tokenUtil = require('../services/token');
const wechat = require('../services/wechat');
const vectorStore = require('../services/vector-store');
const embedding = require('../services/embedding');
const seccheck = require('../services/seccheck');
const { requireAuth, userKey } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rate-limit');
const { fail, assertId } = require('../middleware/error');

const router = express.Router();
const uploadJson = express.json({ limit: Math.ceil(config.feedbackImageMaxBytes / 3) * 4 + 4096 });

/** 统一响应包（§8.4） */
function ok (res, data) {
  res.json({ ok: true, data: data });
}

/**
 * POST /api/auth/login
 * 无需带 token —— 登录本身就是拿 token 的那一步（§8.1 / §8.2 的说明）。
 *
 * ⚠️ 限流：每次调用都会向微信发一次请求（code2Session），
 *    不限流的话这个接口可以被刷 —— 既浪费微信的调用配额，
 *    也可能被拿来反复试探登录。
 */
router.post(
  '/api/auth/login',
  rateLimit({ windowMs: 60000, max: config.rateLimit.loginPerMinute, key: function (req) { return req.ip; } }),
  async function (req, res, next) {
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
    const wantedRole = isAdmin ? 'admin' : 'user';
    if (user.role !== wantedRole) {
      await usersDao.setRole(session.openid, wantedRole);
      user.role = wantedRole;
    }
    const token = tokenUtil.sign({ openid: user.openid, role: user.role });
    ok(res, {
      token: token,
      user: { openid: user.openid, role: user.role, nickname: user.nickname }
    });
  } catch (e) {
    next(e);
  }
  }
);

/**
 * GET /api/health
 * 如实报告降级状态：向量库实现、embedding 模型、语义是否可用、审核是否真跑。
 */
router.get('/api/health', async function (req, res) {
  /* ⚠️ 之前 status 写死 'ok' —— 数据库断了也报 ok，
     而列表接口已经在 500 了。这里真查一次库，查不通就报 503。 */
  let dbOk = true;
  try {
    await db.query('SELECT 1');
  } catch (e) {
    dbOk = false;
    console.error('[health] requestId=' + req.id + ' 数据库探活失败：' +
      (e && e.stack ? e.stack : e));
  }
  /* 数据来源按实际库模式上报 —— 之前是常量 'postgres'，
     内存模式下也在说 postgres。 */
  const dataSource = db.isMemory() ? 'memory' : 'postgres';
  const body = {
    status: dbOk ? 'ok' : 'degraded',
    dataSource: dataSource,
    vectorStore: vectorStore.current(),
    embeddingModel: config.embedding.model,
    embeddingProvider: config.embedding.provider,
    semantic: vectorStore.semanticAvailable(),
    seccheckMode: seccheck.isSkipped() ? 'dev-skip' : 'real',
    wechatConfigured: wechat.isConfigured()
  };
  if (!dbOk) {
    body.error = '数据库暂时不可用';
    body.errorId = req.id;
  }
  res.status(dbOk ? 200 : 503).json({ ok: dbOk, data: body });
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
      sort: q.sort,
      page: q.page,
      size: q.size
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

/** GET /api/experiences/:id */
router.get('/api/experiences/:id', async function (req, res, next) {
  try {
    const exp = await expDao.getById(assertId(req.params.id));
    if (!exp || exp.status !== 'published') throw fail('NOT_FOUND', '这条经验不存在或已下线');
    const related = await expDao.listRelated(exp.id, 3);
    expDao.incrView(exp.id, req.ip).catch(function () { /* 浏览计数失败不影响阅读 */ });
    /* 带上门票与收藏态 ——
       ⚠️ 之前没有这两个字段，详情页的「已投票 / 已收藏」永远显示不出来，
       而且为了知道收藏态，客户端要把整个收藏列表拉一遍。
       带 token 就带上，不带（未登录）就是空值。 */
    let myVote = null;
    let starred = false;
    const raw = tokenUtil.fromHeader(req.headers.authorization);
    if (raw) {
      const v = tokenUtil.verify(raw);
      if (v.ok) {
        const user = await usersDao.findUser(v.payload.openid);
        if (user) {
          myVote = await usersDao.getVote(user.openid, exp.id);
          starred = await usersDao.isFavorite(user.openid, exp.id);
        }
      }
    }
    ok(res, {
      experience: exp,
      points: exp.points,
      sources: exp.sources,
      tags: exp.tagNames,
      related: related,
      usefulCount: exp.usefulCount,
      notUsefulCount: exp.notUsefulCount,
      myVote: myVote,
      starred: starred
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/experiences/:id/related */
router.get('/api/experiences/:id/related', async function (req, res, next) {
  try {
    const related = await expDao.listRelated(assertId(req.params.id), 3);
    ok(res, { items: related });
  } catch (e) {
    next(e);
  }
});

/** GET /api/experiences/:id/sources —— 要点 ↔ 依据映射 */
router.get('/api/experiences/:id/sources', async function (req, res, next) {
  try {
    /* ⚠️ 这里之前只判「存在」，草稿的要点与依据能从公开接口读出来。
       草稿是还没写完的内容，不该在发布前被翻到。 */
    const exp = await expDao.getById(assertId(req.params.id), { publishedOnly: true });
    if (!exp) throw fail('NOT_FOUND', '这条经验不存在或已下线');
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
 * POST /api/upload —— 反馈附图上传，换一个可下载的 url
 *
 * ⚠️ 之前这个接口没有 requireAuth、没有限流、也没有校验：
 *    匿名请求带任意字符串都能拿到 200，内容原样转发给微信。
 *
 * 请求体（base64 的 JSON，不是 multipart ——
 * 小程序端用 wx.getFileSystemManager 读成 base64 再 POST，
 * 这样服务端不用装 multipart 解析器，依赖保持 express + pg 两个）：
 *   { data: '<base64>', filename: 'a.png' }
 *
 * 返回 { url } —— 这个 url 是公网可访问的，
 * 正是 mediaCheckAsync 需要的 media_url（§9.4）。
 */
router.post(
  '/api/upload',
  requireAuth,
  rateLimit({ windowMs: 60000, max: config.rateLimit.uploadPerMinute, key: userKey }),
  uploadJson,
  async function (req, res, next) {
    try {
      const raw = req.body && req.body.data;
      if (!raw) throw fail('VALIDATION', '缺少文件内容');
      const buffer = decodeBase64Image(String(raw), config.feedbackImageMaxBytes);
      const name = String((req.body && req.body.filename) || 'image.png').slice(0, 120);
      const out = await wechat.uploadImage(buffer, name);
      if (!out || !out.url) throw fail('SERVER', '图片上传失败');
      await uploadedMedia.recordUpload(out.url, req.user.openid);
      ok(res, { url: out.url });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
