# better-life

> 生活经验库 · 微信小程序
> 一条经验 = 结论 + 可判定立场的要点 + 挂在要点上的依据来源 —— 可检索、可溯源、可反馈。

**当前状态**：设计已确认；**小程序端与后端代码已落地** —— 小程序 14 页、后端 34 个接口、
30 条带真实来源链接的种子内容、仓库级 9 支断言脚本 + 服务端用例全绿（一条命令跑完）。
**尚未部署**：生产 AppID / 备案域名 / 服务器 / nginx 都还没接，服务器上的动作由本人执行；
**部署与发版流水线已就绪**（见「自动化流程」）。

## 文档索引

| 文档 | 什么时候看 |
| --- | --- |
| [`docs/better-life-design.md`](docs/better-life-design.md) | 产品定义、内容模型、数据模型、搜索方案、API、开发计划 —— 动手写代码前必读 |
| 设计文档 [§19 修订记录](docs/better-life-design.md) | 每轮审查之后改了什么 —— 审查报告文件不单独留 |
| [`docs/miniprogram-registration.md`](docs/miniprogram-registration.md) | 注册 / 备案 / 提审时照填小程序名称、简称、头像与简介 —— 填表前先看自查清单 |
| [`server/README.md`](server/README.md) | 后端怎么起、环境变量、怎么灌种子数据 |
| [`design/README.md`](design/README.md) | 原型怎么打开、每条设计决策落在哪个文件、哪些功能做了哪些没做 |
| [`design/index.html`](design/index.html) | 原型本体，浏览器直接打开即可（纯静态，无构建） |

## 仓库里现在有什么

```
better-life/
├─ README.md                   本文件
├─ CHANGELOG.md                变更记录（Keep a Changelog 格式）
├─ .github/workflows/          3 条流水线（CI 自检 / 部署后端 / 上传小程序）
├─ ci/                         小程序包上传工具（miniprogram-ci 封装）
├─ app.js / app.json / app.wxss / sitemap.json
├─ project.config.json         微信开发者工具工程配置（touristappid；真实 AppID 放 project.private.config.json，不入库）
├─ config/index.js              全局配置（后端地址、超时、开发面板开关、存储 key）
├─ pages/                      14 个页面四件套（读者侧 10 + 管理端 4）
├─ components/                 7 个组件
├─ utils/                      11 个工具模块（api / cloud / auth / storage / role / local / view / format / share / search / nav）
├─ styles/                     tokens.wxss（设计令牌）+ components.wxss（通用类）
├─ assets/                     tabBar 图标、图标资源与品牌头像（brand/）
├─ data/                       演示数据（32 条经验 / 9 领域 / 38 标签 / 62 条依据）
├─ docs/
│  ├─ better-life-design.md    产品与技术设计文档（v1.8）
│  └─ miniprogram-registration.md  小程序注册四栏与填表前的自查清单
├─ server/                     后端（Node + Express + PostgreSQL/pgvector，pg-mem 可替）
│  ├─ src/                     config / db / dao / services / middleware / routes
│  ├─ scripts/                 seed.js / selftest.js / http-test.js / reindex.js / cases.js
│  ├─ sql/seed.sql             可 review 的种子 SQL（由 data/ 生成）
│  ├─ better-life-pm2.json     PM2 进程配置（部署时替换 __DEPLOY_DIR__ 占位符）
│  └─ .env.example             环境变量样例
├─ scripts/                    仓库级自检（10 支 + 一键 runner）+ 生成脚本（3 支）
└─ design/                     高保真原型（便签墙方向）
   ├─ index.html               工作台入口，浏览器直接打开
   ├─ README.md                原型说明
   └─ assets/                  演示数据 + 设计令牌 + 14 个页面的实现
```

## 已经做完的

- **设计**：产品定位、内容模型（经验 / 要点 / 依据三层）、数据模型、搜索方案（向量 + 关键词 RRF 融合）、API 清单、上线合规门槛 —— 都在设计文档里
- **视觉方向**：定稿为**便签墙**；另外两套方向已删，否掉的理由留档在 [`design/README.md`](design/README.md) §5
- **小程序端**：14 个页面全部实现并逐页截图验过；「我的」页带开发模式面板（身份切换 + 演示场景），正式包关掉即隐藏
- **后端**：34 个接口（公开 / 登录 / 管理三组）、15 张表、DAO / 服务 / 路由分层；支持 PostgreSQL 与 pg-mem 双后端，同一套自检两边都能跑
- **种子内容**：30 条经验、**62 条依据全部是真实可访问的链接**（46 个站点），`scripts/verify-links.js` 每次都重测，**当前 62/62 可达**
- **自检**：仓库级 9 支断言脚本 **460 项全绿**；服务端接口用例 **168 项 / 33 组全绿**，安全与并发专项回归 **25 项全绿**；追加链接检查为 **62/62 可达**

### 自检怎么跑

```powershell
# 一条命令跑完全部（仓库级 9 支 + 服务端用例与专项回归；内存库，不连真实 PostgreSQL）
node scripts/verify-all.js

# 追加链接自检（需要联网，逐条探测 62 个来源）
node scripts/verify-all.js --with-links
```

`verify-all.js` 按顺序跑完所有断言脚本，任何一支失败就 `exit 1`，并把失败那支的输出原样打出来。
改了任何一处，跑这一条就够了。

单独跑某一支：

