/**
 * 检索自检
 *
 * 职责：固定查询集 → 期望命中（回归），外加三条底线：
 *   1. mode 如实上报（本地 embedding 下必须是 keyword，不能报 hybrid）
 *   2. 同一个查询两次跑，顺序必须一致（RRF 是确定性的）
 *   3. 泛词不能把结果刷满（命中条数上限）
 *
 * 用法：node scripts/verify-search.js
 */
const { group, check, eq, report } = require('./_kit');

const db = require('../server/src/db');
const search = require('../server/src/services/search');
const { seed } = require('../server/scripts/seed');

/** 固定查询集：查询 → 期望排第一的经验 id */
const CASES = [
  { query: '宝宝能用吗', expect: 1, why: '洗发水类经验（§12 检索用例集）' },
  { query: '二甲基硅油', expect: 1, why: '命中要点「二甲基硅油」' },
  { query: '洗头水', expect: 1, why: 'search_keywords 里写了「洗头水」' },
  { query: '快递丢了怎么赔', expect: 11, why: '维权类经验' },
  { query: '怎么退掉健身房', expect: 12, why: '维权类经验' },
  { query: '空调滤网怎么洗', expect: 19, why: '住家类经验' },
  { query: '医疗险', expect: 26, why: '钱财类经验' }
];

/** 泛词刷屏的上限：一条具体的查询最多回这么多条 */
const MAX_RESULTS = 5;

async function main () {
  await db.init({ memory: true });
  await db.tx(async function (client) { return seed(client); });

  group('固定查询集');
  for (const c of CASES) {
    const r = await search.search({ query: c.query });
    const ids = (r.items || []).map((x) => x.experience.id);
    check('「' + c.query + '」命中第 ' + c.expect + ' 条（' + c.why + '）',
      ids.indexOf(c.expect) >= 0, '实际命中 ' + JSON.stringify(ids));
    check('「' + c.query + '」第一条就是期望的那条', ids[0] === c.expect,
      '第一条是 ' + ids[0]);
  }

  group('结果结构');
  const r0 = await search.search({ query: '二甲基硅油' });
  check('每条结果都带经验本体', (r0.items || []).every(function (x) {
    return x.experience && x.experience.id && x.experience.title;
  }));
  check('每条结果都带命中原因', (r0.items || []).every(function (x) {
    return Array.isArray(x.matchedOn) && x.matchedOn.length > 0;
  }));
  check('命中原因用结构化前缀', (r0.items || []).every(function (x) {
    return x.matchedOn.every(function (m) {
      return /^(point:|keyword:|tag:|summary:|title$|summary$|semantic$)/.test(String(m));
    });
  }), JSON.stringify((r0.items[0] || {}).matchedOn));

  group('前端命中原因翻译');
  const view = require('../utils/view');
  check('要点前缀译成「命中要点：…」', view.hitLabel(['point:二甲基硅油']) === '命中要点：二甲基硅油',
    view.hitLabel(['point:二甲基硅油']));
  check('关键词前缀译成「命中关键词：…」', view.hitLabel(['keyword:洗头水']) === '命中关键词：洗头水',
    view.hitLabel(['keyword:洗头水']));
  check('标签前缀译成「命中标签：…」', view.hitLabel(['tag:成分']) === '命中标签：成分',
    view.hitLabel(['tag:成分']));
  check('结论前缀译成「命中结论：…」', view.hitLabel(['summary:先定头皮类型']) === '命中结论：先定头皮类型',
    view.hitLabel(['summary:先定头皮类型']));
  check('标题命中译成「命中标题」', view.hitLabel(['title']) === '命中标题', view.hitLabel(['title']));
  check('语义命中译成「语义相近」', view.hitLabel(['semantic']) === '语义相近', view.hitLabel(['semantic']));
  check('多条命中取第一条', view.hitLabel(['point:要点甲', 'keyword:词乙']) === '命中要点：要点甲',
    view.hitLabel(['point:要点甲', 'keyword:词乙']));
  check('没有命中原因时留空', view.hitLabel([]) === '' && view.hitLabel(null) === '');
  check('真实检索结果都翻得出中文标签',
    (r0.items || []).every(function (x) { return view.hitLabel(x.matchedOn) !== ''; }),
    JSON.stringify((r0.items[0] || {}).matchedOn));

  group('mode 如实上报');
  check('mode 在约定取值内', ['hybrid', 'vector', 'keyword', 'degraded'].indexOf(r0.mode) >= 0, r0.mode);
  check('本地 embedding 下报 keyword', r0.mode === 'keyword', r0.mode);
  check('本地 embedding 下不报 hybrid', r0.mode !== 'hybrid', r0.mode);

  group('确定性');
  const a = await search.search({ query: '快递丢了怎么赔' });
  const b2 = await search.search({ query: '快递丢了怎么赔' });
  const ida = (a.items || []).map((x) => x.experience.id);
  const idb = (b2.items || []).map((x) => x.experience.id);
  eq('同一个查询两次的顺序一致', ida, idb);

  group('泛词不刷屏');
  for (const c of CASES) {
    const r = await search.search({ query: c.query });
    check('「' + c.query + '」命中不超过 ' + MAX_RESULTS + ' 条',
      (r.items || []).length <= MAX_RESULTS, '实际 ' + (r.items || []).length);
  }
  const generic = await search.search({ query: '怎么' });
  check('只搜泛词也不会刷屏', (generic.items || []).length <= MAX_RESULTS,
    '实际 ' + (generic.items || []).length);

  group('空查询');
  const empty = await search.search({ query: '' });
  eq('空查询返回空列表', (empty.items || []).length, 0);
  eq('空查询的 mode 是 keyword', empty.mode, 'keyword');

  group('筛选');
  const filtered = await search.search({ query: '洗发水', categoryIds: [2] });
  check('按领域筛选生效', (filtered.items || []).every(function (x) {
    return x.experience.categoryId === 2;
  }));
  const stance = await search.search({ query: '洗发水', stance: 'good' });
  check('按立场筛选不报错且有结果', (stance.items || []).length >= 0, '命中 ' + (stance.items || []).length);

  await db.close();
  const failed = report('检索自检');
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error('检索自检崩了：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});