const db = require('../db');
const config = require('../config');
const { toCamel, toCamelList } = require('../lib/to-camel');

/** 批量写入；调用方负责事务，memory 同步在提交后执行。 */
async function upsert (docs, client) {
  const list = Array.isArray(docs) ? docs : [];
  const q = client ? client.query.bind(client) : db.query.bind(db);
  for (const doc of list) {
    const embedding = db.isMemory()
      ? JSON.stringify(doc.embedding || [])
      : '[' + (doc.embedding || []).join(',') + ']';
    const ins = await db.buildInsert({
      table: 'search_documents',
      columns: ['doc_type', 'ref_id', 'title', 'content', 'embedding', 'model', 'dim'],
      values: [
        String(doc.docType), Number(doc.refId), String(doc.title || ''),
        String(doc.content || ''), embedding, String(doc.model || ''), Number(doc.dim || 0)
      ],
      client: client
    });
    await q(ins.sql, ins.params);
  }
  return list.length;
}

async function listAll (model) {
  const params = [];
  let sql = 'SELECT doc_type, ref_id, title, content, embedding, model, dim FROM search_documents';
  if (model) {
    params.push(String(model));
    sql += ' WHERE model = $1';
  }
  const res = await db.query(sql, params);
  return toCamelList(res.rows, { numeric: true });
}

/** 编辑前的旧 point id 也必须显式传入，因为它们已随内容替换被级联删除。 */
async function removeExperience (experienceId, client, pointIds) {
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const params = [Number(experienceId)];
  let sql = "DELETE FROM search_documents WHERE (doc_type = 'experience' AND ref_id = $1) " +
    "OR (doc_type = 'point' AND ref_id IN (SELECT id FROM points WHERE experience_id = $1))";
  const oldIds = (pointIds || []).map(Number).filter(function (id) { return id > 0; });
  if (oldIds.length) {
    sql += " OR (doc_type = 'point' AND ref_id IN (" +
      oldIds.map(function (id) {
        params.push(id);
        return '$' + params.length;
      }).join(',') + '))';
  }
  const res = await q(sql, params);
  return res.rows.length;
}

/** 数量不符或经验文档缺失都进入待重建队列。 */
async function listMissingIndex () {
  const res = await db.query(
    'SELECT e.id, e.title, e.updated_at, d.id AS document_id, d.model, d.dim ' +
    'FROM experiences e LEFT JOIN search_documents d ON d.doc_type = \'experience\' AND d.ref_id = e.id ' +
    "WHERE e.status = 'published' ORDER BY e.updated_at DESC"
  );
  const pointRows = await db.query('SELECT experience_id, count(*) AS n FROM points GROUP BY experience_id');
  const indexedRows = await db.query(
    "SELECT p.experience_id, count(sd.id) AS n FROM points p LEFT JOIN search_documents sd " +
    "ON sd.doc_type = 'point' AND sd.ref_id = p.id GROUP BY p.experience_id"
  );
  const expected = {};
  const indexed = {};
  for (const row of pointRows.rows) expected[String(row.experience_id)] = Number(row.n);
  for (const row of indexedRows.rows) indexed[String(row.experience_id)] = Number(row.n);
  const out = [];
  for (const row of toCamelList(res.rows, { numeric: true })) {
    const reasons = [];
    if (!row.documentId) reasons.push('experience-missing');
    else {
      if (row.model !== config.embedding.model) reasons.push('model-mismatch');
      if (row.dim !== config.embedding.dim) reasons.push('dimension-mismatch');
    }
    row.expectedPoints = expected[String(row.id)] || 0;
    row.indexedPoints = indexed[String(row.id)] || 0;
    if (row.indexedPoints !== row.expectedPoints) reasons.push('point-count-mismatch');
    if (reasons.length) {
      row.reason = reasons.join(',');
      row.missingPoints = Math.max(0, row.expectedPoints - row.indexedPoints);
      out.push(row);
    }
  }
  return out;
}

/** 全量重建前清理失联文档、下线文档与旧模型文档。 */
async function deleteOrphans () {
  const res = await db.query(
    'DELETE FROM search_documents WHERE model <> $1 OR ' +
    "(doc_type = 'point' AND ref_id NOT IN (SELECT id FROM points)) OR " +
    "(doc_type = 'experience' AND ref_id NOT IN (SELECT id FROM experiences WHERE status = 'published'))",
    [config.embedding.model]
  );
  return res.rows.length;
}

async function count () {
  const row = await db.queryOne('SELECT count(*) AS n FROM search_documents');
  return Number(row ? row.n : 0);
}

module.exports = {
  upsert: upsert,
  listAll: listAll,
  removeExperience: removeExperience,
  listMissingIndex: listMissingIndex,
  deleteOrphans: deleteOrphans,
  count: count
};
