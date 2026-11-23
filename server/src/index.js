/**
 * 服务端启动入口
 *
 * 职责：连库 → 探测向量库能力 → 起 HTTP 服务。
 * 约定：启动前先体检配置，缺关键配置直接失败并说清缺哪一项 ——
 *       不能"先跑起来再说"，那会在半夜出问题。
 */
const config = require('./config');
const db = require('./db');
const vectorStore = require('./services/vector-store');
const embedding = require('./services/embedding');
const { createApp } = require('./app');

async function main () {
  config.assertProductionConfig();

  const mode = await db.init();
  const store = await vectorStore.detect();

  const app = createApp();
  const server = app.listen(config.port, function () {
    console.log('better-life 后端已启动');
    console.log('  端口：' + config.port);
    console.log('  数据库：' + mode.mode);
    console.log('  向量库：' + store + (store === 'memory' ? '（降级：精确余弦暴力检索）' : ''));
    console.log('  embedding：' + embedding.provider + ' / ' + embedding.model);
    if (embedding.provider === 'local') {
      console.log('  提示：当前是 local 哈希 embedding，检索会如实报 mode=keyword');
    }
  });

  function shutdown () {
    server.close(function () {
      db.close().then(function () { process.exit(0); });
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(function (err) {
  console.error('启动失败：' + (err && err.message ? err.message : err));
  process.exit(1);
});
