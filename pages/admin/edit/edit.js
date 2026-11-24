/**
 * 经验编辑器（管理-编辑）
 *
 * 职责：录入一条经验的结论、要点、依据与标签，支持存草稿与发布。
 * 口径（设计文档 §4.1）：
 *   1. 发布前必须过四道校验 —— 标题/结论非空、至少 1 条要点、至少 1 条依据、
 *      每条依据都关联了至少一条要点。
 *      这道护栏同时落在数据层（local.validateExperience / 服务端 publish），
 *      界面只是先给一句人话。
 *   2. 要点的立场是三选一（推荐 / 中立 / 避雷）。
 *   3. 依据要关联要点：先把依据挂到要点上，才谈得上溯源。
 * 实现约定：
 *   - 要点 id 一律用字符串。既有 id 从数字转成字符串，新要点给 'cp…' 客户端 id；
 *     服务端落库时会把客户端 id 换成真实主键，并同步改写依据的 pointIds。
 *   - WXML 不做数组方法调用，所以「标签是否选中」「这条依据挂了哪几条要点」
 *     都在 JS 里算好，页面只渲染。
 */
var api = require('../../../utils/api');
var role = require('../../../utils/role');

var STANCES = [
  { key: 'good', name: '推荐' },
  { key: 'neutral', name: '中立' },
  { key: 'bad', name: '避雷' }
];

var SOURCE_TYPES = [
  { key: 'article', name: '文章' },
  { key: 'video', name: '视频' },
  { key: 'post', name: '帖子' },
  { key: 'official', name: '官方' },
  { key: 'paper', name: '论文' },
  { key: 'review', name: '评测' }
];

var seq = 0;

function newClientId (prefix) {
  seq = seq + 1;
  return prefix + Date.now() + '_' + seq;
}

