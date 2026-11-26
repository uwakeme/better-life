# better-life 服务端

> 生活经验库 · 后端（Node + Express + PostgreSQL/pgvector）
> 产品与技术设计见 [`../docs/better-life-design.md`](../docs/better-life-design.md)（v1.8）

## 这是什么

34 个接口分三组：**公开**（目录 / 经验 / 检索 / 健康检查 / 登录）、**需登录**（我的 / 收藏 / 投票 / 反馈）、
**管理端**（经验增改发布 / 标签 / 反馈处理 / 统计 / 重建索引）。全部挂在 `/api` 之下，
管理端整段挂 `requireAuth + requireAdmin`（§9.2 的三层校验里，路由这一层）。

## 两种后端

| 模式 | 什么时候用 | 怎么开 |
| --- | --- | --- |
| **PostgreSQL** | 生产、需要 pgvector | `DATABASE_URL=postgres://…` 且 `USE_MEMORY_DB=false` |
| **pg-mem** | 本地自检，一条命令跑完 | `USE_MEMORY_DB=true` 或命令行加 `--memory` |

自检默认走内存库 —— 本项目没有 CI 的 PG 服务，自检必须能一条命令跑完。
两种后端跑的是**同一套** DAO 与 SQL，结构一致。

## 环境变量

复制 `.env.example` 成 `.env` 后按需改（`.env` 不入库）：

```
cp server/.env.example server/.env
```

| 变量 | 说明 |
| --- | --- |
| `PORT` | 监听端口，默认 8080 |
| `DATABASE_URL` / `USE_MEMORY_DB` / `PGSSL` | 连库方式。`PGSSL=1` 开启 TLS，默认校验服务端证书 |
| `PGSSL_CA` | 自定义 CA 证书路径；不配时使用系统 CA |
| `PGSSL_ALLOW_INSECURE` | 仅开发环境可显式关闭证书校验；生产环境设为 `true` 会直接拒绝启动 |
| `OUTBOUND_TIMEOUT_MS` | 出站 HTTP 超时（微信接口 / embedding），默认 15000ms。上游挂住时按「服务不可用」处理 |
| `TOKEN_SECRET` / `TOKEN_TTL_DAYS` | token 签发；**生产必填**，缺了启动会直接失败 |
| `ADMIN_OPENIDS` | 管理员 openid 名单，逗号分隔；登录时同步提权，已不在名单中的管理员会降为普通用户 |
| `WECHAT_APPID` / `WECHAT_SECRET` | 微信 code2session |
| `SECCHECK_MODE` | `real` 走微信内容安全审核 / `dev-skip` 本地自检直接放行。**生产必须 `real`** |
| `MEDIA_CALLBACK_TOKEN` | 媒体审核回调的校验凭证。**没配时回调直接拒绝**；生产启用真实审核时**必填**，缺失会拒绝启动 |
| `TRUST_PROXY` | 反向代理层数。部署在 nginx 后面填 `1`，并让 nginx 透传 `X-Forwarded-For` —— 不配的话匿名检索的限流全站共用一个桶 |
| `ALLOW_DEV_SECRET` | 显式允许用开发密钥签发 token（默认不允许）。生产应配 `TOKEN_SECRET` |
| `EMBEDDING_PROVIDER` | `siliconflow`（bge-m3/1024 维）/ `minimax`（embo-01/1536 维）/ `local`（零依赖哈希，仅自检） |
| `RRF_K` / `VECTOR_TOP_K` / `KEYWORD_TOP_K` / `SEARCH_LIMIT` | 检索参数 |
| `SEARCH_MIN_SIMILARITY` | 向量检索最低相似度，默认 0.3 |
| `SEARCH_MAX_QUERY_LENGTH` | 检索查询长度上限，默认 200 字。超长截断并在响应里带 `truncated` |
| `FEEDBACK_IMAGE_MAX` / `FEEDBACK_IMAGE_MAX_BYTES` | 反馈图片数量与单张大小上限 |
| `RATE_LIMIT_*` | 反馈 / 投票 / 检索 / 上传 / 登录的限流；固定窗口计数与每日反馈额度均在数据库内原子更新，身份只存 SHA-256 摘要 |

> **生产环境缺关键配置会直接启动失败**，并说清缺哪一项 —— 不做「先跑起来再说」。

## 怎么起

```powershell
cd server
npm install
npm start                 # 真 PG：先配好 .env
```

启动后会打印当前模式：数据库（postgres / memory）、向量库（pgvector / memory 降级）、embedding provider。
**`local` 哈希 embedding 下检索会如实报 `mode=keyword`** —— 不假装是混合检索。

## 灌种子数据

内容一致（都来自仓库根的 `data/`）。**真库灌数据前要先有表** ——
`seed.js` 会自己按 `schema.sql` 建表（全是 `IF NOT EXISTS`，幂等），也可以手工先跑一次。

```powershell
# 1) 走服务层（推荐：建表 + 写数据 + 重算计数 + 重置序列）
node server/scripts/seed.js              # 连 .env 里配的库
node server/scripts/seed.js --memory     # 在内存库上跑一遍（跑完即弃）

# 2) 直接灌 SQL（生产用，可先 review）
node scripts/gen-seed-sql.mjs        # 生成 server/sql/seed.sql
psql $env:DATABASE_URL -f server/src/schema.sql   # 先建表
psql $env:DATABASE_URL -f server/sql/seed.sql

# 3) 重建检索索引（内容改了之后跑）
node server/scripts/reindex.js              # 连 .env 里配的库
node server/scripts/reindex.js --since=2026-11-01   # 只重建这段时间改过的
node server/scripts/reindex.js --exp=12     # 只重建第 12 条
```

