/**
 * 把原型演示数据迁到 data/*.json（一次性导入工具）
 *
 * 职责：design/assets/data.js 里那 32 条经验的内容与要点是写好的，
 * 这里把它们转成新的 JSON 结构，作为种子内容的起点。
 * 来源链接在这一步仍是示意占位 —— 真实来源由后续调研补齐（scripts/verify-links.js 盯着）。
 *
 * 用法：node scripts/import-prototype-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = (...s) => path.join(ROOT, ...s);

/* 载入原型数据（页面渲染函数是纯字符串，载入 data.js 足够） */
const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(abs('design/assets/data.js'), 'utf8'), sandbox, { filename: 'data.js' });

const LB = sandbox.LB;

/* ---------- categories.json ---------- */
const categories = {
  categories: LB.categories.map(c => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    desc: c.desc || ''
  })),
  tags: LB.tags.map(t => ({
    id: t.id,
    categoryId: t.cat,
    name: t.name
  }))
};

/* ---------- experiences.json ---------- */
const experiences = LB.experiences.map(e => ({
  id: e.id,
  slug: e.slug || ('exp-' + e.id),
  categoryId: e.cat,
  categoryName: LB.catById(e.cat) ? LB.catById(e.cat).name : '',
  title: e.title,
  summary: e.summary,
  body: e.body || '',
  keywords: e.keywords || [],
  status: e.status || 'published',
  confidence: e.conf || 'normal',
  reviewedAt: e.reviewed || '',
  nextReviewAt: e.nextReview || null,
  viewCount: e.views || 0,
  favoriteCount: e.favs || 0,
  usefulCount: e.useful || 0,
  notUsefulCount: e.notUseful || 0,
  updatedAt: e.updatedAt || '',
  tagNames: e.tags || [],
  tagIds: e.tagIds || [],
  points: (e.points || []).map(p => ({
    id: p.id,
    stance: p.s,
    title: p.t,
    detail: p.d || '',
    appliesTo: p.a || ''
  })),
  sources: (e.sources || []).map(s => ({
    id: s.id,
    title: s.t,
    url: s.url,
    sourceType: s.type || 'article',
    platform: s.platform || '',
    author: s.author || '',
    publishedAt: s.date || null,
    note: s.note || '',
    pointIds: s.pointIds || []
  }))
}));

/* ---------- feedbacks.json ---------- */
const PLACEHOLDERS = ['photo-1.png', 'photo-2.png', 'photo-3.png', 'photo-4.png'];
const feedbacks = LB.feedbacks.map(f => ({
  id: f.id,
  targetType: f.targetType,
  targetId: f.targetId == null ? null : f.targetId,
  kind: f.kind,
  content: f.content,
  status: f.status,
  reply: f.reply || '',
  repliedAt: f.repliedAt || null,
  createdAt: f.createdAt,
  author: f.author || '匿名用户',
  openid: f.openid || '',
  mediaStatus: f.mediaStatus || 'none',
  images: (f.images || []).map((im, i) => ({
    mediaId: 'demo-' + im.id,
    url: '/assets/placeholder/' + PLACEHOLDERS[(im.id - 101) % PLACEHOLDERS.length],
    name: im.name || ''
  }))
}));

/* 写出 */
fs.mkdirSync(abs('data'), { recursive: true });
fs.writeFileSync(abs('data/categories.json'), JSON.stringify(categories, null, 2) + '\n', 'utf8');
fs.writeFileSync(abs('data/experiences.json'), JSON.stringify(experiences, null, 2) + '\n', 'utf8');
fs.writeFileSync(abs('data/feedbacks.json'), JSON.stringify(feedbacks, null, 2) + '\n', 'utf8');

console.log('categories.json：' + categories.categories.length + ' 个领域 / ' + categories.tags.length + ' 个标签');
console.log('experiences.json：' + experiences.length + ' 条经验');
console.log('feedbacks.json：' + feedbacks.length + ' 条反馈');
