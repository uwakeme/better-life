const db = require('../db');
const config = require('../config');
const embedding = require('./embedding');
const vectorStore = require('./vector-store');
const { normalize, normalizedWithMap } = require('../lib/search-text');

/** 应用层 bigram 切分；查询与文档使用完全相同的归一规则。 */
function bigrams (text) {
  const clean = normalize(text);
  const out = [];
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2));
  if (clean.length === 1) out.push(clean);
  return Array.from(new Set(out));
}

const GENERIC = {
  '怎么': 1, '么办': 1, '怎样': 1, '么样': 1, '如何': 1, '什么': 1, '么事': 1,
  '哪个': 1, '哪些': 1, '为什': 1, '是不': 1, '不是': 1, '可以': 1, '应该': 1,
  '需要': 1, '自己': 1, '一下': 1, '有没': 1, '没有': 1, '能不': 1, '不能': 1,
  '不要': 1, '想要': 1, '这个': 1, '那个': 1, '的话': 1, '好的': 1, '多少': 1,
  '少钱': 1, '哪儿': 1, '哪里': 1, '是否': 1, '还是': 1, '为吗': 1, '是吗': 1
};

function filterSql (filters, params) {
  const where = ["e.status = 'published'"];
  const categories = (filters.categoryIds || []).map(Number).filter(function (n) {
    return Number.isInteger(n) && n > 0;
  });
  if (categories.length) {
    const marks = categories.map(function (id) {
      params.push(id);
      return '$' + params.length;
    });
    where.push('e.category_id IN (' + marks.join(',') + ')');
  }
  if (filters.stance) {
    params.push(String(filters.stance));
    where.push('e.id IN (SELECT experience_id FROM points WHERE stance = $' + params.length + ')');
  }
  return where.join(' AND ');
}

function gramParams (grams, params) {
  return grams.map(function (gram) {
    params.push('%' + gram + '%');
    return '$' + params.length;
  });
}

function anyGram (fields, marks) {
  const parts = [];
  for (const field of fields) {
    for (const mark of marks) parts.push(field + ' LIKE ' + mark);
  }
  return '(' + parts.join(' OR ') + ')';
}

