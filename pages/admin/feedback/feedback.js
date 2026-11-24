/**
 * 反馈盒（管理-反馈）
 *
 * 职责：逐条处理读者提的反馈。
 * 口径（设计文档 §4.3）：
 *   1. 处理反馈一次提交落库 —— 结论（采纳 / 不采纳 / 只回话）+ 可选回复，
 *      合成一次请求提交，不拆成两个按钮两个请求。
 *   2. 理由不强制：采纳 / 不采纳只是给这条反馈下一个结论；
 *      只有「只回话」必须写回复（不写就等于没答复）。
 *      这条护栏落在数据层（local.resolveFeedback / 服务端 resolveFeedback），
 *      界面只是再给一句好懂的提示。
 *   3. 管理侧要看得见图 —— 审核中 / 已通过 / 未通过都显示图片并标出状态。
 */
var api = require('../../../utils/api');
var role = require('../../../utils/role');
var format = require('../../../utils/format');

/** 三个处理结论互斥，选一个 */
var CHOICES = [
  { key: 'accepted', name: '采纳', desc: '按这条反馈改了内容' },
  { key: 'ignored', name: '不采纳', desc: '内容不改' },
  { key: 'replied', name: '只回话', desc: '答复了，但不用改内容' }
];

var FILTERS = [
  { key: 'all', name: '全部' },
  { key: 'pending', name: '待处理' },
  { key: 'accepted', name: '已采纳' },
  { key: 'ignored', name: '不采纳' },
  { key: 'replied', name: '已回复' }
];

Page({
  data: {
    allowed: false,
    loading: true,
    error: '',
    items: [],
    filters: FILTERS,
    filter: 'all',
    choices: CHOICES,
    activeId: 0,
    pick: '',
    reply: '',
    hint: '',
    submitting: false
  },

  onLoad: function () {
    if (!role.canManage()) {
      this.setData({ allowed: false });
      return;
    }
    this.setData({ allowed: true });
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return api.listAdminFeedbacks({ status: this.data.filter }).then(function (res) {
      var list = res.items || [];
      var items = [];
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        var imgs = [];
        var arr = f.images || [];
        for (var j = 0; j < arr.length; j++) {
          imgs.push({ url: arr[j].url || '', name: arr[j].name || '' });
        }
        items.push({
          id: f.id,
          kindLabel: format.FEEDBACK_KIND_LABEL[f.kind] || '反馈',
          statusLabel: format.FEEDBACK_STATUS_LABEL[f.status] || '待处理',
          status: f.status,
          content: f.content || '',
          reply: f.reply || '',
          author: f.author || '读者',
          /* 日期统一成 YYYY-MM-DD —— 服务端可能带时间部分 */
          createdAt: format.date(f.createdAt) || '',
          targetType: f.targetType || 'project',
          targetId: f.targetId || 0,
          mediaStatus: f.mediaStatus || 'none',
          mediaLabel: format.MEDIA_STATUS_LABEL[f.mediaStatus] || '',
          images: imgs
        });
      }
      self.setData({ loading: false, items: items });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  setFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.k, activeId: 0, pick: '', reply: '' });
    this.load();
  },

  /**
   * 打开处理面板
   * ⚠️ 之前每次打开都把回复框清空 —— 管理员写了一半的回复，
   *    换个结论再打开就没了。现在带出这条反馈已写的回复。
   */
  openPanel: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    if (this.data.activeId === id) {
      this.setData({ activeId: 0, pick: '', reply: '', hint: '' });
      return;
    }
    var existing = '';
    var items = this.data.items || [];
    for (var i = 0; i < items.length; i++) {
      if (Number(items[i].id) === id) {
        existing = items[i].reply || '';
        break;
      }
    }
    this.setData({ activeId: id, pick: '', reply: existing, hint: '' });
  },

  setPick: function (e) {
    this.setData({ pick: e.currentTarget.dataset.k, hint: '' });
  },

  onReply: function (e) {
    this.setData({ reply: e.detail.value, hint: '' });
  },

  submit: function (e) {
    var self = this;
    var id = Number(e.currentTarget.dataset.id);
    if (this.data.submitting) return;
    if (!this.data.pick) {
      this.setData({ hint: '先选一个怎么处理这条' });
      return;
    }
    if (this.data.pick === 'replied' && !String(this.data.reply || '').trim()) {
      this.setData({ hint: '选了「只回话」，那就写点什么吧' });
      return;
    }
    this.setData({ submitting: true, hint: '' });
    /* reply 只在「只回话」时必须写；其余结论下，
       回复框里没内容就**不传** reply —— 服务端会保留原来的回复，
       而不是把它清成空串。 */
    var body = { status: this.data.pick };
    var replyText = String(this.data.reply || '').trim();
    if (replyText) body.reply = replyText;
    return api.resolveFeedback(id, body)
      .then(function () {
        self.setData({ submitting: false, activeId: 0, pick: '', reply: '' });
        wx.showToast({ title: '已处理', icon: 'none' });
        self.load();
      }).catch(function (err) {
        self.setData({ submitting: false });
        self.setData({ hint: (err && err.message) || '未生效，请稍后重试' });
      });
  },

  openExp: function (e) {
    var id = Number(e.currentTarget.dataset.id || 0);
    if (!id) return;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  backHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  },

  retry: function () {
    this.load();
  }
});
