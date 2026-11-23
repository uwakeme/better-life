/**
 * 接口用例集
 *
 * 职责：把「哪些接口应该怎么表现」写成一份可复用的用例。
 * 为什么单独抽出来：内存库自检（selftest.js）与对着跑真实实例的联调（http-test.js）
 *   必须跑同一份断言 —— 各写各的，迟早有一边会漏掉某个口径。
 *
 * 用法：const { runCases, report } = require('./cases');
 *       const results = await runCases(request);
 *       // request(base, method, path, body, token) -> { status, body }
 */

/* ---------- 迷你断言框架 ---------- */
const results = [];
let currentGroup = '';

function group (name) {
  currentGroup = name;
}

function check (name, condition, detail) {
  results.push({
    group: currentGroup,
    name: name,
    pass: !!condition,
    detail: condition ? '' : (detail || '')
  });
}

function eq (name, actual, expected, extra) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, (extra ? extra + '；' : '') +
    '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
}

/* ---------- 安全读取响应体 ---------- */
/* 一处失败不能带崩整轮自检，所以所有响应体读取都走这几个空壳函数。 */
function D (r) {
  const d = r && r.body && r.body.data;
  return d && typeof d === 'object' ? d : {};
}

function E (r) {
  const e = r && r.body && r.body.error;
  return e && typeof e === 'object' ? e : {};
}

function L (x) {
  return Array.isArray(x) ? x : [];
}

function O (x) {
  return x && typeof x === 'object' ? x : {};
}