/** 日期统一成 YYYY-MM-DD（服务端 DATE 列可能带时间部分） */
function dateOnly (value) {
  if (!value) return '';
  var s = String(value);
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  var d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

Page({
  data: {
    allowed: false,
    loading: false,
    error: '',
    id: 0,
    isNew: true,
    title: '',
    summary: '',
    body: '',
    categoryId: 1,
    keywordText: '',
    /* 核查日期与下次复核日期 —— 之前没有入口，
       管理端的「待复核」指标在界面上消不掉。 */
    reviewedAt: '',
    nextReviewAt: '',
    tagIds: [],
    tagView: [],
    points: [],
    sources: [],
    categories: [],
    tags: [],
    stances: STANCES,
    sourceTypes: SOURCE_TYPES,
    errors: [],
    hint: '',
    saving: false
  },

  onLoad: function (query) {
    if (!role.canManage()) {
      this.setData({ allowed: false });
      return;
    }
    this.setData({ allowed: true });
    var id = Number(query && query.id ? query.id : 0);
    this.setData({ id: id, isNew: !id });
    this.loadCats();
    if (id) this.loadExp(id);
  },

  loadCats: function () {
    var self = this;
    return api.getCategories().then(function (res) {
      var cats = res.categories || [];
      var list = [];
      for (var i = 0; i < cats.length; i++) {
        list.push({ id: cats[i].id, name: cats[i].name });
      }
      self.setData({ categories: list, tags: res.tags || [] });
      self.refresh();
    }).catch(function () { /* 分类拿不到时表单仍可编辑，只是没法选领域 */ });
  },

  loadExp: function (id) {
    var self = this;
    this.setData({ loading: true });
    return api.getAdminExperience(id).then(function (e) {
      var points = [];
      var pts = e.points || [];
      for (var i = 0; i < pts.length; i++) {
        points.push({
          id: String(pts[i].id),
          stance: pts[i].stance || 'neutral',
          title: pts[i].title || '',
          detail: pts[i].detail || '',
          appliesTo: pts[i].appliesTo || ''
        });
      }
      var sources = [];
      var srcs = e.sources || [];
      for (var j = 0; j < srcs.length; j++) {
        var ids = [];
        var raw = srcs[j].pointIds || [];
        for (var k = 0; k < raw.length; k++) ids.push(String(raw[k]));
        sources.push({
          id: String(srcs[j].id),
          title: srcs[j].title || '',
          url: srcs[j].url || '',
          sourceType: srcs[j].sourceType || 'article',
          platform: srcs[j].platform || '',
          author: srcs[j].author || '',
          /* 日期统一成 YYYY-MM-DD —— 服务端可能带时间部分 */
          publishedAt: dateOnly(srcs[j].publishedAt) || '',
          note: srcs[j].note || '',
          pointIds: ids
        });
      }
      var kws = e.keywords || [];
      self.setData({
        loading: false,
        title: e.title || '',
        summary: e.summary || '',
        body: e.body || '',
        categoryId: Number(e.categoryId || 1),
        keywordText: kws.join('、'),
        /* 日期统一成 YYYY-MM-DD —— 服务端 DATE 列可能带时间部分 */
        reviewedAt: dateOnly(e.reviewedAt),
        nextReviewAt: dateOnly(e.nextReviewAt),
        tagIds: (e.tagIds || []).slice(),
        points: points,
        sources: sources
      });
      self.refresh();
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '这条经验没打开' });
    });
  },

  /**
   * 重算所有派生视图
   * 标签的选中态、依据挂到哪些要点上 —— 都得在 JS 里算，
   * WXML 不做数组方法调用。
   */
  refresh: function () {
    this.refreshTags();
    this.refreshSources();
  },

  refreshTags: function () {
    var tagIds = this.data.tagIds || [];
    var tagView = [];
    for (var i = 0; i < (this.data.tags || []).length; i++) {
      var t = this.data.tags[i];
      tagView.push({ id: t.id, name: t.name, on: tagIds.indexOf(t.id) >= 0 });
    }
    this.setData({ tagView: tagView });
  },

  refreshSources: function () {
    var points = this.data.points || [];
    var sources = [];
    for (var j = 0; j < (this.data.sources || []).length; j++) {
      var s = this.data.sources[j];
      var ids = s.pointIds || [];
      var choices = [];
      for (var k = 0; k < points.length; k++) {
        choices.push({
          id: points[k].id,
          label: points[k].title ? points[k].title : ('要点 ' + (k + 1)),
          on: ids.indexOf(points[k].id) >= 0
        });
      }
      var next = {};
      for (var key in s) {
        if (Object.prototype.hasOwnProperty.call(s, key)) next[key] = s[key];
      }
      next.linkChoices = choices;
      sources.push(next);
    }
    this.setData({ sources: sources });
  },

  scheduleSourceLabels: function () {
    var self = this;
    if (this.sourceLabelTimer) clearTimeout(this.sourceLabelTimer);
    this.sourceLabelTimer = setTimeout(function () {
      self.sourceLabelTimer = null;
      self.refreshSources();
    }, 300);
  },

  onPointTitleBlur: function () {
    if (this.sourceLabelTimer) clearTimeout(this.sourceLabelTimer);
    this.sourceLabelTimer = null;
    this.refreshSources();
  },

  onUnload: function () {
    if (this.sourceLabelTimer) clearTimeout(this.sourceLabelTimer);
  },

  /* ---------- 基本字段 ---------- */

  onTitle: function (e) { this.setData({ title: e.detail.value }); },
  onSummary: function (e) { this.setData({ summary: e.detail.value }); },
  onBody: function (e) { this.setData({ body: e.detail.value }); },
  onKeywords: function (e) { this.setData({ keywordText: e.detail.value }); },
  onReviewedAt: function (e) { this.setData({ reviewedAt: e.detail.value }); },
  onNextReviewAt: function (e) { this.setData({ nextReviewAt: e.detail.value }); },

  setCategory: function (e) {
    this.setData({ categoryId: Number(e.currentTarget.dataset.id || 1) });
  },

  toggleTag: function (e) {
    var id = Number(e.currentTarget.dataset.id || 0);
    var list = this.data.tagIds.slice();
    var at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1); else list.push(id);
    this.setData({ tagIds: list });
    var patch = {};
    for (var i = 0; i < this.data.tagView.length; i++) {
      patch['tagView[' + i + '].on'] = list.indexOf(this.data.tagView[i].id) >= 0;
    }
    this.setData(patch);
  },

  /* ---------- 要点 ---------- */

  addPoint: function () {
    var points = this.data.points.slice();
    points.push({
      id: newClientId('cp'),
      stance: 'neutral',
      title: '',
      detail: '',
      appliesTo: ''
    });
    this.setData({ points: points });
    this.refresh();
  },

  removePoint: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var points = this.data.points.slice();
    var removed = points[i];
    if (!removed) return;
    points.splice(i, 1);
    var patch = { points: points };
    for (var j = 0; j < this.data.sources.length; j++) {
      var ids = (this.data.sources[j].pointIds || []).slice();
      var at = ids.indexOf(removed.id);
      if (at >= 0) {
        ids.splice(at, 1);
        patch['sources[' + j + '].pointIds'] = ids;
      }
    }
    this.setData(patch);
    this.refreshSources();
  },

  onPointTitle: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var patch = {};
    patch['points[' + i + '].title'] = e.detail.value;
    this.setData(patch);
    this.scheduleSourceLabels();
  },

  onPointDetail: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var patch = {};
    patch['points[' + i + '].detail'] = e.detail.value;
    this.setData(patch);
  },

  onPointApplies: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var patch = {};
    patch['points[' + i + '].appliesTo'] = e.detail.value;
    this.setData(patch);
  },

  setPointStance: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var patch = {};
    patch['points[' + i + '].stance'] = e.currentTarget.dataset.k;
    this.setData(patch);
  },

  /* ---------- 依据 ---------- */

  addSource: function () {
    var sources = this.data.sources.slice();
    sources.push({
      id: newClientId('cs'),
      title: '',
      url: '',
      sourceType: 'article',
      platform: '',
      author: '',
      publishedAt: '',
      note: '',
      pointIds: []
    });
    this.setData({ sources: sources });
    this.refreshSources();
  },

  removeSource: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var sources = this.data.sources.slice();
    sources.splice(i, 1);
    this.setData({ sources: sources });
    this.refreshSources();
  },

  onSrcField: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var field = e.currentTarget.dataset.f;
    var patch = {};
    patch['sources[' + i + '].' + field] = e.detail.value;
    this.setData(patch);
  },

  setSrcType: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var patch = {};
    patch['sources[' + i + '].sourceType'] = e.currentTarget.dataset.k;
    this.setData(patch);
  },

  toggleSrcPoint: function (e) {
    var i = Number(e.currentTarget.dataset.i || 0);
    var pid = String(e.currentTarget.dataset.pid);
    var ids = (this.data.sources[i].pointIds || []).slice();
    var at = ids.indexOf(pid);
    if (at >= 0) ids.splice(at, 1); else ids.push(pid);
    var patch = {};
    patch['sources[' + i + '].pointIds'] = ids;
    var choices = this.data.sources[i].linkChoices || [];
    for (var j = 0; j < choices.length; j++) {
      if (String(choices[j].id) === pid) {
        patch['sources[' + i + '].linkChoices[' + j + '].on'] = ids.indexOf(choices[j].id) >= 0;
        break;
      }
    }
    this.setData(patch);
  },

  /* ---------- 校验与保存 ---------- */

  /**
   * 发布前校验 —— 与数据层同一套口径（§4.1）
   * 界面这一份只是提前把话说清楚，护栏本身在数据层。
   * ⚠️ 标题不在这里 —— 标题是每次保存的底线（草稿也要有），
   *    由 save() 统一检查，免得同一句话写两遍。
   */
  validate: function () {
    var errors = [];
    if (!String(this.data.summary || '').trim()) errors.push('结论不能为空');
    if (!this.data.points.length) errors.push('尚未填写要点，请先补充。');
    if (!this.data.sources.length) errors.push('至少需要 1 条依据，发布前请补充。');
    for (var i = 0; i < this.data.sources.length; i++) {
      if (!this.data.sources[i].pointIds || !this.data.sources[i].pointIds.length) {
        errors.push('存在未关联要点的依据，请先为其指定所支撑的要点。');
        break;
      }
    }
    return errors;
  },

  buildPayload: function () {
    var kws = String(this.data.keywordText || '').split(/[、,，\s]+/);
    var keywords = [];
    for (var i = 0; i < kws.length; i++) {
      var k = kws[i].trim();
      if (k) keywords.push(k);
    }
    var points = [];
    for (var j = 0; j < this.data.points.length; j++) {
      var p = this.data.points[j];
      points.push({
        id: p.id,
        stance: p.stance,
        title: String(p.title || '').trim(),
        detail: String(p.detail || '').trim(),
        appliesTo: String(p.appliesTo || '').trim()
      });
    }
    var sources = [];
    for (var m = 0; m < this.data.sources.length; m++) {
      var s = this.data.sources[m];
      sources.push({
        id: s.id,
        title: String(s.title || '').trim(),
        url: String(s.url || '').trim(),
        sourceType: s.sourceType,
        platform: String(s.platform || '').trim(),
        author: String(s.author || '').trim(),
        publishedAt: String(s.publishedAt || '').trim(),
        note: String(s.note || '').trim(),
        pointIds: s.pointIds || []
      });
    }
    var payload = {
      title: String(this.data.title || '').trim(),
      summary: String(this.data.summary || '').trim(),
      body: String(this.data.body || '').trim(),
      categoryId: this.data.categoryId,
      keywords: keywords,
      tagIds: this.data.tagIds,
      points: points,
      sources: sources
    };
    var reviewedAt = dateOnly(this.data.reviewedAt);
    if (reviewedAt) payload.reviewedAt = reviewedAt;
    if (this.data.id) {
      payload.id = this.data.id;
      payload.nextReviewAt = dateOnly(this.data.nextReviewAt) || null;
    }
    return payload;
  },

  save: function (publish) {
    var self = this;
    if (this.data.saving) return;
    /* 标题是底线：草稿也必须有标题 */
    var errors = [];
    if (!String(this.data.title || '').trim()) errors.push('标题不能为空');
    if (publish) {
      errors = errors.concat(this.validate());
    }
    if (errors.length) {
      this.setData({ errors: errors });
      return;
    }
    this.setData({ errors: [], saving: true, hint: '' });
    var payload = this.buildPayload();
    return api.saveExperience(payload).then(function (res) {
      var id = res.id || self.data.id;
      /* 服务端的 hint（「内容已保存，但搜索索引还没建好」）要显示出来 ——
         之前只用了 res.id，hint 被丢掉，索引失败就没人知道了。 */
      var hint = (res && res.hint) || '';
      if (!publish) {
        self.setData({ saving: false, id: id, isNew: false, hint: hint });
        wx.showToast({ title: hint ? '已存草稿' : '已存草稿', icon: 'none' });
        return;
      }
      return api.publishExperience(id).then(function (pres) {
        var hint2 = hint || ((pres && pres.hint) || '');
        self.setData({ saving: false, id: id, isNew: false, hint: hint2 });
        wx.showToast({ title: '已发布', icon: 'none' });
      });
    }).catch(function (err) {
      self.setData({ saving: false });
      var list = (err && err.errors) || [];
      if (list.length) {
        self.setData({ errors: list });
        return;
      }
      self.setData({ hint: (err && err.message) || '保存失败，请稍后重试' });
    });
  },

  saveDraft: function () {
    this.save(false);
  },

  publish: function () {
    this.save(true);
  },

  backHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
