/**
 * 检索服务：两路召回 + RRF 融合（§7）
 *
 * 路 A 向量：query → embed → vectorStore.query
 * 路 B 关键词：bigram 逐个 LOWER(...) LIKE 命中，
 *             标题(3) / 摘要(2) / 要点标题(3) / 要点详情(1)
 * 融合：score = Σ 1/(60 + rank_i)，只看排名不看分数（§7.3）
 *
 * mode 如实上报（§7.7）：
 *   hybrid  向量 + 关键词都走了
 *   vector  关键词路无结果
 *   keyword 向量服务不可用，降级
 *   degraded 服务端整体降级（演示数据）
 */
const db = require('../db');
const config = require('../config');
const embedding = require('./embedding');
const vectorStore = require('./vector-store');

/** 归一：大小写归一 + 去标点与空白 */
function normalize (text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[!-\/:-@\[-`{-~\u3000-\u303f\uff00-\uffef]+/g, '');
}

/**
 * 应用层 bigram 切分（§7.4）
 * 不做中文分词扩展 —— 依赖装扩展的摩擦太大，而 bigram 对短查询够用。
 */
function bigrams (text) {
  const clean = normalize(text);
  const out = [];
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2));
  if (clean.length === 1) out.push(clean);
  /* 去重，避免同一个 bigram 重复计分 */
  const seen = {};
  const uniq = [];
  for (const g of out) {
    if (seen[g]) continue;
    seen[g] = true;
    uniq.push(g);
  }
  return uniq;
}

/** 关键词路：逐 bigram 查，累加到经验上 */
async function keywordRoute (query, filters) {
  const grams = bigrams(query);
  if (!grams.length) return { ranked: [], matched: {} };

  const scores = {};
  const matched = {};

  function bump (id, weight, why) {
    const key = String(id);
    scores[key] = (scores[key] || 0) + weight;
    if (!matched[key]) matched[key] = [];
    if (why && matched[key].indexOf(why) < 0) matched[key].push(why);
  }

  for (const gram of grams) {
    const like = '%' + gram + '%';
    const params = [like];
    let where = "e.status = 'published'";
    if (filters && filters.categoryIds && filters.categoryIds.length) {
      const marks = [];
      for (let i = 0; i < filters.categoryIds.length; i++) {
        marks.push('$' + (params.length + 1));
        params.push(Number(filters.categoryIds[i]));
      }
      where += ' AND e.category_id IN (' + marks.join(',') + ')';
    }
    if (filters && filters.stance) {
      params.push(String(filters.stance));
      where += ' AND EXISTS (SELECT 1 FROM points sp WHERE sp.experience_id = e.id AND sp.stance = $' + params.length + ')';
    }

    /* 经验自身：标题 3 / 摘要 2 / 正文 1 */
    const expRes = await db.query(
      'SELECT e.id, e.title, e.summary, e.search_keywords, ' +
      '(CASE WHEN LOWER(e.title) LIKE $1 THEN 3 ELSE 0 END + ' +
      ' CASE WHEN LOWER(e.summary) LIKE $1 THEN 2 ELSE 0 END + ' +
      ' CASE WHEN LOWER(e.body) LIKE $1 THEN 1 ELSE 0 END) AS w ' +
      'FROM experiences e WHERE ' + where + ' AND ' +
      '(LOWER(e.title) LIKE $1 OR LOWER(e.summary) LIKE $1 OR LOWER(e.body) LIKE $1 ' +
      ' OR LOWER(e.search_keywords::text) LIKE $1) ' +
      'LIMIT ' + config.search.keywordTopK,
      params
    );
    for (const row of expRes.rows) {
      const w = Number(row.w) || 0;
      if (!w) continue;
      bump(row.id, w, null);
      /* 命中搜索关键词时如实标注（§2.6） */
      const kws = row.search_keywords || [];
      for (const kw of kws) {
        if (String(kw).toLowerCase().indexOf(gram) >= 0) {
          bump(row.id, 2, '关键词：' + kw);
        }
      }
    }

    /* 要点：要点标题 3 / 要点详情 1 */
    const pointRes = await db.query(
      'SELECT p.id, p.experience_id, p.title, ' +
      '(CASE WHEN LOWER(p.title) LIKE $1 THEN 3 ELSE 0 END + ' +
      ' CASE WHEN LOWER(p.detail) LIKE $1 THEN 1 ELSE 0 END) AS w ' +
      'FROM points p JOIN experiences e ON e.id = p.experience_id ' +
      'WHERE ' + where + ' AND (LOWER(p.title) LIKE $1 OR LOWER(p.detail) LIKE $1) ' +
      'LIMIT ' + config.search.keywordTopK,
      params
    );
    for (const row of pointRes.rows) {
      const w = Number(row.w) || 0;
      if (!w) continue;
      bump(row.experience_id, w, '命中要点：' + row.title);
    }
  }

  const ranked = Object.keys(scores).map(function (id) {
    return { id: Number(id), score: scores[id] };
  });
  ranked.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });
  return { ranked: ranked.slice(0, config.search.keywordTopK), matched: matched };
}

/** 向量路 */
async function vectorRoute (query) {
  if (!embedding.canCallRemote() || vectorStore.current() !== 'pgvector') {
    return { available: false, ranked: [] };
  }
  let vec;
  try {
    vec = await embedding.embedQuery(query);
  } catch (e) {
    return { available: false, ranked: [] };
  }
  const hits = await vectorStore.query(vec, config.search.vectorTopK);
  if (!hits.length) return { available: true, ranked: [] };

  /* 要点文档要回溯到所属经验 */
  const expIds = [];
  const pointIds = [];
  for (const h of hits) {
    if (h.docType === 'experience') expIds.push(h.refId);
    else pointIds.push(h.refId);
  }
  const rows = [];
  if (expIds.length) {
    const res = await db.query(
      'SELECT id FROM experiences WHERE id IN (' + expIds.map(Number).join(',') + ')',
      []
    );
    for (const r of res.rows) rows.push({ id: Number(r.id), rank: 0 });
  }
  if (pointIds.length) {
    const res = await db.query(
      'SELECT id, experience_id FROM points WHERE id IN (' + pointIds.map(Number).join(',') + ')',
      []
    );
    for (const r of res.rows) rows.push({ id: Number(r.experience_id), rank: 0 });
  }
  /* 用命中顺序回填经验 id（按首次出现的顺序） */
  const order = [];
  for (const h of hits) {
    let id = h.refId;
    if (h.docType === 'point') {
      const p = rows.find(function (r) { return r.id === h.refId; });
      id = p ? Number(p.experience_id) : null;
    }
    if (id && order.indexOf(id) < 0) order.push(id);
  }
  const ranked = order.map(function (id, i) {
    return { id: id, score: 1 - i / (order.length + 1), rank: i + 1 };
  });
  return { available: true, ranked: ranked };
}

/**
 * 检索主入口
 * @param {object} body { query, categoryIds?, stance?, limit? }
 */
async function search (body) {
  const b = body || {};
  const query = String(b.query || '');
  const started = Date.now();
  const filters = { categoryIds: b.categoryIds || [], stance: b.stance || '' };

  if (!normalize(query)) {
    return { query: query, mode: 'keyword', tookMs: 0, items: [] };
  }

  const kw = await keywordRoute(query, filters);
  const vec = await vectorRoute(query);

  /* RRF 融合 */
  const K = config.search.rrfK;
  const fused = {};
  function addFusion (id, rank, weight) {
    const key = String(id);
    if (!fused[key]) fused[key] = { id: Number(id), score: 0, matchedOn: [] };
    fused[key].score += weight / (K + rank);
  }
  for (let i = 0; i < kw.ranked.length; i++) addFusion(kw.ranked[i].id, i + 1, 1);
  for (let i = 0; i < vec.ranked.length; i++) addFusion(vec.ranked[i].id, i + 1, 1);

  const list = Object.keys(fused).map(function (k) { return fused[k]; });
  list.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });
  const limit = db.limit(b.limit, config.search.limit);
  const top = list.slice(0, limit);

  /* 取经验本体 */
  const ids = top.map(function (t) { return t.id; });
  const expMap = {};
  if (ids.length) {
    const res = await db.query(
      'SELECT e.id, e.title, e.summary, e.category_id, e.updated_at, e.confidence, c.name AS category_name ' +
      'FROM experiences e JOIN categories c ON c.id = e.category_id WHERE e.id IN (' +
      ids.map(Number).join(',') + ')'
    );
    for (const row of res.rows) expMap[String(row.id)] = row;
  }

  /* 命中原因 */
  const kwMatched = kw.matched;
  const vectorIds = {};
  for (const v of vec.ranked) vectorIds[String(v.id)] = true;

  const items = [];
  for (const t of top) {
    const row = expMap[String(t.id)];
    if (!row) continue;
    const reasons = (kwMatched[String(t.id)] || []).slice();
    if (vectorIds[String(t.id)] && reasons.indexOf('语义相近') < 0) reasons.push('语义相近');
    items.push({
      experience: {
        id: Number(row.id),
        title: row.title,
        summary: row.summary,
        categoryId: Number(row.category_id),
        categoryName: row.category_name,
        updatedAt: row.updated_at,
        confidence: row.confidence
      },
      score: t.score,
      matchedOn: reasons,
      highlights: { summary: highlight(row.summary, bigrams(query)) }
    });
  }

  /* mode 如实上报 */
  let mode;
  if (!vec.available) mode = 'keyword';
  else if (!kw.ranked.length) mode = 'vector';
  else mode = 'hybrid';

  return {
    query: query,
    mode: mode,
    tookMs: Date.now() - started,
    items: items
  };
}

/** 摘要高亮：返回 [文本, 是否命中] 的数组 */
function highlight (text, grams) {
  const s = String(text || '');
  if (!s || !grams || !grams.length) return [];
  const marks = [];
  const lower = s.toLowerCase();
  for (const g of grams) {
    let at = lower.indexOf(g);
    while (at >= 0) {
      marks.push([at, at + g.length]);
      at = lower.indexOf(g, at + 1);
    }
  }
  if (!marks.length) return [];
  marks.sort(function (a, b) { return a[0] - b[0]; });
  const merged = [marks[0].slice()];
  for (let i = 1; i < marks.length; i++) {
    const last = merged[merged.length - 1];
    if (marks[i][0] <= last[1]) last[1] = Math.max(last[1], marks[i][1]);
    else merged.push(marks[i].slice());
  }
  const out = [];
  let cursor = 0;
  for (const m of merged) {
    if (m[0] > cursor) out.push([s.slice(cursor, m[0]), false]);
    out.push([s.slice(m[0], m[1]), true]);
    cursor = m[1];
  }
  if (cursor < s.length) out.push([s.slice(cursor), false]);
  return out;
}

module.exports = {
  search: search,
  normalize: normalize,
  bigrams: bigrams,
  keywordRoute: keywordRoute,
  highlight: highlight
};
