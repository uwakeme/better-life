/**
 * 错误处理
 *
 * 职责：把任何抛出来的错误统一转成 { ok: false, error: { code, message } }。
 * 约定：错误码是稳定契约（§8.4），前端按 code 分支处理，不解析 message 文本。
 */
const ERROR_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  CONTENT_REJECTED: 422,
  SERVER: 500
};

/** 抛一个带 code 的错误 */
function fail (code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** 404 兜底 */
function notFound (req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: '接口不存在：' + req.method + ' ' + req.path }
  });
}

/** 错误中间件（必须挂在最后） */
function errorHandler (err, req, res, next) {
  if (res.headersSent) return next(err);
  const code = err && err.code ? String(err.code) : 'SERVER';
  const status = ERROR_STATUS[code] || 500;
  const body = {
    ok: false,
    error: {
      code: code,
      message: (err && err.message) || '服务异常'
    }
  };
  if (err && err.errors) body.error.errors = err.errors;
  res.status(status).json(body);
}

module.exports = {
  fail: fail,
  notFound: notFound,
  errorHandler: errorHandler,
  ERROR_STATUS: ERROR_STATUS
};
