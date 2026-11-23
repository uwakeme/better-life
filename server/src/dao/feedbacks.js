/**
 * 反馈 DAO
 *
 * 职责：反馈的写入、查询与处理。
 * 关键约定：
 *   1. 反馈内容仅管理员可见 —— 读者侧接口只按 openid 查自己的。
 *   2. 处理反馈一次提交落 status + reply（§4.3），不拆成两个写动作。
 *   3. media_status 是这条反馈所有图的汇总结论（§9.4）。
 */
const db = require('../db');
const { toCamel, toCamelList } = require('../lib/to-camel');

const KINDS = ['correction', 'supplement', 'question', 'suggestion'];
const STATUSES = ['pending', 'accepted', 'ignored', 'replied'];

/** 写一条反馈 */
async function insert (fb) {
  const images = Array.isArray(fb.images) ? fb.images : [];
  const hasImages = images.length > 0;
  const ins = await db.buildInsert({
    table: 'feedbacks',
    columns: ['target_type', 'target_id', 'openid', 'kind', 'content', 'images', 'media_status'],
    values: [
      fb.targetType === 'experience' ? 'experience' : 'project',
      fb.targetType === 'experience' ? Number(fb.targetId) : null,
      String(fb.openid),
      String(fb.kind),
      String(fb.content || ''),
      JSON.stringify(images),
      hasImages ? 'checking' : 'none'
    ],
    casts: ['', '', '', '', '', '::jsonb', '']
  });
  const res = await db.query(
    ins.sql +
    ' RETURNING id, target_type, target_id, openid, kind, content, images, media_status, ' +
    'status, reply, replied_at, created_at',
    ins.params
  );
  return toCamel(res.rows[0], { numeric: true });
}

/** 一条反馈 */
async function getById (id) {
  const row = await db.queryOne(
    'SELECT id, target_type, target_id, openid, kind, content, images, media_status, ' +
    'media_trace_id, media_checked_at, status, reply, replied_at, created_at ' +
    'FROM feedbacks WHERE id = $1',
    [Number(id)]
  );
  return row ? toCamel(row, { numeric: true }) : null;
}

/** 我提交过的反馈 */
async function listMine (openid) {
  const res = await db.query(
    'SELECT id, target_type, target_id, openid, kind, content, images, media_status, ' +
    'status, reply, replied_at, created_at FROM feedbacks WHERE openid = $1 ORDER BY created_at DESC, id DESC',
    [String(openid)]
  );
  return toCamelList(res.rows, { numeric: true });
}

/** 管理端列表：可按状态、类型与关键词筛 */
async function listForAdmin (opts) {
  const o = opts || {};
  const size = db.limit(o.size, 100);
  const where = ['1 = 1'];
  const params = [];
  let p = 1;
  if (o.status && o.status !== 'all') {
    where.push('f.status = $' + p);
    params.push(String(o.status));
    p++;
  }
  if (o.targetType && o.targetType !== 'all') {
    where.push('f.target_type = $' + p);
    params.push(String(o.targetType));
    p++;
  }
  if (o.q) {
    where.push('LOWER(f.content) LIKE $' + p);
    params.push('%' + String(o.q).toLowerCase() + '%');
    p++;
  }
  const sql =
    'SELECT f.id, f.target_type, f.target_id, f.openid, f.kind, f.content, f.images, f.media_status, ' +
    'f.status, f.reply, f.replied_at, f.created_at ' +
    'FROM feedbacks f WHERE ' + where.join(' AND ') +
    ' ORDER BY f.created_at DESC, f.id DESC LIMIT ' + size;
  const res = await db.query(sql, params);
  return toCamelList(res.rows, { numeric: true });
}

/**
 * 处理反馈：一次提交落 status + reply
 * 护栏在这里 —— 选了「只回话」却没写回复，一律拒绝（§4.3）。
 * 这道护栏在数据层而不是只在界面 handler 里，换个入口也绕不过去。
 */
async function resolve (id, payload) {
  const status = String(payload.status || '');
  const reply = String(payload.reply || '');
  if (STATUSES.indexOf(status) < 0) {
    const e = new Error('先选一个怎么处理这条');
    e.code = 'VALIDATION';
    throw e;
  }
  if (status === 'replied' && !reply.trim()) {
    const e = new Error('选了「只回话」，那就写点什么吧');
    e.code = 'VALIDATION';
    throw e;
  }
  const res = await db.query(
    'UPDATE feedbacks SET status = $2, reply = $3, replied_at = NOW() WHERE id = $1 ' +
    'RETURNING id, status, reply, replied_at',
    [Number(id), status, reply]
  );
  if (!res.rows[0]) return null;
  /* 条目级反馈处理完，经验上的反馈计数 +1 */
  const fb = await getById(id);
  if (fb && fb.targetType === 'experience' && fb.targetId) {
    await db.query(
      'UPDATE experiences SET feedback_count = feedback_count + 1 WHERE id = $1',
      [Number(fb.targetId)]
    );
  }
  return toCamel(res.rows[0], { numeric: true });
}

/** 媒体审核回调：更新 media_status */
async function setMediaStatus (id, mediaStatus, traceId) {
  const res = await db.query(
    'UPDATE feedbacks SET media_status = $2, media_trace_id = COALESCE($3, media_trace_id), ' +
    'media_checked_at = NOW() WHERE id = $1 RETURNING id, media_status, media_trace_id',
    [Number(id), String(mediaStatus), traceId || null]
  );
  return res.rows[0] ? toCamel(res.rows[0], { numeric: true }) : null;
}

/** 按 trace_id 找反馈（超时兜底查询用） */
async function findByTraceId (traceId) {
  const row = await db.queryOne(
    'SELECT id FROM feedbacks WHERE media_trace_id = $1',
    [String(traceId)]
  );
  return row ? toCamel(row, { numeric: true }) : null;
}

/** 今天的反馈数（限流用；一天 5 条） */
async function countSince (openid, sinceIso) {
  const row = await db.queryOne(
    'SELECT count(*) AS n FROM feedbacks WHERE openid = $1 AND created_at >= $2',
    [String(openid), String(sinceIso)]
  );
  return Number(row ? row.n : 0);
}

module.exports = {
  KINDS: KINDS,
  STATUSES: STATUSES,
  insert: insert,
  getById: getById,
  listMine: listMine,
  listForAdmin: listForAdmin,
  resolve: resolve,
  setMediaStatus: setMediaStatus,
  findByTraceId: findByTraceId,
  countSince: countSince
};
