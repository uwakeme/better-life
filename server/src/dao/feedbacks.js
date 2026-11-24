const db = require('../db');
const { toCamel, toCamelList } = require('../lib/to-camel');

const KINDS = ['correction', 'supplement', 'question', 'suggestion'];
const STATUSES = ['pending', 'accepted', 'ignored', 'replied'];
const RESOLVE_STATUSES = ['accepted', 'ignored', 'replied'];
const COLUMNS =
  'id, target_type, target_id, openid, kind, content, images, media_status, ' +
  'media_trace_id, media_checked_at, status, reply, replied_at, created_at';

function imagesOf (row) {
  if (Array.isArray(row.images)) return row.images;
  if (typeof row.images === 'string') {
    try { return JSON.parse(row.images); } catch (e) { return []; }
  }
  return [];
}

async function insert (fb, client) {
  const images = Array.isArray(fb.images) ? fb.images : [];
  const ins = await db.buildInsert({
    table: 'feedbacks',
    columns: ['target_type', 'target_id', 'openid', 'kind', 'content', 'images', 'media_status'],
    values: [
      fb.targetType === 'experience' ? 'experience' : 'project',
      fb.targetType === 'experience' ? Number(fb.targetId) : null,
      String(fb.openid), String(fb.kind), String(fb.content || ''),
      JSON.stringify(images), images.length ? 'checking' : 'none'
    ],
    casts: ['', '', '', '', '', '::jsonb', ''],
    client: client
  });
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const res = await q(ins.sql + ' RETURNING ' + COLUMNS, ins.params);
  return toCamel(res.rows[0], { numeric: true });
}

/** 锁定用户行串行化同用户的日配额检查与插入，兼容多实例与 pg-mem。 */
async function insertWithQuota (fb, limit, sinceIso) {
  return db.tx(async function (client) {
    const locked = await client.query('SELECT openid FROM users WHERE openid = $1 FOR UPDATE', [String(fb.openid)]);
    if (!locked.rows.length) {
      throw Object.assign(new Error('请先登录'), { code: 'UNAUTHORIZED' });
    }
    const used = await countSince(fb.openid, sinceIso, client);
    if (used >= limit) {
      throw Object.assign(new Error('今天反馈条数已用完，请明天再试'), { code: 'RATE_LIMITED' });
    }
    return insert(fb, client);
  });
}

async function remove (id) {
  const res = await db.query('DELETE FROM feedbacks WHERE id = $1 RETURNING id', [Number(id)]);
  return res.rows.length > 0;
}

async function getById (id, client) {
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const row = await q('SELECT ' + COLUMNS + ' FROM feedbacks WHERE id = $1', [Number(id)]);
  return row ? toCamel(row.rows[0], { numeric: true }) : null;
}

async function getByIdForUpdate (id, client) {
  const res = await client.query('SELECT ' + COLUMNS + ' FROM feedbacks WHERE id = $1 FOR UPDATE', [Number(id)]);
  return res.rows[0] ? toCamel(res.rows[0], { numeric: true }) : null;
}

async function listMine (openid) {
  const res = await db.query(
    'SELECT ' + COLUMNS + ' FROM feedbacks WHERE openid = $1 ORDER BY created_at DESC, id DESC',
    [String(openid)]
  );
  return toCamelList(res.rows, { numeric: true });
}

async function countMine (openid) {
  const row = await db.queryOne('SELECT count(*) AS n FROM feedbacks WHERE openid = $1', [String(openid)]);
  return Number(row ? row.n : 0);
}

async function listForAdmin (opts) {
  const o = opts || {};
  const size = db.limit(o.size, 100);
  const where = ['1 = 1'];
  const params = [];
  if (o.status && o.status !== 'all') {
    params.push(String(o.status));
    where.push('f.status = $' + params.length);
  }
  if (o.targetType && o.targetType !== 'all') {
    params.push(String(o.targetType));
    where.push('f.target_type = $' + params.length);
  }
  if (o.q) {
    params.push('%' + String(o.q).toLowerCase() + '%');
    where.push('LOWER(f.content) LIKE $' + params.length);
  }
  const res = await db.query(
    'SELECT f.id, f.target_type, f.target_id, f.kind, f.content, f.images, f.media_status, ' +
    'f.status, f.reply, f.replied_at, f.created_at FROM feedbacks f WHERE ' + where.join(' AND ') +
    ' ORDER BY f.created_at DESC, f.id DESC LIMIT ' + size, params
  );
  return toCamelList(res.rows, { numeric: true });
}

