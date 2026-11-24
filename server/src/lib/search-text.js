/** 查询、文档与高亮共用的文本归一规则。 */
function normalize (text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[!-\/:-@\[-`{-~\u3000-\u303f\uff00-\uffef]+/g, '');
}

/** 保留归一文本到原文的下标，避免高亮跨不过标点与空白。 */
function normalizedWithMap (text) {
  const source = String(text || '');
  let clean = '';
  const starts = [];
  const ends = [];
  const chars = Array.from(source);
  for (let i = 0; i < chars.length; i++) {
    const part = normalize(chars[i]);
    if (!part) continue;
    for (let j = 0; j < part.length; j++) {
      starts.push(i);
      ends.push(i + 1);
      clean += part[j];
    }
  }
  return { text: clean, starts: starts, ends: ends };
}

module.exports = { normalize: normalize, normalizedWithMap: normalizedWithMap };