/** 每类文档只查一次，在 SQL 中归一后批量匹配，再由 JS 按原始权重计分。 */
async function keywordRoute (query, filters) {
  const all = bigrams(query);
  const grams = all.filter(function (g) { return !GENERIC[g]; });
  if (!grams.length) return { ranked: [], matched: {} };

  const scores = {};
  const matched = {};
  function bump (id, weight, why) {
    const key = String(id);
    scores[key] = (scores[key] || 0) + weight;
    if (!matched[key]) matched[key] = [];
    if (why && matched[key].indexOf(why) < 0) matched[key].push(why);
  }

  const mainParams = [];
  const mainMarks = gramParams(grams, mainParams);
  const mainWhere = filterSql(filters, mainParams);
  const mainNorm = [
    'better_normalize(e.title)',
    'better_normalize(e.summary)',
    'better_normalize(e.search_keywords::text)'
  ];
  const mainRes = await db.query(
    'SELECT e.id, e.title, e.summary, e.search_keywords, e.body FROM experiences e WHERE ' +
    mainWhere + ' AND ' + anyGram(mainNorm, mainMarks),
    mainParams
  );

  const pointParams = [];
  const pointMarks = gramParams(grams, pointParams);
  const pointWhere = filterSql(filters, pointParams);
  const pointRes = await db.query(
    'SELECT p.id, p.experience_id, p.title, p.detail FROM points p ' +
    'JOIN experiences e ON e.id = p.experience_id WHERE ' + pointWhere +
    ' AND ' + anyGram(['better_normalize(p.title)', 'better_normalize(p.detail)'], pointMarks),
    pointParams
  );

  const tagParams = [];
  const tagMarks = gramParams(grams, tagParams);
  const tagWhere = filterSql(filters, tagParams);
  const tagRes = await db.query(
    'SELECT et.experience_id, t.name FROM experience_tags et ' +
    'JOIN tags t ON t.id = et.tag_id JOIN experiences e ON e.id = et.experience_id WHERE ' +
    tagWhere + ' AND ' + anyGram(['better_normalize(t.name)'], tagMarks),
    tagParams
  );

  for (const row of mainRes.rows) {
    const title = normalize(row.title);
    const summary = normalize(row.summary);
    const body = normalize(row.body);
    const keywords = Array.isArray(row.search_keywords) ? row.search_keywords : [];
    for (const gram of grams) {
      let main = 0;
      if (title.includes(gram)) {
        main += 3;
        bump(row.id, 3, 'title');
      }
      if (summary.includes(gram)) {
        main += 2;
        bump(row.id, 2, 'summary:');
      }
      const hits = keywords.filter(function (kw) { return normalize(kw).includes(gram); });
      if (hits.length) {
        main += 2;
        bump(row.id, 2, null);
        for (const kw of hits) bump(row.id, 0, 'keyword:' + kw);
      }
      if (main && body.includes(gram)) bump(row.id, 1, null);
    }
  }
  for (const row of pointRes.rows) {
    const title = normalize(row.title);
    const detail = normalize(row.detail);
    for (const gram of grams) {
      const weight = (title.includes(gram) ? 3 : 0) + (detail.includes(gram) ? 1 : 0);
      /* 详情独有的具体词同样是有效召回信号，不再依赖其它字段先命中。 */
      if (weight) bump(row.experience_id, weight, 'point:' + row.title);
    }
  }
  for (const row of tagRes.rows) {
    for (const gram of grams) {
      if (normalize(row.name).includes(gram)) bump(row.experience_id, 2, 'tag:' + row.name);
    }
  }

  const ranked = Object.keys(scores).map(function (id) {
    return { id: Number(id), score: scores[id] };
  });
  ranked.sort(function (a, b) {
    return b.score - a.score || a.id - b.id;
  });
  return { ranked: ranked.slice(0, config.search.keywordTopK), matched: matched };
}

/** 过滤在向量存储的 TopK 之前完成。 */
async function vectorRoute (query, filters) {
  if (!embedding.canCallRemote() || vectorStore.current() !== 'pgvector') {
    return { available: false, ranked: [] };
  }
  let vec;
  try {
    vec = await embedding.embedQuery(query);
  } catch (e) {
    return { available: false, ranked: [] };
  }
  const hits = await vectorStore.query(vec, config.search.vectorTopK, filters);
  const kept = hits.filter(function (h) {
    return typeof h.score === 'number' && h.score >= config.search.minSimilarity;
  });
  const pointIds = kept.filter(function (h) { return h.docType === 'point'; })
    .map(function (h) { return Number(h.refId); });
  const pointMap = {};
  if (pointIds.length) {
    const params = pointIds.map(function (id) {
      return Number(id);
    });
    const res = await db.query(
      'SELECT id, experience_id FROM points WHERE id IN (' +
      params.map(function (_, i) { return '$' + (i + 1); }).join(',') + ')',
      params
    );
    for (const row of res.rows) pointMap[String(row.id)] = Number(row.experience_id);
  }
  const order = [];
  const scoreMap = {};
  for (const hit of kept) {
    const id = hit.docType === 'experience' ? Number(hit.refId) : pointMap[String(hit.refId)];
    if (!id) continue;
    if (order.indexOf(id) < 0) order.push(id);
    scoreMap[String(id)] = hit.score;
  }
  return {
    available: true,
    ranked: order.map(function (id, i) {
      return { id: id, rank: i + 1, score: scoreMap[String(id)] };
    })
  };
}

