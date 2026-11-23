/**
 * 服务端自检（内存库）
 *
 * 职责：在 pg-mem 内存库里把整套接口跑一遍。
 * 为什么用 pg-mem：本项目没有 CI 的 PG 服务，自检必须能一条命令跑完。
 * 用例本身在 cases.js —— 与 http-test.js 共用同一份断言。
 *
 * 用法：node server/scripts/selftest.js
 */
const http = require('http');
const db = require('../src/db');
const vectorStore = require('../src/services/vector-store');
const { createApp } = require('../src/app');
const { seed } = require('./seed');
const { runCases, report } = require('./cases');

/** 造一个走真实 HTTP 的 request（method, path, body, token） */
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
  await db.init({ memory: true });
  await db.tx(async function (client) { return seed(client); });
  await vectorStore.detect();

  const app = createApp();
  const server = await new Promise(function (resolve) {
    const s = app.listen(0, function () { resolve(s); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  let results = [];
  try {
    results = await runCases(makeRequest(base));
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    await db.close();
  }
  return results;
}

run().then(function (results) {
  const failed = report(results);
  process.exit(failed ? 1 : 0);
}).catch(function (err) {
  console.error('自检崩了：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});