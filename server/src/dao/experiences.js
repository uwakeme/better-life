/**
 * 经验 DAO：经验 / 要点 / 依据 / 经验-标签关联
 *
 * 职责：把 §6.2 的四张表读写成业务层的 camelCase 结构，以及写入。
 * 关键约定：
 *   1. 要点与依据是一体的 —— 详情页永远一起返回，写入也永远一起落库。
 *   2. 依据的 point_ids 是数组，pg-mem 不支持 WHERE $id = ANY(数组列)，
 *      所以"这条依据挂了哪些要点"的判断在 JS 里做（数据量小，代价可忽略）。
 *   3. 删要点时必须在同一个事务里把 sources.point_ids 里的这个 id 剔掉，
 *      否则会留下悬空引用（§6.2 的明确要求，§6.3 第 8 条断言会检出）。
 *   4. **不用相关子查询** —— pg-mem 完全不支持 SELECT 列表与 WHERE 里的相关子查询，
 *      一律改成「无相关 IN (SELECT …)」或「单独 GROUP BY 查询后在 JS 里合并」。
 *      这条约束对真实 PG 也成立：写法统一，行为一致。
 */
const db = require('../db');
const { toCamel, toCamelList, toDateOnly } = require('../lib/to-camel');

/**
 * 批量取多条经验的标签名
 * @returns {Object} { '<experienceId>': ['标签', ...] }
 */
async function tagNamesFor (ids) {
  const out = {};
  const list = (ids || []).map(Number).filter(function (n) { return n > 0; });
  if (!list.length) return out;
  const res = await db.query(
    'SELECT et.experience_id, t.name FROM experience_tags et JOIN tags t ON t.id = et.tag_id ' +
    'WHERE et.experience_id IN (' + list.join(',') + ') ORDER BY t.id'
  );
  for (const r of res.rows) {
    const key = String(r.experience_id);
    if (!out[key]) out[key] = [];
    out[key].push(r.name);
  }
  return out;
}

/** 批量标签 id，管理列表避免逐条查询。 */
async function tagIdsFor (ids) {
  const list = (ids || []).map(Number).filter(function (id) { return id > 0; });
  const out = {};
  if (!list.length) return out;
  const res = await db.query(
    'SELECT experience_id, tag_id FROM experience_tags WHERE experience_id IN (' +
    list.join(',') + ') ORDER BY experience_id, tag_id'
  );
  for (const row of res.rows) {
    const key = String(row.experience_id);
    if (!out[key]) out[key] = [];
    out[key].push(Number(row.tag_id));
  }
  return out;
}

async function listTagIds (experienceId) {
  const map = await tagIdsFor([experienceId]);
  return map[String(experienceId)] || [];
}

const EXP_COLUMNS =
  'e.id, e.slug, e.title, e.summary, e.body, e.category_id, e.search_keywords, ' +
  'e.cover_url, e.status, e.confidence, e.reviewed_at, e.next_review_at, ' +
  'e.view_count, e.favorite_count, e.useful_count, e.not_useful_count, e.feedback_count, ' +
  'e.created_at, e.updated_at, c.name AS category_name, c.slug AS category_slug';

/** 经验列表（读者侧：只出已发布的） */
async function listPublished (opts) {
  const o = opts || {};
  const size = db.limit(o.size, 20);
  const page = Math.max(1, Number(o.page) || 1);
  const offset = (page - 1) * size;

  const where = ["e.status = 'published'"];
  const params = [];
  let p = 1;
  if (o.categoryId) {
    where.push('e.category_id = $' + p);
    params.push(Number(o.categoryId));
    p++;
  }
  if (o.tagId) {
    where.push('e.id IN (SELECT experience_id FROM experience_tags WHERE tag_id = $' + p + ')');
    params.push(Number(o.tagId));
    p++;
  }
  /* stance 是要点级字段：这条经验至少有一条该立场的要点（§8.1） */
  if (o.stance) {
    where.push('e.id IN (SELECT experience_id FROM points WHERE stance = $' + p + ')');
    params.push(String(o.stance));
    p++;
  }

  const order = o.sort === 'fav'
    ? 'e.favorite_count DESC, e.updated_at DESC, e.id DESC'
    : 'e.updated_at DESC, e.id DESC';
  const sql =
    'SELECT ' + EXP_COLUMNS + ' FROM experiences e JOIN categories c ON c.id = e.category_id ' +
    'WHERE ' + where.join(' AND ') +
    ' ORDER BY ' + order + ' LIMIT ' + size + ' OFFSET ' + offset;

  const countSql = 'SELECT count(*) AS n FROM experiences e WHERE ' + where.join(' AND ');
  const rows = await db.query(sql, params);
  const totalRow = await db.queryOne(countSql, params);

  const items = toCamelList(rows.rows, { numeric: true });
  const nameMap = await tagNamesFor(items.map(function (i) { return i.id; }));
  const stanceMap = await stanceCountsFor(items.map(function (item) { return item.id; }));
  for (const item of items) {
    item.tagNames = nameMap[String(item.id)] || [];
    item.keywords = item.searchKeywords || [];
    item.stanceCounts = stanceMap[String(item.id)] || { good: 0, bad: 0, neutral: 0 };
  }
  return { items: items, page: page, size: size, total: Number(totalRow ? totalRow.n : 0) };
}

