/**
 * 自检断言套件
 *
 * 职责：九支 scripts/verify-*.js 共用同一套断言与输出格式。
 * 为什么抽出来：断言格式一改要改九处，容易漏；输出不统一就没法一条命令跑完九支。
 * 用法：const { group, check, eq, report } = require('./_kit');
 */
const results = [];
let currentGroup = '';

function group (name) {
  currentGroup = name;
}

function check (name, condition, detail) {
  results.push({
    group: currentGroup,
    name: name,
    pass: !!condition,
    detail: condition ? '' : (detail || '')
  });
}

function eq (name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
}

function report (title) {
  const groups = [];
  for (const r of results) {
    if (groups.indexOf(r.group) < 0) groups.push(r.group);
  }
  let failed = 0;
  console.log('');
  console.log('── ' + title + ' ──');
  for (const g of groups) {
    const items = results.filter(function (r) { return r.group === g; });
    const bad = items.filter(function (r) { return !r.pass; });
    failed += bad.length;
    console.log((bad.length ? '✗' : '✓') + ' ' + g + '（' + (items.length - bad.length) + '/' + items.length + '）');
    for (const b of bad) console.log('    · ' + b.name + (b.detail ? ' —— ' + b.detail : ''));
  }
  console.log('');
  console.log('共 ' + results.length + ' 项断言，失败 ' + failed + ' 项。');
  return failed;
}

module.exports = {
  group: group, check: check, eq: eq, report: report,
  tags: tags, buildTree: buildTree, attrValue: attrValue, guardedBy: guardedBy
};
/* ---------- WXML 解析（lint-wxml 与 verify-copy 共用） ---------- */

/** 取出标签序列（开/闭/自闭合），带位置与属性 */
function tags (text) {
  const out = [];
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const name = m[1];
    const attrs = m[2] || '';
    const closing = raw.charAt(1) === '/';
    const selfClose = /\/\s*>$/.test(raw) ||
      ['image', 'input', 'icon', 'progress', 'import', 'include', 'wxs'].indexOf(name) >= 0;
    out.push({
      name: name, closing: closing, self: selfClose, raw: raw, attrs: attrs,
      start: m.index, end: m.index + raw.length, children: [], parent: null
    });
  }
  return out;
}

/** 建树并算出每个节点的子树区间；返回不匹配的问题描述 */
function buildTree (list, text) {
  const stack = [];
  let broken = '';
  for (const t of list) {
    if (t.closing) {
      const top = stack.pop();
      if (!top || top.name !== t.name) {
        if (!broken) broken = '闭合标签 </' + t.name + '> 与 <' + (top ? top.name : '空') + '> 不匹配';
        continue;
      }
      top.end = t.end;
      continue;
    }
    if (stack.length) {
      t.parent = stack[stack.length - 1];
      stack[stack.length - 1].children.push(t);
    }
    if (!t.self) stack.push(t);
  }
  if (!broken && stack.length) {
    broken = '未闭合：' + stack.map((s) => s.name).join(' > ');
  }
  return broken;
}

/** 从属性串里取某个属性的值（不用正则，避免多层字符串里转义被削掉） */
function attrValue (attrs, key) {
  const at = attrs.indexOf(key);
  if (at < 0) return '';
  const eq = attrs.indexOf('=', at + key.length);
  if (eq < 0) return '';
  const quote = attrs.charAt(eq + 1);
  if (quote !== '"' && quote !== "'") return '';
  const close = attrs.indexOf(quote, eq + 2);
  if (close < 0) return '';
  return attrs.slice(eq + 2, close);
}

/** 某个位置所在的祖先链上，有没有 wx:if 命中给定的关键字 */
function guardedBy (list, index, keys) {
  const node = list[index];
  let cur = node;
  while (cur) {
    const cond = attrValue(cur.attrs, 'wx:if');
    if (cond) {
      for (const k of keys) {
        if (cond.indexOf(k) >= 0) return cond;
      }
    }
    cur = cur.parent;
  }
  return '';
}