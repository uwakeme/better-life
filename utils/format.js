/**
 * 格式化工具
 *
 * 职责：时间相对化、计数、来源类型与反馈类型的中文口径、链接域名提取。
 * 口径来源：design/assets/data.js 的同名函数（原型自检依赖它，改这里要同步改原型）。
 */
var config = require('../config/index');

/** 演示数据的「今天」固定在设计文档日期，避免每次打开相对时间都在变 */
var TODAY = '2026-11-19';

/**
 * 相对时间：小于 7 天说「N 天前」，小于 30 天说「N 周前」，再往后说「N 个月前」
 *
 * ⚠️ 基准日期不能用写死的 TODAY —— 服务端来的数据也走这个函数，
 *    写死的话 '2026-11-19' 永远显示「今天」。
 *    现在：服务端数据用真实当前时间，演示数据才用固定基准日。
 */
function ago (dateStr, isDemo) {
  if (!dateStr) return '';
  var base = isDemo ? Date.parse(TODAY) : Date.now();
  var t = Date.parse(dateStr);
  if (isNaN(t)) return '';
  var days = Math.round((base - t) / 86400000);
  if (days <= 0) return '今天';
  if (days < 7) return days + ' 天前';
  if (days < 30) return Math.round(days / 7) + ' 周前';
  return Math.round(days / 30) + ' 个月前';
}

/**
 * 日期格式化：统一成 YYYY-MM-DD
 *
 * ⚠️ 服务端的 DATE 列曾经被 pg 解析成 Date 对象再序列化，
 *    界面直接显示出 '2026-10-12T00:00:00.000Z' 这种带时区的串。
 *    这里统一截到日期部分 —— 展示的地方不该出现时间与时区。
 */
function date (value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  var s = String(value);
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  var d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** 日期 + 时间（带时区转成本地时间）—— 需要精确到时的场合用 */
function dateTime (value) {
  if (!value) return '';
  var d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return date(value);
  var pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** 来源类型中文口径（界面里不出现英文枚举） */
var SOURCE_TYPE_LABEL = {
  article: '文章',
  video: '视频',
  post: '帖子',
  official: '官方',
  paper: '论文',
  review: '评测'
};

/** 反馈类型中文口径 */
var FEEDBACK_KIND_LABEL = {
  correction: '纠错',
  supplement: '补充说明',
  question: '提问',
  suggestion: '建议'
};

/** 反馈状态中文口径 */
var FEEDBACK_STATUS_LABEL = {
  pending: '待处理',
  accepted: '已采纳',
  ignored: '不采纳',
  replied: '已回复'
};

/** 图片审核状态中文口径 */
var MEDIA_STATUS_LABEL = {
  none: '',
  checking: '审核中',
  passed: '已通过',
  rejected: '未通过'
};

/**
 * 经验卡的立场计数 —— 只到要点级（设计文档 §2.3）
 * 一条经验整体没有立场，所以这里只给「N 推荐 · M 避雷」这种诚实的计数。
 */
function stanceCount (experience) {
  var good = 0, bad = 0, neutral = 0;
  var points = (experience && experience.points) || [];
  for (var i = 0; i < points.length; i++) {
    if (points[i].stance === 'good') good++;
    else if (points[i].stance === 'bad') bad++;
    else neutral++;
  }
  return { good: good, bad: bad, neutral: neutral, total: points.length };
}

/** 立场计数的展示串：只有一种立场时只写那一种 */
function stanceText (experience) {
  var c = stanceCount(experience);
  var parts = [];
  if (c.good) parts.push(c.good + ' 推荐');
  if (c.bad) parts.push(c.bad + ' 避雷');
  if (c.neutral) parts.push(c.neutral + ' 中立');
  if (!parts.length) return '';
  return parts.join(' · ');
}

/**
 * 来源链接只显示域名：完整 URL 在 375px 宽下要占两行，挤掉别的信息；
 * 想看完整地址有「复制链接」，复制出来就是完整的。
 */
function host (url) {
  var s = String(url || '');
  var m = s.match(/^https?:\/\/([^\/]+)/i);
  return m ? m[1] : s;
}

/** 数字千分位，用于「1,284 次浏览」这类展示 */
function number (n) {
  var v = Number(n || 0);
  if (isNaN(v)) return '0';
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 标签列表拼成一行 */
function tagText (names) {
  return (names || []).join(' · ');
}

module.exports = {
  TODAY: TODAY,
  ago: ago,
  date: date,
  dateTime: dateTime,
  number: number,
  host: host,
  tagText: tagText,
  stanceCount: stanceCount,
  stanceText: stanceText,
  SOURCE_TYPE_LABEL: SOURCE_TYPE_LABEL,
  FEEDBACK_KIND_LABEL: FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_LABEL: FEEDBACK_STATUS_LABEL,
  MEDIA_STATUS_LABEL: MEDIA_STATUS_LABEL,
  maxImages: config.feedbackImageMax,
  historyMax: config.searchHistoryMax
};
