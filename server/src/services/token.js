/**
 * token 签发与校验
 *
 * 职责：服务端自签 token（HMAC-SHA256），payload 里带 openid + role + 过期时间。
 * 为什么 role 要进 payload：中间件要校验 role 就必须能从 token 里读到它（§8.4）。
 * ⚠️ 代价：管理员身份被取消后，旧 token 在有效期内仍带着旧 role ——
 *    所以第三层（数据层查库）不能省，管理接口必须再查一次 users.role。
 *
 * 格式：base64url(payload) + '.' + base64url(HMAC-SHA256)
 * 校验用 timingSafeEqual，避免按字节比较带来的时序泄漏。
 */
const crypto = require('crypto');
const config = require('../config');

/**
 * 签发用的密钥。
 *
 * ⚠️ 没有写死的兜底密钥 —— 之前这里是 'better-life-dev-secret'，
 *    任何拿到源码的人都能自签一个 admin token 直接读管理接口、删经验。
 *    现在只有内存模式（本地自检）或显式 ALLOW_DEV_SECRET=1 才允许用开发密钥，
 *    其余情况一律拒绝签发 —— 宁可登录失败，也不能给一个能伪造的后门。
 */
function secret () {
  if (config.tokenSecret) return config.tokenSecret;
  if (config.useMemoryDb || config.allowDevSecret) return 'better-life-dev-secret';
  const e = new Error('服务端没有配置 TOKEN_SECRET，无法签发登录凭证');
  e.code = 'SERVER';
  throw e;
}

/** 当前是否在用「谁都能伪造」的开发密钥 */
function usingDevSecret () {
  return !config.tokenSecret && (config.useMemoryDb || config.allowDevSecret);
}

function b64url (buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url (str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

function hmac (payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest();
}

/**
 * 签一个 token
 * @param {object} claims { openid, role }
 * @param {number} ttlSeconds 有效期（秒）
 */
function sign (claims, ttlSeconds) {
  const ttl = ttlSeconds || config.tokenTtlDays * 86400;
  const payload = {
    openid: String(claims.openid),
    role: String(claims.role || 'user'),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttl
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(body));
  return body + '.' + sig;
}

/**
 * 验一个 token
 * @returns {{ok: true, payload: object} | {ok: false, code: string, message: string}}
 */
function verify (token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, code: 'UNAUTHORIZED', message: '请先登录' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, code: 'UNAUTHORIZED', message: '登录状态无效，请重新登录' };
  }
  const body = parts[0];
  const sig = parts[1];
  const expected = hmac(body);
  let given;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch (e) {
    return { ok: false, code: 'UNAUTHORIZED', message: '登录状态无效，请重新登录' };
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, code: 'UNAUTHORIZED', message: '登录状态无效，请重新登录' };
  }
  let payload;
  try {
    payload = JSON.parse(unb64url(body));
  } catch (e) {
    return { ok: false, code: 'UNAUTHORIZED', message: '登录状态无效，请重新登录' };
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    return { ok: false, code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' };
  }
  return { ok: true, payload: payload };
}

/** 从 Authorization 头里取 token */
function fromHeader (header) {
  if (!header) return null;
  const m = String(header).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

module.exports = {
  sign: sign,
  verify: verify,
  fromHeader: fromHeader,
  usingDevSecret: usingDevSecret
};
