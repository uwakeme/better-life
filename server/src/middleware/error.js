/**
 * 错误处理
 *
 * 职责：把任何抛出来的错误统一转成 { ok: false, error: { code, message } }。
 * 约定：错误码是稳定契约（§8.4），前端按 code 分支处理，不解析 message 文本。
 */
const crypto = require('crypto');

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

/**
 * id 必须是正整数
 * 之前各处直接 Number(id)，'abc' 会变成 NaN 传给数据库，
 * 数据库再抛一个看不懂的类型错误（500 + 原始报错）。
 * 非法 id 在进库之前就该被挡掉 —— 语义上就是「不存在」。
 */
function assertId (id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw fail('NOT_FOUND', '这条内容不存在');
  }
  return n;
}

/** 404 兜底 */
function notFound (req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: '接口不存在：' + req.method + ' ' + req.path }
  });
}

/**
 * 已知的数据库错误码 → 客户端能看懂的说法
 * 23503 外键违例、23505 唯一键违例、22P02 类型转换失败、23514 CHECK 违例
 * 这些是「请求本身不对」，不是服务端坏了 —— 报 400 并说清哪里不对。
 */
const PG_ERRORS = {
  '23503': { status: 400, message: '引用的内容不存在或已被删除' },
  '23505': { status: 400, message: '同样的内容已经存在了' },
  '22P02': { status: 400, message: '参数格式不正确' },
  '23514': { status: 400, message: '内容不符合要求' },
  '23502': { status: 400, message: '缺少必填字段' },
  '57014': { status: 503, message: '服务暂时繁忙，请稍后再试' }
};

/** 错误中间件（必须挂在最后） */
function errorHandler (err, req, res, next) {
  if (res.headersSent) return next(err);
  const requestId = req.id || crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const code = err && err.code ? String(err.code) : 'SERVER';
  let status = ERROR_STATUS[code] || 500;
  let message = (err && err.message) || '服务异常';

  /* 数据库的已知错误 → 映射成人话 */
  const pgCode = err && err.code && typeof err.code === 'string' ? err.code : '';
  if (pgCode && PG_ERRORS[pgCode] && code === 'SERVER') {
    status = PG_ERRORS[pgCode].status;
    message = PG_ERRORS[pgCode].message;
  }

  /* 5xx 必须打日志 —— 设计文档 §15.4 写的「出错先读日志」，
     之前这里一个 console 都没有，出错连痕迹都不留。 */
  if (status >= 500) {
    /* 给一个可追溯的错误编号，用户报障时能对上日志 */
    const errorId = requestId;
    console.error('[error] requestId=' + errorId + ' ' + (req.method || '') + ' ' + (req.originalUrl || req.url || '') +
      ' —— ' + (err && err.stack ? err.stack : message));
    const body = {
      ok: false,
      error: {
        code: 'SERVER',
        /* 5xx 不把原始报错回给客户端 ——
           数据库报错里带着表名、约束名甚至整条 SQL。 */
        message: '服务出了点问题，请稍后重试',
        errorId: errorId
      }
    };
    res.status(status).json(body);
    return;
  }

  const body = {
    ok: false,
    error: {
      code: code,
      message: message
    }
  };
  if (err && err.errors) body.error.errors = err.errors;
  res.status(status).json(body);
}

module.exports = {
  fail: fail,
  assertId: assertId,
  notFound: notFound,
  errorHandler: errorHandler,
  ERROR_STATUS: ERROR_STATUS,
  PG_ERRORS: PG_ERRORS
};
