/**
 * Express 应用组装
 *
 * 职责：把中间件与路由拼起来，返回一个可测试的 app 实例。
 * 为什么单独拆：自检脚本要在内存库里起一个 app 跑 26 组接口用例，
 * 不能每次都真的 listen 一个端口。
 */
const express = require('express');
const publicRoutes = require('./routes/public');
const meRoutes = require('./routes/me');
const searchRoutes = require('./routes/search');
const adminRoutes = require('./routes/admin');
const seccheckRoutes = require('./routes/seccheck');
const { notFound, errorHandler } = require('./middleware/error');

function createApp () {
  const app = express();

  /* 反馈附图走 base64 的 JSON 体，body 要留够 */
  app.use(express.json({ limit: '8mb' }));

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
