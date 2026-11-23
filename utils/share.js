/**
 * 分享参数拼装
 *
 * 职责：统一详情页分享路径与标题，避免各页面各写一套。
 * 落地即详情页（设计文档 §10.1）。
 */

/** 详情页分享路径 */
function detailPath (id) {
  return '/pages/detail/detail?id=' + id;
}

/**
 * 分享卡片文案
 * 标题就是结论 —— 结论先行是本产品的地基（设计文档 §1.2）
 */
function detailShare (experience) {
  if (!experience) {
    return { title: '生活经验库 · 查一条用得上的经验', path: '/pages/home/home', imageUrl: '' };
  }
  return {
    title: experience.title || '生活经验库',
    path: detailPath(experience.id),
    imageUrl: experience.coverUrl || ''
  };
}

/** 搜索页分享：带上预填关键词 */
function searchShare (query) {
  return {
    title: '生活经验库 · 找经验',
    path: '/pages/search/search?q=' + encodeURIComponent(query || ''),
    imageUrl: ''
  };
}

module.exports = {
  detailPath: detailPath,
  detailShare: detailShare,
  searchShare: searchShare
};
