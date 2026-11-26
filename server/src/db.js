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
const { normalize } = require('./lib/search-text');

let pool = null;
let pgmemDb = null;
let memoryMode = false;
let memoryTxQueue = Promise.resolve();

/** PostgreSQL 里 DATE 类型的 oid */
const DATE_TYPE_OID = 1082;

/**
 * 内存库下把 schema 里的 vector 类型换成 TEXT
 * 真实 PG 里 vector 是 pgvector 的类型；pg-mem 没有这个域。
 */
function schemaForMode (sql) {
  if (!memoryMode) return sql;
  return sql
    .replace(/CREATE OR REPLACE FUNCTION better_normalize[\s\S]*?\$\$;/, '')
    .replace(/\bvector\b/g, 'TEXT');
}

async function init (options) {
  const opts = options || {};
  if (opts.memory || config.useMemoryDb) {
    const { newDb, DataType } = require('pg-mem');
    pgmemDb = newDb({ autoCreateForeignKeyIndices: true });
    /* 真实 PG 在 schema 中安装同名 SQL 函数；内存库用同一 JS 规则实现。 */
    pgmemDb.public.registerFunction({
      name: 'better_normalize',
      args: [DataType.text],
      returns: DataType.text,
      implementation: normalize
    });
    const pg = pgmemDb.adapters.createPg();
    pool = new pg.Pool();
    memoryMode = true;
    /* 把「实际生效的模式」同步回 config ——
       自检是 db.init({ memory: true }) 起的，配置层本来不知道自己在内存库上跑。
       不同步的话，token 服务会以为自己在连真库，没有密钥就拒绝签发，
       自检全线 401。health 接口的数据来源标记也靠这个字段如实上报。 */
    config.useMemoryDb = true;
    await applySchema();
    return { mode: 'memory' };
  }
  const { Pool, types } = require('pg');
  /* DATE 列原样返回字符串，不让驱动按服务器时区解析成本地零点的 Date ——
     那样再取日期就取决于进程时区（Asia/Shanghai 下会差一天）。
     必须在建连接池之前设：客户端在构造时拷贝一份解析器表。
     内存库走 pg-mem 自己的类型实现，不经过这里，由转换层按北京时间兜住。 */
  types.setTypeParser(DATE_TYPE_OID, function (value) { return value; });
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: sslConfig(),
    max: 10,
    idleTimeoutMillis: 30000
  });
  /* 空闲连接出错时 pool 会发 'error' 事件 —— 不挂监听的话是未处理事件，
     会把整个进程带崩。 */
  pool.on('error', function (err) {
    console.error('[db] 连接池错误：' + (err && err.message ? err.message : err));
  });
  await pool.query('SELECT 1');
  memoryMode = false;
  memoryTxQueue = Promise.resolve();
  config.useMemoryDb = false;
  await applySchema();
  return { mode: 'postgres' };
}

/** 默认使用系统 CA；只有非生产环境显式申请时才允许跳过证书校验。 */
function sslConfig () {
  if (!config.pgSsl) return undefined;
  if (config.pgSslCa) {
    return { ca: fs.readFileSync(config.pgSslCa, 'utf8'), rejectUnauthorized: true };
  }
  if (config.pgSslAllowInsecure && config.env === 'production') {
    throw new Error('生产环境禁止 PGSSL_ALLOW_INSECURE=true');
  }
  return { rejectUnauthorized: !config.pgSslAllowInsecure };
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
async function runTx (fn) {
  const client = await pool.connect();
  // pg-mem 3.0.14 的 ROLLBACK 不恢复已执行写操作，用其 O(1) 备份点补齐事务语义。
  const backup = memoryMode && pgmemDb ? pgmemDb.backup() : null;
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    if (backup) backup.restore();
    else {
      try { await client.query('ROLLBACK'); } catch (e) { /* 回滚失败也要把原错误抛出去 */ }
    }
    throw err;
  } finally {
    client.release();
  }
}

async function tx (fn) {
  if (!memoryMode) return runTx(fn);
  // pg-mem 不实现行锁且 MAX(id)+1 会竞争；串行事务避免自检产生伪并发失败。
  const previous = memoryTxQueue;
  let release;
  memoryTxQueue = new Promise(function (resolve) { release = resolve; });
  await previous;
  try {
    return await runTx(fn);
  } finally {
    release();
  }
}

/** 关闭连接池 */
async function close () {
  if (pool && pool.end) await pool.end();
  pool = null;
  pgmemDb = null;
  memoryMode = false;
  config.useMemoryDb = false;
}

function isMemory () {
  return memoryMode;
}

/**
 * LIMIT 的安全内联：一律整数，不接受任何字符串
 *
 * ⚠️ 之前一律截到 200 —— 统计接口传 size=1000 也只回 200 条，
 *    库里 214 条经验时统计报「200」。
 *    现在上限可配置（LIST_MAX_LIMIT，默认 500），
 *    而统计与重建索引这类内部调用改走 SQL 聚合 / 分页，不再靠放大 size。
 */
function limit (n, fallback, max) {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return fallback || 20;
  const cap = max || config.listMaxLimit;
  return Math.min(Math.floor(v), cap);
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
  sslConfig: sslConfig,
  isMemory: isMemory,
  limit: limit,
  arrayLiteral: arrayLiteral,
  nextId: nextId,
  buildInsert: buildInsert,
  get pool () { return pool; }
};
