/**
 * 经验业务服务
 *
 * 职责：写入一条经验的完整流程 —— 校验 → 落库 → 索引。
 * 关键约定：
 *   1. 发布前的四道校验（§4.1）：标题/结论非空、至少 1 条要点、至少 1 条依据、
 *      每条依据都关联了至少一条要点。护栏在数据层，这里只是提前把话说清楚。
 *   2. embedding 失败**不阻塞发布**（§7.9）：内容先可见，索引缺行就是待重试标记。
 *   3. 改内容后要重建这条经验的索引。
 */
const db = require('../db');
const config = require('../config');
const expDao = require('../dao/experiences');
const catalogDao = require('../dao/catalog');
const vectorStore = require('./vector-store');
const embedding = require('./embedding');

/** 发布前校验 —— 与设计文档 §4.1 同一套口径 */
function validateForPublish (exp) {
  const errors = [];
  const e = exp || {};
  if (!e.title || !String(e.title).trim()) errors.push('标题不能为空');
  if (!e.summary || !String(e.summary).trim()) errors.push('结论不能为空');
  const points = e.points || [];
  const sources = e.sources || [];
  if (!points.length) errors.push('尚未填写要点，请先补充。');
  if (!sources.length) errors.push('至少需要 1 条依据，发布前请补充。');
  for (const s of sources) {
    if (!s.pointIds || !s.pointIds.length) {
      errors.push('存在未关联要点的依据，请先为其指定所支撑的要点。');
      break;
    }
  }
  return errors;
}

/** 经验文档的 embedding 文本（§7.8 规则） */
function buildEmbeddingText (exp) {
  const points = exp.points || [];
  let text = String(exp.title || '') + ' ' + String(exp.summary || '') + ' ' + String(exp.body || '');
  for (const p of points) {
    text += ' ' + String(p.title || '') + ' ' + String(p.detail || '') + ' ' + String(p.appliesTo || '');
  }
  const tagNames = exp.tagNames || [];
  if (tagNames.length) text += ' ' + tagNames.join(' ');
  const categoryName = exp.categoryName || '';
  if (categoryName) text += ' ' + categoryName;
  return text.trim();
}

/** 要点文档的 embedding 文本 */
function buildPointEmbeddingText (point, exp) {
  return [point.title, point.detail, point.appliesTo, exp.title]
    .map(function (s) { return String(s || ''); })
    .join(' ')
    .trim();
}

/** 给一条经验建索引（经验文档 + 每个要点文档） */
async function indexExperience (exp) {
  const docs = [{
    docType: 'experience',
    refId: exp.id,
    title: exp.title,
    content: buildEmbeddingText(exp),
    model: config.embedding.model,
    dim: config.embedding.dim
  }];
  const points = exp.points || [];
  for (const p of points) {
    docs.push({
      docType: 'point',
      refId: p.id,
      title: p.title,
      content: buildPointEmbeddingText(p, exp),
      model: config.embedding.model,
      dim: config.embedding.dim
    });
  }
  const vectors = await embedding.embedDocuments(docs.map(function (d) { return d.content; }));
  for (let i = 0; i < docs.length; i++) docs[i].embedding = vectors[i];
  await vectorStore.upsert(docs);
  return docs.length;
}

/**
 * 保存一条经验（新建或更新）
 * 状态是 published 时顺手重建索引；索引失败不阻塞保存，只记到 hint 里。
 */
async function save (payload) {
  const errors = validateForPublish(payload);
  /* 标题是任何一次保存的底线 —— 草稿也必须有标题。
     草稿可以没写完（没结论、没要点、没依据都行），
     但一条连标题都没有的经验，列表里根本看不出是什么，更别说生成唯一 slug。 */
  if (!payload || !String(payload.title || '').trim()) {
    const e = new Error('标题不能为空');
    e.code = 'VALIDATION';
    e.errors = ['标题不能为空'];
    throw e;
  }
  const wantPublish = payload.status === 'published';
  if (wantPublish && errors.length) {
    const e = new Error(errors[0]);
    e.code = 'VALIDATION';
    e.errors = errors;
    throw e;
  }

  const id = await db.tx(async function (client) {
    return expDao.save(payload, client);
  });

  const exp = await expDao.getById(id);
  let indexed = false;
  let hint = '';
  if (exp && exp.status === 'published') {
    try {
      await indexExperience(exp);
      indexed = true;
    } catch (err) {
      /* 内容永远比索引重要 —— 发布不因为索引失败而回滚（§7.9） */
      hint = '内容已保存，但搜索索引还没建好，稍后可重建索引。';
    }
  }
  return { id: id, indexed: indexed, hint: hint, errors: errors };
}

/** 发布 */
async function publish (id) {
  const exp = await expDao.getById(id);
  if (!exp) {
    const e = new Error('这条经验不存在');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const errors = validateForPublish(exp);
  if (errors.length) {
    const e = new Error(errors[0]);
    e.code = 'VALIDATION';
    e.errors = errors;
    throw e;
  }
  await expDao.setStatus(id, 'published');
  let indexed = false;
  let hint = '';
  try {
    await indexExperience(exp);
    indexed = true;
  } catch (err) {
    hint = '内容已发布，但搜索索引还没建好，稍后可重建索引。';
  }
  return { id: Number(id), indexed: indexed, hint: hint };
}

/** 下线 */
async function unpublish (id) {
  await expDao.setStatus(id, 'draft');
  return { id: Number(id) };
}

/** 全量重建索引 */
async function reindexAll () {
  const list = await expDao.listForAdmin({ size: 500 });
  let total = 0;
  for (const item of list.items) {
    if (item.status !== 'published') continue;
    const exp = await expDao.getById(item.id);
    if (!exp) continue;
    try {
      total += await indexExperience(exp);
    } catch (e) {
      /* 单条失败不影响其它经验 */
    }
  }
  return { documents: total };
}

/** 重建一条经验的索引 */
async function reindexOne (id) {
  const exp = await expDao.getById(id);
  if (!exp) {
    const e = new Error('这条经验不存在');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const n = await indexExperience(exp);
  return { id: Number(id), documents: n };
}

module.exports = {
  validateForPublish: validateForPublish,
  buildEmbeddingText: buildEmbeddingText,
  buildPointEmbeddingText: buildPointEmbeddingText,
  indexExperience: indexExperience,
  save: save,
  publish: publish,
  unpublish: unpublish,
  reindexAll: reindexAll,
  reindexOne: reindexOne
};