async function search (body) {
  const b = body || {};
  const rawQuery = String(b.query || '');
  const maxLen = config.search.maxQueryLength;
  const query = rawQuery.length > maxLen ? rawQuery.slice(0, maxLen) : rawQuery;
  const truncated = query.length !== rawQuery.length;
  const started = Date.now();
  const filters = { categoryIds: b.categoryIds || [], stance: b.stance || '' };
  if (!normalize(query)) {
    return { query: query, truncated: false, queryLength: rawQuery.length, mode: 'keyword', tookMs: 0, items: [] };
  }

  const kw = await keywordRoute(query, filters);
  const vec = await vectorRoute(query, filters);
  const fused = {};
  function addFusion (id, rank) {
    const key = String(id);
    if (!fused[key]) fused[key] = { id: Number(id), score: 0, matchedOn: [] };
    fused[key].score += 1 / (config.search.rrfK + rank);
  }
  kw.ranked.forEach(function (row, i) { addFusion(row.id, i + 1); });
  vec.ranked.forEach(function (row, i) { addFusion(row.id, i + 1); });
  const list = Object.keys(fused).map(function (key) { return fused[key]; });
  list.sort(function (a, b) { return b.score - a.score || a.id - b.id; });
  const top = list.slice(0, db.limit(b.limit, config.search.limit));

  const ids = top.map(function (item) { return Number(item.id); });
  const expMap = {};
  if (ids.length) {
    const params = ids.slice();
    const where = ["e.status = 'published'", 'e.id IN (' +
      ids.map(function (_, i) { return '$' + (i + 1); }).join(',') + ')'];
    const categories = (filters.categoryIds || []).map(Number).filter(function (n) {
      return Number.isInteger(n) && n > 0;
    });
    if (categories.length) {
      const marks = categories.map(function (id) {
        params.push(id);
        return '$' + params.length;
      });
      where.push('e.category_id IN (' + marks.join(',') + ')');
    }
    if (filters.stance) {
      params.push(String(filters.stance));
      where.push('e.id IN (SELECT experience_id FROM points WHERE stance = $' + params.length + ')');
    }
    const res = await db.query(
      'SELECT e.id, e.title, e.summary, e.category_id, e.updated_at, e.confidence, ' +
      'c.name AS category_name FROM experiences e JOIN categories c ON c.id = e.category_id WHERE ' +
      where.join(' AND '), params
    );
    for (const row of res.rows) expMap[String(row.id)] = row;
  }

  const vectorIds = {};
  vec.ranked.forEach(function (row) { vectorIds[String(row.id)] = true; });
  const grams = bigrams(query);
  const items = [];
  for (const item of top) {
    const row = expMap[String(item.id)];
    if (!row) continue;
    const reasons = (kw.matched[String(item.id)] || []).slice();
    if (vectorIds[String(item.id)]) reasons.push('semantic');
    items.push({
      experience: {
        id: Number(row.id), title: row.title, summary: row.summary,
        categoryId: Number(row.category_id), categoryName: row.category_name,
        updatedAt: row.updated_at, confidence: row.confidence
      },
      score: item.score,
      matchedOn: reasons,
      highlights: { summary: highlight(row.summary, grams) }
    });
  }
  return {
    query: query,
    truncated: truncated,
    queryLength: rawQuery.length,
    mode: !vec.available ? 'keyword' : (!kw.ranked.length ? 'vector' : 'hybrid'),
    tookMs: Date.now() - started,
    items: items
  };
}

function highlight (text, grams) {
  const source = String(text || '');
  const mapped = normalizedWithMap(source);
  if (!mapped.text || !grams || !grams.length) return [];
  const marks = [];
  for (const gram of grams) {
    let at = mapped.text.indexOf(gram);
    while (at >= 0) {
      marks.push([mapped.starts[at], mapped.ends[at + gram.length - 1]]);
      at = mapped.text.indexOf(gram, at + 1);
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
  for (const mark of merged) {
    if (mark[0] > cursor) out.push([source.slice(cursor, mark[0]), false]);
    out.push([source.slice(mark[0], mark[1]), true]);
    cursor = mark[1];
  }
  if (cursor < source.length) out.push([source.slice(cursor), false]);
  return out;
}

module.exports = {
  search: search,
  normalize: normalize,
  bigrams: bigrams,
  keywordRoute: keywordRoute,
  vectorRoute: vectorRoute,
  highlight: highlight
};
