/**
 * 重建搜索索引
 *
 * 职责：把「内容改了但索引没跟上」这件事变成一条命令。
 * 什么时候需要跑：改了 embedding 模型、换了 provider、批量改过内容，
 * 或者 /api/health 报出索引缺失。
 *
 * 用法：
 *   node server/scripts/reindex.js                  # 全量重建
 *   node server/scripts/reindex.js --exp=12         # 只重建第 12 条
 *   node server/scripts/reindex.js --since=2026-11-01   # 只重建这段时间改过的
 *   node server/scripts/reindex.js --memory         # 在内存库上跑一遍（要先有数据）
 */
const config = require('../src/config');
const db = require('../src/db');
const vectorStore = require('../src/services/vector-store');
const expService = require('../src/services/experiences');

function arg (name) {
  const hit = process.argv.find(function (a) { return a.indexOf('--' + name + '=') === 0; });
  return hit ? hit.slice(('--' + name + '=').length) : '';
}

function hasFlag (name) {
  return process.argv.indexOf('--' + name) >= 0;
}

async function run () {
  /* ⚠️ 判断依据必须走 config —— config.js 把 .env 解析进 fileEnv，不写 process.env，
     所以直接读 process.env.DATABASE_URL 的话，按 README 把库配进 .env 之后
     这里会静默选成内存库，重建完就退出，真库的索引根本没动。 */
  const memory = hasFlag('memory') || !config.databaseUrl;
  await db.init({ memory: memory });
  console.log('目标库：' + (memory ? '内存库（跑完即弃，不落库）' : '真实数据库（' + config.databaseUrl.replace(/:[^:@/]*@/, ':***@') + '）'));
  /* 内存库是空的，先把种子灌进去，否则重建索引只能空跑 */
  if (memory) {
    const { seed } = require('./seed');
    await db.tx(async function (client) { return seed(client); });
  }
  await vectorStore.detect();

  const expId = arg('exp');
  const since = arg('since');
  let total = 0;
  let touched = 0;

  if (expId) {
    const out = await expService.reindexOne(expId);
    console.log('已重建第 ' + out.id + ' 条经验的索引，共 ' + out.documents + ' 个文档。');
    await db.close();
    return;
  }

  const out = await expService.reindexAll({ since: since });
  total = out.documents;
  touched = out.experiences;
  console.log('处理 ' + touched + ' 条已发布经验，重建 ' + total + ' 个索引文档，失败 ' + out.failed + ' 条。');
  await db.close();
  if (out.failed) process.exitCode = 1;
}

run().catch(function (err) {
  console.error('重建索引失败：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});