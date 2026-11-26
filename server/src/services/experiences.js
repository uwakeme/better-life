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
const sdDao = require('../dao/search-documents');
const { toDateOnly } = require('../lib/to-camel');

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
async function indexExperience (exp, opts) {
  const options = opts || {};
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
  if (!Array.isArray(vectors) || vectors.length !== docs.length) {
    throw new Error('embedding 返回数量与文档不一致');
  }
  for (let i = 0; i < docs.length; i++) {
    if (!Array.isArray(vectors[i]) || vectors[i].length !== config.embedding.dim) {
      throw new Error('embedding 维度与配置不一致');
    }
    docs[i].embedding = vectors[i];
  }
  await vectorStore.replaceExperience(exp.id, docs, options.pointIds || []);
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

  const previous = payload.id ? await expDao.getById(payload.id) : null;
  if (payload.id && !previous) throw Object.assign(new Error('这条经验不存在'), { code: 'NOT_FOUND' });
  const oldPointIds = (previous && previous.points || []).map(function (point) { return point.id; });
  const id = await db.tx(async function (client) {
    return expDao.save(payload, client);
  });

  const exp = await expDao.getById(id);
  let indexed = false;
  let hint = '';
  if (exp && exp.status === 'published') {
    try {
      await indexExperience(exp, { pointIds: oldPointIds });
      indexed = true;
    } catch (err) {
      /* 内容永远比索引重要 —— 发布不因为索引失败而回滚（§7.9）
         但必须留下痕迹：之前这里只写进 hint，前端又不显示 hint，
         结果索引失败全链路静默，没人知道哪条内容搜不到。 */
      console.error('[experiences] 建索引失败 experience=' + id + '：' +
        (err && err.message ? err.message : err));
      try {
        // 内容已提交、旧要点已删除；回滚后的旧 point 索引必须显式清理。
        await sdDao.removeExperience(id, null, oldPointIds);
      } catch (cleanupErr) {
        console.error('[experiences] 清理失效索引失败 experience=' + id + '：' +
          (cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr));
      }
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
    console.error('[experiences] 建索引失败 experience=' + id + '：' +
      (err && err.message ? err.message : err));
    hint = '内容已发布，但搜索索引还没建好，稍后可重建索引。';
  }
  return { id: Number(id), indexed: indexed, hint: hint };
}

/**
 * 下线
 * ⚠️ 之前只改状态，不动索引 —— 下线的内容还在搜索结果里，
 *    点进去详情接口却 404。现在下线与清索引一起做。
 */
async function unpublish (id) {
  const exp = await expDao.getById(id);
  if (!exp) {
    const e = new Error('这条经验不存在');
    e.code = 'NOT_FOUND';
    throw e;
  }
  await expDao.setStatus(id, 'draft');
  try {
    await removeIndex(exp);
  } catch (err) {
    console.error('[experiences] 清索引失败 experience=' + exp.id + '：' +
      (err && err.message ? err.message : err));
  }
  return { id: Number(id) };
}

/** 清掉一条经验的全部索引文档（经验文档 + 它的要点文档） */
async function removeIndex (exp) {
  const pointIds = (exp.points || []).map(function (point) { return Number(point.id); });
  await vectorStore.removeExperience(exp.id, pointIds);
}

/**
 * 全量重建索引
 *
 * ⚠️ 之前有三个问题：
 *   1) 只取前 500 条（而且 limit 被截到 200）—— 库里的经验多起来就漏。
 *   2) 不清旧模型与孤儿文档 —— 换 embedding 模型后旧文档还在库里。
 *   3) 失败静默吞掉。
 * 现在分页取全量，每条重建前先清掉它自己的旧文档。
 */
async function reindexAll (opts) {
  const options = opts || {};
  let total = 0;
  let processed = 0;
  let failed = 0;
  const pageSize = 100;
  await sdDao.deleteOrphans();
  for (let page = 1; ; page++) {
    const list = await expDao.listForAdmin({ status: 'published', size: pageSize, page: page });
    const items = list.items || [];
    if (!items.length) break;
    const exps = await expDao.getByIds(items.map(function (item) { return item.id; }));
    for (const exp of exps) {
      if (options.since && dateOnly(exp.updatedAt) < options.since) continue;
      try {
        total += await indexExperience(exp, {
          pointIds: exp.points.map(function (point) { return point.id; })
        });
        processed++;
      } catch (e) {
        failed++;
        console.error('[experiences] 重建索引失败 experience=' + exp.id + '：' +
          (e && e.message ? e.message : e));
      }
    }
    if (items.length < pageSize) break;
  }
  return { documents: total, experiences: processed, failed: failed };
}

/** 经验的更新日期（北京时间）—— 与接口里返回的日期是同一套算法 */
function dateOnly (value) {
  return value ? toDateOnly(value) : '';
}

/**
 * 重建一条经验的索引
 * ⚠️ 只索引已发布的内容 —— 之前不看状态，
 *    对草稿执行重建索引会生成「草稿-未发布-机密」这样的文档，
 *    搜出来点进去却是 404。
 */
async function reindexOne (id) {
  const exp = await expDao.getById(id);
  if (!exp) {
    const e = new Error('这条经验不存在');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (exp.status !== 'published') {
    /* 草稿不建索引 —— 但要把它的旧索引清掉（之前发布过再下线的情况） */
    await removeIndex(exp);
    return { id: Number(id), documents: 0, skipped: 'not-published' };
  }
  /* 重建前先清掉这条经验的全部文档 ——
     要点每次保存都会整份重插、id 全部变化，
     旧要点的索引文档没人清理，会变成孤儿。 */
  const n = await indexExperience(exp, {
    pointIds: exp.points.map(function (point) { return point.id; })
  });
  return { id: Number(id), documents: n };
}

/** 先清 point 索引，再级联删除内容；两者在同一事务。 */
async function remove (id) {
  const exp = await expDao.getById(id);
  if (!exp) throw Object.assign(new Error('这条经验不存在'), { code: 'NOT_FOUND' });
  const pointIds = exp.points.map(function (point) { return Number(point.id); });
  await db.tx(async function (client) {
    await sdDao.removeExperience(id, client, pointIds);
    await client.query('DELETE FROM experiences WHERE id = $1', [Number(id)]);
  });
  vectorStore.forget('experience', [id]);
  vectorStore.forget('point', pointIds);
  return { id: Number(id) };
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
  reindexOne: reindexOne,
  remove: remove
};
