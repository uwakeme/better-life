/**
 * 搜索索引 DAO：search_documents
 *
 * 职责：写入与读取 embedding。
 * 约定：
 *   1. embedding 维度不写死，换模型不用改表结构（§6.2）。
 *   2. pg-mem 里 vector 列是 TEXT，embedding 存 JSON 文本；
 *      真实 PG 里存 '[0.1,0.2,...]' 这样的向量字面量。
 */
const db = require('../db');
const { toCamel, toCamelList } = require('../lib/to-camel');

/** 批量写入（先删同 ref 再插，保证幂等） */
async function upsert (docs) {
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    await db.query(
      'DELETE FROM search_documents WHERE doc_type = $1 AND ref_id = $2',
      [String(doc.docType), Number(doc.refId)]
    );
    const embedding = db.isMemory()
      ? JSON.stringify(doc.embedding || [])
      : '[' + (doc.embedding || []).join(',') + ']';
    const ins = await db.buildInsert({
      table: 'search_documents',
      columns: ['doc_type', 'ref_id', 'title', 'content', 'embedding', 'model', 'dim'],
      values: [
        String(doc.docType),
        Number(doc.refId),
        String(doc.title || ''),
        String(doc.content || ''),
        embedding,
        String(doc.model || ''),
        Number(doc.dim || 0)
      ]
    });
    await db.query(ins.sql, ins.params);
  }
  return list.length;
}

/** 全部索引（memory vector store 启动时载入用） */
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

/** 删掉某条经验的全部索引 */
async function removeExperience (experienceId) {
  const res = await db.query(
    "DELETE FROM search_documents WHERE (doc_type = 'experience' AND ref_id = $1) " +
    "OR (doc_type = 'point' AND ref_id IN (SELECT id FROM points WHERE experience_id = $1))",
    [Number(experienceId)]
  );
  return res.rows.length;
}

/** 已发布但没有索引的经验（待重试队列，§7.9） */
async function listMissingIndex () {
  const res = await db.query(
    "SELECT e.id, e.title, e.updated_at FROM experiences e " +
    "WHERE e.status = 'published' AND NOT EXISTS (" +
    "SELECT 1 FROM search_documents d WHERE d.doc_type = 'experience' AND d.ref_id = e.id) " +
    'ORDER BY e.updated_at DESC'
  );
  return toCamelList(res.rows, { numeric: true });
}

/** 索引条数（自检断言用） */
async function count () {
  const row = await db.queryOne('SELECT count(*) AS n FROM search_documents');
  return Number(row ? row.n : 0);
}

module.exports = {
  upsert: upsert,
  listAll: listAll,
  removeExperience: removeExperience,
  listMissingIndex: listMissingIndex,
  count: count
};
