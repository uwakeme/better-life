/**
 * 用户 DAO：users / favorites / votes
 *
 * 职责：登录用户、收藏、投票。
 * 关键约定：
 *   1. 投票是"取消投 / 改投"语义 —— votes 主键是 (openid, experience_id)。
 *   2. useful_count 与 not_useful_count 从 votes 表重新数一遍写回 experiences，
 *      而不是在这里 +1/-1 —— 加减法一旦漏了哪一步，两个计数就会对不上，
 *      而 §6.3 第 12 条断言会当场抓出来。重新数一遍的成本可以忽略。
 */
const db = require('../db');
const { toCamel, toCamelList } = require('../lib/to-camel');

/** 按 openid 查用户 */
async function findUser (openid) {
  const row = await db.queryOne(
    'SELECT openid, unionid, nickname, avatar, role, created_at, last_seen_at FROM users WHERE openid = $1',
    [String(openid)]
  );
  return row ? toCamel(row) : null;
}

/** 建号或更新（登录时调用） */
async function upsertUser (openid, patch) {
  const p = patch || {};
  const res = await db.query(
    'INSERT INTO users (openid, unionid, nickname, avatar, role) VALUES ($1, $2, $3, $4, $5) ' +
    'ON CONFLICT (openid) DO UPDATE SET unionid = COALESCE(EXCLUDED.unionid, users.unionid), ' +
    'nickname = CASE WHEN EXCLUDED.nickname <> $6 THEN EXCLUDED.nickname ELSE users.nickname END, ' +
    'last_seen_at = NOW() ' +
    'RETURNING openid, unionid, nickname, avatar, role, created_at, last_seen_at',
    [
      String(openid),
      p.unionid || null,
      p.nickname || '',
      p.avatar || '',
      p.role || 'user',
      ''
    ]
  );
  return toCamel(res.rows[0]);
}

/** 把 openid 提成管理员 */
async function setRole (openid, role) {
  const res = await db.query(
    'UPDATE users SET role = $2 WHERE openid = $1 RETURNING openid, role',
    [String(openid), String(role)]
  );
  return res.rows[0] ? toCamel(res.rows[0]) : null;
}

/* ---------- 收藏 ---------- */

/**
 * 我的收藏
 * sort: 'added'（默认，收藏时间倒序）/ 'updated'（经验最近更新倒序）
 * ⚠️ 之前页面传了 sort，服务端不处理 —— 「最近更新」那个按钮是空的。
 */
async function listFavorites (openid, opts) {
  const o = opts || {};
  const size = db.limit(o.size, 50);
  const page = Math.max(1, Number(o.page) || 1);
  const params = [String(openid)];
  let where = 'f.openid = $1';
  if (o.categoryId) {
    params.push(Number(o.categoryId));
    where += ' AND e.category_id = $' + params.length;
  }
  let order = 'f.created_at DESC, e.id DESC';
  if (o.sort === 'updated') order = 'e.updated_at DESC, f.created_at DESC, e.id DESC';
  const sql =
    'SELECT e.id, e.title, e.summary, e.category_id, e.updated_at, e.status, ' +
    'c.name AS category_name, f.created_at AS favorited_at ' +
    'FROM favorites f JOIN experiences e ON e.id = f.experience_id ' +
    'JOIN categories c ON c.id = e.category_id WHERE ' + where +
    ' ORDER BY ' + order + ' LIMIT ' + size + ' OFFSET ' + ((page - 1) * size);
  const res = await db.query(sql, params);
  const totalRow = await db.queryOne(
    'SELECT count(*) AS n FROM favorites f JOIN experiences e ON e.id = f.experience_id WHERE ' + where,
    params
  );
  return {
    items: toCamelList(res.rows, { numeric: true }),
    page: page,
    size: size,
    total: Number(totalRow ? totalRow.n : 0)
  };
}

async function countFavorites (openid) {
  const row = await db.queryOne('SELECT count(*) AS n FROM favorites WHERE openid = $1', [String(openid)]);
  return Number(row ? row.n : 0);
}

/** 是否已收藏 */
async function isFavorite (openid, experienceId) {
  const row = await db.queryOne(
    'SELECT 1 AS hit FROM favorites WHERE openid = $1 AND experience_id = $2',
    [String(openid), Number(experienceId)]
  );
  return !!row;
}

/** 收藏（幂等） */
async function addFavorite (openid, experienceId) {
  await db.query(
    'INSERT INTO favorites (openid, experience_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [String(openid), Number(experienceId)]
  );
  await recountFavorites(Number(experienceId));
  return true;
}

