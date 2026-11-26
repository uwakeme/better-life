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
 * 日期列：统一转成 YYYY-MM-DD 字符串，一律按北京时间
 *
 * ⚠️ 数据库的 DATE 列会被驱动解析成 Date 对象，再序列化到接口里
 *    就变成 '2026-10-12T00:00:00.000Z' 这种带时区的串 ——
 *    界面直接显示这串，编辑页的日期输入框里也塞着它。
 *
 * 项目只面向国内用户，日历日期固定按北京时间取，不跟服务器时区走。
 * 之前这里用 toISOString() 取日期，那是按 UTC 算的：服务器时区为 Asia/Shanghai 时，
 * DATE 列的 2026-06-04 被驱动解析成本地零点（UTC 的前一天 16:00），取出来就成了 2026-06-03；
 * 北京时间 0 点到 8 点的时间戳也会算到前一天。
 * 中国不实行夏令时，固定加 8 小时即可，与进程时区无关。
 *
 * 两个后端各走一条路，结果一致：
 *    - 真库：db.js 把 DATE 的类型解析器设成原样返回字符串，日期不经过 Date。
 *    - 内存库：pg-mem 不认 pg 的类型解析器，DATE 仍是 Date（UTC 零点），加 8 小时后还是同一天。
 * 时间戳列（updated_at 等）是绝对时刻，两个后端都按加 8 小时后的日期算。
 */
const DATE_COLUMNS = new Set([
  'reviewedAt', 'nextReviewAt', 'publishedAt', 'createdAt', 'updatedAt',
  'repliedAt', 'mediaCheckedAt', 'lastSeenAt'
]);

/** 北京时间比 UTC 快 8 小时（固定，没有夏令时） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 某个时刻在北京时间是哪一天 —— 与服务器时区无关 */
function beijingDate (date) {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  /* 加 8 小时后超出 Date 取值范围的极端时刻，退回原值 */
  if (isNaN(shifted.getTime())) return date.toISOString().slice(0, 10);
  return shifted.toISOString().slice(0, 10);
}

/** Date / 日期串 → YYYY-MM-DD（北京时间） */
function toDateOnly (value) {
  if (value === null || value === undefined || value === '') return value;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return value;
    return beijingDate(value);
  }
  const s = String(value);
  /* 纯日期本身就是日历日期（真库 DATE 列的原样值），不做任何时区换算 */
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return value;
  return beijingDate(d);
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
  beijingDate: beijingDate,
  INT_COLUMNS: INT_COLUMNS,
  DATE_COLUMNS: DATE_COLUMNS
};
