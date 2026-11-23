/**
 * 端到端契约自检
 *
 * 职责：前端 utils/api.js 调的每一个接口，后端都得真的存在；
 *   后端回的包，前端也得真的解得开。
 * 检查四项：
 *   1. 前端每个 (方法, 路径) 在后端都有对应路由
 *   2. 后端管理端路由都挂在 /api/admin 之下，且那一段挂了登录与管理员校验
 *   3. 响应包 { ok, data } / { ok:false, error } 与前端的拆包逻辑一致（真打一次）
 *   4. 检索结果的结构与页面读法一致（items[].experience）
 *
 * 用法：node scripts/verify-contract.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { group, check, eq, report } = require('./_kit');

const ROOT = path.resolve(__dirname, '..');

/** 前端方法名 → HTTP 动词 */
const METHOD = { get: 'GET', post: 'POST', put: 'PUT', del: 'DELETE', patch: 'PATCH', upload: 'POST' };

/** 把路径里的 :xxx 统一成 :id，两边才能对上 */
function norm (p) {
  return String(p).replace(/:[A-Za-z_][\w]*/g, ':id').replace(/\/+$/, '');
}

/** 去掉注释，但保留字符串字面量（注释里出现的 cloud.get( 不能算数） */
function stripComments (src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src.charAt(i);
    const c2 = src.substr(i, 2);
    if (quote) {
      out += c;
      if (c === '\\') { out += src.charAt(i + 1); i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c2 === '//') { while (i < src.length && src.charAt(i) !== '\n') i += 1; continue; }
    if (c2 === '/*') {
      i += 2;
      while (i < src.length && src.substr(i, 2) !== '*/') i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    out += c;
    i += 1;
  }
  return out;
}

/** 从 open 处的左括号开始，读出一层的参数列表 */
function readArgs (src, open) {
  const args = [];
  let depth = 0;
  let cur = '';
  let quote = null;
  for (let i = open + 1; i < src.length; i += 1) {
    const c = src.charAt(i);
    if (quote) {
      cur += c;
      if (c === '\\') { cur += src.charAt(i + 1); i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) { args.push(cur); return args; }
      depth -= 1;
      cur += c;
      continue;
    }
    if (c === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += c;
  }
  args.push(cur);
  return args;
}

/** 按顶层分隔符拆片段（括号与字符串里的不算） */
function splitTop (src, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const c = src.charAt(i);
    if (quote) {
      cur += c;
      if (c === '\\') { cur += src.charAt(i + 1); i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') { depth -= 1; cur += c; continue; }
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

/**
 * 把一段路径表达式还原成模板路径。
 * 字面量片段原样保留，变量片段（id / body.id / opts.id）统一换成 :id，
 * 拼接完成后再归一化 —— '/api/admin/experiences/' + id + '/publish'
 * 读出来才是 '/api/admin/experiences/:id/publish'，不会把后缀吃掉。
 */
function buildPath (expr) {
  const parts = splitTop(expr, '+');
  let p = '';
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const q = t.charAt(0);
    if ((q === "'" || q === '"' || q === '`') && t.charAt(t.length - 1) === q) {
      p += t.slice(1, -1);
    } else {
      p += ':id';
    }
  }
  return p || null;
}

/** 前端调用的接口清单 */
function frontendCalls () {
  const text = stripComments(fs.readFileSync(path.join(ROOT, 'utils', 'api.js'), 'utf8'));
  const out = [];
  const re = /cloud\.(get|post|put|del|patch|upload)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const verb = METHOD[m[1]];
    const open = m.index + m[0].length - 1;
    const args = readArgs(text, open);
    if (!args.length) continue;
    const p = buildPath(args[0]);
    if (!p) continue;
    out.push({ verb: verb, path: norm(p), raw: (m[1] + ' ' + p).slice(0, 70) });
  }
  return out;
}

/** 后端声明的路由 */
function backendRoutes () {
  const dir = path.join(ROOT, 'server', 'src', 'routes');
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const re = /router\.(get|post|put|delete|patch)\(\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(text))) {
      out.push({ verb: m[1].toUpperCase(), path: norm(m[2]), file: name });
    }
  }
  return out;
}

function request (base, method, path, body, token) {
  return new Promise(function (resolve, reject) {
    const url = new URL(path, base);
    const headers = { 'content-type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    if (payload) headers['content-length'] = payload.length;
    const req = http.request({
      method: method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, headers: headers
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
}

async function main () {
  const calls = frontendCalls();
  const routes = backendRoutes();

  /* 人工核对用：把两端清单打出来对 */
  if (process.argv.indexOf('--list') >= 0) {
    console.log('前端调用 ' + calls.length + ' 条：');
    calls.forEach(function (c) { console.log('  ' + c.verb.padEnd(6) + c.path); });
    console.log('后端路由 ' + routes.length + ' 条：');
    routes.forEach(function (x) { console.log('  ' + x.verb.padEnd(6) + x.path + '   [' + x.file + ']'); });
    return;
  }

  group('前端调用的接口都有后端路由');
  check('前端至少调了 20 个接口', calls.length >= 20, '实际 ' + calls.length);
  const missing = calls.filter(function (c) {
    return !routes.some(function (r) { return r.verb === c.verb && r.path === c.path; });
  });
  check('每个调用都有对应路由', missing.length === 0,
    missing.map((m) => m.verb + ' ' + m.path).join('；'));

  group('管理端路由');
  const adminRoutes = routes.filter((r) => r.path.indexOf('/api/admin') === 0);
  check('管理端路由都在 /api/admin 之下', adminRoutes.length > 0, adminRoutes.length + ' 条');
  const adminText = fs.readFileSync(path.join(ROOT, 'server', 'src', 'routes', 'admin.js'), 'utf8');
  check('管理端挂了登录与管理员校验',
    /router\.use\('\/api\/admin',\s*requireAuth,\s*requireAdmin\)/.test(adminText),
    '没找到 router.use(\'/api/admin\', requireAuth, requireAdmin)');
  const adminCalls = calls.filter((c) => c.path.indexOf('/api/admin') === 0);
  check('前端的��理端调用都在 /api/admin 之下', adminCalls.length > 0, adminCalls.length + ' 条');
  const strayAdmin = calls.filter(function (c) {
    return /admin/.test(c.path) && c.path.indexOf('/api/admin/') !== 0;
  });
  check('没有绕开 /api/admin 的管理端调用', strayAdmin.length === 0,
    strayAdmin.map((s) => s.path).join('；'));

  group('响应包');
  const db = require('../server/src/db');
  const { createApp } = require('../server/src/app');
  const { seed } = require('../server/scripts/seed');
  await db.init({ memory: true });
  await db.tx(async function (client) { return seed(client); });
  const app = createApp();
  const server = await new Promise(function (resolve) {
    const s = app.listen(0, function () { resolve(s); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    let r = await request(base, 'GET', '/api/categories');
    check('成功响应是 { ok, data }', r.body && r.body.ok === true && !!r.body.data,
      JSON.stringify(r.body).slice(0, 120));
    check('data 里就是页面要用的字段', !!(r.body.data.categories && r.body.data.tags));
    r = await request(base, 'GET', '/api/nope');
    check('失败响应是 { ok:false, error:{code,message} }',
      r.body && r.body.ok === false && !!(r.body.error && r.body.error.code && r.body.error.message),
      JSON.stringify(r.body).slice(0, 120));

    group('检索结果结构');
    r = await request(base, 'POST', '/api/search', { query: '洗发水' });
    const items = (r.body.data && r.body.data.items) || [];
    check('items 是数组', Array.isArray(items));
    check('每条都是 { experience, matchedOn }', items.every(function (x) {
      return x.experience && x.experience.id && x.experience.title && Array.isArray(x.matchedOn);
    }), JSON.stringify(items[0] || {}).slice(0, 160));
    check('mode 与前端读法一致', typeof (r.body.data || {}).mode === 'string');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    await db.close();
  }

  const failed = report('端到端契约自检');
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error('契约自检崩了：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});