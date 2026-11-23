# better-life 服务端

> 生活经验库 · 后端（Node + Express + PostgreSQL/pgvector）
> 产品与技术设计见 [`../docs/better-life-design.md`](../docs/better-life-design.md)（v1.7）

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
| `DATABASE_URL` / `USE_MEMORY_DB` / `PGSSL` | 连库方式 |
| `TOKEN_SECRET` / `TOKEN_TTL_DAYS` | token 签发；**生产必填**，缺了启动会直接失败 |
| `ADMIN_OPENIDS` | 首次部署时把这些 openid 提成管理员，逗号分隔 |
| `WECHAT_APPID` / `WECHAT_SECRET` | 微信 code2session |
| `SECCHECK_MODE` | `real` 走微信内容安全审核 / `dev-skip` 本地自检直接放行 |
| `MEDIA_CALLBACK_TOKEN` | 配了媒体审核就必须带对，异步回调会校验它 |
| `EMBEDDING_PROVIDER` | `siliconflow`（bge-m3/1024 维）/ `minimax`（embo-01/1536 维）/ `local`（零依赖哈希，仅自检） |
| `RRF_K` / `VECTOR_TOP_K` / `KEYWORD_TOP_K` / `SEARCH_LIMIT` | 检索参数 |
| `RATE_LIMIT_*` | 反馈 / 投票 / 检索的限流 |

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

三种方式，内容一致（都来自仓库根的 `data/`）：

```powershell
# 1) 走服务层（推荐：会建表 + 写数据 + 重算计数）
node server/scripts/seed.js --memory

# 2) 直接灌 SQL（生产用，可先 review）
node scripts/gen-seed-sql.mjs        # 生成 server/sql/seed.sql
psql $env:DATABASE_URL -f server/sql/seed.sql

# 3) 重建检索索引（内容改了之后跑）
node server/scripts/reindex.js --memory
```

## 自检

```powershell
node server/scripts/selftest.js        # 单元自检，内存库
node server/scripts/http-test.js --memory  # 真起一个服务，逐个打 API
```

两个脚本共用 `server/scripts/cases.js` 里的用例集，当前**各 101 项断言、19 组，全绿**。

## 目录结构

```
server/
├─ src/
│  ├─ index.js / app.js        启动入口 / Express 应用
│  ├─ config.js                环境配置（自写 .env 解析）
│  ├─ db.js                    双后端 query / tx / 主键
│  ├─ schema.sql               建表脚本（11 张表）
│  ├─ routes/                  public / me / admin / search / seccheck
│  ├─ services/                业务逻辑（token / embedding / vector-store / search / experiences / feedbacks / seccheck / wechat）
│  ├─ dao/                     数据库访问 + camelCase 转换
│  ├─ lib/to-camel.js          snake_case ↔ camelCase
│  └─ middleware/              error.js / auth.js
├─ scripts/                    seed / selftest / http-test / reindex / cases
├─ sql/seed.sql                生成物，可 review
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

## 部署相关的说明

**本仓库不代跑部署动作。** 生产 AppID / AppSecret、备案域名、服务器、nginx 与证书
按约定由本人执行；仓库里只留代码与配置样例。
