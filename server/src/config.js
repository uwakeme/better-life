/**
 * 环境配置
 *
 * 职责：读 .env 与环境变量，给出唯一的配置出口。
 * 约定：
 *   1. 不引 dotenv —— 自己解析 .env，依赖越少越好（§5.4）。
 *   2. 密钥只从环境变量读，代码里不写死任何 AppSecret / API Key。
 *   3. 缺关键配置时不静默兜底成假数据，而是让启动失败并说清缺哪一项。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** 解析 .env（只认 KEY=VALUE，不做变量插值） */
function loadEnvFile () {
  const file = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === '#') continue;
    const at = trimmed.indexOf('=');
    if (at < 0) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    const first = value.charAt(0);
    if ((first === '"' || first === "'") && value.charAt(value.length - 1) === first) {
      /* 引号里的 # 是值的一部分，不当注释 */
      value = value.slice(1, -1);
    } else {
      /* 引号外的 # 是行内注释 ——
         不剥掉的话 TOKEN_SECRET=abc # 备注 会把备注也算进密钥。 */
      const hash = value.indexOf('#');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile();

/** 取配置：环境变量优先，其次 .env，最后默认值 */
function env (key, fallback) {
  if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
  if (fileEnv[key] !== undefined && fileEnv[key] !== '') return fileEnv[key];
  return fallback;
}

function envInt (key, fallback, range) {
  /* ⚠️ 不能写成 Number(env(key, '')) —— Number('') 是 0 而不是 NaN，
     会把「没配」当成「配成 0」：PORT / RRF_K / 各类限流全被清零。
     所以先判空串，再判非法值。
     range: { min, max } —— 越界退回 fallback。
     TOKEN_TTL_DAYS=0 会让 token 一签发就过期，这种「配了但等于没配」的值要挡掉。 */
  const raw = env(key, '');
  if (raw === '') return fallback;
  const v = Number(raw);
  if (isNaN(v)) return fallback;
  const r = range || {};
  if (r.min !== undefined && v < r.min) return fallback;
  if (r.max !== undefined && v > r.max) return fallback;
  return v;
}

function envBool (key, fallback) {
  const v = env(key, '');
  if (v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function envNum (key, fallback) {
  const raw = env(key, '');
  if (raw === '') return fallback;
  const v = Number(raw);
  return isNaN(v) ? fallback : v;
}

function envList (key) {
  const v = env(key, '');
  if (!v) return [];
  return v.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

/* ---------- embedding provider ---------- */
/**
 * 三档 provider（§7.5）：
 *   siliconflow —— 默认，bge-m3，1024 维，OpenAI 兼容
 *   minimax     —— embo-01，1536 维，请求体不兼容 OpenAI，必须自己拼
 *   local       —— 零依赖哈希 embedding，仅用于本地自检与降级；
 *                  此时检索 mode 必须报 keyword（不能说 hybrid）
 */
const EMBEDDING_PROVIDERS = {
  siliconflow: {
    name: 'siliconflow',
    endpoint: 'https://api.siliconflow.cn/v1/embeddings',
    model: 'BAAI/bge-m3',
    dim: 1024,
    batchSize: 16
  },
  minimax: {
    name: 'minimax',
    endpoint: 'https://api.minimaxi.com/v1/embeddings',
    model: 'embo-01',
    dim: 1536,
    batchSize: 16
  },
  local: {
    name: 'local',
    endpoint: '',
    model: 'local-hash-256',
    dim: 256,
    batchSize: 64
  }
};

const providerName = env('EMBEDDING_PROVIDER', 'local');
/* ⚠️ 拼错不能静默回落 local ——
   local 是零依赖哈希 embedding，只用于本地自检，
   静默回落等于「以为在用语义检索，其实一直在用关键词匹配」，
   而且 mode 还会如实报 keyword，容易被忽略。直接报错说清可选值。 */
if (!EMBEDDING_PROVIDERS[providerName]) {
  throw new Error('EMBEDDING_PROVIDER 取值不认识：' + providerName +
    '（可选：' + Object.keys(EMBEDDING_PROVIDERS).join('、') + '）');
}
const provider = EMBEDDING_PROVIDERS[providerName];

const config = {
  root: ROOT,
  env: env('NODE_ENV', 'development'),
  port: envInt('PORT', 8080),

  /* ---------- 出站 HTTP ---------- */
  /** 微信接口 / embedding 的超时（毫秒）—— 上游挂住时不能无限等 */
  outboundTimeoutMs: envInt('OUTBOUND_TIMEOUT_MS', 15000, { min: 1000, max: 120000 }),

  /* ---------- 反向代理 ---------- */
  /**
   * 信任几层代理。
   * 部署在 nginx 后面时，req.ip 默认是代理的地址 ——
   * 所有人共用一个限流桶，全站每分钟只能搜 30 次。
   * 一层代理填 1（nginx 直连本服务）；填 true 等同 1。
   * 不部署代理就留 0 / 不配。
   */
  trustProxy: envInt('TRUST_PROXY', 0, { min: 0, max: 10 }),

  /* ---------- 数据库 ---------- */
  databaseUrl: env('DATABASE_URL', ''),
  /** 本地自检用 pg-mem 起一个内存库，不连真实 PG */
  useMemoryDb: envBool('USE_MEMORY_DB', false),
  /** 列表接口一次最多返回多少条（防止一次拉爆内存） */
  listMaxLimit: envInt('LIST_MAX_LIMIT', 500, { min: 20, max: 5000 }),
  pgSsl: envBool('PGSSL', false),
  /** CA 证书路径；未配时使用系统 CA。 */
  pgSslCa: env('PGSSL_CA', ''),
  /** 仅开发环境可显式关闭证书校验，生产始终拒绝。 */
  pgSslAllowInsecure: envBool('PGSSL_ALLOW_INSECURE', false),

  /* ---------- 鉴权 ---------- */
  tokenSecret: env('TOKEN_SECRET', ''),
  tokenTtlDays: envInt('TOKEN_TTL_DAYS', 7, { min: 1 }),
  /** 显式允许用开发密钥签发 token —— 只有内存模式或自己明确打开时才行 */
  allowDevSecret: envBool('ALLOW_DEV_SECRET', false),
  /** 首次部署时按这个列表把 openid 提成管理员 */
  adminOpenids: envList('ADMIN_OPENIDS'),

  /* ---------- 微信 ---------- */
  wechatAppid: env('WECHAT_APPID', ''),
  wechatSecret: env('WECHAT_SECRET', ''),
  wechatApiBase: env('WECHAT_API_BASE', 'https://api.weixin.qq.com'),

  /* ---------- 内容安全审核 ---------- */
  /** real = 走微信 msgSecCheck / mediaCheckAsync；dev-skip = 本地自检直接放行 */
  seccheckMode: env('SECCHECK_MODE', 'dev-skip'),
  mediaCallbackToken: env('MEDIA_CALLBACK_TOKEN', ''),

  /* ---------- embedding ---------- */
  embedding: {
    provider: provider.name,
    endpoint: env('EMBEDDING_ENDPOINT', provider.endpoint),
    model: env('EMBEDDING_MODEL', provider.model),
    dim: envInt('EMBEDDING_DIM', provider.dim),
    batchSize: provider.batchSize,
    apiKey: env('EMBEDDING_API_KEY', '') ||
      env('SILICONFLOW_API_KEY', '') ||
      env('MINIMAX_API_KEY', ''),
    /** bge-m3 的 query 前缀；实测不提升召回就把它置空 */
    queryPrefix: env('EMBEDDING_QUERY_PREFIX', 'Represent this sentence for searching relevant passages: ')
  },

  /* ---------- 检索 ---------- */
  search: {
    rrfK: envInt('RRF_K', 60),
    vectorTopK: envInt('VECTOR_TOP_K', 30),
    keywordTopK: envInt('KEYWORD_TOP_K', 30),
    limit: envInt('SEARCH_LIMIT', 20, { min: 1 }),
    /** 绝对阈值：向量相似度低于这个值就不返回（没有它，近邻会原样刷满结果） */
    minSimilarity: envNum('SEARCH_MIN_SIMILARITY', 0.3),
    /** 查询长度上限 —— 超长查询会切成上千个 bigram，每个 bigram 都发一次全表 LIKE */
    maxQueryLength: envInt('SEARCH_MAX_QUERY_LENGTH', 200, { min: 10, max: 2000 })
  },

  /* ---------- 反馈（§4.3 / §9.4） ---------- */
  /** 一条反馈最多附几张图（客户端 config/index.js 里也是 3，两边要一致） */
  feedbackImageMax: envInt('FEEDBACK_IMAGE_MAX', 3, { min: 0, max: 9 }),
  /** 单张图片大小上限（字节） */
  feedbackImageMaxBytes: envInt('FEEDBACK_IMAGE_MAX_BYTES', 2 * 1024 * 1024, { min: 1024 }),

  /* ---------- 限流（§8.4） ---------- */
  rateLimit: {
    feedbackPerDay: envInt('RATE_LIMIT_FEEDBACK_PER_DAY', 5, { min: 1 }),
    votePerMinute: envInt('RATE_LIMIT_VOTE_PER_MINUTE', 60, { min: 1 }),
    searchPerMinute: envInt('RATE_LIMIT_SEARCH_PER_MINUTE', 30, { min: 1 }),
    uploadPerMinute: envInt('RATE_LIMIT_UPLOAD_PER_MINUTE', 20, { min: 1 }),
    loginPerMinute: envInt('RATE_LIMIT_LOGIN_PER_MINUTE', 20, { min: 1 })
  },

  /** 数据来源标记：postgres = 真库；demo = 服务端整体降级 */
  dataSource: env('DATA_SOURCE', 'postgres')
};

/**
 * 启动前的配置体检
 * 只在 production 下强制要求密钥 —— 本地自检不连微信也不连 embedding。
 */
function assertProductionConfig () {
  if (config.env !== 'production') return;
  const missing = [];
  if (!config.tokenSecret) missing.push('TOKEN_SECRET');
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.wechatAppid) missing.push('WECHAT_APPID');
  if (!config.wechatSecret) missing.push('WECHAT_SECRET');
  /* 下面两项不是「缺了」，是「配错了」——
     内存库上线等于没上线；审核走 dev-skip 等于没审核。 */
  if (config.useMemoryDb) missing.push('USE_MEMORY_DB=false（当前是内存库，重启即丢数据）');
  if (config.seccheckMode !== 'real') missing.push('SECCHECK_MODE=real（当前为 ' + config.seccheckMode + '，等于不做内容审核）');
  if (config.seccheckMode === 'real' && !config.mediaCallbackToken) missing.push('MEDIA_CALLBACK_TOKEN（用于接收媒体审核回调）');
  if (missing.length) {
    throw new Error('生产环境缺少必需配置：' + missing.join('、'));
  }
}

/**
 * 启动时的风险提示（非 production 也打）
 * 开发密钥本身不是错 —— 但它意味着「任何人都能伪造管理员 token」，
 * 必须让人一眼看见，而不是等出事才知道。
 */
function warnRiskyConfig () {
  const warnings = [];
  if (!config.tokenSecret) {
    const allowed = config.useMemoryDb || config.allowDevSecret;
    warnings.push(allowed
      ? 'TOKEN_SECRET 未配置，正在使用开发密钥（仅限内存库/自检，token 可被伪造）'
      : 'TOKEN_SECRET 未配置且未显式允许开发密钥 —— token 签发将直接失败');
  }
  if (config.useMemoryDb) {
    warnings.push('USE_MEMORY_DB=true —— 当前连的是内存库，重启即丢数据');
  }
  if (config.seccheckMode !== 'real') {
    warnings.push('SECCHECK_MODE=' + config.seccheckMode + ' —— 内容审核没有真跑');
  }
  return warnings;
}

module.exports = config;
module.exports.assertProductionConfig = assertProductionConfig;
module.exports.warnRiskyConfig = warnRiskyConfig;
module.exports.EMBEDDING_PROVIDERS = EMBEDDING_PROVIDERS;
