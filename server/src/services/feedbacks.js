/**
 * 反馈业务服务
 *
 * 职责：反馈提交（限流 → 校验 → 审核 → 落库）与处理。
 * 口径（§4.3）：
 *   1. 反馈只给普通用户提交 —— 管理员发现问题直接改内容。
 *   2. 每天最多 5 条（§8.4 限流）。
 *   3. 带图的反馈先落库、图片标审核中，不是"审核通过才落库"（§9.4）。
 *   4. 处理一次提交落 status + reply；「只回话」必须写回复 —— 护栏在 DAO 层。
 */
const config = require('../config');
const fbDao = require('../dao/feedbacks');
const seccheck = require('./seccheck');
const expDao = require('../dao/experiences');
const usersDao = require('../dao/users');

/** 一天之内的起点（ISO 字符串） */
function dayStartIso () {
  return new Date(Date.now() - 86400000).toISOString();
}

/**
 * 提交一条反馈
 * @param {string} openid 提交人
 * @param {object} payload { targetType, targetId, kind, content, images }
 */
async function submit (openid, payload) {
  const p = payload || {};
  const kind = String(p.kind || '');
  if (fbDao.KINDS.indexOf(kind) < 0) {
    const e = new Error('请选择反馈类型');
    e.code = 'VALIDATION';
    throw e;
  }
  const content = String(p.content || '').trim();
  if (!content) {
    const e = new Error('请填写反馈内容');
    e.code = 'VALIDATION';
    throw e;
  }
  const images = Array.isArray(p.images) ? p.images : [];
  if (images.length > config.feedbackImageMax) {
    const e = new Error('最多只能附 ' + config.feedbackImageMax + ' 张图片');
    e.code = 'VALIDATION';
    throw e;
  }

  /* 限流：一天 5 条 */
  const today = await fbDao.countSince(openid, dayStartIso());
  if (today >= config.rateLimit.feedbackPerDay) {
    const e = new Error('今天反馈条数已用完，请明天再试');
    e.code = 'RATE_LIMITED';
    throw e;
  }

  /* 条目级：经验必须存在 */
  const targetType = p.targetType === 'experience' ? 'experience' : 'project';
  let targetId = null;
  if (targetType === 'experience') {
    targetId = Number(p.targetId);
    const exp = await expDao.getById(targetId);
    if (!exp) {
      const e = new Error('这条经验不存在');
      e.code = 'NOT_FOUND';
      throw e;
    }
  }

  /* 文本审核 —— 不通过就不落库（§9.3） */
  const check = await seccheck.checkText(content);
  if (!check.ok) {
    const e = new Error(check.message || '内容未通过安全检查');
    e.code = 'CONTENT_REJECTED';
    throw e;
  }

  /* 先落库（带图也是先落库，media_status=checking） */
  const fb = await fbDao.insert({
    targetType: targetType,
    targetId: targetId,
    openid: openid,
    kind: kind,
    content: content,
    images: images
  });

  /* 再逐张送异步审核（§9.4） */
  let traceId = null;
  for (const img of images) {
    const mediaId = img.mediaId || img.media_id || '';
    if (!mediaId) continue;
    const res = await seccheck.submitMedia(mediaId);
    if (res.ok && res.traceId && !traceId) traceId = res.traceId;
  }
  if (traceId) {
    await db_setTrace(fb.id, traceId);
  }
  return fb;
}

/** 记 trace_id（DAO 里没单列一个方法，直接走查询） */
async function db_setTrace (id, traceId) {
  const db = require('../db');
  await db.query(
    'UPDATE feedbacks SET media_trace_id = $2 WHERE id = $1',
    [Number(id), String(traceId)]
  );
}

/** 处理反馈 —— 护栏在 DAO（选了「只回话」却没写回复会被拒） */
async function resolve (id, payload) {
  const fb = await fbDao.resolve(id, payload);
  if (!fb) {
    const e = new Error('这条反馈不存在');
    e.code = 'NOT_FOUND';
    throw e;
  }
  return fb;
}

module.exports = {
  submit: submit,
  resolve: resolve
};