async function stanceCountsFor (ids) {
  const list = (ids || []).map(Number).filter(function (id) { return id > 0; });
  const out = {};
  if (!list.length) return out;
  const res = await db.query(
    'SELECT experience_id, stance, count(*) AS n FROM points WHERE experience_id IN (' +
    list.join(',') + ') GROUP BY experience_id, stance'
  );
  for (const row of res.rows) {
    const key = String(row.experience_id);
    if (!out[key]) out[key] = { good: 0, bad: 0, neutral: 0 };
    if (Object.prototype.hasOwnProperty.call(out[key], row.stance)) {
      out[key][row.stance] = Number(row.n);
    }
  }
  return out;
}

async function relationCountsFor (ids) {
  const list = (ids || []).map(Number).filter(function (id) { return id > 0; });
  const out = {};
  for (const id of list) out[String(id)] = { points: 0, sources: 0 };
  if (!list.length) return out;
  const inList = '(' + list.join(',') + ')';
  const points = await db.query('SELECT experience_id, count(*) AS n FROM points WHERE experience_id IN ' + inList + ' GROUP BY experience_id');
  const sources = await db.query('SELECT experience_id, count(*) AS n FROM sources WHERE experience_id IN ' + inList + ' GROUP BY experience_id');
  for (const row of points.rows) out[String(row.experience_id)].points = Number(row.n);
  for (const row of sources.rows) out[String(row.experience_id)].sources = Number(row.n);
  return out;
}

/** 管理端列表：含草稿，支持关键词与领域筛选 */
async function listForAdmin (opts) {
  const o = opts || {};
  const size = db.limit(o.size, 50);
  const page = Math.max(1, Number(o.page) || 1);
  const offset = (page - 1) * size;

  const where = ['1 = 1'];
  const params = [];
  let p = 1;
  if (o.categoryId) {
    where.push('e.category_id = $' + p);
    params.push(Number(o.categoryId));
    p++;
  }
  if (o.status && o.status !== 'all') {
    where.push('e.status = $' + p);
    params.push(String(o.status));
    p++;
  }
  if (o.q) {
    /* 搜索范围：标题 / 结论 / 正文 / 标签名 ——
       管理端输入框的提示写的是「搜标题、结论或标签」，那标签就必须真能搜到。 */
    where.push('(LOWER(e.title) LIKE $' + p + ' OR LOWER(e.summary) LIKE $' + p +
      ' OR LOWER(e.body) LIKE $' + p +
      ' OR e.id IN (SELECT et.experience_id FROM experience_tags et JOIN tags t ON t.id = et.tag_id' +
      ' WHERE LOWER(t.name) LIKE $' + p + '))');
    params.push('%' + String(o.q).toLowerCase() + '%');
    p++;
  }

  const sql =
    'SELECT ' + EXP_COLUMNS + ' FROM experiences e JOIN categories c ON c.id = e.category_id ' +
    'WHERE ' + where.join(' AND ') +
    ' ORDER BY e.updated_at DESC, e.id DESC LIMIT ' + size + ' OFFSET ' + offset;

  const rows = await db.query(sql, params);
  const totalRow = await db.queryOne('SELECT count(*) AS n FROM experiences e WHERE ' + where.join(' AND '), params);
  const items = toCamelList(rows.rows, { numeric: true });
  const ids = items.map(function (item) { return item.id; });
  const nameMap = await tagNamesFor(ids);
  const tagMap = await tagIdsFor(ids);
  const relationMap = await relationCountsFor(ids);
  for (const item of items) {
    item.tagNames = nameMap[String(item.id)] || [];
    item.tagIds = tagMap[String(item.id)] || [];
    item.keywords = item.searchKeywords || [];
    item.pointCount = relationMap[String(item.id)].points;
    item.sourceCount = relationMap[String(item.id)].sources;
  }
  return { items: items, page: page, size: size, total: Number(totalRow ? totalRow.n : 0) };
}

