# life-better

> 生活经验库 · 微信小程序
> 一条经验 = 结论 + 可判定立场的要点 + 挂在要点上的依据来源 —— 可检索、可溯源、可反馈。

**当前状态**：设计已确认；**小程序端与后端代码已落地** —— 小程序 14 页、后端 34 个接口、
30 条带真实来源链接的种子内容、九支仓库级自检 + 两支服务端自检全绿。
**尚未部署**：生产 AppID / 备案域名 / 服务器 / nginx 都还没接，服务器上的动作由本人执行。

## 文档索引

| 文档 | 什么时候看 |
| --- | --- |
| [`docs/better-life-design.md`](docs/better-life-design.md) | 产品定义、内容模型、数据模型、搜索方案、API、开发计划 —— 动手写代码前必读 |
| 设计文档 [§19 修订记录](docs/better-life-design.md) | 每轮审查之后改了什么 —— 审查报告文件不单独留 |
| [`server/README.md`](server/README.md) | 后端怎么起、环境变量、怎么灌种子数据 |
| [`design/README.md`](design/README.md) | 原型怎么打开、每条设计决策落在哪个文件、哪些功能做了哪些没做 |
| [`design/index.html`](design/index.html) | 原型本体，浏览器直接打开即可（纯静态，无构建） |

## 仓库里现在有什么

```
better-life/
├─ README.md                   本文件
├─ app.js / app.json / app.wxss / sitemap.json
├─ project.config.json         微信开发者工具工程配置（touristappid；真实 AppID 放 project.private.config.json，不入库）
├─ config/index.js              全局配置（后端地址、超时、开发面板开关、存储 key）
├─ pages/                      14 个页面四件套（读者侧 10 + 管理端 4）
├─ components/                 7 个组件
├─ utils/                      11 个工具模块（api / cloud / auth / storage / role / local / view / format / share / search / nav）
├─ styles/                     tokens.wxss（设计令牌）+ components.wxss（通用类）
├─ assets/                     tabBar 图标与图标资源
├─ data/                       演示数据（32 条经验 / 9 领域 / 38 标签 / 62 条依据）
├─ docs/
│  └─ better-life-design.md    产品与技术设计文档（v1.7）
├─ server/                     后端（Node + Express + PostgreSQL/pgvector，pg-mem 可替）
│  ├─ src/                     config / db / dao / services / middleware / routes
│  ├─ scripts/                 seed.js / selftest.js / http-test.js / reindex.js / cases.js
│  ├─ sql/seed.sql             可 review 的种子 SQL（由 data/ 生成）
│  └─ .env.example             环境变量样例
├─ scripts/                    仓库级自检（9 支）+ 生成脚本（3 支）
└─ design/                     高保真原型（便签墙方向）
   ├─ index.html               工作台入口，浏览器直接打开
   ├─ README.md                原型说明
   └─ assets/                  演示数据 + 设计令牌 + 14 个页面的实现
```

## 已经做完的

- **设计**：产品定位、内容模型（经验 / 要点 / 依据三层）、数据模型、搜索方案（向量 + 关键词 RRF 融合）、API 清单、上线合规门槛 —— 都在设计文档里
- **视觉方向**：定稿为**便签墙**；另外两套方向已删，否掉的理由留档在 [`design/README.md`](design/README.md) §5
- **小程序端**：14 个页面全部实现并逐页截图验过；「我的」页带开发模式面板（身份切换 + 演示场景），正式包关掉即隐藏
- **后端**：34 个接口（公开 / 登录 / 管理三组）、11 张表、DAO / 服务 / 路由分层；支持 PostgreSQL 与 pg-mem 双后端，同一套自检两边都能跑
- **种子内容**：30 条经验、**62 条依据全部是真实可访问的链接**（46 个站点），`scripts/verify-links.js` 每次都重测，**当前 62/62 可达**
- **自检**：仓库级 8 支断言脚本 **342 项全绿** + 链接 62 条全通；服务端 2 支 **各 101 项全绿**（19 组）

### 自检怎么跑

```powershell
# 仓库级 8 支断言脚本
node scripts/lint-wxml.js
node scripts/check-modules.js
node scripts/verify-data.js
node scripts/verify-search.js
node scripts/verify-tokens.js
node scripts/verify-copy.js
node scripts/verify-pages.js
node scripts/verify-contract.js

# 链接自检（联网，逐条探测 62 个来源）
node scripts/verify-links.js

# 服务端 2 支（内存库，不连真实 PostgreSQL）
node server/scripts/selftest.js
node server/scripts/http-test.js --memory
```

改了任何一处都要重跑对应那支；脚本有错会 exit 1。

## 还没做的

- **部署**：生产 AppID / AppSecret、备案域名、服务器、nginx 与证书 —— 按约定由本人执行，仓库里不代跑
- **真机验证**：字体回退、原生 tabBar 高度、安全区、键盘遮挡、320px 窄屏、真实 `wx.request`（预览环境不支持，见设计文档 §16）
- **外部服务**：embedding provider（当前用本地 bigram-hash，`mode` 如实报 `keyword`）、内容安全审核的线上配置与回调
- **GitHub Pages 主页**：设计文档 §15.2 B8 里列了，本次未做

## 下一步

1. 接生产 AppID 与备案域名 → 起后端 → 灌种子数据（步骤见 [`server/README.md`](server/README.md)）
2. 真机跑一遍 14 页：重点看原生 tabBar 高度、安全区、键盘遮挡、外链复制
3. 接外部 embedding provider，确认 `mode` 能报 `hybrid`

动手前先看两处：设计文档 **§11**（微信小程序特有的坑：原生 tabBar、外链只能复制、
胶囊按钮避让、运行时禁 `?.` / `??`……）和 **§16**（上线前的合规硬门槛）。
