/**
 * 视图模型
 *
 * 职责：把领域数据加工成页面直接能渲染的字段（便签颜色、立场计数、相对时间、
 * 来源元信息……），组件只负责渲染，不再自己算。
 * 为什么放在这里而不是组件里：
 *   1. 小程序运行时的 observers 是基础库 2.6.3+ 的 API，预览运行时不一定实现；
 *      派生值在页面侧算好，组件变成纯渲染，跨端行为一致。
 *   2. 派生规则只写一份，列表页、搜索页、收藏夹不会各算各的。
 */
var format = require('./format');

/** 8 色便签循环 —— 按经验 id 取，同一条经验跨页同色 */
var COLORS = ['s-lemon', 's-mint', 's-peach', 's-sky', 's-lilac', 's-cream', 's-wheat', 's-slate'];

/** 颜色类名 → 具体色值（给需要内联的场景兜底） */
var COLOR_HEX = {
  's-lemon': '#f8dc8e',
  's-mint': '#b9e3c4',
  's-peach': '#f9c3a3',
  's-sky': '#bcd6ee',
  's-lilac': '#d6c8ec',
  's-cream': '#fdf6ea',
  's-wheat': '#ecd9b3',
  's-slate': '#c8d2da'
};

/**
 * 经验卡视图
 * 口径：整条经验不贴立场贴纸，只写「N 推荐 · M 避雷」的计数（设计文档 §2.3）。
 */
function cardView (exp, hit) {
  if (!exp) {
    return { id: 0, title: '', summary: '', color: 's-cream', colorHex: COLOR_HEX['s-cream'], stanceText: '', updated: '', categoryName: '', tags: [], hit: hit || '' };
  }
  var id = Number(exp.id || 0);
  var color = id > 0 ? COLORS[(id - 1) % COLORS.length] : 's-cream';
  return {
    id: id,
    title: exp.title || '',
    summary: exp.summary || '',
    color: color,
    colorHex: COLOR_HEX[color],
    stanceText: format.stanceText(exp),
    updated: format.ago(exp.updatedAt),
    categoryName: exp.categoryName || '',
    tags: exp.tagNames || [],
    usefulCount: exp.usefulCount || 0,
    notUsefulCount: exp.notUsefulCount || 0,
    hit: hit || ''
  };
}

/** 立场贴纸视图：颜色 + 符号 + 文字三个通道（设计文档 §2.3） */
function stanceView (stance) {
  var map = {
    good: { tone: 'good', sym: '✓', text: '推荐' },
    bad: { tone: 'bad', sym: '✕', text: '避雷' },
    neutral: { tone: 'neutral', sym: '—', text: '中立' }
  };
  return map[stance] || map.neutral;
}

/** 要点视图 */
function pointView (point, sources, index) {
  var p = point || {};
  var srcs = (sources || []).map(function (s) { return sourceView(s); });
  return {
    id: p.id || 0,
    index: index || 0,
    stance: p.stance || 'neutral',
    stanceView: stanceView(p.stance),
    title: p.title || '',
    detail: p.detail || '',
    appliesTo: p.appliesTo || '',
    sources: srcs,
    sourceCount: srcs.length
  };
}

/** 依据视图 */
function sourceView (source, badge, also) {
  var s = source || {};
  var meta = [];
  if (s.platform) meta.push(s.platform);
  if (s.author) meta.push(s.author);
  if (s.publishedAt) meta.push(s.publishedAt);
  return {
    id: s.id || 0,
    title: s.title || '',
    url: s.url || '',
    typeLabel: format.SOURCE_TYPE_LABEL[s.sourceType] || '文章',
    meta: meta.join(' · '),
    note: s.note || '',
    host: format.host(s.url),
    badge: badge || '',
    also: also || ''
  };
}

/** 要点 ↔ 依据 映射分组（来源页用） */
function sourceGroups (points, sources) {
  var list = points || [];
  var srcs = sources || [];
  var groups = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    var mine = [];
    for (var j = 0; j < srcs.length; j++) {
      var ids = srcs[j].pointIds || [];
      if (ids.indexOf(p.id) >= 0) mine.push(srcs[j]);
    }
    groups.push({
      pointId: p.id,
      pointTitle: p.title || '',
      stance: p.stance || 'neutral',
      sources: mine.map(function (s) { return sourceView(s); })
    });
  }
  return groups;
}

/** 依据的「同时支撑」说明：它还支撑了哪几个要点 */
function alsoSupports (source, points) {
  var ids = (source && source.pointIds) || [];
  var names = [];
  var list = points || [];
  for (var i = 0; i < list.length; i++) {
    if (ids.indexOf(list[i].id) >= 0) names.push(list[i].title);
  }
  return names.join('、');
}

/**
 * 命中原因 → 中文标签
 *
 * 后端回的是结构化前缀（point: / keyword: / tag: / summary: / title / semantic），
 * 翻译只写这一份，页面直接拿中文标签，不各自解析前缀。
 */
var HIT_PREFIX = [
  { prefix: 'point:', label: '命中要点：' },
  { prefix: 'keyword:', label: '命中关键词：' },
  { prefix: 'tag:', label: '命中标签：' },
  { prefix: 'summary:', label: '命中结论：' }
];

function hitLabel (matchedOn) {
  var list = matchedOn || [];
  for (var i = 0; i < list.length; i++) {
    var m = String(list[i]);
    for (var j = 0; j < HIT_PREFIX.length; j++) {
      var p = HIT_PREFIX[j];
      if (m.indexOf(p.prefix) === 0) return p.label + m.slice(p.prefix.length);
    }
    if (m === 'title') return '命中标题';
    if (m === 'semantic') return '语义相近';
  }
  return '';
}

module.exports = {
  COLORS: COLORS,
  COLOR_HEX: COLOR_HEX,
  hitLabel: hitLabel,
  cardView: cardView,
  stanceView: stanceView,
  pointView: pointView,
  sourceView: sourceView,
  sourceGroups: sourceGroups,
  alsoSupports: alsoSupports
};
