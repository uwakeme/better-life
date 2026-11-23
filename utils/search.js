/**
 * 搜索相关的纯函数
 *
 * 职责：输入归一、bigram 切分、防抖、命中高亮片段。
 * 约定：
 *   1. 小程序运行时不写可选链与空值合并（设计文档 §5.2）。
 *   2. 清洗不用 Unicode 属性转义（那玩意儿在部分基础库上不认），
 *      改成按码位白名单保留中日韩、字母与数字 —— 零依赖、跨端同一份实现。
 */

/** 输入归一：去空白、转小写 */
function normalize (q) {
  return String(q == null ? '' : q).trim().toLowerCase();
}

/** 判断一个码位是否属于要保留的字符 */
function keepCode (code) {
  if (code >= 0x4e00 && code <= 0x9fff) return true;  /* 中日韩统一表意 */
  if (code >= 0x3400 && code <= 0x4dbf) return true;  /* 扩展 A */
  if (code >= 0xf900 && code <= 0xfaff) return true;  /* 兼容表意 */
  if (code >= 0x3040 && code <= 0x30ff) return true;  /* 假名 */
  if (code >= 0xac00 && code <= 0xd7af) return true;  /* 谚文 */
  if (code >= 0x0041 && code <= 0x005a) return true;  /* A-Z */
  if (code >= 0x0061 && code <= 0x007a) return true;  /* a-z */
  if (code >= 0x0030 && code <= 0x0039) return true;  /* 0-9 */
  return false;
}

/** 清洗：去掉空白与标点，保留中日韩、字母与数字 */
function clean (text) {
  var s = String(text == null ? '' : text);
  var out = '';
  for (var i = 0; i < s.length; i++) {
    if (keepCode(s.charCodeAt(i))) out += s.charAt(i);
  }
  return out;
}

/**
 * bigram 切分：「洗发水推荐」→ ['洗发','发水','水推','推荐']
 * 零依赖，对中文短查询召回够用（设计文档 §7.4）
 */
function bigrams (text) {
  var s = clean(text);
  var out = [];
  for (var i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  if (s.length === 1) out.push(s);
  return out;
}

/** 防抖：搜索输入 300ms（设计文档 §3.4） */
function debounce (fn, wait) {
  var timer = null;
  var delay = wait || 300;
  return function () {
    var ctx = this;
    var args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      fn.apply(ctx, args);
    }, delay);
  };
}

/**
 * 高亮片段：返回 [[文本, 是否命中], ...]，交给 WXML 分段渲染。
 * 只做切分不做 HTML 拼装 —— WXML 里没有 innerHTML。
 */
function highlight (text, terms) {
  var s = String(text == null ? '' : text);
  var list = (terms || []).filter(function (t) { return t && t.length > 1; });
  if (!list.length) return [[s, false]];
  list.sort(function (a, b) { return b.length - a.length; });
  var lower = s.toLowerCase();
  var marks = [];
  for (var z = 0; z < s.length; z++) marks.push(false);
  for (var i = 0; i < list.length; i++) {
    var t = String(list[i]).toLowerCase();
    var from = 0;
    while (from < lower.length) {
      var at = lower.indexOf(t, from);
      if (at < 0) break;
      for (var k = at; k < at + t.length; k++) marks[k] = true;
      from = at + t.length;
    }
  }
  var out = [];
  var buf = '';
  var flag = marks[0];
  for (var j = 0; j < s.length; j++) {
    if (marks[j] !== flag) {
      out.push([buf, flag]);
      buf = '';
      flag = marks[j];
    }
    buf += s.charAt(j);
  }
  if (buf) out.push([buf, flag]);
  return out;
}

/** 从一段文本里抽出命中的词（用于 matchedOn 的关键词提示） */
function matchedTerms (text, terms) {
  var lower = String(text == null ? '' : text).toLowerCase();
  var out = [];
  (terms || []).forEach(function (t) {
    if (t && t.length > 1 && lower.indexOf(String(t).toLowerCase()) >= 0) out.push(t);
  });
  return out;
}

module.exports = {
  normalize: normalize,
  clean: clean,
  bigrams: bigrams,
  debounce: debounce,
  highlight: highlight,
  matchedTerms: matchedTerms
};
