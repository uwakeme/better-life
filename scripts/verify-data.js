/**
 * 数据层自检（设计文档 §6.3 的十三条完整性断言）
 *
 * 职责：在内存库上把种子数据灌一遍，逐条核对完整性约束。
 * 为什么每条都失败即 exit 1：这些约束一旦破了，读者看到的就是
 * 「依据指向不存在的要点」「计数对不上」这种脏数据 —— 事后没人查得出来。
 *
 * 用法：node scripts/verify-data.js [--skip-index]
 */
const path = require('path');
const { group, check, eq, report } = require('./_kit');

const db = require('../server/src/db');
const config = require('../server/src/config');
const expService = require('../server/src/services/experiences');
const { seed } = require('../server/scripts/seed');

const STANCES = ['good', 'bad', 'neutral'];
const KINDS = ['correction', 'supplement', 'question', 'suggestion'];
const STATUSES = ['pending', 'accepted', 'ignored', 'replied'];
const MEDIA = ['none', 'checking', 'passed', 'rejected'];

function hasFlag (name) {
  return process.argv.indexOf('--' + name) >= 0;
}

async function main () {
  const skipIndex = hasFlag('skip-index');
  await db.init({ memory: true });
  await db.tx(async function (client) { return seed(client); });

  /* ---------- 1 ---------- */
  group('断言 1 · 已发布经验的完整性');
  const published = await db.query(
    "SELECT e.id, e.title, e.reviewed_at, e.category_id FROM experiences e WHERE e.status = 'published'"
  );
  const catRows = await db.query('SELECT id, parent_id FROM categories');
  const topCats = catRows.rows.filter((c) => c.parent_id === null || c.parent_id === undefined).map((c) => Number(c.id));
  const bad1 = [];
  for (const e of published.rows) {
    const pts = await db.query('SELECT id FROM points WHERE experience_id = $1', [Number(e.id)]);
    const src = await db.query('SELECT id FROM sources WHERE experience_id = $1', [Number(e.id)]);
    if (!pts.rows.length) bad1.push(e.id + ' 没有要点');
    if (!src.rows.length) bad1.push(e.id + ' 没有依据');
    if (!e.reviewed_at) bad1.push(e.id + ' reviewed_at 为空');
    if (topCats.indexOf(Number(e.category_id)) < 0) bad1.push(e.id + ' 的 category_id 不是一级领域');
  }
  check('已发布经验：≥1 要点、≥1 依据、reviewed_at 非空、归属一级领域', bad1.length === 0, bad1.slice(0, 8).join('；'));
  check('已发布经验不为空', published.rows.length > 0, '实际 ' + published.rows.length);

  /* ---------- 2 ---------- */
  group('断言 2 · 要点');
  const points = await db.query('SELECT id, experience_id, title, stance FROM points');
  const bad2 = points.rows.filter((p) =>
    !String(p.title || '').trim() || STANCES.indexOf(String(p.stance)) < 0
  ).map((p) => p.id + '（' + p.title + ' / ' + p.stance + '）');
  check('要点有标题且立场合法', bad2.length === 0, bad2.slice(0, 8).join('；'));

  /* ---------- 3 & 8 ---------- */
  group('断言 3 · 依据');
  const sources = await db.query('SELECT id, experience_id, title, url, point_ids FROM sources');
  const bad3 = [];
  const bad8 = [];
  for (const s of sources.rows) {
    if (!/^https?:\/\//.test(String(s.url || ''))) bad3.push(s.id + ' 的 url 不是 http(s)');
    if (!String(s.title || '').trim()) bad3.push(s.id + ' 没有标题');
    const ids = Array.isArray(s.point_ids) ? s.point_ids.map(String) : [];
    if (!ids.length) bad3.push(s.id + ' 没有关联要点');
    const own = await db.query('SELECT id FROM points WHERE experience_id = $1', [Number(s.experience_id)]);
    const ownIds = own.rows.map((p) => String(p.id));
    for (const pid of ids) {
      if (ownIds.indexOf(pid) < 0) {
        bad8.push('依据 ' + s.id + ' 指向了本经验下不存在的要点 ' + pid);
      }
    }
  }
  check('依据有合法链接、标题与关联要点', bad3.length === 0, bad3.slice(0, 8).join('；'));
  check('依据的 point_ids 都指向本经验下真实存在的要点', bad8.length === 0, bad8.slice(0, 8).join('；'));

  /* ---------- 4 ---------- */
  group('断言 4 · 搜索索引');
  if (skipIndex) {
    check('索引检查已跳过（--skip-index）', true);
  } else {
    const out = await expService.reindexAll();
    check('索引重建成功', out.documents > 0, '文档数 ' + out.documents);
    check('索引重建没有失败项', out.failed === 0, '失败 ' + out.failed);
    const missing = [];
    for (const e of published.rows) {
      const idx = await db.query(
        "SELECT model FROM search_documents WHERE doc_type = 'experience' AND ref_id = $1",
        [Number(e.id)]
      );
      if (!idx.rows.length) { missing.push(e.id + ' 没有索引'); continue; }
      if (String(idx.rows[0].model) !== String(config.embedding.model)) {
        missing.push(e.id + ' 的索引模型与当前配置不一致');
      }
    }
    check('已发布经验都有索引且模型一致', missing.length === 0, missing.slice(0, 8).join('；'));
    const publishedIds = new Set(published.rows.map(function (e) { return String(e.id); }));
    const pointDocs = await db.query("SELECT ref_id FROM search_documents WHERE doc_type = 'point'");
    const indexedPointIds = new Set(pointDocs.rows.map(function (p) { return String(p.ref_id); }));
    const missingPoints = points.rows.filter(function (p) {
      return publishedIds.has(String(p.experience_id)) && !indexedPointIds.has(String(p.id));
    }).map(function (p) { return p.id; });
    const orphanPoints = points.rows.filter(function (p) {
      return !publishedIds.has(String(p.experience_id)) && indexedPointIds.has(String(p.id));
    }).map(function (p) { return p.id; });
    check('已发布经验的每个要点都有索引', missingPoints.length === 0, missingPoints.join(', '));
    check('未发布经验的要点没有残留索引', orphanPoints.length === 0, orphanPoints.join(', '));
  }

  /* ---------- 5 ---------- */
  group('断言 5 · 经验与标签的关联');
  const et = await db.query('SELECT experience_id, tag_id FROM experience_tags');
  const bad5 = [];
  for (const r of et.rows) {
    const e = await db.query('SELECT id FROM experiences WHERE id = $1', [Number(r.experience_id)]);
    const t = await db.query('SELECT id FROM tags WHERE id = $1', [Number(r.tag_id)]);
    if (!e.rows.length) bad5.push('关联指向不存在的经验 ' + r.experience_id);
    if (!t.rows.length) bad5.push('关联指向不存在的标签 ' + r.tag_id);
  }
  check('标签关联都指向存在的经验与标签', bad5.length === 0, bad5.slice(0, 8).join('；'));

  /* ---------- 6 ---------- */
  group('断言 6 · 一级领域数量');
  eq('一级领域恰好 9 个', topCats.length, 9);

  /* ---------- 7 ---------- */
  group('断言 7 · 标签归属');
  const tags = await db.query('SELECT id, category_id FROM tags');
  const bad7 = tags.rows.filter((t) =>
    t.category_id !== null && t.category_id !== undefined && topCats.indexOf(Number(t.category_id)) < 0
  ).map((t) => t.id + ' → ' + t.category_id);
  check('标签的 category_id 为空或指向存在的一级领域', bad7.length === 0, bad7.join('；'));

  /* ---------- 9 ---------- */
  group('断言 9 · 反馈的指向与类型');
  const fbs = await db.query('SELECT id, target_type, target_id, kind FROM feedbacks');
  const bad9 = [];
  for (const f of fbs.rows) {
    if (KINDS.indexOf(String(f.kind)) < 0) bad9.push(f.id + ' 的 kind 不合法');
    if (f.target_type === 'experience') {
      if (f.target_id === null || f.target_id === undefined) bad9.push(f.id + ' 条目级反馈没有 target_id');
      else {
        const e = await db.query('SELECT id FROM experiences WHERE id = $1', [Number(f.target_id)]);
        if (!e.rows.length) bad9.push(f.id + ' 指向不存在的经验 ' + f.target_id);
      }
    } else if (f.target_type === 'project') {
      if (f.target_id !== null && f.target_id !== undefined) bad9.push(f.id + ' 项目级反馈不该有 target_id');
    } else {
      bad9.push(f.id + ' 的 target_type 不合法');
    }
  }
  check('反馈的指向合法且类型在枚举内', bad9.length === 0, bad9.slice(0, 8).join('；'));

  /* ---------- 10 ---------- */
  group('断言 10 · 反馈状态与回复自洽');
  const fbs2 = await db.query('SELECT id, status, reply FROM feedbacks');
  const bad10 = fbs2.rows.filter((f) =>
    STATUSES.indexOf(String(f.status)) < 0 || (String(f.status) === 'replied' && !String(f.reply || '').trim())
  ).map((f) => f.id + '（' + f.status + '）');
  check('状态在枚举内，且「已回复」必定有回复', bad10.length === 0, bad10.join('；'));

  /* ---------- 11 ---------- */
  group('断言 11 · 反馈图片与审核状态自洽');
  const fbs3 = await db.query('SELECT id, images, media_status FROM feedbacks');
  const bad11 = [];
  for (const f of fbs3.rows) {
    const imgs = Array.isArray(f.images) ? f.images : [];
    const st = String(f.media_status);
    if (MEDIA.indexOf(st) < 0) bad11.push(f.id + ' 的 media_status 不合法：' + st);
    if (imgs.length && st === 'none') bad11.push(f.id + ' 有图但 media_status 是 none');
    if (!imgs.length && st !== 'none') bad11.push(f.id + ' 没图但 media_status 是 ' + st);
    if (imgs.length > 3) bad11.push(f.id + ' 图片超过 3 张');
  }
  check('有图必非 none、无图必为 none、不超过 3 张', bad11.length === 0, bad11.join('；'));

  /* ---------- 12 ---------- */
  group('断言 12 · 投票计数与源表一致');
  const exps = await db.query('SELECT id, useful_count, not_useful_count FROM experiences');
  const bad12 = [];
  for (const e of exps.rows) {
    const votes = await db.query('SELECT useful FROM votes WHERE experience_id = $1', [Number(e.id)]);
    let good = 0;
    let bad = 0;
    for (const v of votes.rows) {
      if (v.useful) good++;
      else bad++;
    }
    if (Number(e.useful_count) !== good) bad12.push(e.id + ' useful_count ' + e.useful_count + ' ≠ ' + good);
    if (Number(e.not_useful_count) !== bad) bad12.push(e.id + ' not_useful_count ' + e.not_useful_count + ' ≠ ' + bad);
  }
  check('两个投票计数都等于 votes 表实际行数', bad12.length === 0, bad12.join('；'));

  /* ---------- 收藏与反馈冗余计数 ---------- */
  group('收藏与反馈计数');
  const favorites = await db.query('SELECT experience_id FROM favorites');
  const processedFeedback = await db.query(
    "SELECT target_type, target_id FROM feedbacks WHERE status <> 'pending'"
  );
  const favoriteCounts = new Map();
  const feedbackCounts = new Map();
  for (const row of favorites.rows) {
    const id = String(row.experience_id);
    favoriteCounts.set(id, (favoriteCounts.get(id) || 0) + 1);
  }
  for (const row of processedFeedback.rows) {
    if (row.target_type !== 'experience') continue;
    const id = String(row.target_id);
    feedbackCounts.set(id, (feedbackCounts.get(id) || 0) + 1);
  }
  const storedCounts = await db.query('SELECT id, favorite_count, feedback_count FROM experiences');
  const badCounts = storedCounts.rows.filter(function (e) {
    return Number(e.favorite_count) !== (favoriteCounts.get(String(e.id)) || 0) ||
      Number(e.feedback_count) !== (feedbackCounts.get(String(e.id)) || 0);
  }).map(function (e) {
    return e.id + '（收藏 ' + e.favorite_count + '/' + (favoriteCounts.get(String(e.id)) || 0) +
      '，反馈 ' + e.feedback_count + '/' + (feedbackCounts.get(String(e.id)) || 0) + '）';
  });
  check('收藏计数等于 favorites 实际行数，反馈计数只统计已处理项', badCounts.length === 0, badCounts.join('；'));
  check('种子里的已处理经验反馈确实存在', processedFeedback.rows.some(function (f) {
    return f.target_type === 'experience';
  }));

  /* ---------- 13 ---------- */
  group('断言 13 · 同领域标签不重名');
  /* pg-mem 不支持 HAVING count(*) > 1 —— 先 GROUP BY 再在 JS 里判 */
  const grouped = await db.query('SELECT category_id, name, count(*) AS n FROM tags GROUP BY category_id, name');
  const dup = grouped.rows.filter((d) => Number(d.n) > 1);
  check('同一领域内没有同名标签', dup.length === 0,
    dup.map((d) => d.category_id + '/' + d.name).join('；'));
  const byName = await db.query('SELECT name, category_id FROM tags');
  const nameMap = {};
  for (const r of byName.rows) {
    const k = String(r.name);
    if (!nameMap[k]) nameMap[k] = [];
    nameMap[k].push(String(r.category_id));
  }
  const cross = Object.keys(nameMap).filter((k) => {
    const ids = nameMap[k].filter((v, i) => nameMap[k].indexOf(v) === i);
    return ids.length > 1;
  });
  check('同名标签跨领域是允许的（不是错误）', true, cross.length + ' 组同名跨领域，属正常');

  await db.close();
  const failed = report('数据完整性（§6.3 十三条）');
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error('数据自检崩了：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});