/** 条件更新与首次计数同事务；重复或并发 PATCH 不会重复增加反馈数。 */
async function resolve (id, payload) {
  const status = String(payload.status || '');
  const hasReply = payload.reply !== undefined && payload.reply !== null;
  const reply = hasReply ? String(payload.reply) : '';
  if (RESOLVE_STATUSES.indexOf(status) < 0) {
    throw Object.assign(new Error('先选一个怎么处理这条'), { code: 'VALIDATION' });
  }
  return db.tx(async function (client) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const locked = await client.query('SELECT ' + COLUMNS + ' FROM feedbacks WHERE id = $1 FOR UPDATE', [Number(id)]);
      const before = locked.rows[0] ? toCamel(locked.rows[0], { numeric: true }) : null;
      if (!before) return null;
      const nextReply = hasReply ? reply : before.reply;
      if (status === 'replied' && !nextReply.trim()) {
        throw Object.assign(new Error('选了「只回话」，那就写点什么吧'), { code: 'VALIDATION' });
      }
      const updated = await client.query(
        'UPDATE feedbacks SET status = $2, reply = $3, replied_at = NOW() ' +
        'WHERE id = $1 AND status = $4 RETURNING id, status, reply, replied_at',
        [Number(id), status, nextReply, before.status]
      );
      if (!updated.rows.length) continue;
      if (before.status === 'pending' && before.targetType === 'experience' && before.targetId) {
        await client.query(
          'UPDATE experiences SET feedback_count = feedback_count + 1 WHERE id = $1',
          [Number(before.targetId)]
        );
      }
      return toCamel(updated.rows[0], { numeric: true });
    }
    throw new Error('反馈状态更新冲突，请重试');
  });
}

async function setMediaStatus (id, mediaStatus, traceId) {
  const res = await db.query(
    'UPDATE feedbacks SET media_status = $2, media_trace_id = COALESCE($3, media_trace_id), ' +
    "media_checked_at = NOW() WHERE id = $1 AND media_status NOT IN ('passed','rejected') " +
    'RETURNING id, media_status, media_trace_id',
    [Number(id), String(mediaStatus), traceId || null]
  );
  return res.rows[0] ? toCamel(res.rows[0], { numeric: true }) : null;
}

async function applyMediaVerdictInTx (client, id, traceId, verdict) {
  const before = await getByIdForUpdate(id, client);
  if (!before) return null;
  if (before.mediaStatus === 'passed' || before.mediaStatus === 'rejected') {
    return { id: before.id, mediaStatus: before.mediaStatus, mediaTraceId: before.mediaTraceId };
  }
  const images = imagesOf(before);
  let hit = false;
  for (const img of images) {
    if (String(img.traceId || '') !== String(traceId || '')) continue;
    hit = true;
    if (img.status === 'passed' || img.status === 'rejected') continue;
    if (verdict === 'passed' || verdict === 'rejected' || verdict === 'checking') img.status = verdict;
  }
  if (!hit) return { id: before.id, mediaStatus: before.mediaStatus, mediaTraceId: before.mediaTraceId };
  let overall = 'checking';
  if (images.some(function (img) { return img.status === 'rejected' || img.status === 'failed'; })) {
    overall = 'rejected';
  } else if (images.length && images.every(function (img) { return img.status === 'passed'; })) {
    overall = 'passed';
  }
  const res = await client.query(
    'UPDATE feedbacks SET images = $2::jsonb, media_status = $3, ' +
    'media_trace_id = COALESCE($4, media_trace_id), media_checked_at = NOW() ' +
    "WHERE id = $1 AND media_status NOT IN ('passed','rejected') " +
    'RETURNING id, media_status, media_trace_id',
    [Number(id), JSON.stringify(images), overall, traceId || null]
  );
  return res.rows[0] ? toCamel(res.rows[0], { numeric: true }) : null;
}

async function applyMediaVerdict (id, traceId, verdict, client) {
  if (client) return applyMediaVerdictInTx(client, id, traceId, verdict);
  return db.tx(async function (txClient) {
    return applyMediaVerdictInTx(txClient, id, traceId, verdict);
  });
}

async function updateImageReviewInTx (client, id, update) {
  const fb = await getByIdForUpdate(id, client);
  if (!fb) return null;
  if (fb.mediaStatus === 'passed' || fb.mediaStatus === 'rejected') return fb;
  const images = imagesOf(fb);
  update(images);
  const failed = images.some(function (img) { return img.status === 'rejected' || img.status === 'failed'; });
  const overall = failed ? 'rejected' :
    (images.length && images.every(function (img) { return img.status === 'passed'; }) ? 'passed' : 'checking');
  const res = await client.query(
    'UPDATE feedbacks SET images = $2::jsonb, media_status = $3, ' +
    'media_trace_id = COALESCE($4, media_trace_id), media_checked_at = NOW() WHERE id = $1 ' +
    "AND media_status NOT IN ('passed','rejected') RETURNING id, images, media_status, media_trace_id",
    [Number(id), JSON.stringify(images), overall,
      images.length && images[0].traceId ? images[0].traceId : null]
  );
  return res.rows[0] ? toCamel(res.rows[0], { numeric: true }) : fb;
}