/* ---------- 用例 ---------- */
async function runCases (request) {
  let userToken = '';
  let adminToken = '';

  /* 1 健康检查 */
  group('健康检查');
  let r = await request('GET', '/api/health');
  eq('status 200', r.status, 200);
  check('ok=true', r.body && r.body.ok === true);
  check('如实报告向量库实现', !!D(r).vectorStore, JSON.stringify(r.body));
  check('如实报告语义是否可用', typeof D(r).semantic === 'boolean');
  check('如实报告审核是否真跑', !!D(r).seccheckMode);

  /* 2 目录 */
  group('目录');
  r = await request('GET', '/api/categories');
  eq('status 200', r.status, 200);
  check('九个一级领域', L(D(r).categories).length === 9, '实际 ' + L(D(r).categories).length);
  check('标签一并返回', L(D(r).tags).length > 0);
  r = await request('GET', '/api/tags');
  check('GET /api/tags 可用', r.status === 200 && L(D(r).items).length > 0);

  /* 3 经验列表 */
  group('经验列表');
  r = await request('GET', '/api/experiences?size=100');
  eq('status 200', r.status, 200);
  check('列表非空', L(D(r).items).length > 0);
  check('总数与条目数一致', D(r).total >= L(D(r).items).length);
  const sample = O(L(D(r).items)[0]);
  check('条目带领域名', typeof sample.categoryName === 'string' && sample.categoryName.length > 0);
  check('条目带要点（卡片要显示立场计数）', Array.isArray(sample.points));

  r = await request('GET', '/api/experiences?categoryId=1&size=100');
  check('按领域筛选生效', L(D(r).items).every(function (e) { return e.categoryId === 1; }));

  r = await request('GET', '/api/experiences?tagId=1&size=100');
  check('按标签筛选生效', L(D(r).items).length > 0);

  r = await request('GET', '/api/experiences?stance=good&size=100');
  check('按立场筛选生效（要点级）', L(D(r).items).every(function (e) {
    return L(O(e).points).some(function (p) { return p.stance === 'good'; });
  }));

  /* 4 详情 */
  group('经验详情');
  r = await request('GET', '/api/experiences/1');
  eq('status 200', r.status, 200);
  check('返回 experience / points / sources', !!D(r).experience && !!D(r).points && !!D(r).sources);
  check('要点带立场', L(D(r).points).length > 0 && !!O(L(D(r).points)[0]).stance);
  check('依据带 pointIds', L(D(r).sources).length > 0 && Array.isArray(O(L(D(r).sources)[0]).pointIds));
  check('相关经验非空', L(D(r).related).length > 0);

  r = await request('GET', '/api/experiences/999999');
  eq('不存在的 id 返回 404', r.status, 404);
  check('错误码 NOT_FOUND', E(r).code === 'NOT_FOUND');

  /* 5 依据映射 */
  group('依据映射');
  r = await request('GET', '/api/experiences/1/sources');
  eq('status 200', r.status, 200);
  check('按要点分组', L(D(r).groups).length > 0);
  check('分组里有依据', L(D(r).groups).some(function (g) { return L(O(g).sources).length > 0; }));

  /* 6 登录 */
  group('登录');
  r = await request('POST', '/api/auth/login', { code: 'user' });
  eq('status 200', r.status, 200);
  check('返回 token', typeof D(r).token === 'string' && D(r).token.length > 20);
  userToken = D(r).token;
  check('返回角色', O(D(r).user).role === 'user');

  r = await request('POST', '/api/auth/login', { code: 'admin' });
  adminToken = D(r).token;
  check('管理员登录拿到 admin 角色', O(D(r).user).role === 'admin');

  r = await request('POST', '/api/auth/login', {});
  eq('缺 code 返回 400', r.status, 400);

  /* 7 鉴权 */
  group('鉴权');
  r = await request('GET', '/api/me');
  eq('无 token 返回 401', r.status, 401);
  r = await request('GET', '/api/me', undefined, 'not-a-token');
  eq('坏 token 返回 401', r.status, 401);
  r = await request('GET', '/api/me', undefined, userToken);
  eq('带 token 返回 200', r.status, 200, JSON.stringify(r.body));
  check('返回指标', typeof O(D(r).metrics).favorites === 'number');
  check('返回角色来自数据库', O(D(r).user).role === 'user');

  /* 8 收藏 */
  group('收藏');
  r = await request('POST', '/api/me/favorites/2', {}, userToken);
  eq('收藏成功', r.status, 200);
  r = await request('GET', '/api/me/favorites', undefined, userToken);
  check('收藏列表含这条', L(D(r).items).some(function (e) { return e.id === 2; }));
  r = await request('POST', '/api/me/favorites/2', {}, userToken);
  eq('重复收藏不报错（幂等）', r.status, 200);
  r = await request('DELETE', '/api/me/favorites/2', undefined, userToken);
  eq('取消收藏成功', r.status, 200);
  r = await request('GET', '/api/me/favorites', undefined, userToken);
  check('取消后不在列表里', !L(D(r).items).some(function (e) { return e.id === 2; }));

  /* 9 投票 */
  group('投票');
  r = await request('POST', '/api/me/votes/3', { useful: true }, userToken);
  eq('投「有用」成功', r.status, 200);
  const up = D(r).usefulCount;
  check('有用计数 +1', up >= 1, '实际 ' + up);
  r = await request('POST', '/api/me/votes/3', { useful: false }, userToken);
  eq('改投成功', r.status, 200);
  check('改投后有用计数回落', D(r).usefulCount === up - 1, '有用 ' + D(r).usefulCount + '，之前 ' + up);
  check('改投后没用计数 +1', D(r).notUsefulCount >= 1);
  r = await request('POST', '/api/me/votes/3', { useful: false }, userToken);
  eq('再点一次取消投', r.status, 200);
  check('取消后没用计数回落', D(r).notUsefulCount === 0, '实际 ' + D(r).notUsefulCount);
  check('取消后有用计数也归位', D(r).usefulCount === up - 1, '实际 ' + D(r).usefulCount);

  /* 10 反馈：普通用户 */
  group('反馈提交');
  r = await request('POST', '/api/feedbacks', { kind: '', content: 'x' }, userToken);
  eq('缺类型返回 400', r.status, 400);
  r = await request('POST', '/api/feedbacks', { kind: 'correction', content: '   ' }, userToken);
  eq('缺内容返回 400', r.status, 400);
  r = await request('POST', '/api/feedbacks', {
    targetType: 'experience', targetId: 1, kind: 'correction', content: '这里的措辞不太对'
  }, userToken);
  eq('正常提交成功', r.status, 200, JSON.stringify(r.body));
  const fbId = D(r).id;
  check('落库状态 pending', D(r).status === 'pending');
  r = await request('GET', '/api/me/feedbacks', undefined, userToken);
  check('我的反馈里有这条', L(D(r).items).some(function (f) { return f.id === fbId; }));
  check('别的反馈看不到（仅自己的）', L(D(r).items).every(function (f) { return f.openid === 'dev-user'; }));

  /* 11 反馈：管理员不提交 */
  group('管理员不提交反馈');
  r = await request('POST', '/api/feedbacks', { kind: 'suggestion', content: '管理员的反馈' }, adminToken);
  eq('管理员提交返回 403', r.status, 403);

  /* 12 管理端权限 */
  group('管理端权限');
  r = await request('GET', '/api/admin/experiences', undefined, userToken);
  eq('普通用户访问返回 403', r.status, 403);
  r = await request('GET', '/api/admin/experiences', undefined, adminToken);
  eq('管理员访问返回 200', r.status, 200);
  check('含草稿', L(D(r).items).length >= 30, '实际 ' + L(D(r).items).length);
  r = await request('GET', '/api/admin/experiences?q=洗发水', undefined, adminToken);
  check('管理端搜索能命中', L(D(r).items).length > 0);

  /* 13 管理端：写经验 */
  group('管理端写经验');
  r = await request('POST', '/api/admin/experiences', {
    title: '', summary: '', points: [], sources: []
  }, adminToken);
  eq('空内容被拒（发布前校验）', r.status, 400);
  check('返回校验错误列表', L(E(r).errors).length > 0);

  r = await request('POST', '/api/admin/experiences', {
    title: '自检建的测试经验',
    summary: '这是自检建的，用来验证写入链路。',
    body: '正文。',
    categoryId: 1,
    keywords: ['自检'],
    points: [{ id: 'cp1', stance: 'good', title: '要点一', detail: '理由', appliesTo: '条件' }],
    sources: [{ id: 'cs1', title: '依据一', url: 'https://example.org/a', sourceType: 'article', platform: '自检', author: '自检', publishedAt: '2026-11-01', note: '自检', pointIds: ['cp1'] }],
    tagIds: [1],
    status: 'draft'
  }, adminToken);
  eq('新建成功', r.status, 200, JSON.stringify(r.body));
  const newId = D(r).id;
  check('拿到新 id', !!newId);

  r = await request('GET', '/api/admin/experiences/' + newId, undefined, adminToken);
  eq('读回成功', r.status, 200);
  check('要点写进去了', L(D(r).points).length === 1);
  check('依据写进去了', L(D(r).sources).length === 1);
  const backSource = O(L(D(r).sources)[0]);
  const backPoint = O(L(D(r).points)[0]);
  check('依据的 pointIds 已映射到真实 id',
    L(backSource.pointIds).length === 1 && L(backSource.pointIds)[0] === backPoint.id,
    JSON.stringify(backSource.pointIds) + ' vs ' + JSON.stringify(backPoint.id));
  check('标签关联写进去了', L(D(r).tagIds).length === 1);

  r = await request('POST', '/api/admin/experiences/' + newId + '/publish', {}, adminToken);
  eq('发布成功', r.status, 200);
  r = await request('GET', '/api/experiences/' + newId);
  eq('发布后读者可见', r.status, 200);

  r = await request('POST', '/api/admin/experiences/' + newId + '/unpublish', {}, adminToken);
  eq('下线成功', r.status, 200);
  r = await request('GET', '/api/experiences/' + newId);
  eq('下线后读者不可见', r.status, 404);

  /* 14 管理端：反馈处理 */
  group('反馈处理');
  r = await request('GET', '/api/admin/feedbacks', undefined, adminToken);
  eq('反馈盒可读', r.status, 200);
  check('反馈盒有数据', L(D(r).items).length > 0);
  check('反馈带关联经验标题', L(D(r).items).some(function (f) { return typeof f.targetTitle === 'string'; }));

  r = await request('PATCH', '/api/admin/feedbacks/' + fbId, { status: 'replied', reply: '' }, adminToken);
  eq('「只回话」不写回复被拒', r.status, 400);
  r = await request('PATCH', '/api/admin/feedbacks/' + fbId, { status: 'bogus', reply: 'x' }, adminToken);
  eq('非法状态被拒', r.status, 400);
  r = await request('PATCH', '/api/admin/feedbacks/' + fbId, { status: 'accepted', reply: '' }, adminToken);
  eq('采纳成功（理由可省）', r.status, 200);
  check('状态落库', D(r).status === 'accepted');
  r = await request('PATCH', '/api/admin/feedbacks/' + fbId, { status: 'replied', reply: '已按你的说法改了措辞。' }, adminToken);
  eq('只回话 + 写入回复成功', r.status, 200);

  /* 15 管理端：标签 */
  group('标签管理');
  r = await request('POST', '/api/admin/tags', { name: '自检标签', categoryId: 1 }, adminToken);
  eq('新增标签成功', r.status, 200);
  const tagId = D(r).id;
  r = await request('POST', '/api/admin/tags', { name: '自检标签', categoryId: 1 }, adminToken);
  eq('同领域重名被拒', r.status, 400);
  r = await request('POST', '/api/admin/tags', { name: '自检标签', categoryId: 2 }, adminToken);
  eq('跨领域同名允许', r.status, 200);
  r = await request('PUT', '/api/admin/tags/' + tagId, { name: '自检标签改名', categoryId: 1 }, adminToken);
  eq('改名成功', r.status, 200);
  r = await request('DELETE', '/api/admin/tags/' + tagId, undefined, adminToken);
  eq('删除成功', r.status, 200);

  /* 16 检索 */
  group('检索');
  r = await request('POST', '/api/search', { query: '洗发水' });
  eq('status 200', r.status, 200);
  check('搜到了结果', L(D(r).items).length > 0, '命中 ' + L(D(r).items).length);
  check('mode 如实上报', ['hybrid', 'vector', 'keyword', 'degraded'].indexOf(D(r).mode) >= 0, D(r).mode);
  check('local embedding 下不许报 hybrid', D(r).mode !== 'hybrid', D(r).mode);
  check('local embedding 下报 keyword', D(r).mode === 'keyword', D(r).mode);
  check('结果带命中原因', L(O(L(D(r).items)[0]).matchedOn).length > 0);
  r = await request('POST', '/api/search', { query: '' });
  eq('空查询返回空列表', L(D(r).items).length, 0);

  /* 17 指标与索引 */
  group('指标与索引');
  r = await request('GET', '/api/admin/stats', undefined, adminToken);
  eq('status 200', r.status, 200);
  check('指标由数据派生', D(r).published > 0 && D(r).tags > 0, JSON.stringify(D(r)));
  r = await request('POST', '/api/admin/reindex', { scope: 'all' }, adminToken);
  eq('重建索引成功', r.status, 200);

  /* 18 审核回调 */
  group('审核回调');
  r = await request('POST', '/api/seccheck/callback', { trace_id: 'none', result: [{ suggestion: 0 }] });
  eq('回调可处理（未匹配的 trace 也不报错）', r.status, 200);
  r = await request('GET', '/api/seccheck/trace/none');
  eq('查不到的 trace 返回 404', r.status, 404);

  /* 19 未知路由 */
  group('未知路由');
  r = await request('GET', '/api/nope');
  eq('返回 404', r.status, 404);
  check('错误包格式正确', r.body && r.body.ok === false && !!E(r).code);

  return results;
}

/* ---------- 输出 ---------- */
function report (list) {
  const groups = [];
  for (const r of list) {
    if (groups.indexOf(r.group) < 0) groups.push(r.group);
  }
  let failed = 0;
  console.log('');
  for (const g of groups) {
    const items = list.filter(function (r) { return r.group === g; });
    const bad = items.filter(function (r) { return !r.pass; });
    failed += bad.length;
    console.log((bad.length ? '✗' : '✓') + ' ' + g + '（' + (items.length - bad.length) + '/' + items.length + '）');
    for (const b of bad) console.log('    · ' + b.name + (b.detail ? ' —— ' + b.detail : ''));
  }
  console.log('');
  console.log('共 ' + list.length + ' 项断言，失败 ' + failed + ' 项，涉及 ' + groups.length + ' 组。');
  return failed;
}

module.exports = { runCases: runCases, report: report };