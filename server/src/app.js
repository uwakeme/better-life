/**
 * Express 应用组装
 *
 * 职责：把中间件与路由拼起来，返回一个可测试的 app 实例。
 * 为什么单独拆：自检脚本在内存库里起一个临时端口实例跑 19 组接口用例，
 * 用完就关 —— 不用每次都手动起服务再打。
 */
const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const publicRoutes = require('./routes/public');
const meRoutes = require('./routes/me');
const searchRoutes = require('./routes/search');
const adminRoutes = require('./routes/admin');
const seccheckRoutes = require('./routes/seccheck');
const { notFound, errorHandler } = require('./middleware/error');

function createApp () {
  const app = express();

  /*
   * 反向代理信任层数。
   * ⚠️ 不配的话，部署在 nginx 后面时 req.ip 全是代理地址，
   *    匿名检索的限流全站共用一个桶（设计文档 §8.4 的 30 次/分钟会变成全站 30 次）。
   *    部署方需要在 .env 里配 TRUST_PROXY=1，并让 nginx 透传 X-Forwarded-For。
   */
  if (config.trustProxy > 0) {
    app.set('trust proxy', config.trustProxy);
  }

  app.use(function (req, res, next) {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  /* 上传大请求体在鉴权与限流之后解析，其余接口保持 100KB 上限。 */
  app.use(function (req, res, next) {
    if (/^\/api\/upload\/?$/i.test(req.path)) return next();
    return express.json({ limit: '100kb' })(req, res, next);
  });

  app.use(publicRoutes);
  app.use(meRoutes);
  app.use(searchRoutes);
  app.use(adminRoutes);
  app.use(seccheckRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp: createApp };
