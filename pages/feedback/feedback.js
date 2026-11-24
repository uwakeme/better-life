/**
 * 反馈提交页
 *
 * 职责：条目级反馈（从详情页进）与项目级反馈（从「我的反馈」进）共用这一页。
 * 口径（设计文档 §4.3 / §9.4）：
 *   1. 只给普通用户 —— 管理员视角下不渲染表单，只给一句说明和去反馈盒的入口。
 *   2. 反馈类型只有内容层面的几类：纠错 / 补充说明 / 提问 / 建议。
 *   3. 最多附 3 张图；图片先上传换 media_id，临时路径不能直接送审。
 *   4. 反馈只有提交者与管理员看得到，不公开。
 */
var api = require('../../utils/api');
var role = require('../../utils/role');
var format = require('../../utils/format');
var config = require('../../config/index');

var KINDS = ['correction', 'supplement', 'question', 'suggestion'];
var chooserPending = false;
var pendingUploads = 0;
var uploadTaskSeq = 0;

function safeTitle (value) {
  var raw = String(value == null ? '' : value).slice(0, 120);
  try {
    return decodeURIComponent(raw).slice(0, 120);
  } catch (e) {
    return raw;
  }
}

Page({
  data: {
    isAdmin: false,
    targetType: 'project',
    targetId: 0,
    targetTitle: '',
    kinds: [],
    kind: '',
    content: '',
    images: [],
    maxImages: config.feedbackImageMax,
    submitting: false,
    pending: false,
    uploading: false,
    hint: ''
  },

  onLoad: function (query) {
    var q = query || {};
    var kinds = [];
    for (var i = 0; i < KINDS.length; i++) {
      kinds.push({ key: KINDS[i], name: format.FEEDBACK_KIND_LABEL[KINDS[i]] });
    }
    this.setData({
      isAdmin: role.isAdmin(),
      targetType: q.targetType === 'experience' ? 'experience' : 'project',
      targetId: Number(q.targetId || 0),
      targetTitle: safeTitle(q.title),
      kinds: kinds
    });
  },

  setKind: function (e) {
    this.setData({ kind: e.currentTarget.dataset.k, hint: '' });
  },

  onContent: function (e) {
    this.setData({ content: e.detail.value, hint: '' });
  },

  chooseImage: function () {
    var self = this;
    if (chooserPending || pendingUploads || this.data.submitting) return;
    var remain = this.data.maxImages - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多只能附 ' + this.data.maxImages + ' 张图片', icon: 'none' });
      return;
    }
    if (typeof wx.chooseMedia !== 'function') {
      wx.showToast({ title: '当前环境不支持选图', icon: 'none' });
      return;
    }
    chooserPending = true;
    this.setData({ pending: true });
    var finishChoose = function () {
      chooserPending = false;
      self.setData({ pending: false });
    };
    try {
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sizeType: ['compressed'],
        success: function (res) {
          finishChoose();
          var files = res.tempFiles || [];
          var paths = [];
          for (var i = 0; i < files.length && paths.length < remain; i++) {
            if (files[i] && files[i].tempFilePath) paths.push(files[i].tempFilePath);
          }
          self.uploadAll(paths);
        },
        fail: finishChoose
      });
    } catch (e) {
      finishChoose();
    }
  },

  uploadAll: function (paths) {
    var self = this;
    var list = (paths || []).slice(0, Math.max(0, this.data.maxImages - this.data.images.length));
    if (!list.length || pendingUploads || this.data.submitting) return;
    var task = ++uploadTaskSeq;
    var done = 0;
    var failed = 0;
    pendingUploads = list.length;
    this.setData({ uploading: true, hint: '' });
    for (var i = 0; i < list.length; i++) {
      (function (filePath) {
        var finish = function (err, result) {
          if (task !== uploadTaskSeq) return;
          done++;
          pendingUploads--;
          if (err) {
            failed++;
            self.setData({ hint: (err && err.message) || '有一张图没能上传成功' });
          } else if (self.data.images.length < self.data.maxImages) {
            self.setData({ images: self.data.images.concat([result]) });
          }
          if (pendingUploads === 0) {
            self.setData({ uploading: false });
            if (!failed) wx.showToast({ title: '图片已附上', icon: 'none' });
          }
        };
        api.uploadImage(filePath).then(function (result) {
          finish(null, result);
        }, function (err) {
          finish(err);
        });
      })(list[i]);
    }
  },

  removeImage: function (e) {
    if (chooserPending || pendingUploads || this.data.uploading || this.data.submitting) return;
    var i = Number(e.currentTarget.dataset.i || 0);
    var list = this.data.images.slice();
    list.splice(i, 1);
    this.setData({ images: list });
  },

  onUnload: function () {
    uploadTaskSeq++;
    pendingUploads = 0;
    chooserPending = false;
  },

  submit: function () {
    var self = this;
    if (this.data.submitting) return;
    if (chooserPending || pendingUploads || this.data.uploading || this.data.pending) {
      this.setData({ hint: '图片还在上传，稍等一下' });
      return;
    }
    if (this.data.images.length > this.data.maxImages) {
      this.setData({ hint: '最多只能附 ' + this.data.maxImages + ' 张图片' });
      return;
    }
    if (!this.data.kind) {
      this.setData({ hint: '请先选择反馈类型' });
      return;
    }
    if (!String(this.data.content || '').trim()) {
      this.setData({ hint: '请填写反馈内容' });
      return;
    }
    this.setData({ submitting: true, hint: '' });
    var payload = {
      targetType: this.data.targetType,
      targetId: this.data.targetType === 'experience' ? this.data.targetId : null,
      kind: this.data.kind,
      content: String(this.data.content).trim(),
      images: this.data.images
    };
    return api.submitFeedback(payload).then(function () {
      self.setData({ submitting: false });
      wx.showToast({ title: '已提交', icon: 'none' });
      /* 不延迟返回 —— 延迟期间用户自己退出会多退一层页面。 */
      wx.navigateBack({ delta: 1, fail: function () { wx.switchTab({ url: '/pages/home/home' }); } });
    }).catch(function (err) {
      self.setData({ submitting: false });
      var msg = (err && err.message) || '提交失败，请稍后重试';
      self.setData({ hint: msg });
    });
  },

  goAdminFeedback: function () {
    wx.redirectTo({ url: '/pages/admin/feedback/feedback' });
  }
});