/**
 * 单条经验（含要点与依据）
 * @param {number} id
 * @param {object} opts { publishedOnly: true 时只取已发布的 }
 */
async function getByIds (ids, opts) {
  const list = (ids || []).map(Number).filter(function (id) { return id > 0; });
  if (!list.length) return [];
  const params = list.slice();
  let where = 'e.id IN (' + list.map(function (_, i) { return '$' + (i + 1); }).join(',') + ')';
  if (opts && opts.publishedOnly) where += " AND e.status = 'published'";
  const rows = await db.query(
    'SELECT ' + EXP_COLUMNS + ' FROM experiences e JOIN categories c ON c.id = e.category_id WHERE ' + where,
    params
  );
  const items = toCamelList(rows.rows, { numeric: true });
  const pointMap = await listPointsByExperience(list);
  const sourceMap = await listSourcesByExperience(list);
  const nameMap = await tagNamesFor(list);
  const tagMap = await tagIdsFor(list);
  for (const exp of items) {
    const key = String(exp.id);
    exp.tagNames = nameMap[key] || [];
    exp.points = pointMap[key] || [];
    exp.sources = sourceMap[key] || [];
    exp.tagIds = tagMap[key] || [];
    exp.keywords = exp.searchKeywords || [];
  }
  return items;
}

async function getById (id, opts) {
  const list = await getByIds([id], opts);
  return list.length ? list[0] : null;
}

/**
 * 批量取多条经验的要点
 * 列表页要显示「N 推荐 · M 避雷」（§2.3），一次查完，别一条一条查。
 * @returns {Object} { '<experienceId>': [point, ...] }
 */
async function listPointsByExperience (ids) {
  const list = (ids || []).map(Number).filter(function (n) { return n > 0; });
  const out = {};
  if (!list.length) return out;
  const res = await db.query(
    'SELECT id, experience_id, stance, title, detail, applies_to, sort_order FROM points ' +
    'WHERE experience_id IN (' + list.join(',') + ') ORDER BY experience_id, sort_order, id'
  );
  for (const row of res.rows) {
    const p = toCamel(row, { numeric: true });
    const key = String(p.experienceId);
    if (!out[key]) out[key] = [];
    out[key].push(p);
  }
  return out;
}

/** 要点列表 */
async function listPoints (experienceId) {
  const res = await db.query(
    'SELECT id, experience_id, stance, title, detail, applies_to, sort_order ' +
    'FROM points WHERE experience_id = $1 ORDER BY sort_order, id',
    [Number(experienceId)]
  );
  return toCamelList(res.rows, { numeric: true });
}

async function listSourcesByExperience (ids) {
  const list = (ids || []).map(Number).filter(function (id) { return id > 0; });
  const out = {};
  if (!list.length) return out;
  const res = await db.query(
    'SELECT id, experience_id, title, url, source_type, platform, author, published_at, note, ' +
    'point_ids, sort_order FROM sources WHERE experience_id IN (' + list.join(',') +
    ') ORDER BY experience_id, sort_order, id'
  );
  for (const row of toCamelList(res.rows, { numeric: true })) {
    const key = String(row.experienceId);
    if (!out[key]) out[key] = [];
    out[key].push(row);
  }
  return out;
}

/** 依据列表 */
async function listSources (experienceId) {
  const res = await db.query(
    'SELECT id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order ' +
    'FROM sources WHERE experience_id = $1 ORDER BY sort_order, id',
    [Number(experienceId)]
  );
  return toCamelList(res.rows, { numeric: true });
}

/** 依据挂了哪些要点（pg-mem 不支持 ANY 数组列，改在 JS 里判） */
function sourceCoversPoint (source, pointId) {
  const ids = source.pointIds || [];
  for (const id of ids) {
    if (String(id) === String(pointId)) return true;
  }
  return false;
}

/**
 * 写一条经验（新建或更新）
 * 要点、依据、标签关联一起落库 —— 半截数据（只有标题没有要点）不允许存在。
 */
