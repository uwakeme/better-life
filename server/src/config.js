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
      value = value.slice(1, -1);
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

function envInt (key, fallback) {
  /* ⚠️ 不能写成 Number(env(key, '')) —— Number('') 是 0 而不是 NaN，
     会把「没配」当成「配成 0」：PORT / RRF_K / 各类限流全被清零。
     所以先判空串，再判非法值。 */
  const raw = env(key, '');
  if (raw === '') return fallback;
  const v = Number(raw);
  return isNaN(v) ? fallback : v;
}

function envBool (key, fallback) {
  const v = env(key, '');
  if (v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
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
const provider = EMBEDDING_PROVIDERS[providerName] || EMBEDDING_PROVIDERS.local;

const config = {
  root: ROOT,
  env: env('NODE_ENV', 'development'),
  port: envInt('PORT', 8080),

  /* ---------- 数据库 ---------- */
  databaseUrl: env('DATABASE_URL', ''),
  /** 本地自检用 pg-mem 起一个内存库，不连真实 PG */
  useMemoryDb: envBool('USE_MEMORY_DB', false),
  pgSsl: envBool('PGSSL', false),

  /* ---------- 鉴权 ---------- */
  tokenSecret: env('TOKEN_SECRET', ''),
  tokenTtlDays: envInt('TOKEN_TTL_DAYS', 7),
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
    limit: envInt('SEARCH_LIMIT', 20)
  },

  /* ---------- 限流（§8.4） ---------- */
  rateLimit: {
    feedbackPerDay: envInt('RATE_LIMIT_FEEDBACK_PER_DAY', 5),
    votePerMinute: envInt('RATE_LIMIT_VOTE_PER_MINUTE', 60),
    searchPerMinute: envInt('RATE_LIMIT_SEARCH_PER_MINUTE', 30)
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
  if (missing.length) {
    throw new Error('生产环境缺少必需配置：' + missing.join('、'));
  }
}

module.exports = config;
module.exports.assertProductionConfig = assertProductionConfig;
module.exports.EMBEDDING_PROVIDERS = EMBEDDING_PROVIDERS;