> ⚠️ 脚本按 `config` 判断连的是哪个库，并在启动时打印。
> 按 `.env` 配好库之后**不要**再加 `--memory` —— 那样会跑在内存库上，跑完即弃。
>
> ⚠️ 演示账号（`dev-user` / `dev-admin`）**只在内存模式插入** ——
> 真库里留着 `dev-admin` 等于留了一个公开后门。生产的管理员只从 `ADMIN_OPENIDS` 提权。

## 自检

```powershell
node server/scripts/selftest.js        # 单元自检，内存库
node server/scripts/http-test.js --memory  # 真起一个服务，逐个打 API
node server/scripts/regression-test.js # 安全、并发、限流、索引与生产配置专项回归
```

两个接口脚本共用 `server/scripts/cases.js` 里的用例集，当前**各 168 项断言、33 组，全绿**；
专项回归当前 **25 项全绿**，并由仓库根 `scripts/verify-all.js` 一并执行。

用例覆盖的是「内存库 + 关键词检索 + 成功路径」。**没有覆盖的**：向量检索路、
所有错误路径的响应体细节、客户端到服务端的错误码传递、微信真环境的审核接口。
这些要么用 mock 补，要么得对着真环境验。

## 目录结构

```
server/
├─ src/
│  ├─ index.js / app.js        启动入口 / Express 应用
│  ├─ config.js                环境配置（自写 .env 解析）
│  ├─ db.js                    双后端 query / tx / 主键
│  ├─ schema.sql               建表脚本（15 张表）
│  ├─ routes/                  public / me / admin / search / seccheck
│  ├─ services/                业务逻辑（token / embedding / vector-store / search / experiences / feedbacks / seccheck / wechat）
│  ├─ dao/                     数据库访问 + camelCase 转换
│  ├─ lib/to-camel.js          snake_case ↔ camelCase
│  └─ middleware/              error.js / auth.js
├─ scripts/                    seed / selftest / http-test / regression-test / reindex / cases
├─ sql/seed.sql                生成物，可 review
├─ better-life-pm2.json        PM2 进程配置（__DEPLOY_DIR__ 由部署时替换）
└─ .env.example                环境变量样例
```

## pg-mem 的能力边界（写 DAO 时必须绕开）

实测 pg-mem 3.0.14 不支持下面这些 —— 这些差异只影响实现方式，不影响对外结构：

- 不支持 `CREATE DOMAIN` → 内存库里 `vector` 列当 TEXT 存
- 不支持 `unnest` / `date_trunc` / `array_remove`
- 不支持 `DEFAULT VALUES` → 插入时总是给全列值
- 数组参数要写成 `'{a,b}'` 文本再 `::text[]` 强转，直接传数组会解析失败
- **不支持任何相关子查询**（SELECT 列表里的、`WHERE` 里的 `EXISTS` 都算）→ 聚合判断放到 JS 里做
- **`HAVING count(*) > 1` 不支持** → GROUP BY 之后在 JS 里判
- **`count(*) FILTER (WHERE …)` 会忽略过滤条件**（每行同时算进 good 和 bad）→ 取回明细在 JS 里数
- 自增计数器每张表从 1 重开，与种子的显式 id 撞车 → 内存库走 `db.nextId()`（应用层算 `max(id)+1`），
  真 PG 仍走数据库自增（并发安全）
- 事务按调用顺序串行执行，不能用来验证真实 PostgreSQL 的行锁并发；部署前需在真 PG 上复测配额、限流与回调合并

## 部署相关的说明

**服务器上的动作由本人执行**（装 PostgreSQL / pgvector、建目录、nginx 反代与证书）；
仓库只留代码与配置样例。但**代码上线这一步已经自动化**：
[`.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml)
在 push main 且动了 `server/` 时跑完整条链路 ——

```
备份线上代码 → scp 覆盖 → npm ci --omit=dev
  → 应用 schema.sql（建表，重启前，失败就退出）
  → 预检生产配置（NODE_ENV=production 下跑 assertProductionConfig）
  → 重启 PM2（better-life-server）→ 轮询 /api/health 探活
  → 不健康就把备份那版换回来再重启
```

几个要点：

- **建表在重启之前**：`schema.sql` 全是 `CREATE ... IF NOT EXISTS`，重复执行安全；
  向量列依赖 pgvector 扩展，扩展没装会在这一步明确报错 —— 那时旧进程还在跑。
- **`.env` 绝不覆盖**：服务器上的 `.env` 由本人维护。流水线只在它缺失时创建一份
  （含 `NODE_ENV=production` 与 `DATABASE_URL`），缺 `TOKEN_SECRET` 时补一个，
  **已存在的值绝不替换**。
- **端口从应用自己的配置里取**（`require('./src/config').port`），不另写一套 `.env` 解析 ——
  否则 `PORT = 9090` 这类写法会让探活探错端口。
- **PM2 配置**：`better-life-pm2.json` 里的 `__DEPLOY_DIR__` 由部署时替换成实际目录。
  ⚠️ `pm2 restart` 用的是 PM2 里存的进程配置、不读这个文件 ——
  改了它（cwd / env / 端口）要手动 `pm2 delete better-life-server` 后再部署一次才生效。
- **种子数据不自动灌**：`seed.js` 是普通 INSERT，重复执行会撞 slug 唯一约束。
  需要时手动触发部署并在输入里勾上 `seed`。

配置项与必需性见上表；CI 与发版流水线见仓库根 [README](../README.md) 的「自动化流程」。
