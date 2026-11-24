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

const crypto = require('crypto');
const config = require('../src/config');

/* ---------- 迷你断言框架 ---------- */
/*
 * ⚠️ results 之前是模块级数组 —— 同一个进程里跑两遍 runCases 会往同一个数组里
 * 累加，第二次的断言数会翻倍。现在改成每次调用新建一个局部数组。
 */
let currentGroup = '';
let results = [];

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
  /* 每次调用一份新的结果集 */
  results = [];
  let userToken = '';
  let adminToken = '';
  const originalAdminOpenids = config.adminOpenids.slice();
  if (config.useMemoryDb && config.adminOpenids.indexOf('dev-admin') < 0) {
    config.adminOpenids.push('dev-admin');
  }

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
  const publicTotal = D(r).total;
  const sample = O(L(D(r).items)[0]);
  check('条目带领域名', typeof sample.categoryName === 'string' && sample.categoryName.length > 0);
  check('条目带立场聚合而非完整要点', !!sample.stanceCounts && !Array.isArray(sample.points));
  r = await request('GET', '/api/experiences?size=1&page=2');
  check('公开分页返回真实 total', D(r).total === publicTotal && L(D(r).items).length <= 1);

  r = await request('GET', '/api/experiences?categoryId=1&size=100');
  check('按领域筛选生效', L(D(r).items).every(function (e) { return e.categoryId === 1; }));

  r = await request('GET', '/api/experiences?tagId=1&size=100');
  check('按标签筛选生效', L(D(r).items).length > 0);

  r = await request('GET', '/api/experiences?stance=good&size=100');
  check('按立场筛选生效（要点级）', L(D(r).items).every(function (e) {
    return O(O(e).stanceCounts).good > 0;
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

  if (config.useMemoryDb) {
    const revokedCode = 'revoked-admin';
    const revokedOpenid = 'dev-revokedadmin';
    config.adminOpenids.push(revokedOpenid);
    r = await request('POST', '/api/auth/login', { code: revokedCode });
    eq('名单内账号首次登录提权', O(D(r).user).role, 'admin');
    config.adminOpenids = config.adminOpenids.filter(function (id) { return id !== revokedOpenid; });
    r = await request('POST', '/api/auth/login', { code: revokedCode });
    eq('移出名单后再次登录降权', O(D(r).user).role, 'user');
  }

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
  const favoriteTotal = D(r).total;
  r = await request('GET', '/api/me/favorites?page=1&size=1', undefined, userToken);
  check('收藏分页有真实 total', D(r).total === favoriteTotal && L(D(r).items).length === 1);
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
  r = await request('GET', '/api/admin/experiences?page=1&size=1', undefined, adminToken);
  check('管理分页返回真实 total', D(r).total > 1 && L(D(r).items).length === 1 &&
    Array.isArray(O(L(D(r).items)[0]).tagIds));
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

  r = await request('PUT', '/api/admin/experiences/' + newId, { nextReviewAt: '2027-01-02' }, adminToken);
  eq('设置复核日期成功', r.status, 200);
  r = await request('PUT', '/api/admin/experiences/' + newId, { title: '自检建的测试经验' }, adminToken);
  r = await request('GET', '/api/admin/experiences/' + newId, undefined, adminToken);
  eq('缺省 nextReviewAt 保留旧值', D(r).nextReviewAt, '2027-01-02');
  r = await request('PUT', '/api/admin/experiences/' + newId, { nextReviewAt: null }, adminToken);
  eq('显式 null 清空复核日期', r.status, 200);
  r = await request('GET', '/api/admin/experiences/' + newId, undefined, adminToken);
  eq('复核日期已清空', D(r).nextReviewAt, null);

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
  for (const query of ['型，再', '型再', '成膜剂', '洗护']) {
    r = await request('POST', '/api/search', { query: query });
    check('归一/标签/要点详情召回：' + query,
      L(D(r).items).some(function (item) { return O(item.experience).id === 1; }),
      '实际 ' + JSON.stringify(L(D(r).items).map(function (item) { return O(item.experience).id; })));
  }
  const oldCutoff = config.search.relativeCutoff;
  config.search.relativeCutoff = 0.65;
  r = await request('POST', '/api/search', { query: '成分' });
  check('RRF 相对阈值不会把多结果压成一条', L(D(r).items).length > 1,
    '实际 ' + L(D(r).items).length);
  config.search.relativeCutoff = oldCutoff;

  /* 17 指标与索引 */
  group('指标与索引');
  r = await request('GET', '/api/admin/stats', undefined, adminToken);
  eq('status 200', r.status, 200);
  check('指标由数据派生', D(r).published > 0 && D(r).tags > 0, JSON.stringify(D(r)));
  r = await request('POST', '/api/admin/reindex', { scope: 'all' }, adminToken);
  eq('重建索引成功', r.status, 200);

  /* 18 审核回调 */
  group('审核回调');
  /* 回调是公网入口 —— 没配凭证时必须拒绝（之前是全放行，
     匿名请求就能把一条反馈从 checking 改成 passed） */
  r = await request('POST', '/api/seccheck/callback', {
    Event: 'wxa_media_check', trace_id: 'none', errcode: 0, result: { suggest: 'pass' }
  });
  eq('没配凭证时回调被拒', r.status, 403);
  /* 官方回调格式：result 是对象不是数组 —— 旧格式会抛 'results is not iterable' */
  r = await request('POST', '/api/seccheck/callback', {
    Event: 'wxa_media_check', trace_id: 'none', errcode: 0, result: { suggest: 'pass' }
  }, 'wrong-token');
  eq('凭证不对时回调被拒', r.status, 403);
  const oldCallbackToken = config.mediaCallbackToken;
  config.mediaCallbackToken = 'cases-callback-token';
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 'cases-' + Date.now();
  const signature = crypto.createHash('sha1').update(
    [config.mediaCallbackToken, String(timestamp), nonce].sort().join('')
  ).digest('hex');
  const callbackPath = '/api/seccheck/callback?timestamp=' + timestamp + '&nonce=' + nonce +
    '&signature=' + signature;
  r = await request('POST', callbackPath, {
    Event: 'wxa_media_check', trace_id: 'unknown-trace', errcode: 0, result: { suggest: 'pass' }
  });
  eq('有效签名与时间窗允许未知 trace', r.status, 200);
  check('未知 trace 明确返回未匹配', D(r).matched === false, JSON.stringify(D(r)));
  /* 未知 trace 先暂存结论，nonce 仍需防重放，trace 落库后会合并。 */
  r = await request('POST', callbackPath, {
    Event: 'wxa_media_check', trace_id: 'unknown-trace', errcode: 0, result: { suggest: 'pass' }
  });
  eq('未知 trace 的同 nonce 重放被拒', r.status, 403);
  r = await request('POST', '/api/seccheck/callback?token=' + config.mediaCallbackToken +
    '&timestamp=' + (timestamp - 600) + '&nonce=stale-' + Date.now(), {
    Event: 'wxa_media_check', trace_id: 'unknown-trace', errcode: 0, result: { suggest: 'pass' }
  });
  eq('过期时间戳被拒', r.status, 403);
  config.mediaCallbackToken = oldCallbackToken;
  /* trace 查询是审核结论，只给管理员看 */
  r = await request('GET', '/api/seccheck/trace/none');
  eq('匿名查 trace 返回 401', r.status, 401);
  r = await request('GET', '/api/seccheck/trace/none', undefined, userToken);
  eq('普通用户查 trace 返回 403', r.status, 403);
  r = await request('GET', '/api/seccheck/trace/none', undefined, adminToken);
  eq('管理员查不到的 trace 返回 404', r.status, 404);

  /* 19 未知路由 */
  group('未知路由');
  r = await request('GET', '/api/nope');
  eq('返回 404', r.status, 404);
  check('错误包格式正确', r.body && r.body.ok === false && !!E(r).code);


  /* 20 回归：草稿隔离与状态过滤 */
  group('草稿隔离');
  /* 草稿不该从公开接口漏出去 —— 之前 sources 接口只判「存在」，
     详情接口 404 但 sources 接口 200，把草稿的要点与依据交出去了。 */
  const draftId = await createDraft(request, adminToken, '回归用的草稿');
  r = await request('GET', '/api/experiences/' + draftId);
  eq('草稿详情对读者 404', r.status, 404);
  r = await request('GET', '/api/experiences/' + draftId + '/sources');
  eq('草稿的依据接口对读者 404', r.status, 404);
  r = await request('POST', '/api/me/favorites/' + draftId, {}, userToken);
  eq('草稿不能被收藏', r.status, 404);
  r = await request('POST', '/api/feedbacks', {
    targetType: 'experience', targetId: draftId, kind: 'correction', content: '对草稿的反馈'
  }, userToken);
  eq('不能对草稿提交反馈', r.status, 404);
  /* 列表只出已发布 */
  r = await request('GET', '/api/experiences?size=100');
  check('列表里没有这条草稿', !L(D(r).items).some(function (e) { return e.id === draftId; }));

  /* 21 回归：删除与下线 */
  group('删除与下线');
  r = await request('DELETE', '/api/admin/experiences/999999', undefined, adminToken);
  eq('删除不存在的经验返回 404', r.status, 404);
  eq('错误码 NOT_FOUND', E(r).code === 'NOT_FOUND' ? 'NOT_FOUND' : E(r).code, 'NOT_FOUND');
  r = await request('POST', '/api/admin/experiences/999999/unpublish', {}, adminToken);
  eq('下线不存在的经验返回 404', r.status, 404);

  /* 22 回归：非法 id 不该把数据库报错吐给客户端 */
  group('非法参数');
  r = await request('GET', '/api/experiences/abc');
  eq('非法 id 返回 404 而不是 500', r.status, 404);
  check('错误消息不泄露 SQL', String(E(r).message).indexOf('SELECT') < 0 &&
    String(E(r).message).indexOf('FROM') < 0, E(r).message);
  r = await request('GET', '/api/experiences/abc');
  check('错误码是 NOT_FOUND', E(r).code === 'NOT_FOUND', E(r).code);

  /* 23 回归：列表的 stance 筛选要真的生效 */
  group('立场筛选');
  /* 之前 listPublished 根本不处理 stance —— 不传、传 nonsense、传 bad 返回的都是同 30 条。 */
  r = await request('GET', '/api/experiences?stance=good&size=100');
  const goodItems = L(D(r).items);
  check('stance=good 有结果', goodItems.length > 0, '命中 ' + goodItems.length);
  check('每条都至少有一个 good 要点', goodItems.every(function (e) {
    return O(O(e).stanceCounts).good > 0;
  }));
  r = await request('GET', '/api/experiences?stance=bogus&size=100');
  eq('不存在的立场值返回空', L(D(r).items).length, 0);

  /* 24 回归：反馈上限与计数 */
  group('反馈上限与计数');
  r = await request('POST', '/api/feedbacks', {
    targetType: 'experience', targetId: 1, kind: 'suggestion', content: 'x'.repeat(3000)
  }, userToken);
  eq('正文超长被拒', r.status, 400);
  for (const images of [{}, [{ url: 'https://example.org/a.png' }]]) {
    r = await request('POST', '/api/feedbacks', {
      targetType: 'experience', targetId: 1, kind: 'suggestion', content: '非法图片', images: images
    }, userToken);
    eq('非法图片在落库前返回 VALIDATION', r.status, 400);
    check('非法图片错误码正确', E(r).code === 'VALIDATION');
  }
  r = await request('POST', '/api/feedbacks', {
    targetType: 'experience', targetId: 1, kind: 'suggestion', content: '附太多图',
    images: [{ url: 'a' }, { url: 'b' }, { url: 'c' }, { url: 'd' }]
  }, userToken);
  eq('图片超过上限被拒', r.status, 400);

  /* 反馈计数只加一次 —— 同一条处理两次不能加两次 */
  const statsBefore = await request('GET', '/api/admin/stats', undefined, adminToken);
  const countBefore = D(statsBefore).experiences;
  const fbForCount = await request('POST', '/api/feedbacks', {
    targetType: 'experience', targetId: 2, kind: 'suggestion', content: '用来验计数'
  }, userToken);
  const countFbId = D(fbForCount).id;
  await request('PATCH', '/api/admin/feedbacks/' + countFbId, { status: 'accepted' }, adminToken);
  await request('PATCH', '/api/admin/feedbacks/' + countFbId, { status: 'ignored' }, adminToken);
  const statsAfter = await request('GET', '/api/admin/stats', undefined, adminToken);
  check('重复处理不改变经验总数', D(statsAfter).experiences === countBefore,
    '之前 ' + countBefore + '，之后 ' + D(statsAfter).experiences);

  /* 回复不被空串覆盖 */
  await request('PATCH', '/api/admin/feedbacks/' + countFbId, {
    status: 'replied', reply: '这是写好的回复'
  }, adminToken);
  await request('PATCH', '/api/admin/feedbacks/' + countFbId, { status: 'accepted' }, adminToken);
  r = await request('GET', '/api/admin/feedbacks', undefined, adminToken);
  const keptFb = L(D(r).items).find(function (f) { return f.id === countFbId; });
  check('改结论不会清掉已写的回复', keptFb && keptFb.reply === '这是写好的回复',
    keptFb ? ('回复是「' + keptFb.reply + '」') : '没找到这条反馈');

  /* 25 回归：上传接口要登录 */
  group('上传接口');
  r = await request('POST', '/api/upload', { data: 'aGVsbG8=' }, undefined);
  eq('匿名上传被拒 401', r.status, 401);
  r = await request('POST', '/api/upload', { data: 'aGVsbG8=' }, userToken);
  eq('登录后上传至少不是 401', r.status !== 401, true);
  check('非图片内容被拒', r.status === 400, '实际 ' + r.status + ' ' + JSON.stringify(r.body));

  /* 26 回归：详情带投票态与收藏态 */
  group('投票与收藏回显');
  await request('POST', '/api/me/votes/4', { useful: true }, userToken);
  r = await request('GET', '/api/experiences/4', undefined, userToken);
  check('详情带 myVote', D(r).myVote === true, '实际 ' + JSON.stringify(D(r).myVote));
  check('详情带 starred 字段', typeof D(r).starred === 'boolean');
  await request('POST', '/api/me/favorites/4', {}, userToken);
  r = await request('GET', '/api/experiences/4', undefined, userToken);
  check('收藏后 starred 为 true', D(r).starred === true);
  await request('DELETE', '/api/me/favorites/4', undefined, userToken);

  /* 27 回归：health 要真探活 */
  group('健康检查探活');
  r = await request('GET', '/api/health');
  eq('status 200', r.status, 200);
  eq('status 如实为 ok', D(r).status, 'ok');
  check('dataSource 按实际库模式上报', D(r).dataSource === 'memory' || D(r).dataSource === 'postgres',
    '实际 ' + D(r).dataSource);

  /* 28 回归：管理端搜索要能搜到标签 */
  group('管理端搜索');
  r = await request('GET', '/api/admin/tags', undefined, adminToken);
  const someTag = L(D(r).items)[0];
  if (someTag && someTag.name) {
    r = await request('GET', '/api/admin/experiences?q=' + encodeURIComponent(someTag.name), undefined, adminToken);
    check('能按标签名搜到', L(D(r).items).length > 0, '标签「' + someTag.name + '」没搜到');
  }

  /* 29 回归：统计不被 200 条截断 */
  group('统计口径');
  r = await request('GET', '/api/admin/stats', undefined, adminToken);
  check('统计用 SQL 聚合，不被列表上限截断', D(r).experiences > 0 && typeof D(r).experiences === 'number');
  check('统计带缺索引数', typeof D(r).missingIndex === 'number');

  /* 30 回归：领域说明字段 */
  group('领域说明');
  r = await request('GET', '/api/categories');
  const firstCat = L(D(r).categories)[0];
  check('领域带 description 字段', firstCat && typeof firstCat.description === 'string',
    JSON.stringify(firstCat));

  /* 31 回归：日期是 YYYY-MM-DD，不是 ISO 时间串 */
  group('日期格式');
  r = await request('GET', '/api/experiences/1');
  const oneExp = O(D(r).experience);
  check('reviewedAt 是 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(String(oneExp.reviewedAt)),
    '实际 ' + oneExp.reviewedAt);
  check('updatedAt 不带 T 与时区', !String(oneExp.updatedAt).includes('T00:00:00.000Z'),
    '实际 ' + oneExp.updatedAt);

  /* 32 回归：检索查询长度有上限 */
  group('检索查询长度');
  const longQuery = new Array(121).join('洗发水');   // 360 字
  r = await request('POST', '/api/search', { query: longQuery });
  eq('超长查询不报错', r.status, 200);
  check('响应里如实标记被截断', D(r).truncated === true, JSON.stringify(D(r)));
  check('实际查询被截到上限内', String(D(r).query).length <= 200,
    '长度 ' + String(D(r).query).length);
  check('上报原始查询长度', D(r).queryLength === longQuery.length, '实际 ' + D(r).queryLength);

  /* 33 回归：管理端按状态筛选 */
  group('管理端状态筛选');
  const statusDraftId = await createDraft(request, adminToken, '状态筛选用的草稿');
  r = await request('GET', '/api/admin/experiences?status=draft', undefined, adminToken);
  eq('返回 200', r.status, 200);
  check('草稿能筛出来', L(D(r).items).length > 0);
  check('只回草稿', L(D(r).items).every(function (e) { return e.status === 'draft'; }),
    '混进了别的状态');
  r = await request('GET', '/api/admin/experiences?status=published', undefined, adminToken);
  check('只回已发布', L(D(r).items).every(function (e) { return e.status === 'published'; }),
    '混进了别的状态');
  check('草稿不会混进已发布', L(D(r).items).every(function (e) { return e.id !== statusDraftId; }));

  config.adminOpenids = originalAdminOpenids;
  return results;
}

/**
 * 建一条草稿（回归用例用）
 * @returns {Promise<number>} 草稿 id
 */
async function createDraft (request, adminToken, title) {
  const r = await request('POST', '/api/admin/experiences', {
    title: title,
    summary: '这是一条草稿。',
    body: '',
    categoryId: 1,
    keywords: [],
    points: [{ id: 'cp1', stance: 'good', title: '要点', detail: '', appliesTo: '' }],
    sources: [{ id: 'cs1', title: '依据', url: 'https://example.org/a', sourceType: 'article', platform: '', author: '', publishedAt: '', note: '', pointIds: ['cp1'] }],
    tagIds: [],
    status: 'draft'
  }, adminToken);
  return D(r).id;
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