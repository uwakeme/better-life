const assert = require('assert').strict;
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const db = require('../src/db');
const config = require('../src/config');
const vectorStore = require('../src/services/vector-store');
const search = require('../src/services/search');
const expDao = require('../src/dao/experiences');
const expService = require('../src/services/experiences');
const sdDao = require('../src/dao/search-documents');
const usersDao = require('../src/dao/users');
const rateLimits = require('../src/dao/rate-limits');
const uploadedMedia = require('../src/dao/uploaded-media');
const { decodeBase64Image } = require('../src/lib/image');
const { fetchWithTimeout } = require('../src/lib/http');
const tokenUtil = require('../src/services/token');
const wechat = require('../src/services/wechat');
const fbDao = require('../src/dao/feedbacks');
const fbService = require('../src/services/feedbacks');
const seccheck = require('../src/services/seccheck');
const { toCamel, toDateOnly } = require('../src/lib/to-camel');
const { seed } = require('./seed');

let passed = 0;
let failed = 0;
let seedOut;
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function test (name, fn) {
  try {
    await fn();
    passed++;
    console.log('✓ ' + name);
  } catch (err) {
    failed++;
    console.error('✗ ' + name + '\n' + (err.stack || err));
  }
}

function payload (title, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({ id: 'p' + i, stance: i % 2 ? 'bad' : 'good', title: '要点' + i,
      detail: '具体细节' + i, appliesTo: '全部' });
  }
  return {
    title: title, summary: '结论' + title, body: '正文' + title, categoryId: 1,
    keywords: [title], points: points, tagIds: [], status: 'published',
    sources: [{ title: '依据', url: 'https://example.org/source', pointIds: points.map(function (p) { return p.id; }) }]
  };
}

async function docsFor (id) {
  const res = await db.query(
    'SELECT id, doc_type, ref_id FROM search_documents WHERE ' +
    "(doc_type = 'experience' AND ref_id = $1) OR (doc_type = 'point' AND ref_id IN " +
    '(SELECT id FROM points WHERE experience_id = $1))', [Number(id)]
  );
  return res.rows;
}

