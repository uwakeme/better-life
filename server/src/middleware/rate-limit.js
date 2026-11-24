const crypto = require('crypto');
const rateLimits = require('../dao/rate-limits');
const { fail } = require('./error');

function rateLimit (options) {
  const opts = options || {};
  const windowMs = Number(opts.windowMs) || 60000;
  const max = Number(opts.max) || 30;
  return async function (req, res, next) {
    try {
      const identity = String(await opts.key(req));
      const route = req.route && req.route.path ? req.route.path : 'unknown';
      const scope = opts.scope || req.method + ' ' + route;
      const digest = crypto.createHash('sha256').update(scope + '\n' + identity).digest('hex');
      const result = await rateLimits.consume(scope + ':' + digest, windowMs);
      if (result.count > max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
        throw fail('RATE_LIMITED', '操作太频繁，请稍后再试');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { rateLimit };
