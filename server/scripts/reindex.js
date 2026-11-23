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
const db = require('../src/db');
const vectorStore = require('../src/services/vector-store');
const expDao = require('../src/dao/experiences');
const expService = require('../src/services/experiences');

function arg (name) {
  const hit = process.argv.find(function (a) { return a.indexOf('--' + name + '=') === 0; });
  return hit ? hit.slice(('--' + name + '=').length) : '';
}

function hasFlag (name) {
  return process.argv.indexOf('--' + name) >= 0;
}

async function run () {
  const memory = hasFlag('memory') || !process.env.DATABASE_URL;
  await db.init({ memory: memory });
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

  const list = await expDao.listForAdmin({ size: 1000 });
  for (const item of list.items) {
    if (item.status !== 'published') continue;
    if (since) {
      const updated = String(item.updatedAt || '');
      if (updated.slice(0, 10) < since) continue;
    }
    touched++;
    try {
      const out = await expService.reindexOne(item.id);
      total += out.documents;
      process.stdout.write('.');
    } catch (e) {
      console.log('\n第 ' + item.id + ' 条失败：' + (e && e.message ? e.message : e));
    }
  }
  console.log('');
  console.log('处理 ' + touched + ' 条已发布经验，重建 ' + total + ' 个索引文档。');
  await db.close();
}

run().catch(function (err) {
  console.error('重建索引失败：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});