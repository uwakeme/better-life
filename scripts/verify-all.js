/**
 * 一条命令跑完全部自检
 *
 * 职责：把「改了代码要跑哪几支」从人脑里拿走。
 * 背景：仓库里散着 9 支断言脚本 + 两支服务端自检，
 *   漏跑一支，就等于漏掉了钉住本次改动的那一支。
 *
 * 用法：
 *   node scripts/verify-all.js               # 全部断言脚本 + 服务端内存库用例
 *   node scripts/verify-all.js --with-links  # 追加链接自检（需要联网，逐条探测来源）
 *
 * 退出码：任何一支失败 → exit 1。
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const SUITES = [
  { name: 'WXML 规范', file: 'scripts/lint-wxml.js' },
  { name: '模块加载', file: 'scripts/check-modules.js' },
  { name: '种子数据自洽', file: 'scripts/verify-data.js' },
  { name: '检索行为', file: 'scripts/verify-search.js' },
  { name: '设计令牌', file: 'scripts/verify-tokens.js' },
  { name: '文案口径', file: 'scripts/verify-copy.js' },
  { name: '页面结构', file: 'scripts/verify-pages.js' },
  { name: '前后端契约', file: 'scripts/verify-contract.js' },
  { name: '客户端行为', file: 'scripts/verify-client-behavior.js' },
  { name: '服务端用例（内存库）', file: 'scripts/selftest.js', cwd: 'server' },
  { name: '服务端专项回归', file: 'scripts/regression-test.js', cwd: 'server' }
];

if (process.argv.indexOf('--with-links') >= 0) {
  SUITES.push({ name: '来源链接可达', file: 'scripts/verify-links.js' });
}

const failed = [];

for (const s of SUITES) {
  const cwd = s.cwd ? path.join(ROOT, s.cwd) : ROOT;
  const file = path.join(cwd, s.file);
  const started = Date.now();
  const r = spawnSync(process.execPath, [file], { cwd: cwd, encoding: 'utf8' });
  const took = Date.now() - started;
  const out = String(r.stdout || '') + String(r.stderr || '');
  const ok = r.status === 0;
  if (!ok) failed.push(s.name);
  console.log((ok ? '✓' : '✗') + ' ' + s.name + '  (' + took + 'ms)');
  if (!ok) {
    console.log(out.trim().split(/\r?\n/).map(function (l) { return '    ' + l; }).join('\n'));
  }
}

console.log('');
if (failed.length) {
  console.log('没过：' + failed.join('、'));
  process.exit(1);
}
console.log('全部通过（' + SUITES.length + ' 支）');