```powershell
node scripts/lint-wxml.js
node scripts/check-modules.js
node scripts/verify-data.js
node scripts/verify-search.js
node scripts/verify-tokens.js
node scripts/verify-copy.js
node scripts/verify-pages.js
node scripts/verify-contract.js
node scripts/verify-client-behavior.js   # 客户端行为：错误码透传、写操作不回落、筛选映射……
node scripts/check-package-size.js      # 上传包体积与 packOptions.ignore 登记

# 服务端用例（内存库）
node server/scripts/selftest.js
node server/scripts/regression-test.js   # 安全、并发、限流、索引与生产配置专项回归

# 同一份用例，改指真实 PG 或已起的实例：
node server/scripts/http-test.js
node server/scripts/http-test.js --base=http://127.0.0.1:8080
```

> `selftest.js` 与 `http-test.js` **跑的是同一份用例**（`cases.js`）——
> 前者固定起内存库，后者可以改指真实数据库或已有实例，用来验证同一批断言在真库上也成立。

## 自动化流程（GitHub Actions）

仓库里有三条流水线，在 [`.github/workflows/`](.github/workflows/)：

| 流程 | 什么时候跑 | 干什么 |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | push main / PR / 手动 | 跑完全部自检（仓库级 9 支 + 服务端用例与专项回归 + 上传包体积） |
| [`deploy-backend.yml`](.github/workflows/deploy-backend.yml) | push main 且动了 `server/` 或 `data/` / 手动 | SSH 部署后端：备份 → 传代码 → 装依赖 → 建表 → 预检配置 → 重启 → 探活 → 失败自动回滚 |
| [`release-miniprogram.yml`](.github/workflows/release-miniprogram.yml) | 推 `v*` tag / 发 Release / 手动 | 用 miniprogram-ci 把小程序包上传到公众平台（**只到开发版本**） |

### 要先在仓库里配好的东西

`deploy-backend.yml` 里 `environment: 腾讯云` —— **这个 Environment 要先在仓库设置里建好**，
下面这些是它的 secrets：

| Secret | 必需 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY` | 是 | 服务器与 SSH 私钥（私钥内容整段贴进去） |
| `SERVER_PORT` | 否 | SSH 端口，不配按 22 |
| `DEPLOY_DIR` | 否 | 部署目录，默认 `/home/ubuntu/deploy/better-life` |
| `DATABASE_URL` | 是 | 生产库连接串。**仅在服务器上还没有 `.env` 时**用它创建初始 `.env` |
| `PUBLIC_URL` | 否 | 外网地址（如 `https://better-life.uwakeme.top`）。配了才做外网探活 —— 第一次部署还没装 nginx 时先留空 |
| `WX_APP_ID` / `WX_UPLOAD_PRIVATE_KEY` | 发版要 | 小程序正式 AppID 与上传密钥（`private.key` 的内容） |

> ⚠️ **服务器上的 `.env` 由本人维护，流水线绝不覆盖。**
> 缺 `TOKEN_SECRET` 时流水线会自己生成一个；**已存在的值绝不替换** ——
> 换了等于把所有人踢下线。其余缺项（`WECHAT_APPID` / `WECHAT_SECRET` / `SECCHECK_MODE=real` /
> `MEDIA_CALLBACK_TOKEN` / `ADMIN_OPENIDS`）会在「预检生产配置」那一步明确报出缺哪一项，
> 而那一步失败时旧进程还在跑 —— 不用回滚。
>
> 流水线只碰这一个项目的目录与 `better-life-server` 这一个 PM2 进程，不动同机上的其他项目。

### 首次部署要本人做的事

1. 服务器上装 PostgreSQL 与 **pgvector 扩展**（`search_documents` 的向量列依赖它，缺了建表会失败）
2. 建好部署目录（默认 `/home/ubuntu/deploy/better-life`）与日志目录
3. nginx 反代 + 证书：`better-life.uwakeme.top` → `127.0.0.1:8080`，
   并让 nginx 透传 `X-Forwarded-For`（配合 `.env` 的 `TRUST_PROXY=1`，否则全站共用一个限流桶）
4. 第一次部署后补齐 `.env` 里缺的几项（流水线会打印缺哪一项）
5. 灌一次种子数据：手动触发 `deploy-backend.yml` 并在输入里勾上 `seed`
   （`seed.js` 是普通 INSERT，**只能灌一次**，重复执行会撞 slug 唯一约束）

## 还没做的

- **部署**：流水线已就绪（见上），但生产 AppID / 备案域名 / 服务器 / nginx / pgvector 还没接 —— 服务器上的动作由本人执行
- **真机验证**：字体回退、原生 tabBar 高度、安全区、键盘遮挡、320px 窄屏、真实 `wx.request`（预览环境不支持，见设计文档 §16）
- **外部服务**：embedding provider（当前用本地 bigram-hash，`mode` 如实报 `keyword`）、内容安全审核的线上配置与回调
- **GitHub Pages 主页**：设计文档 §15.2 B8 里列了，本次未做

## 下一步

1. 接生产 AppID 与备案域名 → 起后端 → 灌种子数据（步骤见 [`server/README.md`](server/README.md)）
2. 真机跑一遍 14 页：重点看原生 tabBar 高度、安全区、键盘遮挡、外链复制
3. 接外部 embedding provider，确认 `mode` 能报 `hybrid`

动手前先看两处：设计文档 **§11**（微信小程序特有的坑：原生 tabBar、外链只能复制、
胶囊按钮避让、运行时禁 `?.` / `??`……）和 **§16**（上线前的合规硬门槛）。
