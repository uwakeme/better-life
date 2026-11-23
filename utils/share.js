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

/**
 * 一期只分享详情页（设计文档 §10.1）。
 * 搜索页是 tabBar 页，热启动时 wx.switchTab 带不了 query，
 * 「搜索页带 q 的分享卡」这条路留到二期真要做了再补（那时需要一个非 tabBar 的中转页）。
 */
module.exports = {
  detailPath: detailPath,
  detailShare: detailShare
};
