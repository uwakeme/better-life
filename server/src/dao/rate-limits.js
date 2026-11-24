const db = require('../db');

async function consume (key, windowMs) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const row = await db.queryOne(
    'INSERT INTO rate_limits (bucket_key, window_start, count) VALUES ($1, $3, 1) ' +
    'ON CONFLICT (bucket_key) DO UPDATE SET ' +
    'count = CASE WHEN rate_limits.window_start < $2 THEN 1 ELSE rate_limits.count + 1 END, ' +
    'window_start = CASE WHEN rate_limits.window_start < $2 THEN $3 ELSE rate_limits.window_start END ' +
    'RETURNING count, window_start',
    [key, cutoff, now.toISOString()]
  );
  if (Math.random() < 0.02) {
    await db.query('DELETE FROM rate_limits WHERE window_start < $1', [cutoff]);
  }
  const startedAt = new Date(row.window_start).getTime();
  return {
    count: Number(row.count),
    retryAfterMs: Math.max(0, startedAt + windowMs - now.getTime())
  };
}

module.exports = { consume };