async function save (exp, client) {
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const isNew = !exp.id;
  let id = Number(exp.id) || 0;

  /* slug 上有唯一约束（§6.2）。
     新建时生成一个唯一值 —— 早先固定写成 'exp-new'，
     结果第二条新经验就撞唯一键直接 500；
     更新时保持原来的 slug 不变，不能每次改内容都换 slug。 */
  let slug = String(exp.slug || '').trim();
  if (!slug) {
    slug = isNew
      ? ('exp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6))
      : ('exp-' + id);
  }
  const categoryId = Number(exp.categoryId) || 1;
  const keywords = Array.isArray(exp.searchKeywords) ? exp.searchKeywords : [];
  const status = exp.status || 'draft';
  const confidence = exp.confidence || 'normal';
  /* 没填核查日期时默认是「今天」—— 按北京时间的今天算，不按 UTC */
  const reviewedAt = exp.reviewedAt || toDateOnly(new Date());
  const nextReviewAt = exp.nextReviewAt === undefined ? null : exp.nextReviewAt;

  if (isNew) {
    const ins = await db.buildInsert({
      table: 'experiences',
      columns: ['slug', 'title', 'summary', 'body', 'category_id', 'search_keywords',
        'cover_url', 'status', 'confidence', 'reviewed_at', 'next_review_at'],
      values: [
        slug,
        exp.title || '',
        exp.summary || '',
        exp.body || '',
        categoryId,
        db.arrayLiteral(keywords),
        exp.coverUrl || null,
        status,
        confidence,
        reviewedAt,
        nextReviewAt
      ],
      casts: ['', '', '', '', '', '::text[]', '', '', '', '', ''],
      client: client
    });
    const res = await q(ins.sql + ' RETURNING id', ins.params);
    id = Number(res.rows[0].id);
  } else {
    await q(
      'UPDATE experiences SET slug = $2, title = $3, summary = $4, body = $5, category_id = $6, ' +
      'search_keywords = $7::text[], cover_url = $8, status = $9, confidence = $10, ' +
      'reviewed_at = $11, next_review_at = $12, updated_at = NOW() WHERE id = $1',
      [
        id,
        slug,
        exp.title || '',
        exp.summary || '',
        exp.body || '',
        categoryId,
        db.arrayLiteral(keywords),
        exp.coverUrl || null,
        status,
        confidence,
        reviewedAt,
        nextReviewAt
      ]
    );
  }

  /* 要点：整份替换 —— 编辑器提交的是完整列表 */
  await q('DELETE FROM points WHERE experience_id = $1', [id]);
  const points = exp.points || [];
  const pointIdMap = {};
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const ins = await db.buildInsert({
      table: 'points',
      columns: ['experience_id', 'stance', 'title', 'detail', 'applies_to', 'sort_order'],
      values: [id, p.stance || 'neutral', p.title || '', p.detail || '', p.appliesTo || '', i],
      client: client
    });
    const res = await q(ins.sql + ' RETURNING id', ins.params);
    const newId = Number(res.rows[0].id);
    /* 客户端可能自带 id（编辑已有要点），要记住「旧 id → 新 id」的对应关系，
       这样依据上的 pointIds 才能对上。 */
    if (p.id !== undefined && p.id !== null) pointIdMap[String(p.id)] = newId;
    pointIdMap[String(newId)] = newId;
  }

  /* 依据：整份替换 */
  await q('DELETE FROM sources WHERE experience_id = $1', [id]);
  const sources = exp.sources || [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const raw = Array.isArray(s.pointIds) ? s.pointIds : [];
    const mapped = [];
    /* ⚠️ 悬空的 pointId 之前是静默丢弃的 ——
       依据引用一个不存在的要点，落库后 point_ids 变成空数组，
       而发布护栏只校验入参，看不到映射结果，所以照样能发布。
       这里记下来，由服务层在映射之后拒绝发布。 */
    let dangling = 0;
    for (const pid of raw) {
      const key = String(pid);
      if (pointIdMap[key] !== undefined) mapped.push(pointIdMap[key]);
      else dangling++;
    }
    if (dangling > 0) {
      const e = new Error('存在未关联要点的依据，请先为其指定所支撑的要点。');
      e.code = 'VALIDATION';
      throw e;
    }
    const ins = await db.buildInsert({
      table: 'sources',
      columns: ['experience_id', 'title', 'url', 'source_type', 'platform', 'author',
        'published_at', 'note', 'point_ids', 'sort_order'],
      values: [
        id,
        s.title || '',
        s.url || '',
        s.sourceType || 'article',
        s.platform || '',
        s.author || '',
        s.publishedAt || null,
        s.note || '',
        db.arrayLiteral(mapped),
        i
      ],
      casts: ['', '', '', '', '', '', '', '', '::bigint[]', ''],
      client: client
    });
    await q(ins.sql, ins.params);
  }

  /* 标签关联 */
  await q('DELETE FROM experience_tags WHERE experience_id = $1', [id]);
  const tagIds = Array.isArray(exp.tagIds) ? exp.tagIds : [];
  for (const tagId of tagIds) {
    await q(
      'INSERT INTO experience_tags (experience_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, Number(tagId)]
    );
  }

  return id;
}

