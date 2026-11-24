const config = require('../config');
const fbDao = require('../dao/feedbacks');
const seccheck = require('./seccheck');
const expDao = require('../dao/experiences');
const uploadedMedia = require('../dao/uploaded-media');

const MAX_CONTENT_LENGTH = 2500;

function dayStartIso () {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** uploadimg 返回的是 mmbiz.qpic.cn 下的公网素材地址，不接受任意外部 URL。 */
function isAllowedImageUrl (value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  let url;
  try { url = new URL(value); } catch (e) { return false; }
  return (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.hostname.toLowerCase() === 'mmbiz.qpic.cn' && !url.port &&
    !url.username && !url.password && !url.search && !url.hash &&
    /^\/mmbiz_(?:jpg|jpeg|png|gif|webp)\/[^/?#]+/i.test(url.pathname);
}

function validateImages (value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('图片格式不正确'), { code: 'VALIDATION' });
  }
  if (value.length > config.feedbackImageMax) {
    throw Object.assign(new Error('最多只能附 ' + config.feedbackImageMax + ' 张图片'), { code: 'VALIDATION' });
  }
  return value.map(function (image) {
    if (!image || typeof image !== 'object' || Array.isArray(image) || !isAllowedImageUrl(image.url)) {
      throw Object.assign(new Error('图片地址无效，请使用本系统上传的图片'), { code: 'VALIDATION' });
    }
    return { url: image.url };
  });
}

async function submit (openid, payload) {
  const p = payload || {};
  const kind = String(p.kind || '');
  if (fbDao.KINDS.indexOf(kind) < 0) {
    throw Object.assign(new Error('请选择反馈类型'), { code: 'VALIDATION' });
  }
  const content = String(p.content || '').trim();
  if (!content) throw Object.assign(new Error('请填写反馈内容'), { code: 'VALIDATION' });
  if (content.length > MAX_CONTENT_LENGTH) {
    throw Object.assign(new Error('内容太长了，请控制在 ' + MAX_CONTENT_LENGTH + ' 字以内'), { code: 'VALIDATION' });
  }
  const images = validateImages(p.images);
  if (images.length) {
    const owned = await uploadedMedia.ownedUrls(images.map(function (image) { return image.url; }), openid);
    if (images.some(function (image) { return !owned.has(image.url); })) {
      throw Object.assign(new Error('图片已过期或不属于当前账号，请重新上传'), { code: 'VALIDATION' });
    }
  }

  const targetType = p.targetType === 'experience' ? 'experience' : 'project';
  let targetId = null;
  if (targetType === 'experience') {
    targetId = Number(p.targetId);
    const exp = await expDao.getById(targetId, { publishedOnly: true });
    if (!exp) throw Object.assign(new Error('这条经验不存在或已下线'), { code: 'NOT_FOUND' });
  }

  const check = await seccheck.checkText(content, openid);
  if (!check.ok) {
    throw Object.assign(new Error(check.message || '内容未通过安全检查'), { code: check.code || 'CONTENT_REJECTED' });
  }

  const fb = await fbDao.insertWithQuota({
    targetType: targetType,
    targetId: targetId,
    openid: openid,
    kind: kind,
    content: content,
    images: images
  }, config.rateLimit.feedbackPerDay, dayStartIso());

  if (!images.length) return fb;
  let reviewed = fb;
  for (let i = 0; i < images.length; i++) {
    let result;
    try {
      result = await seccheck.submitMedia(images[i].url, openid);
    } catch (e) {
      result = { ok: false };
    }
    const saved = result && result.ok && result.skipped
      ? { ok: true, skipped: true }
      : result && result.ok && result.traceId
        ? { ok: true, traceId: result.traceId }
        : { ok: false };
    reviewed = await fbDao.setImageReviewResult(fb.id, i, saved) || reviewed;
    if (!saved.ok) {
      await fbDao.remove(fb.id);
      throw Object.assign(new Error('图片送审失败，请稍后重试'), { code: 'CONTENT_REJECTED' });
    }
  }
  return reviewed || fb;
}

async function resolve (id, payload) {
  const fb = await fbDao.resolve(id, payload);
  if (!fb) throw Object.assign(new Error('这条反馈不存在'), { code: 'NOT_FOUND' });
  return fb;
}

module.exports = {
  submit: submit,
  resolve: resolve,
  validateImages: validateImages,
  isAllowedImageUrl: isAllowedImageUrl
};
