/**
 * 鉴权中间件
 *
 * 职责：三层校验里的第二层与第三层（§9.2）：
 *   1. 前端隐藏只是体验
 *   2. 中间件校验 token
 *   3. **数据层查库确认角色** —— 必须查，因为旧 token 在有效期内还带着旧 role（§8.4）
 * 所以这里不直接信 token 里的 role，而是查 users 表取当前 role。
 */
const tokenUtil = require('../services/token');
const usersDao = require('../dao/users');
const { fail } = require('./error');

/** 必须登录 */
async function requireAuth (req, res, next) {
  try {
    const raw = tokenUtil.fromHeader(req.headers.authorization);
    const v = tokenUtil.verify(raw);
    if (!v.ok) throw fail(v.code, v.message);
    const user = await usersDao.findUser(v.payload.openid);
    if (!user) throw fail('UNAUTHORIZED', '请先登录');
    req.user = user;
    req.tokenPayload = v.payload;
    next();
  } catch (e) {
    next(e);
  }
}

/** 必须是管理员（要放在 requireAuth 之后） */
function requireAdmin (req, res, next) {
  try {
    if (!req.user) throw fail('UNAUTHORIZED', '请先登录');
    if (req.user.role !== 'admin') throw fail('FORBIDDEN', '这一页只有管理员能进');
    next();
  } catch (e) {
    next(e);
  }
}

/** 限流：按 key 计数（§8.4） */
function rateLimit (options) {
  const o = options || {};
  const windowMs = o.windowMs || 60000;
  const max = o.max || 60;
  const keyFn = o.key || function (req) { return req.ip; };
  const buckets = new Map();

  return function (req, res, next) {
    try {
      const key = keyFn(req);
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || now - bucket.start >= windowMs) {
        bucket = { start: now, count: 0 };
        buckets.set(key, bucket);
      }
      bucket.count++;
      if (bucket.count > max) {
        throw fail('RATE_LIMITED', '操作太频繁了，请稍后再试');
      }
      /* 顺手清掉过期的桶，别让内存无限涨 */
      if (buckets.size > 5000) {
        for (const [k, b] of buckets) {
          if (now - b.start >= windowMs) buckets.delete(k);
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** 已登录用户的限流 key */
function userKey (req) {
  return (req.user && req.user.openid) || req.ip;
}

module.exports = {
  requireAuth: requireAuth,
  requireAdmin: requireAdmin,
  rateLimit: rateLimit,
  userKey: userKey
};
