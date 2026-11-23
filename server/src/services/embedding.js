/**
 * Embedding Provider 抽象（§7.5）
 *
 * 接口：
 *   embedDocuments(texts) => Promise<number[][]>
 *   embedQuery(text)      => Promise<number[]>
 *   model / dim
 *
 * 三档 provider：
 *   siliconflow —— 默认，BAAI/bge-m3，1024 维，OpenAI 兼容
 *   minimax     —— embo-01，1536 维，请求体不兼容 OpenAI（自己拼 body）
 *   local       —— 零依赖哈希 embedding，本地自检与降级用；
 *                  此时检索 mode 必须报 keyword —— 说成 hybrid 就是撒谎。
 *
 * 远端 provider 缺 key 或调用失败时抛错，由调用方降级，绝不假装成功。
 */
const config = require('../config');

/* ---------- local：确定性哈希 embedding ---------- */

/**
 * 把文本压成一个固定维度的单位向量
 * 用字符 bigram 的 FNV-1a 哈希分桶，累加后归一化。
 * 不是语义模型，但**确定性**且能区分不同文本 —— 本地自检要的是「能不能跑通链路」。
 */
function hashEmbedding (text, dim) {
  const v = new Array(dim).fill(0);
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const gram = s.slice(i, i + 2);
    let h = 2166136261;
    for (let j = 0; j < gram.length; j++) {
      h ^= gram.charCodeAt(j);
      h = Math.imul(h, 16777619) >>> 0;
    }
    v[h % dim] += 1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const out = new Array(dim);
  for (let k = 0; k < dim; k++) out[k] = v[k] / norm;
  return out;
}

/* ---------- 远端 provider ---------- */

async function callSiliconflow (texts) {
  const res = await fetch(config.embedding.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + config.embedding.apiKey
    },
    body: JSON.stringify({ model: config.embedding.model, input: texts })
  });
  if (!res.ok) throw new Error('embedding 调用失败：HTTP ' + res.status);
  const body = await res.json();
  const data = body && body.data ? body.data : [];
  return data.map(function (d) { return d.embedding; });
}

async function callMinimax (texts) {
  /* ⚠️ minimax 的请求体与 OpenAI 不兼容：{ model, texts, type }，响应 { vectors } */
  const res = await fetch(config.embedding.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + config.embedding.apiKey
    },
    body: JSON.stringify({
      model: config.embedding.model,
      texts: texts,
      type: 'db'
    })
  });
  if (!res.ok) throw new Error('embedding 调用失败：HTTP ' + res.status);
  const body = await res.json();
  return body && body.vectors ? body.vectors : [];
}

/* ---------- 对外接口 ---------- */

/** 当前 provider 是否为远端 */
function isRemote () {
  return config.embedding.provider !== 'local';
}

/** 是否具备调用远端 provider 的条件 */
function canCallRemote () {
  return isRemote() && !!config.embedding.apiKey && !!config.embedding.endpoint;
}

async function embedDocuments (texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  if (!canCallRemote()) {
    return list.map(function (t) { return hashEmbedding(t, config.embedding.dim); });
  }
  const out = [];
  const size = config.embedding.batchSize || 16;
  for (let i = 0; i < list.length; i += size) {
    const batch = list.slice(i, i + size);
    const vecs = config.embedding.provider === 'minimax'
      ? await callMinimax(batch)
      : await callSiliconflow(batch);
    for (const v of vecs) out.push(v);
  }
  return out;
}

async function embedQuery (text) {
  if (!canCallRemote()) {
    return hashEmbedding(text, config.embedding.dim);
  }
  const input = config.embedding.queryPrefix
    ? config.embedding.queryPrefix + String(text || '')
    : String(text || '');
  const vecs = config.embedding.provider === 'minimax'
    ? await callMinimax([input])
    : await callSiliconflow([input]);
  return vecs[0];
}

module.exports = {
  embedDocuments: embedDocuments,
  embedQuery: embedQuery,
  hashEmbedding: hashEmbedding,
  isRemote: isRemote,
  canCallRemote: canCallRemote,
  model: config.embedding.model,
  dim: config.embedding.dim,
  provider: config.embedding.provider
};
