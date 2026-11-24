/**
 * 页面清单自检
 *
 * 职责：app.json 与 pages/ 目录必须互相对得上 —— 少一个文件、真机就白屏或 404。
 * 检查五项：
 *   1. app.json 里每个页面都有 .js / .wxml / .wxss / .json 四个文件
 *   2. pages/ 下没有没被登记的目录（登了忘建 vs 建了忘登，两头都查）
 *   3. 页面 .json 里 usingComponents 指向的组件确实存在
 *   4. tabBar 三项，图标文件存在，且页��在 pages 列表里
 *   5. tabBar 的页不能同时出现在二级页（原生 tabBar 页不能再 navigateTo 过去）
 *
 * 用法：node scripts/verify-pages.js
 */
const fs = require('fs');
const path = require('path');
const { group, check, eq, report } = require('./_kit');

const ROOT = path.resolve(__dirname, '..');

function readJson (p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/** pages/ 下所有页面目录（相对仓库根） */
function pageDirs () {
  const base = path.join(ROOT, 'pages');
  const out = [];
  if (!fs.existsSync(base)) return out;
  for (const a of fs.readdirSync(base)) {
    const dir = path.join(base, a);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (fs.existsSync(path.join(dir, a + '.wxml'))) {
      out.push('pages/' + a + '/' + a);
      continue;
    }
    for (const b2 of fs.readdirSync(dir)) {
      const sub = path.join(dir, b2);
      if (!fs.statSync(sub).isDirectory()) continue;
      /* 两级页面的路径约定是 pages/<组>/<页>/<页> */
      if (fs.existsSync(path.join(sub, b2 + '.wxml'))) out.push('pages/' + a + '/' + b2 + '/' + b2);
    }
  }
  return out;
}

function main () {
  const app = readJson(path.join(ROOT, 'app.json'));
  group('app.json');
  check('app.json 能解析', !!app);
  if (!app) { report('页面清单自检'); process.exit(1); }
  const declared = app.pages || [];
  const onDisk = pageDirs();
  check('至少注册了 14 个页面', declared.length === 14, '实际 ' + declared.length);

  group('页面文件');
  for (const p of declared) {
    const missing = ['.js', '.wxml', '.wxss', '.json'].filter(function (ext) {
      return !fs.existsSync(path.join(ROOT, p + ext));
    });
    check(p + ' 四个文件齐全', missing.length === 0, '缺 ' + missing.join(', '));
  }

  group('目录与登记一致');
  const orphan = onDisk.filter((p) => declared.indexOf(p) < 0);
  check('没有未登记的页面目录', orphan.length === 0, orphan.join(', '));
  const missingDir = declared.filter((p) => onDisk.indexOf(p) < 0);
  check('登记的页面都有目录', missingDir.length === 0, missingDir.join(', '));

  group('组件引用');
  for (const p of declared) {
    const json = readJson(path.join(ROOT, p + '.json'));
    if (!json) {
      check(p + '.json 能解析', false);
      continue;
    }
    const used = json.usingComponents || {};
    const bad = Object.keys(used).filter(function (name) {
      const rel = String(used[name] || '');
      if (!rel) return true;
      /* 绝对路径（以 / 开头）从仓库根算，相对路径从 components/ 算 */
      const abs = rel.charAt(0) === '/'
        ? path.join(ROOT, rel)
        : path.join(ROOT, 'components', rel);
      return !fs.existsSync(abs + '.js') && !fs.existsSync(path.join(abs, 'index.js'));
    });
    check(p + ' 的组件都存在', bad.length === 0, bad.join(', '));
  }

  group('tabBar');
  const tab = (app.tabBar && app.tabBar.list) || [];
  eq('原生 tabBar 三项', tab.length, 3);
  const tabPaths = tab.map((t) => t.pagePath);
  for (const t of tab) {
    check(t.pagePath + ' 已注册', declared.indexOf(t.pagePath) >= 0);
    const iconOk = fs.existsSync(path.join(ROOT, t.iconPath)) && fs.existsSync(path.join(ROOT, t.selectedIconPath));
    check(t.pagePath + ' 的图标存在', iconOk, t.iconPath + ' / ' + t.selectedIconPath);
  }
  const dup = tabPaths.filter((p, i) => tabPaths.indexOf(p) !== i);
  check('tabBar 没有重复页面', dup.length === 0, dup.join(', '));

  group('全局配置');
  check('自定义导航（navigationStyle=custom）', app.window && app.window.navigationStyle === 'custom');
  check('sitemap 已配置', !!app.sitemapLocation && fs.existsSync(path.join(ROOT, app.sitemapLocation)));
  const project = readJson(path.join(ROOT, 'project.config.json'));
  check('构建不忽略未使用文件', project && project.setting && project.setting.ignoreDevUnusedFiles === false);

  group('可访问性语义');
  const card = fs.readFileSync(path.join(ROOT, 'components/experience-card/experience-card.wxml'), 'utf8');
  check('可点击经验卡有原生按钮语义', /<button\b/.test(card) || /aria-role=["']button["']/.test(card));
  check('可点击经验卡有可读名称', /aria-label=["'][^"'{{][^"']+["']/.test(card));
  const pills = fs.readFileSync(path.join(ROOT, 'components/tag-pills/tag-pills.wxml'), 'utf8');
  check('标签选项有原生按钮语义', /<button\b/.test(pills) || /aria-role=["']button["']/.test(pills));
  check('标签选项暴露选中状态', /aria-(?:checked|selected)=["']/.test(pills));
  const nav = fs.readFileSync(path.join(ROOT, 'components/nav-bar/nav-bar.wxml'), 'utf8');
  check('顶栏图标操作都有可读名称', (nav.match(/aria-label=["'][^"']+["']/g) || []).length >= 2);
  const search = fs.readFileSync(path.join(ROOT, 'pages/search/search.wxml'), 'utf8');
  check('搜索输入框有明确标签', /aria-label=["'][^"']+["']/.test(search));
  check('清空搜索有可读名称', /bindtap=["']clearInput["'][^>]*aria-label=["'][^"']+["']|aria-label=["'][^"']+["'][^>]*bindtap=["']clearInput["']/.test(search));
  const componentsCss = fs.readFileSync(path.join(ROOT, 'styles/components.wxss'), 'utf8');
  const actRule = componentsCss.match(/\.act\s*\{([^}]*)\}/);
  const actWidth = actRule && actRule[1].match(/(?:min-)?width:\s*(\d+)rpx/);
  const actHeight = actRule && actRule[1].match(/(?:min-)?height:\s*(\d+)rpx/);
  check('顶栏操作触控尺寸至少 88rpx', !!actWidth && !!actHeight &&
    Number(actWidth[1]) >= 88 && Number(actHeight[1]) >= 88);
  const pillCss = fs.readFileSync(path.join(ROOT, 'components/tag-pills/tag-pills.wxss'), 'utf8');
  const pillRule = pillCss.match(/\.pill\s*\{([^}]*)\}/);
  const pillHeight = pillRule && pillRule[1].match(/min-height:\s*(\d+)rpx/);
  check('标签选项触控高度至少 88rpx', !!pillHeight && Number(pillHeight[1]) >= 88);

  const failed = report('页面清单自检');
  process.exit(failed ? 1 : 0);
}

main();