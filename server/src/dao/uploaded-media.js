const db = require('../db');

const UPLOAD_TTL_MS = 30 * 60 * 1000;

async function recordUpload (url, openid) {
  await db.query(
    'INSERT INTO uploaded_media (url, openid, created_at) VALUES ($1, $2, NOW()) ' +
    'ON CONFLICT (url, openid) DO UPDATE SET created_at = NOW()',
    [String(url), String(openid)]
  );
}

async function ownedUrls (urls, openid) {
  const list = Array.isArray(urls) ? urls : [];
  const out = new Set();
  if (!list.length) return out;
  const params = [String(openid), new Date(Date.now() - UPLOAD_TTL_MS).toISOString()].concat(list);
  const placeholders = list.map(function (_, i) { return '$' + (i + 3); }).join(',');
  const res = await db.query(
    'SELECT url FROM uploaded_media WHERE openid = $1 AND created_at >= $2 AND url IN (' + placeholders + ')',
    params
  );
  for (const row of res.rows) out.add(String(row.url));
  if (Math.random() < 0.02) {
    await db.query('DELETE FROM uploaded_media WHERE created_at < $1', [params[1]]);
  }
  return out;
}

module.exports = { recordUpload, ownedUrls, UPLOAD_TTL_MS };
