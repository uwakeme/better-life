import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = String.fromCharCode(39);

function readJson (name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
}

/** SQL 字面量：单引号转义成两个 */
function lit (v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return Q + String(v).split(Q).join(Q + Q) + Q;
}

function litArr (arr) {
  const list = Array.isArray(arr) ? arr : [];
  return 'ARRAY[' + list.map(lit).join(', ') + ']::bigint[]';
}

function litTextArr (arr) {
  const list = Array.isArray(arr) ? arr : [];
  return 'ARRAY[' + list.map(lit).join(', ') + ']::text[]';
}

function litJson (v) {
  return lit(JSON.stringify(Array.isArray(v) ? v : [])) + '::jsonb';
}

function arg (name) {
  const hit = process.argv.find((a) => a.indexOf('--' + name + '=') === 0);
  return hit ? hit.slice(('--' + name + '=').length) : '';
}

const categories = readJson('categories.json');
const experiences = readJson('experiences.json');
const feedbacks = readJson('feedbacks.json');

const out = [];
const push = (s) => out.push(s);

push('-- 种子数据（由 scripts/gen-seed-sql.mjs 生成，请勿手改）');
push('-- 来源：data/categories.json、data/experiences.json、data/feedbacks.json');
push('-- 生成时间：' + new Date().toISOString());
push('BEGIN;');
push('');
push('-- 领域');
for (const c of categories.categories) {
  push('INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (' +
    [c.id, lit(c.slug), lit(c.name), lit(c.icon || null), lit(c.desc || ''), c.id].join(', ') + ');');
}
push('');
push('-- 标签');
for (const t of categories.tags) {
  push('INSERT INTO tags (id, category_id, slug, name) VALUES (' +
    [t.id, t.categoryId, lit('tag-' + t.id), lit(t.name)].join(', ') + ');');
}
push('');
push('-- 经验');
for (const e of experiences) {
  const cols = [
    e.id, lit(e.slug), lit(e.title), lit(e.summary), lit(e.body || ''), e.categoryId,
    litTextArr(e.keywords || []), lit(e.coverUrl || null), lit(e.status || 'draft'),
    lit(e.confidence || 'normal'), lit(e.reviewedAt || e.updatedAt), lit(e.nextReviewAt || null),
    e.viewCount || 0, e.favoriteCount || 0, e.usefulCount || 0, e.notUsefulCount || 0,
    e.feedbackCount || 0, lit(e.updatedAt || '2026-01-01'), lit(e.updatedAt || '2026-01-01')
  ];
  push('INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, ' +
    'cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, ' +
    'useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (' +
    cols.join(', ') + ');');

  for (let i = 0; i < (e.points || []).length; i++) {
    const p = e.points[i];
    push('INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (' +
      [p.id, e.id, lit(p.stance || 'neutral'), lit(p.title || ''), lit(p.detail || ''),
        lit(p.appliesTo || ''), i].join(', ') + ');');
  }

  for (let i = 0; i < (e.sources || []).length; i++) {
    const s = e.sources[i];
    push('INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, ' +
      'published_at, note, point_ids, sort_order) VALUES (' +
      [s.id, e.id, lit(s.title || ''), lit(s.url || ''), lit(s.sourceType || 'article'),
        lit(s.platform || ''), lit(s.author || ''), lit(s.publishedAt || null), lit(s.note || ''),
        litArr(s.pointIds || []), i].join(', ') + ');');
  }

  for (const tagId of e.tagIds || []) {
    push('INSERT INTO experience_tags (experience_id, tag_id) VALUES (' +
      e.id + ', ' + tagId + ') ON CONFLICT DO NOTHING;');
  }
  push('');
}
push('-- 反馈');
for (const f of feedbacks) {
  push('INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, ' +
    'status, reply, replied_at, created_at) VALUES (' +
    [f.id, lit(f.targetType || 'project'),
      f.targetId === null || f.targetId === undefined ? 'NULL' : Number(f.targetId),
      lit(f.openid || 'dev-user'), lit(f.kind || 'suggestion'), lit(f.content || ''),
      litJson(f.images || []), lit(f.mediaStatus || 'none'), lit(f.status || 'pending'),
      lit(f.reply || ''), lit(f.repliedAt || null), lit(f.createdAt || '2026-11-01')]
      .join(', ') + ');');
}
push('');
push('-- 演示账号');
push('INSERT INTO users (openid, nickname, role) VALUES (' + Q + 'dev-user' + Q + ', ' + Q + '读者' + Q + ', ' + Q + 'user' + Q + ') ON CONFLICT (openid) DO NOTHING;');
push('INSERT INTO users (openid, nickname, role) VALUES (' + Q + 'dev-admin' + Q + ', ' + Q + '维护者' + Q + ', ' + Q + 'admin' + Q + ') ON CONFLICT (openid) DO NOTHING;');
push('');
push('-- 序列推到显式 id 之后，否则后续插入会撞主键');
for (const t of ['categories', 'tags', 'experiences', 'points', 'sources', 'feedbacks']) {
  push('SELECT setval(pg_get_serial_sequence(' + Q + t + Q + ', ' + Q + 'id' + Q + '), ' +
    'COALESCE((SELECT MAX(id) FROM ' + t + '), 1));');
}
push('');
push('COMMIT;');
push('');

const sql = out.join('\n');

if (process.argv.indexOf('--stdout') >= 0) {
  process.stdout.write(sql);
} else {
  const target = arg('out') || path.join(ROOT, 'server', 'sql', 'seed.sql');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, sql, 'utf8');
  console.log('已生成 ' + path.relative(ROOT, target) + '（' + sql.length + ' 字符）');
}