/** 取消收藏 */
async function removeFavorite (openid, experienceId) {
  await db.query(
    'DELETE FROM favorites WHERE openid = $1 AND experience_id = $2',
    [String(openid), Number(experienceId)]
  );
  await recountFavorites(Number(experienceId));
  return true;
}

/** 收藏数重数一遍写回（冗余计数，§6.2） */
async function recountFavorites (experienceId) {
  await db.query(
    'UPDATE experiences SET favorite_count = ' +
    '(SELECT count(*) FROM favorites WHERE experience_id = $1) WHERE id = $1',
    [Number(experienceId)]
  );
}

/* ---------- 投票 ---------- */

/** 我的投票 */
async function getVote (openid, experienceId) {
  const row = await db.queryOne(
    'SELECT useful FROM votes WHERE openid = $1 AND experience_id = $2',
    [String(openid), Number(experienceId)]
  );
  return row ? !!row.useful : null;
}

/**
 * 投票：取消投 / 改投
 *
 * ⚠️ 之前是「先读、再决定插入还是更新还是删除」三步独立语句 —-
 *    同一用户并发点两次，两边都读到「还没有票」，都去 INSERT，
 *    后到的撞唯一键返回 500（实测 16 次并发有 7 次 500）。
 *
 * 现在整个「切换 + 重算计数」放进一个事务：
 *   DELETE ... RETURNING 先删掉当前那一票（删到了 = 本次是取消投），
 *   删不到再 INSERT ... ON CONFLICT DO UPDATE（改成新的一票）。
 *   并发下最多一方成功删、另一方走 upsert，结果始终一致。
 *
 * @returns {{useful: boolean|null, usefulCount: number, notUsefulCount: number}}
 */
async function setVote (openid, experienceId, useful) {
  const want = !!useful;
  return db.tx(async function (client) {
    /* ⚠️ 删除条件里必须带上 useful = $3 ——
       只有「当前这一票和想投的方向相同」才删（再点一次 = 取消投）。
       不带这个条件的话，「改投」会先把旧票删掉，
       结果被当成取消投，改投就改不成。 */
    const deleted = await client.query(
      'DELETE FROM votes WHERE openid = $1 AND experience_id = $2 AND useful = $3 RETURNING useful',
      [String(openid), Number(experienceId), want]
    );
    let current = null;
    if (deleted.rows.length) {
      /* 原来有票且被删掉 —— 再点一次同一个 = 取消投 */
      current = null;
    } else {
      const inserted = await client.query(
        'INSERT INTO votes (openid, experience_id, useful) VALUES ($1, $2, $3) ' +
        'ON CONFLICT (openid, experience_id) DO UPDATE SET useful = EXCLUDED.useful, created_at = NOW() ' +
        'RETURNING useful',
        [String(openid), Number(experienceId), want]
      );
      current = inserted.rows.length ? !!inserted.rows[0].useful : null;
    }
    /* 计数在同一事务里重算，避免中间态被读走 */
    const counted = await recountVotes(Number(experienceId), client);
    return {
      useful: current,
      usefulCount: counted.usefulCount,
      notUsefulCount: counted.notUsefulCount
    };
  });
}

/** 两个计数都从 votes 表重数一遍写回 —— 改投时两个数一起改对 */
async function recountVotes (experienceId, client) {
  const run = client ? client.query.bind(client) : db.query.bind(db);
  /* 不用 count(*) FILTER (WHERE …) —— pg-mem 会忽略 FILTER 里的条件，
     把每一行同时算进 good 和 bad（实测 useful=false 的行也算出 good=1）。
     改成把 useful 取回来看一眼再数，两个后端行为完全一致。 */
  const res = await run(
    'SELECT useful FROM votes WHERE experience_id = $1',
    [Number(experienceId)]
  );
  let good = 0;
  let bad = 0;
  for (const row of res.rows) {
    if (row.useful) good++;
    else bad++;
  }
  await run(
    'UPDATE experiences SET useful_count = $2, not_useful_count = $3 WHERE id = $1',
    [Number(experienceId), good, bad]
  );
  return { usefulCount: good, notUsefulCount: bad };
}

module.exports = {
  findUser: findUser,
  upsertUser: upsertUser,
  setRole: setRole,
  listFavorites: listFavorites,
  countFavorites: countFavorites,
  isFavorite: isFavorite,
  addFavorite: addFavorite,
  removeFavorite: removeFavorite,
  getVote: getVote,
  setVote: setVote,
  recountVotes: recountVotes
};
