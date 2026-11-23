/**
 * 依据链接校验
 *
 * 职责：把「这条依据的链接还打得开吗」变成一条命令。
 * 为什么必须有：依据是这个库的全部价值所在 —— 链接点不开，整条经验就只是断言。
 *   本项目不接受示意链接与占位域名，宁可少几条也不能拿假链接充数。
 *
 * 用法：
 *   node scripts/verify-links.js                    # 校验 data/experiences.json 里的全部依据
 *   node scripts/verify-links.js --min=95           # 可达率门槛（默认 95）
 *   node scripts/verify-links.js --candidates=候选.json # 校验候选链接，并输出标题与日期
 *   node scripts/verify-links.js --json             # 输出机器可读的结果
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** 示意链接的域名 —— 这些一律不允许出现在交付物里 */
const BLOCKED_HOSTS = [
  'example.com', 'example.org', 'example.net', 'localhost',
  'dxy.com', 'zhihu.com', 'bilibili.com', 'baidu.com', 'so.com', 'sogou.com'
];

function arg (name) {
  const hit = process.argv.find((a) => a.indexOf('--' + name + '=') === 0);
  return hit ? hit.slice(('--' + name + '=').length) : '';
}

function hasFlag (name) {
  return process.argv.indexOf('--' + name) >= 0;
}

function hostOf (url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
}

/** 抽页面标题 */
function pickTitle (html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** 抽发布日期 —— 优先 meta，其次正文里的日期 */
function pickDate (html) {
  const metas = [
    /<meta[^>]+(?:name|property)=["'](?:pubdate|publishdate|article:published_time|date|weibo:article:create_at)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:pubdate|publishdate|article:published_time)["']/i
  ];
  for (const re of metas) {
    const m = html.match(re);
    if (m) {
      const d = m[1].match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
      if (d) return d[1] + '-' + String(d[2]).padStart(2, '0') + '-' + String(d[3]).padStart(2, '0');
    }
  }
  const m2 = html.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (m2) return m2[1] + '-' + String(m2[2]).padStart(2, '0') + '-' + String(m2[3]).padStart(2, '0');
  return '';
}

/** 探测一个链接 */
async function check (url, withBody) {
  const out = { url: url, status: 0, title: '', date: '', host: hostOf(url), error: '' };
  const opts = {
    method: withBody ? 'GET' : 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
      /* 有些站点（科普中国等）对没有 Referer 的请求直接回 405，
         带上同源 Referer 才拿得到正文 */
      'referer': (function () {
        try { return new URL(url).origin + '/'; } catch (e) { return ''; }
      })()
    }
  };
  /**
   * 先 HEAD 后 GET。
   * 为什么不能只用 HEAD：不少政府站与媒体站对 HEAD 直接回 403/405/500，
   * 但 GET 正常返回 —— 只探 HEAD 会把好链接误判成失效。
   */
  async function once (method) {
    const res = await fetch(url, Object.assign({}, opts, { method: method }));
    if (!res.ok) return { ok: false, status: res.status, html: '' };
    if (!withBody) {
      /* 不读正文，但要断开连接，否则连接会挂着 */
      try { await res.arrayBuffer(); } catch (e) { /* 读不完整也没关系 */ }
      return { ok: true, status: res.status, html: '' };
    }
    const html = await res.text();
    return { ok: true, status: res.status, html: html };
  }
  try {
    let r = await once('HEAD');
    if (!r.ok) r = await once('GET');
    out.status = r.status;
    out.ok = r.ok;
    if (r.html) {
      out.title = pickTitle(r.html);
      out.date = pickDate(r.html);
      out.bytes = r.html.length;
    }
    if (!r.ok) out.error = 'HTTP ' + r.status;
  } catch (e) {
    out.error = String(e && e.message ? e.message : e).slice(0, 80);
  }
  out.ok = out.status >= 200 && out.status < 400;
  return out;
}

/** 并发跑（一次最多 CONCURRENCY 个） */
async function checkAll (urls, withBody) {
  const CONCURRENCY = 6;
  const results = new Array(urls.length);
  let cursor = 0;
  async function worker () {
    while (cursor < urls.length) {
      const i = cursor++;
      results[i] = await check(urls[i], withBody);
    }
  }
  const pool = [];
  for (let i = 0; i < CONCURRENCY; i++) pool.push(worker());
  await Promise.all(pool);
  return results;
}

async function main () {
  const candidates = arg('candidates');
  const min = Number(arg('min') || 95);
  const asJson = hasFlag('json');

  let urls = [];
  if (candidates) {
    const file = path.isAbsolute(candidates) ? candidates : path.join(ROOT, candidates);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    urls = raw.map((x) => (typeof x === 'string' ? x : x.url)).filter(Boolean);
  } else {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'experiences.json'), 'utf8'));
    const arr = Array.isArray(data) ? data : (data.experiences || []);
    for (const e of arr) {
      for (const s of e.sources || []) {
        if (s.url) urls.push(s.url);
      }
    }
  }

  /* 重复的链接只探一次 */
  const unique = Array.from(new Set(urls));
  const withBody = !!candidates;
  const results = await checkAll(unique, withBody);

  const blocked = results.filter((r) => BLOCKED_HOSTS.indexOf(r.host) >= 0);
  const alive = results.filter((r) => r.ok);
  const dead = results.filter((r) => !r.ok);
  const ratio = results.length ? (alive.length / results.length) * 100 : 100;

  const payload = JSON.stringify({ total: results.length, alive: alive.length, ratio: Math.round(ratio * 10) / 10, results: results }, null, 1);
  const outFile = arg('out');
  if (outFile) {
    /* 自己写文件，别靠 shell 重定向 —— Windows 的 shell 会写成 UTF-16 */
    fs.writeFileSync(path.isAbsolute(outFile) ? outFile : path.join(ROOT, outFile), payload, 'utf8');
    console.log('结果已写入 ' + outFile);
  }
  if (asJson) {
    console.log(payload);
  } else {
    console.log('链接 ' + results.length + ' 个，可达 ' + alive.length + ' 个（' + (Math.round(ratio * 10) / 10) + '%），打不开 ' + dead.length + ' 个');
    if (blocked.length) {
      console.log('');
      console.log('⚠ 占位/不可用来源域名 ' + blocked.length + ' 个：');
      for (const b of blocked) console.log('    · ' + b.host + ' | ' + b.url);
    }
    if (dead.length) {
      console.log('');
      console.log('✗ 打不开的链接 ' + dead.length + ' 个：');
      for (const d of dead) console.log('    · ' + d.status + ' ' + (d.error || '') + ' ' + d.url);
    }
  }

  if (dead.length || blocked.length) process.exit(1);
  if (ratio < min) {
    console.error('可达率 ' + Math.round(ratio * 10) / 10 + '% 低于门槛 ' + min + '%');
    process.exit(1);
  }
}

main().catch(function (err) {
  console.error('链接校验失败：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});