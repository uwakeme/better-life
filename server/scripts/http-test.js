/**
 * 对着真实实例跑一遍接口用例
 *
 * 职责：联调用 —— 起一个实例（或打已有实例），把 cases.js 的用例跑一遍。
 * 与 selftest.js 的区别：selftest 固定跑内存库；这里可以打真实 PG 的实例，
 * 用来验「同一份断言在真实数据库上也成立」。
 *
 * 用法：
 *   node server/scripts/http-test.js --memory          # 起一个内存库实例再打自己
 *   node server/scripts/http-test.js                   # 用 DATABASE_URL 连真库
 *   node server/scripts/http-test.js --base=http://127.0.0.1:8080   # 打已有实例
 */
const http = require('http');
const db = require('../src/db');
const vectorStore = require('../src/services/vector-store');
const { createApp } = require('../src/app');
const { seed } = require('./seed');
const { runCases, report } = require('./cases');

function arg (name) {
  const hit = process.argv.find(function (a) { return a.indexOf('--' + name + '=') === 0; });
  return hit ? hit.slice(('--' + name + '=').length) : '';
}

function hasFlag (name) {
  return process.argv.indexOf('--' + name) >= 0;
}

/** 走真实 HTTP 的 request（method, path, body, token） */
function makeRequest (base) {
  return function (method, path, body, token) {
    return new Promise(function (resolve, reject) {
      const url = new URL(path, base);
      const headers = { 'content-type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
      if (payload) headers['content-length'] = payload.length;
      const req = http.request({
        method: method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: headers
      }, function (res) {
        let raw = '';
        res.on('data', function (c) { raw += c; });
        res.on('end', function () {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };
}

async function run () {
  const base = arg('base');
  if (base) {
    console.log('对着已有实例跑：' + base);
    const results = await runCases(makeRequest(base));
    const failed = report(results);
    process.exit(failed ? 1 : 0);
    return;
  }

  const memory = hasFlag('memory') || !process.env.DATABASE_URL;
  await db.init({ memory: memory });
  if (memory) {
    await db.tx(async function (client) { return seed(client); });
  }
  await vectorStore.detect();

  const app = createApp();
  const server = await new Promise(function (resolve) {
    const s = app.listen(0, function () { resolve(s); });
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  console.log('本地实例：' + url + (memory ? '（内存库）' : '（真实库）'));

  let results = [];
  try {
    results = await runCases(makeRequest(url));
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    await db.close();
  }
  const failed = report(results);
  process.exit(failed ? 1 : 0);
}

run().catch(function (err) {
  console.error('联调崩了：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});