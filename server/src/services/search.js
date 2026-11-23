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

/**
 * 泛词表：只做「不参与召回」，不做分词
 *
 * 为什么需要：§7.4 决定不做中文分词扩展（不装 PG 扩展），于是查询被切成 bigram。
 *   但「怎么」「什么」「可以」这类 bigram 在几十条经验里都出现，
 *   谁沾上就等于命中 —— 搜「空调滤网怎么洗」会把所有带「怎么」的经验都顶上来。
 *   把它们剔掉，召回就干净了；这不是分词，只是去掉没有信息量的字组。
 *   ⚠️ 整条查询全是泛词时（用户只搜「怎么」）不能一个都不留，退回原样。
 */
const GENERIC = {
  '怎么': 1, '么办': 1, '怎样': 1, '么样': 1, '如何': 1, '什么': 1, '么事': 1,
  '哪个': 1, '哪些': 1, '为什': 1, '是不': 1, '不是': 1, '可以': 1, '应该': 1,
  '需要': 1, '自己': 1, '一下': 1, '有没': 1, '没有': 1, '能不': 1, '不能': 1,
  '不要': 1, '想要': 1, '这个': 1, '那个': 1, '的话': 1, '好的': 1, '多少': 1,
  '少钱': 1, '哪儿': 1, '哪里': 1, '是否': 1, '还是': 1, '为吗': 1, '是吗': 1
};

/** 关键词路：逐 bigram 查，累加到经验上 */
async function keywordRoute (query, filters) {
  const all = bigrams(query);
  if (!all.length) return { ranked: [], matched: {} };
  /* 剔掉泛词。整条查询都是泛词（「怎么」「怎么办」这种）说明没有任何检索信号，
     如实返回空结果 —— 硬凑一批「哪儿都算命中」的经验只会误导人。 */
  const meaningful = all.filter(function (g) { return !GENERIC[g]; });
  if (!meaningful.length) return { ranked: [], matched: {} };
  const grams = meaningful;

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
      /* 无相关子查询 —— 相关子查询在 pg-mem 里会报「column does not exist」 */
      where += ' AND e.id IN (SELECT experience_id FROM points WHERE stance = $' + params.length + ')';
    }

    /* 经验自身：标题 3 / 摘要 2 / 搜索关键词 2；正文只作加分，不单独算数 */
    const expRes = await db.query(
      'SELECT e.id, e.title, e.summary, e.search_keywords, ' +
      '(CASE WHEN LOWER(e.title) LIKE $1 THEN 3 ELSE 0 END + ' +
      ' CASE WHEN LOWER(e.summary) LIKE $1 THEN 2 ELSE 0 END + ' +
      ' CASE WHEN LOWER(e.search_keywords::text) LIKE $1 THEN 2 ELSE 0 END) AS wmain, ' +
      '(CASE WHEN LOWER(e.body) LIKE $1 THEN 1 ELSE 0 END) AS wbody ' +
      'FROM experiences e WHERE ' + where + ' AND ' +
      '(LOWER(e.title) LIKE $1 OR LOWER(e.summary) LIKE $1 ' +
      ' OR LOWER(e.search_keywords::text) LIKE $1) ' +
      'LIMIT ' + config.search.keywordTopK,
      params
    );
    for (const row of expRes.rows) {
      const wmain = Number(row.wmain) || 0;
      if (!wmain) continue;
      /* 命中标题 / 结论也要说清楚，不能只有一条没有理由的结果 */
      if (String(row.title || '').toLowerCase().indexOf(gram) >= 0) bump(row.id, 0, 'title');
      else if (String(row.summary || '').toLowerCase().indexOf(gram) >= 0) bump(row.id, 0, 'summary');
      /* 正文权重只在标题/摘要/关键词已经命中时作为加分 ——
         正文很长，「怎么」这种泛词到处都是，只靠正文命中会把不相干的经验顶上来。 */
      bump(row.id, wmain + (Number(row.wbody) || 0), null);
      /* 命中搜索关键词时如实标注（§2.6） */
      const kws = row.search_keywords || [];
      for (const kw of kws) {
        if (String(kw).toLowerCase().indexOf(gram) >= 0) {
          bump(row.id, 2, 'keyword:' + kw);
        }
      }
    }

    /* 要点：要点标题 3 / 要点详情 1 */
    const pointRes = await db.query(
      'SELECT p.id, p.experience_id, p.title, ' +
      '(CASE WHEN LOWER(p.title) LIKE $1 THEN 3 ELSE 0 END) AS wt, ' +
      '(CASE WHEN LOWER(p.detail) LIKE $1 THEN 1 ELSE 0 END) AS wd ' +
      'FROM points p JOIN experiences e ON e.id = p.experience_id ' +
      'WHERE ' + where + ' AND (LOWER(p.title) LIKE $1 OR LOWER(p.detail) LIKE $1) ' +
      'LIMIT ' + config.search.keywordTopK,
      params
    );
    for (const row of pointRes.rows) {
      const wt = Number(row.wt) || 0;
      const wd = Number(row.wd) || 0;
      if (!wt && !wd) continue;
      /* 只在要点详情里蹭到泛词、这条经验又没有任何其它命中 —— 不算命中 */
      if (!wt && scores[String(row.experience_id)] === undefined) continue;
      bump(row.experience_id, wt + wd, 'point:' + row.title);
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
  /* 明显弱于最佳结果的不占位 —— bigram 没法分词，「怎么」这种泛词在摘要里到处命中，
     不设阈值就会用一堆不相干的经验把结果刷满。 */
  const topScore = list.length ? list[0].score : 0;
  const cutoff = topScore * config.search.relativeCutoff;
  const kept = list.filter(function (x) { return x.score >= cutoff; });
  /* RRF 只看排名，分数几乎一样 —— 相对阈值要落在「关键词路的原始分」上才有效 */
  const kwScore = {};
  for (const r of kw.ranked) kwScore[String(r.id)] = r.score;
  const maxKw = kw.ranked.length ? kw.ranked[0].score : 0;
  const kwCutoff = maxKw * config.search.relativeCutoff;
  const kept2 = kept.filter(function (x) {
    const s = kwScore[String(x.id)];
    if (s === undefined) return true;   /* 只来自向量路的，保留 */
    return s >= kwCutoff;
  });
  const top = kept2.slice(0, limit);

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
    if (vectorIds[String(t.id)] && reasons.indexOf('semantic') < 0) reasons.push('semantic');
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
