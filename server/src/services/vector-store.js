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
  return !na || !nb ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

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

async function loadMemory () {
  const rows = await sdDao.listAll(config.embedding.model);
  memoryDocs = [];
  for (const row of rows) {
    let vec = row.embedding;
    if (typeof vec === 'string') {
      try { vec = JSON.parse(vec); } catch (e) { vec = []; }
    }
    if (Array.isArray(vec) && vec.length) {
      memoryDocs.push({ docType: row.docType, refId: row.refId, vector: vec });
    }
  }
  return memoryDocs.length;
}

function syncUpsert (docs) {
  if (mode !== 'memory') return;
  for (const doc of docs) {
    const idx = memoryDocs.findIndex(function (item) {
      return item.docType === doc.docType && Number(item.refId) === Number(doc.refId);
    });
    const item = { docType: doc.docType, refId: Number(doc.refId), vector: doc.embedding };
    if (idx >= 0) memoryDocs[idx] = item;
    else memoryDocs.push(item);
  }
}

async function upsert (docs) {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length) return 0;
  await sdDao.upsert(list);
  syncUpsert(list);
  return list.length;
}

/** 单经验删除与插入同事务，失败时旧索引整体保留。 */
async function replaceExperience (experienceId, docs, pointIds) {
  const list = Array.isArray(docs) ? docs : [];
  await db.tx(async function (client) {
    await sdDao.removeExperience(experienceId, client, pointIds);
    await sdDao.upsert(list, client);
  });
  if (mode === 'memory') {
    const refs = list.map(function (doc) { return Number(doc.refId); });
    refs.push.apply(refs, (pointIds || []).map(Number));
    forget('point', refs);
    forget('experience', [experienceId]);
    syncUpsert(list);
  }
  return list.length;
}

function forget (docType, refIds) {
  if (mode !== 'memory') return;
  const ids = (refIds || []).map(Number);
  memoryDocs = memoryDocs.filter(function (item) {
    return item.docType !== docType || ids.indexOf(Number(item.refId)) < 0;
  });
}

async function remove (docType, refIds) {
  const ids = (Array.isArray(refIds) ? refIds : [refIds]).map(Number).filter(function (id) {
    return Number.isInteger(id) && id > 0;
  });
  if (!ids.length) return;
  const params = [String(docType)].concat(ids);
  await db.query(
    'DELETE FROM search_documents WHERE doc_type = $1 AND ref_id IN (' +
    ids.map(function (_, i) { return '$' + (i + 2); }).join(',') + ')', params
  );
  forget(docType, ids);
}

async function removeExperience (experienceId, pointIds) {
  await sdDao.removeExperience(experienceId, null, pointIds);
  forget('experience', [experienceId]);
  forget('point', pointIds || []);
}

function filterConditions (filters, params, pointAlias) {
  const conditions = [];
  const categories = (filters.categoryIds || []).map(Number).filter(function (id) {
    return Number.isInteger(id) && id > 0;
  });
  if (categories.length) {
    conditions.push(pointAlias + '.category_id IN (' + categories.map(function (id) {
      params.push(id);
      return '$' + params.length;
    }).join(',') + ')');
  }
  if (filters.stance) {
    params.push(String(filters.stance));
    conditions.push(pointAlias + '.id IN (SELECT experience_id FROM points WHERE stance = $' +
      params.length + ')');
  }
  return conditions;
}

async function memoryEligible (filters) {
  const expParams = [];
  const expConditions = filterConditions(filters, expParams, 'e');
  const expRes = await db.query(
    "SELECT e.id FROM experiences e WHERE e.status = 'published'" +
    (expConditions.length ? ' AND ' + expConditions.join(' AND ') : ''), expParams
  );
  const pointParams = [];
  const pointConditions = filterConditions(filters, pointParams, 'e');
  const pointRes = await db.query(
    "SELECT p.id FROM points p JOIN experiences e ON e.id = p.experience_id WHERE e.status = 'published'" +
    (pointConditions.length ? ' AND ' + pointConditions.join(' AND ') : ''), pointParams
  );
  return {
    experience: new Set(expRes.rows.map(function (row) { return Number(row.id); })),
    point: new Set(pointRes.rows.map(function (row) { return Number(row.id); }))
  };
}

/** 先过滤再排序截断，memory 与 pgvector 使用同一组语义条件。 */
async function query (vector, topK, filters) {
  const k = db.limit(topK, 30);
  if (!vector || !vector.length) return [];
  const f = filters || {};
  if (mode === 'pgvector') {
    const params = [config.embedding.model, '[' + vector.join(',') + ']'];
    const expConditions = filterConditions(f, params, 'e');
    const pointConditions = filterConditions(f, params, 'e');
    const res = await db.query(
      'SELECT doc_type, ref_id, (embedding <=> $2::vector) AS distance FROM search_documents ' +
      'WHERE model = $1 AND ((doc_type = \'experience\' AND ref_id IN ' +
      '(SELECT e.id FROM experiences e WHERE e.status = \'published\'' +
      (expConditions.length ? ' AND ' + expConditions.join(' AND ') : '') + ')) OR ' +
      '(doc_type = \'point\' AND ref_id IN (SELECT p.id FROM points p JOIN experiences e ' +
      "ON e.id = p.experience_id WHERE e.status = 'published'" +
      (pointConditions.length ? ' AND ' + pointConditions.join(' AND ') : '') + '))) ' +
      'ORDER BY embedding <=> $2::vector LIMIT ' + k, params
    );
    return res.rows.map(function (row, i) {
      const distance = Number(row.distance);
      return {
        docType: row.doc_type,
        refId: Number(row.ref_id),
        score: isNaN(distance) ? 0 : Math.max(0, 1 - distance),
        distance: isNaN(distance) ? 1 : distance,
        rank: i + 1
      };
    });
  }

  const eligible = await memoryEligible(f);
  const scored = [];
  for (const doc of memoryDocs) {
    if (!eligible[doc.docType] || !eligible[doc.docType].has(Number(doc.refId))) continue;
    scored.push({
      docType: doc.docType, refId: Number(doc.refId), score: cosine(vector, doc.vector), rank: 0
    });
  }
  scored.sort(function (a, b) {
    return b.score - a.score || a.refId - b.refId ||
      String(a.docType).localeCompare(String(b.docType));
  });
  return scored.slice(0, k).map(function (item, i) {
    item.rank = i + 1;
    return item;
  });
}

function current () { return mode; }
function semanticAvailable () {
  const embedding = require('./embedding');
  return mode === 'pgvector' && embedding.canCallRemote();
}

module.exports = {
  detect: detect,
  upsert: upsert,
  replaceExperience: replaceExperience,
  remove: remove,
  removeExperience: removeExperience,
  forget: forget,
  query: query,
  current: current,
  semanticAvailable: semanticAvailable,
  loadMemory: loadMemory
};
