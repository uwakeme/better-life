/**
 * 数据库访问入口
 *
 * 职责：统一提供 query / transaction，两种后端：
 *   - pg：真实 PostgreSQL（生产）
 *   - pg-mem：内存库（本地自检，server/scripts/selftest.js 用）
 * 为什么要内存库这一档：本项目没有 CI 的 PG 服务，自检必须能一条命令跑完。
 *
 * pg-mem 的能力边界（实测 3.0.14，写 DAO 时必须绕开这些）：
 *   - 不支持 CREATE DOMAIN → 内存库把 vector 列当 TEXT 存
 *   - 不支持 unnest / date_trunc / array_remove
 *   - 不支持 WHERE $id = ANY(数组列) → 数组成员判断改在 JS 里做
 *   - 不支持 DEFAULT VALUES → 插入时总是给全列值
 *   - 数组参数要写成 '{a,b}' 文本再 ::text[] 强转，直接传数组会解析失败
 * 这些差异只影响实现方式，不影响对外结构。
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

let pool = null;
let pgmemDb = null;
let memoryMode = false;

/**
 * 内存库下把 schema 里的 vector 类型换成 TEXT
 * 真实 PG 里 vector 是 pgvector 的类型；pg-mem 没有这个域。
 */
function schemaForMode (sql) {
  if (!memoryMode) return sql;
  return sql.replace(/\bvector\b/g, 'TEXT');
}

async function init (options) {
  const opts = options || {};
  if (opts.memory || config.useMemoryDb) {
    const { newDb } = require('pg-mem');
    pgmemDb = newDb({ autoCreateForeignKeyIndices: true });
    const pg = pgmemDb.adapters.createPg();
    pool = new pg.Pool();
    memoryMode = true;
    await applySchema();
    return { mode: 'memory' };
  }
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000
  });
  await pool.query('SELECT 1');
  memoryMode = false;
  return { mode: 'postgres' };
}

/** 跑建表脚本 */
async function applySchema () {
  const sql = schemaForMode(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await pool.query(sql);
}

/** 一条查询 */
async function query (text, params) {
  return pool.query(text, params || []);
}

/** 一条查询的第一行（可能为 undefined） */
async function queryOne (text, params) {
  const res = await pool.query(text, params || []);
  return res.rows[0];
}

/**
 * 事务
 * 用法：await tx(async (client) => { ... })
 * 里面用 client.query，不要用外层的 query —— 否则不在同一事务里。
 */
async function tx (fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* 回滚失败也要把原错误抛出去 */ }
    throw err;
  } finally {
    client.release();
  }
}

/** 关闭连接池 */
async function close () {
  if (pool && pool.end) await pool.end();
  pool = null;
  pgmemDb = null;
  memoryMode = false;
}

function isMemory () {
  return memoryMode;
}

/** LIMIT 的安全内联：一律整数，不接受任何字符串 */
function limit (n, fallback) {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return fallback || 20;
  return Math.min(Math.floor(v), 200);
}

/**
 * 把数组转成 PG 的数组字面量文本
 * pg-mem 不接受数组参数，只接受 '{a,b}' 这样的文本再 ::text[] 强转。
 */
function arrayLiteral (arr) {
  const list = Array.isArray(arr) ? arr : [];
  const parts = [];
  for (const item of list) {
    parts.push(String(item).replace(/([\\,{}])/g, '\\$1'));
  }
  return '{' + parts.join(',') + '}';
}

/**
 * 插入前取主键。
 * 真 PG 走数据库自增（并发安全）→ 返回 null，调用方不写 id 列；
 * pg-mem 根本没有序列对象，每张表的自增计数器从 1 重新开始，
 * 会和种子数据里显式指定的 id 撞车（真 PG 可以 setval 推后，pg-mem 不行），
 * 所以内存库在应用层算 max(id)+1。
 */
const ID_TABLES = [
  'categories', 'tags', 'experiences', 'points', 'sources', 'feedbacks', 'search_documents'
];

async function nextId (table, client) {
  if (!memoryMode) return null;
  if (ID_TABLES.indexOf(table) < 0) throw new Error('nextId 不认识的表：' + table);
  const run = client ? client.query.bind(client) : pool.query.bind(pool);
  const res = await run('SELECT MAX(id) AS n FROM ' + table);
  const row = res.rows[0];
  const n = row && row.n !== null && row.n !== undefined ? Number(row.n) : 0;
  return n + 1;
}

/**
 * 组装一条 INSERT。
 * id 放在列的最后 —— INSERT 的列顺序不影响结果，这样现有 $1..$n 占位符
 * 与 ::text[] 之类的强转都不用改。
 * @param {object} o
 * @param {string} o.table 表名
 * @param {string[]} o.columns 列名（不含 id）
 * @param {Array} o.values 与列一一对应的值
 * @param {string[]} [o.casts] 占位符强转后缀，如 ['::jsonb']
 * @param {object} [o.client] 事务客户端 —— 在事务里算 id 才看得到同一事务里的行
 */
async function buildInsert (o) {
  const client = o.client || null;
  const id = await nextId(o.table, client);
  const columns = o.columns.slice();
  const values = o.values.slice();
  if (id !== null) {
    columns.push('id');
    values.push(id);
  }
  const casts = o.casts || [];
  const parts = [];
  for (let i = 0; i < columns.length; i++) {
    parts.push('$' + (i + 1) + (casts[i] || ''));
  }
  return {
    sql: 'INSERT INTO ' + o.table + ' (' + columns.join(', ') + ') VALUES (' + parts.join(', ') + ')',
    params: values
  };
}

module.exports = {
  init: init,
  query: query,
  queryOne: queryOne,
  tx: tx,
  close: close,
  applySchema: applySchema,
  isMemory: isMemory,
  limit: limit,
  arrayLiteral: arrayLiteral,
  nextId: nextId,
  buildInsert: buildInsert,
  get pool () { return pool; }
};