/** 改状态（发布 / 下线） */
async function setStatus (id, status) {
  const res = await db.query(
    'UPDATE experiences SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, status',
    [Number(id), String(status)]
  );
  return res.rows[0] ? toCamel(res.rows[0], { numeric: true }) : null;
}

/**
 * 相关经验：同领域优先，标签重叠兜底（§14 D9）
 */
async function listRelated (id, limit) {
  const max = db.limit(limit, 3);
  const exp = await getById(id);
  if (!exp) return [];
  const same = await db.query(
    'SELECT e.id, e.title, e.summary, e.category_id, e.updated_at, c.name AS category_name ' +
    'FROM experiences e JOIN categories c ON c.id = e.category_id ' +
    "WHERE e.status = 'published' AND e.category_id = $1 AND e.id <> $2 " +
    'ORDER BY e.updated_at DESC LIMIT ' + max,
    [exp.categoryId, exp.id]
  );
  const items = toCamelList(same.rows, { numeric: true });
  if (items.length >= max) return items.slice(0, max);

  const overlap = await db.query(
    'SELECT e.id, e.title, e.summary, e.category_id, e.updated_at, c.name AS category_name ' +
    'FROM experiences e JOIN categories c ON c.id = e.category_id ' +
    "WHERE e.status = 'published' AND e.id <> $1 AND e.category_id <> $2 " +
    'AND e.id IN (SELECT experience_id FROM experience_tags WHERE tag_id IN ' +
    '(SELECT tag_id FROM experience_tags WHERE experience_id = $3)) ' +
    'ORDER BY e.updated_at DESC LIMIT ' + max,
    [exp.id, exp.categoryId, exp.id]
  );
  const more = toCamelList(overlap.rows, { numeric: true });
  return items.concat(more).slice(0, max);
}

/**
 * 浏览计数 +1
 *
 * ⚠️ 之前每次请求详情都 +1，没有去重 ——
 *    反复刷新同一页就能把浏览数刷上去。这个数字是内容热度的参考，
 *    刷出来的数字没有意义。
 *    现在按「同一条内容 + 同一 IP + 同一小时」去重：
 *    重复刷新不再增加，跨小时再来看才算新的一次浏览。
 */
const VIEW_DEDUP = new Map();

async function incrView (id, ip) {
  const key = String(id) + '|' + String(ip || '');
  const hour = Math.floor(Date.now() / 3600000);
  const last = VIEW_DEDUP.get(key);
  if (last === hour) return;
  VIEW_DEDUP.set(key, hour);
  /* 桶别无限涨 —— 顺手清掉两小时前的 */
  if (VIEW_DEDUP.size > 5000) {
    for (const [k, h] of VIEW_DEDUP) {
      if (hour - h > 1) VIEW_DEDUP.delete(k);
    }
  }
  await db.query('UPDATE experiences SET view_count = view_count + 1 WHERE id = $1', [Number(id)]);
}

module.exports = {
  tagNamesFor: tagNamesFor,
  listTagIds: listTagIds,
  tagIdsFor: tagIdsFor,
  stanceCountsFor: stanceCountsFor,
  listPublished: listPublished,
  listForAdmin: listForAdmin,
  getById: getById,
  getByIds: getByIds,
  listPoints: listPoints,
  listPointsByExperience: listPointsByExperience,
  listSources: listSources,
  listSourcesByExperience: listSourcesByExperience,
  sourceCoversPoint: sourceCoversPoint,
  save: save,
  setStatus: setStatus,
  listRelated: listRelated,
  incrView: incrView
};