function request (base, method, path, body, headers) {
  return new Promise(function (resolve, reject) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(new URL(path, base), {
      method: method,
      headers: Object.assign({ 'content-type': 'application/json' }, data ? {
        'content-length': data.length
      } : {}, headers || {})
    }, function (res) {
      let raw = '';
      res.on('data', function (chunk) { raw += chunk; });
      res.on('end', function () {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main () {
  await db.init({ memory: true });
  seedOut = await db.tx(async function (client) { return seed(client); });
  await vectorStore.detect();

  await test('SQL 与 JS 归一一致，高亮保留原文标点空白', async function () {
    for (const text of [' 型，再\t！ ', 'ＡＢＣ　１２３', '洗 护', 'foo_bar-baz']) {
      const row = await db.queryOne('SELECT better_normalize($1) AS n', [text]);
      assert.equal(row.n, search.normalize(text));
    }
    const source = '先 定头皮，型！再判断';
    const parts = search.highlight(source, search.bigrams('型，再'));
    assert.equal(parts.map(function (part) { return part[0]; }).join(''), source);
    assert.ok(parts.some(function (part) { return part[1] && part[0] === '型！再'; }));
    for (const query of ['型，再', '型再', '成膜剂', '洗护']) {
      const result = await search.search({ query: query });
      assert.ok(result.items.some(function (item) { return item.experience.id === 1; }), query);
    }
  });

  await test('关键词每类文档仅一批查询，RRF 不使用相对阈值', async function () {
    const original = db.query;
    let calls = 0;
    db.query = async function () { calls++; return original.apply(db, arguments); };
    try { await search.keywordRoute('洗发水', {}); } finally { db.query = original; }
    assert.equal(calls, 3);
    config.search.relativeCutoff = 0.65;
    const result = await search.search({ query: '成分' });
    delete config.search.relativeCutoff;
    assert.ok(result.items.length > 1);
  });

  await test('memory 向量在 TopK 前过滤，pgvector SQL 同条件前置', async function () {
    const rows = await expDao.listForAdmin({ status: 'published', size: 100 });
    const first = rows.items[0];
    const other = rows.items.find(function (item) { return item.categoryId !== first.categoryId; });
    const full = await expDao.getById(first.id);
    const doc = { title: 'test', content: 'test', model: config.embedding.model, dim: 2 };
    await vectorStore.upsert([
      Object.assign({}, doc, { docType: 'experience', refId: other.id, embedding: [1, 0] }),
      Object.assign({}, doc, { docType: 'experience', refId: first.id, embedding: [0.8, 0.2] }),
      Object.assign({}, doc, { docType: 'point', refId: full.points[0].id, embedding: [0.1, 0.1] })
    ]);
    const filtered = await vectorStore.query([1, 0], 1, { categoryIds: [first.categoryId] });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].refId, first.id);
    const unfiltered = await vectorStore.query([1, 0], 1, {});
    assert.equal(unfiltered[0].refId, other.id);

    const oldMemory = db.isMemory;
    const oldOne = db.queryOne;
    const oldQuery = db.query;
    let sql = '';
    try {
      db.isMemory = function () { return false; };
      db.queryOne = async function () { return { ok: 1 }; };
      db.query = async function (text) { sql = text; return { rows: [] }; };
      await vectorStore.detect();
      assert.equal(vectorStore.current(), 'pgvector');
      await vectorStore.query([1, 0], 1, { categoryIds: [first.categoryId], stance: 'good' });
      assert.ok(sql.indexOf('WHERE model = $1 AND') >= 0);
      assert.ok(sql.indexOf('WHERE model = $1 AND') < sql.indexOf('LIMIT 1'));
      assert.equal((sql.match(/status = 'published'/g) || []).length, 2);
      assert.equal((sql.match(/category_id IN/g) || []).length, 2);
    } finally {
      db.isMemory = oldMemory;
      db.queryOne = oldOne;
      db.query = oldQuery;
      await vectorStore.detect();
      await vectorStore.loadMemory();
    }
    await expService.reindexOne(first.id);
    await expService.reindexOne(other.id);
  });

  await test('编辑替换无孤儿，索引删除插入失败可回滚', async function () {
    const created = await expService.save(payload('原子索引回归', 2));
    const id = created.id;
    const oldDocs = await docsFor(id);
    assert.equal(oldDocs.length, 3);
    await expService.save(Object.assign(payload('原子索引回归改', 3), { id: id }));
    const currentDocs = await docsFor(id);
    assert.equal(currentDocs.length, 4);
    const orphanAfterEdit = await db.queryOne(
      'SELECT count(*) AS n FROM search_documents sd ' +
      "LEFT JOIN experiences e ON sd.doc_type = 'experience' AND e.id = sd.ref_id " +
      "LEFT JOIN points p ON sd.doc_type = 'point' AND p.id = sd.ref_id " +
      "WHERE (sd.doc_type = 'experience' AND e.id IS NULL) OR (sd.doc_type = 'point' AND p.id IS NULL)"
    );
    assert.equal(Number(orphanAfterEdit.n), 0);
    const beforeFailure = currentDocs.map(function (row) { return row.id }).sort();
    const original = sdDao.upsert;
    sdDao.upsert = async function () { throw new Error('injected index insert failure'); };
    try {
      const current = await expDao.getById(id);
      const docs = [{
        docType: 'experience', refId: id, title: current.title, content: current.title,
        model: config.embedding.model, dim: config.embedding.dim, embedding: [1]
      }];
      await assert.rejects(function () {
        return vectorStore.replaceExperience(id, docs, current.points.map(function (point) { return point.id; }));
      }, /injected index insert failure/);
      assert.deepEqual((await docsFor(id)).map(function (row) { return row.id; }).sort(), beforeFailure);
      const saved = await expService.save(Object.assign(payload('原子索引回归再改', 1), { id: id }));
      assert.equal(saved.indexed, false);
      assert.ok(saved.hint);
    } finally { sdDao.upsert = original; }
    assert.equal((await docsFor(id)).length, 0);
    const orphanAfterFailure = await db.queryOne(
      'SELECT count(*) AS n FROM search_documents sd LEFT JOIN points p ' +
      "ON sd.doc_type = 'point' AND p.id = sd.ref_id WHERE sd.doc_type = 'point' AND p.id IS NULL"
    );
    assert.equal(Number(orphanAfterFailure.n), 0);
    await expService.reindexOne(id);
    assert.equal((await docsFor(id)).length, 2);
    const pointDoc = (await docsFor(id)).find(function (row) { return row.doc_type === 'point'; });
    await db.query('DELETE FROM search_documents WHERE id = $1', [pointDoc.id]);
    const missing = await sdDao.listMissingIndex();
    assert.ok(missing.some(function (item) { return item.id === id && item.reason.includes('point-count-mismatch'); }));
    await expService.reindexOne(id);
    assert.equal((await sdDao.listMissingIndex()).some(function (item) { return item.id === id; }), false);
    await expService.remove(id);
    assert.equal((await docsFor(id)).length, 0);
    assert.equal((await db.query('SELECT id FROM points WHERE experience_id = $1', [id])).rows.length, 0);
  });

  await test('全量重建批量读取且失败可见', async function () {
    const original = expDao.getById;
    expDao.getById = async function () { throw new Error('N+1 getById called'); };
    try {
      const out = await expService.reindexAll();
      assert.equal(out.failed, 0);
      assert.ok(out.documents > 0);
    } finally { expDao.getById = original; }
    const orphan = await db.queryOne(
      "SELECT count(*) AS n FROM search_documents sd LEFT JOIN points p ON sd.doc_type = 'point' AND p.id = sd.ref_id " +
      "WHERE sd.doc_type = 'point' AND p.id IS NULL"
    );
    assert.equal(Number(orphan.n), 0);
  });

  await test('公开/管理/收藏分页 total 与聚合正确', async function () {
    const published = await expDao.listPublished({ page: 1, size: 1 });
    assert.equal(published.items.length, 1);
    assert.ok(published.total > 1 && published.items[0].stanceCounts);
    assert.equal(published.items[0].points, undefined);
    const admin = await expDao.listForAdmin({ page: 1, size: 1 });
    assert.equal(admin.items.length, 1);
    assert.ok(admin.total > 1 && Array.isArray(admin.items[0].tagIds));
    const favorites = await usersDao.listFavorites('dev-user', { page: 1, size: 1 });
    assert.equal(favorites.items.length, 1);
    assert.equal(favorites.total, await usersDao.countFavorites('dev-user'));
    assert.ok(favorites.total > 1);
  });

  await test('种子所有经验计数按源表重算并断言', async function () {
    const sums = await db.queryOne(
      'SELECT sum(favorite_count) AS favorites, sum(useful_count) AS useful, ' +
      'sum(not_useful_count) AS bad, sum(feedback_count) AS feedback FROM experiences'
    );
    assert.equal(Number(sums.favorites), seedOut.favorites);
    assert.equal(Number(sums.useful) + Number(sums.bad), seedOut.votes);
    assert.equal(Number(sums.feedback), seedOut.processedFeedbacks);
    assert.equal(Number(sums.favorites), 3);
    const source = await db.queryOne(
      "SELECT count(*) AS n FROM feedbacks WHERE target_type = 'experience' AND status <> 'pending'"
    );
    assert.equal(Number(sums.feedback), Number(source.n));
  });

  await test('图片白名单在落库前校验', async function () {
    const before = await fbDao.countMine('dev-user');
    const invalid = [{}, null, [null], [{ url: '' }], [{ url: 'https://evil.example/a.png' }],
      [{ url: 'https://mmbiz.qpic.cn.evil.example/mmbiz_png/a.png' }],
      [{ url: 'https://mmbiz.qpic.cn/not-an-upload/a.png' }]];
    for (const images of invalid) {
      await assert.rejects(function () {
        return fbService.submit('dev-user', { kind: 'suggestion', content: '非法图片', images: images });
      }, function (err) { return err.code === 'VALIDATION'; });
    }
    assert.equal(await fbDao.countMine('dev-user'), before);
    assert.ok(fbService.isAllowedImageUrl('http://mmbiz.qpic.cn/mmbiz_png/appid/0/image.png'));
  });

  await test('图片送审失败释放配额且不留下半成品', async function () {
    await usersDao.upsertUser('image-failure-user', { role: 'user' });
    const image = { url: 'https://mmbiz.qpic.cn/mmbiz_png/appid/0/failure.png' };
    await uploadedMedia.recordUpload(image.url, 'image-failure-user');
    const before = await fbDao.countMine('image-failure-user');
    const original = seccheck.submitMedia;
    seccheck.submitMedia = async function () { return { ok: false }; };
    try {
      await assert.rejects(function () {
        return fbService.submit('image-failure-user', { kind: 'suggestion', content: '图片送审失败', images: [image] });
      }, function (err) { return err.code === 'CONTENT_REJECTED'; });
    } finally { seccheck.submitMedia = original; }
    assert.equal(await fbDao.countMine('image-failure-user'), before);
  });

  await test('出站超时覆盖响应体读取', async function () {
    const oldFetch = global.fetch;
    global.fetch = async function (url, options) {
      return {
        status: 200,
        arrayBuffer: function () {
          return new Promise(function (resolve, reject) {
            if (options.signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
            options.signal.addEventListener('abort', function () {
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        }
      };
    };
    try {
      const keepAlive = setTimeout(function () {}, 100);
      try {
        await assert.rejects(function () {
          return fetchWithTimeout('https://example.com/stalled-body', {}, 10);
        }, function (err) { return err.code === 'UPSTREAM_TIMEOUT'; });
      } finally { clearTimeout(keepAlive); }
    } finally { global.fetch = oldFetch; }
  });

  await test('图片编码与结构严格校验', async function () {
    assert.equal(decodeBase64Image(png, 1024).length, 68);
    for (const invalid of ['iVBORw==', png + '!', png.slice(0, -4), 'aGVsbG8=']) {
      assert.throws(function () { decodeBase64Image(invalid, 1024); }, function (err) {
        return err.code === 'VALIDATION';
      });
    }
  });

  await test('反馈图片校验上传归属与有效期', async function () {
    await usersDao.upsertUser('media-owner-a', { role: 'user' });
    await usersDao.upsertUser('media-owner-b', { role: 'user' });
    const image = { url: 'https://mmbiz.qpic.cn/mmbiz_png/appid/0/owned.png' };
    await uploadedMedia.recordUpload(image.url, 'media-owner-a');
    await assert.rejects(function () {
      return fbService.submit('media-owner-b', { kind: 'suggestion', content: '冒用图片', images: [image] });
    }, function (err) { return err.code === 'VALIDATION'; });
    await db.query("UPDATE uploaded_media SET created_at = now() - interval '31 minutes' WHERE url = $1", [image.url]);
    await assert.rejects(function () {
      return fbService.submit('media-owner-a', { kind: 'suggestion', content: '过期图片', images: [image] });
    }, function (err) { return err.code === 'VALIDATION'; });
  });

  await test('开发审核跳过不遗留永久 checking', async function () {
    const oldMode = config.seccheckMode;
    try {
      config.seccheckMode = 'dev-skip';
      const image = { url: 'https://mmbiz.qpic.cn/mmbiz_png/appid/0/dev-skip.png' };
      await usersDao.upsertUser('media-dev-skip-user', { role: 'user' });
      await uploadedMedia.recordUpload(image.url, 'media-dev-skip-user');
      const fb = await fbService.submit('media-dev-skip-user', {
        kind: 'suggestion', content: '开发环境图片', images: [image]
      });
      assert.equal(fb.mediaStatus, 'passed');
      assert.equal(fb.images[0].status, 'passed');
      assert.equal(fb.images[0].traceId || '', '');
    } finally { config.seccheckMode = oldMode; }
  });

  await test('多图回调合并不会覆盖彼此结论', async function () {
    const fb = await fbDao.insert({ targetType: 'experience', targetId: 1, openid: 'dev-user',
      kind: 'suggestion', content: '并发回调', images: [
        { url: 'https://mmbiz.qpic.cn/mmbiz_png/a/0/one.png' },
        { url: 'https://mmbiz.qpic.cn/mmbiz_png/a/0/two.png' }
      ] });
    await fbDao.setImageReviewResults(fb.id, [{ ok: true, traceId: 'parallel-one' },
      { ok: true, traceId: 'parallel-two' }]);
    await Promise.all([
      fbDao.applyMediaVerdict(fb.id, 'parallel-one', 'passed'),
      fbDao.applyMediaVerdict(fb.id, 'parallel-two', 'passed')
    ]);
    const after = await fbDao.getById(fb.id);
    assert.equal(after.mediaStatus, 'passed');
    assert.ok(after.images.every(function (image) { return image.status === 'passed'; }));
  });

  await test('审核异常或未知结论一律不放行', async function () {
    const oldMode = config.seccheckMode;
    const oldToken = wechat.getAccessToken;
    const oldConfigured = wechat.isConfigured;
    const oldFetch = global.fetch;
    try {
      config.seccheckMode = 'real';
      wechat.isConfigured = function () { return true; };
      wechat.getAccessToken = async function () { return 'regression-access-token'; };
      global.fetch = async function () {
        return new Response(JSON.stringify({ errcode: 0, result: {} }), { status: 200 });
      };
      const missing = await seccheck.checkText('未知审核结论', 'dev-user');
      assert.equal(missing.ok, false);
      assert.equal(missing.code, 'CONTENT_REJECTED');
    } finally {
      config.seccheckMode = oldMode;
      wechat.getAccessToken = oldToken;
      wechat.isConfigured = oldConfigured;
      global.fetch = oldFetch;
    }
    assert.equal(seccheck.handleCallback({ trace_id: 'x', errcode: 0, result: {} }).result, 'rejected');
    assert.equal(seccheck.handleCallback({ trace_id: 'x', errcode: 0,
      detail: [{ suggest: 'unknown' }] }).result, 'rejected');
    assert.equal(seccheck.handleCallback({ trace_id: 'x', errcode: 0,
      detail: [{ suggest: 'pass' }, { suggest: 'review' }] }).result, 'checking');
  });

  await test('日配额数据库原子，并发仅允许配额内提交', async function () {
    await usersDao.upsertUser('quota-user', { role: 'user' });
    const oldLimit = config.rateLimit.feedbackPerDay;
    config.rateLimit.feedbackPerDay = 2;
    try {
      const results = await Promise.allSettled(Array.from({ length: 8 }, function (_, i) {
        return fbService.submit('quota-user', { kind: 'suggestion', content: '并发配额' + i });
      }));
      assert.equal(results.filter(function (item) { return item.status === 'fulfilled'; }).length, 2);
      assert.equal(results.filter(function (item) { return item.status === 'rejected' &&
        item.reason.code === 'RATE_LIMITED'; }).length, 6);
    } finally { config.rateLimit.feedbackPerDay = oldLimit; }
    assert.equal(await fbDao.countMine('quota-user'), 2);
  });

  await test('并发重复处理反馈只增加一次计数', async function () {
    const fb = await fbDao.insert({ targetType: 'experience', targetId: 1, openid: 'dev-user',
      kind: 'suggestion', content: '并发处理', images: [] });
    const before = await expDao.getById(1);
    const statuses = ['accepted', 'ignored', 'replied', 'accepted'];
    const results = await Promise.allSettled(statuses.map(function (status, i) {
      return fbDao.resolve(fb.id, { status: status, reply: status === 'replied' ? '回复' + i : undefined });
    }));
    assert.ok(results.every(function (item) { return item.status === 'fulfilled'; }));
    const after = await expDao.getById(1);
    assert.equal(after.feedbackCount, before.feedbackCount + 1);
  });

  await test('限流计数数据库原子并支持窗口重置', async function () {
    const key = 'regression:same-client';
    const results = await Promise.all(Array.from({ length: 8 }, function () {
      return rateLimits.consume(key, 60000);
    }));
    assert.deepEqual(results.map(function (item) { return item.count; }).sort(function (a, b) { return a - b; }),
      [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(results.every(function (item) { return item.retryAfterMs > 0; }));
    await db.query("UPDATE rate_limits SET window_start = now() - interval '2 minutes' WHERE bucket_key = $1", [key]);
    const reset = await rateLimits.consume(key, 60000);
    assert.equal(reset.count, 1);
  });

  await test('PGSSL 默认系统 CA，生产禁止显式不安全开关', async function () {
    const old = { ssl: config.pgSsl, ca: config.pgSslCa, insecure: config.pgSslAllowInsecure, env: config.env };
    try {
      config.pgSsl = true;
      config.pgSslCa = '';
      config.pgSslAllowInsecure = false;
      config.env = 'production';
      assert.equal(db.sslConfig().rejectUnauthorized, true);
      config.pgSslAllowInsecure = true;
      assert.throws(function () { db.sslConfig(); }, /生产环境禁止/);
      config.env = 'development';
      assert.equal(db.sslConfig().rejectUnauthorized, false);
    } finally {
      config.pgSsl = old.ssl;
      config.pgSslCa = old.ca;
      config.pgSslAllowInsecure = old.insecure;
      config.env = old.env;
    }
  });

  await test('生产环境真实审核必须配置回调凭证', function () {
    const env = Object.assign({}, process.env, {
      NODE_ENV: 'production', USE_MEMORY_DB: '0', SECCHECK_MODE: 'real',
      TOKEN_SECRET: 'regression-secret', DATABASE_URL: 'postgres://regression/db',
      WECHAT_APPID: 'regression-appid', WECHAT_SECRET: 'regression-wechat-secret',
      MEDIA_CALLBACK_TOKEN: ''
    });
    const code = "const fs=require('fs');fs.existsSync=()=>false;const c=require('./src/config');c.assertProductionConfig()";
    const missing = spawnSync(process.execPath, ['-e', code], {
      cwd: path.resolve(__dirname, '..'), env: env, encoding: 'utf8'
    });
    assert.equal(missing.status, 1);
    assert.ok(String(missing.stderr).includes('MEDIA_CALLBACK_TOKEN'));
    env.MEDIA_CALLBACK_TOKEN = 'regression-callback-token';
    const configured = spawnSync(process.execPath, ['-e', code], {
      cwd: path.resolve(__dirname, '..'), env: env, encoding: 'utf8'
    });
    assert.equal(configured.status, 0, configured.stderr);
  });

  const oldSearchLimit = config.rateLimit.searchPerMinute;
  config.rateLimit.searchPerMinute = 2;
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = await new Promise(function (resolve) { app.listen(0, function () { resolve(this); }); });
  const base = 'http://127.0.0.1:' + server.address().port;

  await test('登录角色可撤销且请求 ID 关联健康错误', async function () {
    const oldAdmins = config.adminOpenids.slice();
    const oldQuery = db.query;
    const oldError = console.error;
    try {
      config.adminOpenids.push('dev-httprevoked');
      let res = await request(base, 'POST', '/api/auth/login', { code: 'httprevoked' });
      assert.equal(res.body.data.user.role, 'admin');
      config.adminOpenids = config.adminOpenids.filter(function (id) { return id !== 'dev-httprevoked'; });
      res = await request(base, 'POST', '/api/auth/login', { code: 'httprevoked' });
      assert.equal(res.body.data.user.role, 'user');
      assert.ok(res.headers['x-request-id']);
      db.query = async function () { throw new Error('raw database secret SELECT password'); };
      let logged = '';
      console.error = function (line) { logged += line; };
      res = await request(base, 'GET', '/api/health');
      assert.equal(res.status, 503);
      assert.equal(res.body.data.error, '数据库暂时不可用');
      assert.equal(res.body.data.errorId, res.headers['x-request-id']);
      assert.equal(JSON.stringify(res.body).includes('raw database secret'), false);
      assert.ok(logged.includes(res.headers['x-request-id']));
    } finally {
      config.adminOpenids = oldAdmins;
      db.query = oldQuery;
      console.error = oldError;
    }
  });

  await test('检索限流跨请求生效并返回等待时间', async function () {
    try {
      for (let i = 0; i < 2; i++) {
        const res = await request(base, 'POST', '/api/search', { query: '限流回归' });
        assert.notEqual(res.status, 429);
      }
      const blocked = await request(base, 'POST', '/api/search', { query: '限流回归' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.code, 'RATE_LIMITED');
      assert.ok(Number(blocked.headers['retry-after']) >= 1);
    } finally { config.rateLimit.searchPerMinute = oldSearchLimit; }
  });

  await test('上传先鉴权、校验图片结构并记录归属', async function () {
    let res = await request(base, 'POST', '/api/upload', {
      data: 'x'.repeat(config.feedbackImageMaxBytes + 1024)
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');

    res = await request(base, 'POST', '/API/UPLOAD/', {
      data: 'x'.repeat(config.feedbackImageMaxBytes + 1024)
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');

    await usersDao.upsertUser('dev-user', { role: 'user' });
    await usersDao.setRole('dev-user', 'admin');
    const adminToken = tokenUtil.sign({ openid: 'dev-user', role: 'admin' });
    const authHeaders = { authorization: 'Bearer ' + adminToken };
    const oldUpload = wechat.uploadImage;
    wechat.uploadImage = async function (buffer, name) {
      assert.equal(name, 'tiny.png');
      assert.ok(buffer.length > 8);
      return { url: 'https://mmbiz.qpic.cn/mmbiz_png/a/0/tiny.png' };
    };
    try {
      res = await request(base, 'POST', '/api/upload', { data: png, filename: 'tiny.png' }, authHeaders);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.url, 'https://mmbiz.qpic.cn/mmbiz_png/a/0/tiny.png');
      assert.ok((await uploadedMedia.ownedUrls([res.body.data.url], 'dev-user')).has(res.body.data.url));
      res = await request(base, 'POST', '/api/upload/', { data: png.slice(0, 16), filename: 'truncated.png' }, authHeaders);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION');
      res = await request(base, 'POST', '/api/upload/', {
        data: 'x'.repeat(config.feedbackImageMaxBytes + 1024)
      }, authHeaders);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION');
    } finally {
      wechat.uploadImage = oldUpload;
    }
  });

  await test('回调时间窗/nonce 重放/终态不回退/header 优先', async function () {
    const oldToken = config.mediaCallbackToken;
    config.mediaCallbackToken = 'regression-token';
    try {
      const fb = await fbDao.insert({ targetType: 'experience', targetId: 1, openid: 'dev-user',
        kind: 'suggestion', content: '回调回归', images: [
          { url: 'https://mmbiz.qpic.cn/mmbiz_png/a/0/one.png' },
          { url: 'https://mmbiz.qpic.cn/mmbiz_png/a/0/two.png' }
        ] });
      await fbDao.setImageReviewResults(fb.id, [{ ok: true, traceId: 'trace-one' },
        { ok: true, traceId: 'trace-two' }]);
      const timestamp = Math.floor(Date.now() / 1000);
      async function callback (trace, suggest, nonce, ts, token) {
        return request(base, 'POST', '/api/seccheck/callback', {
          Event: 'wxa_media_check', trace_id: trace, errcode: 0, result: { suggest: suggest }
        }, { 'x-media-token': token === undefined ? config.mediaCallbackToken : token,
          'x-timestamp': String(ts === undefined ? timestamp : ts), 'x-nonce': nonce });
      }
      let res = await callback('trace-one', 'pass', 'nonce-one');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.result, 'checking');
      res = await callback('trace-two', 'risky', 'nonce-two');
      assert.equal(res.body.data.result, 'rejected');
      res = await callback('trace-one', 'pass', 'nonce-three');
      assert.equal(res.body.data.result, 'rejected');
      res = await callback('trace-two', 'pass', 'nonce-two');
      assert.equal(res.status, 403);
      res = await callback('trace-one', 'pass', 'nonce-stale', timestamp - 600);
      assert.equal(res.status, 403);
      res = await request(base, 'POST', '/api/seccheck/callback?token=' + config.mediaCallbackToken +
        '&timestamp=' + timestamp + '&nonce=header-priority', {
        Event: 'wxa_media_check', trace_id: 'trace-one', errcode: 0, result: { suggest: 'pass' }
      }, { 'x-media-token': 'wrong', 'x-timestamp': String(timestamp), 'x-nonce': 'header-priority' });
      assert.equal(res.status, 403);
      res = await request(base, 'POST', '/api/seccheck/callback?token=' + config.mediaCallbackToken +
        '&timestamp=' + timestamp + '&nonce=query-compatible', {
        Event: 'wxa_media_check', trace_id: 'unmatched-only', errcode: 0, result: { suggest: 'pass' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.matched, false);
      const queried = await fbDao.insert({ targetType: 'experience', targetId: 1, openid: 'dev-user',
        kind: 'suggestion', content: '主动查询', images: [
          { url: 'https://mmbiz.qpic.cn/mmbiz_png/a/0/query.png' }
        ] });
      await fbDao.setImageReviewResults(queried.id, [{ ok: true, traceId: 'query-trace' }]);
      const oldQuery = seccheck.queryMedia;
      seccheck.queryMedia = async function () {
        return { result: 'rejected', message: 'stub verdict' };
      };
      try {
        res = await request(base, 'GET', '/api/seccheck/trace/query-trace', undefined, {
          authorization: 'Bearer ' + tokenUtil.sign({ openid: 'dev-user', role: 'admin' })
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.mediaStatus, 'rejected');
        assert.equal(res.body.data.queried, true);
      } finally {
        seccheck.queryMedia = oldQuery;
      }
      const callbackEarly = await fbDao.insert({ targetType: 'experience', targetId: 1, openid: 'dev-user',
        kind: 'suggestion', content: '提前回调', images: [
          { url: 'https://mmbiz.qpic.cn/mmbiz_png/a/0/early-callback.png' }
        ] });
      res = await callback('early-callback', 'pass', 'early-callback-nonce');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.matched, false);
      res = await callback('early-callback', 'risky', 'early-callback-nonce');
      assert.equal(res.status, 403);
      assert.equal((await fbDao.getById(callbackEarly.id)).mediaStatus, 'checking');
      await fbDao.setImageReviewResult(callbackEarly.id, 0, { ok: true, traceId: 'early-callback' });
      const merged = await fbDao.getById(callbackEarly.id);
      assert.equal(merged.mediaStatus, 'passed');
      assert.equal(merged.images[0].status, 'passed');
      config.mediaCallbackToken = '';
      res = await callback('trace-one', 'pass', 'nonce-no-config');
      assert.equal(res.status, 403);
    } finally { config.mediaCallbackToken = oldToken; }
  });

  await test('日历日期一律按北京时间，与服务器时区无关', async function () {
    // 北京时间 07:30（换成 UTC 还是前一天）要算在北京时间的当天
    assert.equal(toDateOnly(new Date('2026-11-24T07:30:00+08:00')), '2026-11-24');
    // DATE 列若被驱动按本地零点解析（如 Asia/Shanghai），日期不能变
    assert.equal(toDateOnly(new Date('2026-06-03T16:00:00.000Z')), '2026-06-04');
    // 纯日期本身就是日历日期，不做换算；带时区的 ISO 串按北京时间换算
    assert.equal(toDateOnly('2026-06-04'), '2026-06-04');
    assert.equal(toDateOnly('2026-11-24T18:00:00.000Z'), '2026-11-25');
    assert.equal(toDateOnly(null), null);
    assert.equal(toDateOnly(''), '');
    // 走一遍转换层：内存库把 DATE 解析成 UTC 零点，时间戳是绝对时刻
    const row = await db.queryOne(
      "SELECT DATE '2026-06-04' AS reviewed_at, TIMESTAMPTZ '2026-11-23T23:00:00Z' AS created_at");
    const converted = toCamel(row, { numeric: true });
    assert.equal(converted.reviewedAt, '2026-06-04');
    assert.equal(converted.createdAt, '2026-11-24');
    // 没填核查日期时默认是北京时间的今天
    const before = toDateOnly(new Date());
    const saved = await expService.save({ title: '默认核查日期', status: 'draft' });
    const after = toDateOnly(new Date());
    const reviewedAt = (await expDao.getById(saved.id)).reviewedAt;
    assert.ok(reviewedAt === before || reviewedAt === after, reviewedAt);
  });

  await new Promise(function (resolve) { server.close(resolve); });
  await db.close();
  console.log('\n服务端专项回归：' + passed + ' 通过，' + failed + ' 失败。');
  process.exit(failed ? 1 : 0);
}

main().catch(async function (err) {
  console.error(err.stack || err);
  try { await db.close(); } catch (e) {}
  process.exit(1);
});
