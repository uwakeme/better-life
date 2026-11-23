/**
 * 搜索页
 *
 * 职责：混合检索 + 领域/立场筛选 + 本机搜索历史。
 * 五个状态（设计文档 §3.5）：默认 / 输入中 / 结果 / 无结果 / 超时。
 * 口径：
 *   1. 输入 300ms 防抖；**输入过程不写历史**，只记提交过的查询（§3.4）。
 *   2. 历史只存本机，最多 8 条，重复搜索挪到最前，有清空入口，不上传（§3.4）。
 *   3. 联想词来自本机历史与已收录内容，面板上要标明来源。
 *   4. 领域与立场是两组筛选，同组里「全部」与具体项互斥。
 *   5. mode 不为 hybrid 时如实提示降级（§7.7）。
 */
var api = require('../../utils/api');
var config = require('../../config/index');
var storage = require('../../utils/storage');
var searchUtil = require('../../utils/search');
var view = require('../../utils/view');

Page({
  data: {
    input: '',
    q: '',
    searched: false,
    loading: false,
    error: '',
    timeout: false,
    mode: '',
    source: '',
    cards: [],
    hist: [],
    suggest: [],
    showFilters: false,
    catId: 0,
    stance: '',
    categories: [],
    recent: []
  },

  onLoad: function (query) {
    var q = query && query.q ? String(query.q) : '';
    this.setData({ hist: this.readHist(), q: q, input: q });
    this.loadBase();
    if (q) this.doSearch(q);
  },

  onShow: function () {
    this.setData({ hist: this.readHist() });
  },

  /** 默认态的两样东西：本机历史 + 最近收录的内容 */
  loadBase: function () {
    var self = this;
    api.getCategories().then(function (res) {
      self.setData({
        source: res.source || 'demo',
        categories: (res.categories || []).map(function (c) {
          return { id: c.id, name: c.name };
        })
      });
    });
    api.listExperiences({ size: 8 }).then(function (res) {
      var items = res.items || [];
      var cards = [];
      for (var i = 0; i < items.length; i++) cards.push(view.cardView(items[i]));
      self.setData({ recent: cards });
    }).catch(function () {
      /* 默认态拿不到就空着，不影响搜索 */
    });
  },

  /* ---------- 搜索历史：只存本机 ---------- */

  readHist: function () {
    var list = storage.get(config.searchHistoryKey);
    return Array.isArray(list) ? list : [];
  },

  writeHist: function (q) {
    var list = this.readHist();
    var key = String(q || '').trim();
    if (!key) return list;
    var next = [];
    next.push(key);
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== key && next.length < config.searchHistoryMax) next.push(list[i]);
    }
    storage.set(config.searchHistoryKey, next);
    return next;
  },

  clearHist: function () {
    storage.remove(config.searchHistoryKey);
    this.setData({ hist: [] });
  },

  /* ---------- 输入与联想 ---------- */

  onInput: function (e) {
    var val = e.detail.value;
    this.setData({ input: val });
    this.debouncedSuggest(val);
  },

  onDebouncedSuggest: function (val) {
    var q = searchUtil.normalize(val);
    if (!q) {
      this.setData({ suggest: [] });
      return;
    }
    /* 联想来自本机历史与已收录内容 —— 不查别人的搜索记录 */
    var pool = [];
    var hist = this.readHist();
    for (var i = 0; i < hist.length; i++) pool.push({ text: hist[i], from: 'history' });
    var recent = this.data.recent || [];
    for (var j = 0; j < recent.length; j++) {
      pool.push({ text: recent[j].title, from: 'content' });
    }
    var cats = this.data.categories || [];
    for (var k = 0; k < cats.length; k++) pool.push({ text: cats[k].name, from: 'content' });
    var out = [];
    var seen = {};
    for (var m = 0; m < pool.length; m++) {
      var t = pool[m].text;
      if (!t || seen[t]) continue;
      if (searchUtil.normalize(t).indexOf(q) < 0) continue;
      seen[t] = true;
      out.push(pool[m]);
      if (out.length >= 6) break;
    }
    this.setData({ suggest: out });
  },

  onFocus: function () {
    if (!this.data.input) this.setData({ suggest: [] });
  },

  pickSuggest: function (e) {
    var text = e.currentTarget.dataset.text;
    this.setData({ input: text, suggest: [] });
    this.doSearch(text);
  },

  clearInput: function () {
    this.setData({ input: '', q: '', suggest: [], searched: false, cards: [], error: '', timeout: false });
  },

  /* ---------- 检索 ---------- */

  doSearch: function (q) {
    var self = this;
    var key = String(q || '').trim();
    if (!key) return;
    this.setData({ q: key, input: key, searched: true, loading: true, error: '', timeout: false, suggest: [] });
    var body = { query: key, limit: 20 };
    if (this.data.catId) body.categoryIds = [this.data.catId];
    if (this.data.stance) body.stance = this.data.stance;
    return api.search(body).then(function (res) {
      var items = res.items || [];
      var cards = [];
      for (var i = 0; i < items.length; i++) {
        var hit = view.hitLabel(items[i].matchedOn);
        cards.push(view.cardView(items[i].experience, hit));
      }
      /* 只有提交过的查询才进历史 */
      var hist = self.writeHist(key);
      self.setData({
        loading: false,
        cards: cards,
        mode: res.mode || '',
        source: res.source || 'demo',
        hist: hist
      });
    }).catch(function (err) {
      var code = err && err.code;
      self.setData({
        loading: false,
        timeout: code === 'TIMEOUT',
        error: code === 'TIMEOUT' ? '' : ((err && err.message) || '检索没成功，请重试'),
        cards: []
      });
    });
  },

  retry: function () {
    this.doSearch(this.data.q);
  },

  /* ---------- 筛选 ---------- */

  toggleFilters: function () {
    this.setData({ showFilters: !this.data.showFilters });
  },

  onCat: function (e) {
    this.setData({ catId: Number(e.detail.value || 0) });
    this.doSearch(this.data.q);
  },

  onStance: function (e) {
    this.setData({ stance: e.detail.value || '' });
    this.doSearch(this.data.q);
  },

  clearFilters: function () {
    this.setData({ catId: 0, stance: '' });
    this.doSearch(this.data.q);
  },

  openExp: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  goHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  },

  pickHist: function (e) {
    var text = e.currentTarget.dataset.text;
    this.setData({ input: text });
    this.doSearch(text);
  }
});
