/**
 * snake_case → camelCase
 *
 * 职责：库表列名一律 snake_case，业务层一律 camelCase，转换只在这一处做。
 * 为什么单独一个文件：转换规则散在各处时，最容易出的错是"某个列名忘了转"，
 * 而那种错不会报错，只会让业务层拿到 undefined。
 *
 * 数字转换按列名白名单做：pg 读 JSONB / NUMERIC 会给字符串，
 * 但不能"见数字就转" —— 像 slug '2026' 这种本来就该是字符串的列被转了会丢前导零。
 */

/** 需要转成数字的列（只列真正是数值的） */
const INT_COLUMNS = new Set([
  'id', 'parentId', 'categoryId', 'experienceId', 'tagId', 'refId',
  'pointId', 'targetId', 'sortOrder', 'dim', 'viewCount', 'favoriteCount',
  'usefulCount', 'notUsefulCount', 'feedbackCount'
]);

/**
 * 日期列：统一转成 YYYY-MM-DD 字符串
 *
 * ⚠️ 数据库的 DATE 列会被驱动解析成 Date 对象，再序列化到接口里
 *    就变成 '2026-10-12T00:00:00.000Z' 这种带时区的串 ——
 *    界面直接显示这串，编辑页的日期输入框里也塞着它。
 *    真库上还会因为会话时区差一天。
 *
 * 在这里统一处理，而不是依赖各驱动的类型解析器：
 *    pg 的 setTypeParser 管得到真库，管不到 pg-mem（走自己的类型推断）。
 *    转换层是两边共用的唯一出口，在这里切最稳。
 */
const DATE_COLUMNS = new Set([
  'reviewedAt', 'nextReviewAt', 'publishedAt', 'createdAt', 'updatedAt',
  'repliedAt', 'mediaCheckedAt', 'lastSeenAt'
]);

/** Date / 日期串 → YYYY-MM-DD */
function toDateOnly (value) {
  if (value === null || value === undefined || value === '') return value;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return value;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

/** snake_case → camelCase */
function camel (key) {
  return String(key).replace(/_([a-z0-9])/g, function (_, c) {
    return c.toUpperCase();
  });
}

/** camelCase → snake_case */
function snake (key) {
  return String(key).replace(/([A-Z])/g, function (_, c) {
    return '_' + c.toLowerCase();
  });
}

/**
 * 一行记录转 camelCase
 * @param {object} row  数据库行
 * @param {object} opts { numeric: true 时按白名单把数值列转成 number }
 */
function toCamel (row, opts) {
  if (!row || typeof row !== 'object') return row;
  const numeric = !!(opts && opts.numeric);
  const out = {};
  for (const key in row) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const name = camel(key);
    let value = row[key];
    if (numeric && INT_COLUMNS.has(name) && value !== null && value !== undefined) {
      const n = Number(value);
      value = isNaN(n) ? value : n;
    }
    if (numeric && name === 'pointIds' && Array.isArray(value)) {
      value = value.map(function (v) {
        const n = Number(v);
        return isNaN(n) ? v : n;
      });
    }
    /* 日期列统一成 YYYY-MM-DD */
    if (DATE_COLUMNS.has(name)) {
      value = toDateOnly(value);
    }
    out[name] = value;
  }
  return out;
}

/** 一批行 */
function toCamelList (rows, opts) {
  if (!Array.isArray(rows)) return [];
  return rows.map(function (r) { return toCamel(r, opts); });
}

/**
 * 业务对象 → 数据库列
 * 只取传进来的键，不额外补默认值 —— 补默认值交给 SQL 与 DAO。
 */
function toRow (obj, opts) {
  const out = {};
  const skip = (opts && opts.skip) || [];
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (skip.indexOf(key) >= 0) continue;
    out[snake(key)] = obj[key];
  }
  return out;
}

module.exports = {
  camel: camel,
  snake: snake,
  toCamel: toCamel,
  toCamelList: toCamelList,
  toRow: toRow,
  toDateOnly: toDateOnly,
  INT_COLUMNS: INT_COLUMNS,
  DATE_COLUMNS: DATE_COLUMNS
};
