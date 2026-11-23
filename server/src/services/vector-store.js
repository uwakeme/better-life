/**
 * Vector Store 抽象与降级（§7.6）
 *
 * 接口：
 *   upsert(docs)        批量写入/更新
 *   remove(docType, refIds)
 *   query(vector, topK)  => [{ docType, refId, score }]
 *
 * 两档实现：
 *   pgvector —— SELECT ... WHERE model=$1 ORDER BY embedding <=> $2 LIMIT $3
 *   memory   —— 启动时全量载入内存，暴力余弦（零依赖降级）
 *
 * 探测：启动时查 pg_extension 有没有 vector；查不到就用 memory，
 * 并在 /api/health 如实返回 vectorStore: 'memory'。
 */
const db = require('../db');
const config = require('../config');
const sdDao = require('../dao/search-documents');

let mode = 'memory';
let memoryDocs = [];

function cosine (a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 探测可用的实现 */
async function detect () {
  if (db.isMemory()) {
    mode = 'memory';
    return mode;
  }
  try {
    const row = await db.queryOne("SELECT 1 AS ok FROM pg_extension WHERE extname = 'vector'");
    mode = row ? 'pgvector' : 'memory';
  } catch (e) {
    mode = 'memory';
  }
  if (mode === 'memory') await loadMemory();
  return mode;
}

/** 内存实现：启动时全量载入 */
async function loadMemory () {
  const rows = await sdDao.listAll(config.embedding.model);
  memoryDocs = [];
  for (const r of rows) {
    let vec = r.embedding;
    if (typeof vec === 'string') {
      try { vec = JSON.parse(vec); } catch (e) { vec = []; }
    }
    if (!Array.isArray(vec) || !vec.length) continue;
    memoryDocs.push({ docType: r.docType, refId: r.refId, vector: vec });
  }
  return memoryDocs.length;
}

/** 批量写入 */
async function upsert (docs) {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length) return 0;
  await sdDao.upsert(list);
  if (mode === 'memory') {
    for (const doc of list) {
      const idx = memoryDocs.findIndex(function (m) {
        return m.docType === doc.docType && Number(m.refId) === Number(doc.refId);
      });
      const item = { docType: doc.docType, refId: Number(doc.refId), vector: doc.embedding };
      if (idx >= 0) memoryDocs[idx] = item;
      else memoryDocs.push(item);
    }
  }
  return list.length;
}

/** 删除 */
async function remove (docType, refIds) {
  const ids = Array.isArray(refIds) ? refIds : [refIds];
  for (const id of ids) {
    await db.query(
      'DELETE FROM search_documents WHERE doc_type = $1 AND ref_id = $2',
      [String(docType), Number(id)]
    );
  }
  if (mode === 'memory') {
    memoryDocs = memoryDocs.filter(function (m) {
      if (m.docType !== docType) return true;
      return ids.map(Number).indexOf(Number(m.refId)) < 0;
    });
  }
}

/**
 * 查询最近邻
 * @returns {Array<{docType, refId, score}>}
 */
async function query (vector, topK) {
  const k = db.limit(topK, 30);
  if (!vector || !vector.length) return [];

  if (mode === 'pgvector') {
    const literal = '[' + vector.join(',') + ']';
    const res = await db.query(
      'SELECT doc_type, ref_id FROM search_documents WHERE model = $1 ' +
      'ORDER BY embedding <=> $2::vector LIMIT ' + k,
      [config.embedding.model, literal]
    );
    const out = [];
    for (let i = 0; i < res.rows.length; i++) {
      out.push({
        docType: res.rows[i].doc_type,
        refId: Number(res.rows[i].ref_id),
        score: 1 - i / (res.rows.length + 1),
        rank: i + 1
      });
    }
    return out;
  }

  /* memory：暴力余弦 */
  const scored = [];
  for (const m of memoryDocs) {
    scored.push({
      docType: m.docType,
      refId: Number(m.refId),
      score: cosine(vector, m.vector),
      rank: 0
    });
  }
  scored.sort(function (a, b) { return b.score - a.score; });
  const top = scored.slice(0, k);
  for (let i = 0; i < top.length; i++) top[i].rank = i + 1;
  return top;
}

/** 当前实现名 */
function current () {
  return mode;
}

/** 语义能力是否可用：local provider 没有真语义，必须报 false */
function semanticAvailable () {
  const embedding = require('./embedding');
  return mode === 'pgvector' && embedding.canCallRemote();
}

module.exports = {
  detect: detect,
  upsert: upsert,
  remove: remove,
  query: query,
  current: current,
  semanticAvailable: semanticAvailable,
  loadMemory: loadMemory
};
