/**
 * 管理-标签
 *
 * 职责：二级标签的归属领域、改名与新增。
 * 口径（设计文档 §14 D16）：唯一键是（领域, 名称）—— 标签同名可以跨领域存在，
 * 所以改名时必须连同领域一起判重，不能只看名字。
 */
var api = require('../../../utils/api');
var role = require('../../../utils/role');

Page({
  data: {
    allowed: false,
    loading: true,
    error: '',
    groups: [],
    categories: [],
    editingId: 0,
    editName: '',
    adding: false,
    newName: '',
    newCat: 0,
    hint: ''
  },

  onLoad: function () {
    if (!role.canManage()) {
      this.setData({ allowed: false });
      return;
    }
    this.setData({ allowed: true });
    /* ⚠️ 之前 loadCats() 与 load() 并行发出，
       load() 直接读 this.data.categories 来分组 ——
       如果它先返回，分组就是在空的领域列表上做的，之后也不会重建。
       串起来：先拿领域，再分组。 */
    this.loadCats().then(this.load.bind(this));
  },

  loadCats: function () {
    var self = this;
    return api.getCategories().then(function (res) {
      var cats = res.categories || [];
      var items = [];
      for (var i = 0; i < cats.length; i++) {
        items.push({ id: cats[i].id, name: cats[i].name });
      }
      self.setData({ categories: items, newCat: items.length ? items[0].id : 0 });
    }).catch(function () { /* 拿不到就只做改名与删除 */ });
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    return api.listAdminTags().then(function (res) {
      var list = res.items || [];
      var cats = self.data.categories;
      var groups = [];
      for (var i = 0; i < cats.length; i++) {
        groups.push({ id: cats[i].id, name: cats[i].name, tags: [] });
      }
      for (var j = 0; j < list.length; j++) {
        var t = list[j];
        var hit = false;
        for (var k = 0; k < groups.length; k++) {
          if (groups[k].id === Number(t.categoryId)) {
            groups[k].tags.push({ id: t.id, name: t.name, categoryId: t.categoryId });
            hit = true;
            break;
          }
        }
        if (!hit) {
          groups.push({ id: Number(t.categoryId), name: t.categoryName || '未归类', tags: [{ id: t.id, name: t.name, categoryId: t.categoryId }] });
        }
      }
      self.setData({ loading: false, groups: groups });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络不太顺畅，没连上' });
    });
  },

  startEdit: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var name = e.currentTarget.dataset.name;
    this.setData({ editingId: id, editName: name, hint: '' });
  },

  onEditName: function (e) {
    this.setData({ editName: e.detail.value });
  },

  cancelEdit: function () {
    this.setData({ editingId: 0, editName: '' });
  },

  saveEdit: function () {
    var self = this;
    var id = this.data.editingId;
    var name = String(this.data.editName || '').trim();
    if (!name) {
      this.setData({ hint: '标签名不能为空' });
      return;
    }
    var catId = 0;
    for (var i = 0; i < this.data.groups.length; i++) {
      var tags = this.data.groups[i].tags;
      for (var j = 0; j < tags.length; j++) {
        if (tags[j].id === id) catId = this.data.groups[i].id;
      }
    }
    return api.saveTag({ id: id, name: name, categoryId: catId }).then(function () {
      self.setData({ editingId: 0, editName: '', hint: '' });
      wx.showToast({ title: '已保存', icon: 'none' });
      self.load();
    }).catch(function (err) {
      self.setData({ hint: (err && err.message) || '保存失败，请稍后重试' });
    });
  },

  remove: function (e) {
    var self = this;
    var id = Number(e.currentTarget.dataset.id);
    var name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除标签',
      content: '确定删除「' + name + '」？已经用上这个标签的经验不会被改动，只是这里不再显示它。',
      confirmText: '删除',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        api.removeTag(id).then(function () {
          wx.showToast({ title: '已删除', icon: 'none' });
          self.load();
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        });
      }
    });
  },

  startAdd: function () {
    this.setData({ adding: true, newName: '', hint: '' });
  },

  cancelAdd: function () {
    this.setData({ adding: false, newName: '' });
  },

  onNewName: function (e) {
    this.setData({ newName: e.detail.value });
  },

  setNewCat: function (e) {
    this.setData({ newCat: Number(e.currentTarget.dataset.id || 0) });
  },

  saveAdd: function () {
    var self = this;
    var name = String(this.data.newName || '').trim();
    if (!name) {
      this.setData({ hint: '标签名不能为空' });
      return;
    }
    return api.saveTag({ name: name, categoryId: this.data.newCat }).then(function () {
      self.setData({ adding: false, newName: '', hint: '' });
      wx.showToast({ title: '已新增', icon: 'none' });
      self.load();
    }).catch(function (err) {
      self.setData({ hint: (err && err.message) || '新增失败，请稍后重试' });
    });
  },

  backHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  },

  retry: function () {
    this.load();
  }
});