/** 送审失败落为明确的 failed/rejected，不伪装成 checking 成功。 */
async function setImageReviewResults (id, results) {
  return db.tx(async function (client) {
    return updateImageReviewInTx(client, id, function (images) {
      const list = Array.isArray(results) ? results : [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        if (image.status === 'passed' || image.status === 'rejected') continue;
        const result = list[i] || { ok: false };
        image.status = result.ok ? 'checking' : 'failed';
        if (result.traceId) image.traceId = result.traceId;
      }
    });
  });
}

async function setImageReviewResult (id, index, result) {
  const updated = await db.tx(async function (client) {
    return updateImageReviewInTx(client, id, function (images) {
      const image = images[index];
      if (!image || image.status === 'passed' || image.status === 'rejected') return;
      image.status = result && result.ok ? (result.skipped ? 'passed' : 'checking') : 'failed';
      if (result && result.traceId) image.traceId = result.traceId;
    });
  });
  const traceId = result && result.traceId;
  if (traceId && await applyPendingCallback(traceId)) return getById(id);
  return updated;
}

/** LIKE 仅作候选过滤，再精确比对 JSON 内的 trace，避免通配符误命中。 */
async function findByTraceId (traceId, client) {
  const trace = String(traceId || '');
  if (!trace) return null;
  const escaped = trace.replace(/([\\%_])/g, '\\$1');
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const res = await q(
    "SELECT id, images, media_trace_id FROM feedbacks WHERE media_trace_id = $1 OR images::text LIKE $2",
    [trace, '%' + escaped + '%']
  );
  for (const row of res.rows) {
    if (String(row.media_trace_id || '') === trace) return toCamel(row, { numeric: true });
    if (imagesOf(row).some(function (img) { return String(img.traceId || '') === trace; })) {
      return toCamel(row, { numeric: true });
    }
  }
  return null;
}

async function countSince (openid, sinceIso, client) {
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const row = await q(
    'SELECT count(*) AS n FROM feedbacks WHERE openid = $1 AND created_at >= $2',
    [String(openid), String(sinceIso)]
  );
  return Number(row.rows[0].n);
}

async function consumeNonce (nonce, client) {
  const res = await client.query(
    'INSERT INTO seccheck_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING RETURNING nonce',
    [String(nonce)]
  );
  return res.rows.length > 0;
}

async function pruneNonces (beforeIso) {
  await db.query('DELETE FROM seccheck_nonces WHERE created_at < $1', [String(beforeIso)]);
}

async function savePendingCallback (traceId, result, client) {
  const q = client ? client.query.bind(client) : db.query.bind(db);
  await q(
    'INSERT INTO pending_media_callbacks (trace_id, result) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [String(traceId), String(result)]
  );
}

async function applyPendingCallbackInTx (client, traceId) {
  const pending = await client.query(
    'SELECT result FROM pending_media_callbacks WHERE trace_id = $1',
    [String(traceId)]
  );
  if (!pending.rows.length) return false;
  const fb = await findByTraceId(traceId, client);
  if (!fb) return false;
  const applied = await applyMediaVerdictInTx(client, fb.id, traceId, pending.rows[0].result);
  await client.query('DELETE FROM pending_media_callbacks WHERE trace_id = $1', [String(traceId)]);
  return !!applied;
}

async function applyPendingCallback (traceId) {
  return db.tx(async function (client) {
    return applyPendingCallbackInTx(client, traceId);
  });
}

async function prunePendingCallbacks (beforeIso) {
  await db.query('DELETE FROM pending_media_callbacks WHERE created_at < $1', [String(beforeIso)]);
}

module.exports = {
  KINDS: KINDS,
  STATUSES: STATUSES,
  RESOLVE_STATUSES: RESOLVE_STATUSES,
  insert: insert,
  insertWithQuota: insertWithQuota,
  remove: remove,
  getById: getById,
  listMine: listMine,
  countMine: countMine,
  listForAdmin: listForAdmin,
  resolve: resolve,
  setMediaStatus: setMediaStatus,
  applyMediaVerdict: applyMediaVerdict,
  setImageReviewResults: setImageReviewResults,
  setImageReviewResult: setImageReviewResult,
  findByTraceId: findByTraceId,
  countSince: countSince,
  consumeNonce: consumeNonce,
  pruneNonces: pruneNonces,
  savePendingCallback: savePendingCallback,
  applyPendingCallback: applyPendingCallback,
  prunePendingCallbacks: prunePendingCallbacks
};
