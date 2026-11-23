# life-better 设计文档

> 生活经验库 · 微信小程序
> 状态：设计已确认；**小程序端与后端代码已落地（未部署）**
> 日期：2026-11-23
> 版本：v1.7
> 修订脉络：2026-11-20 首轮审查 + 第二轮复审 → 2026-11-21 界面文案统一书面语 →
> 2026-11-22 五项产品决策落地 → 2026-11-23 文档整理 →
> 2026-11-23 第三轮设计审查落地（39 条问题逐条核对，见 §19 第 6 轮）→
> 2026-11-23 小程序端与后端落地（实施轮，见 §19 第 7 轮）。
> 每一轮改了什么，逐条写在 §19 —— 审查 / 复审报告文件改完即删，不在仓库里留；
> 本文档各节就是改完之后的正式版本。

---

## 0. 文档怎么读

- **想快速上手**：读 §1 产品定义 → §2 内容模型 → §15 开发计划
- **准备写代码**：读 §5 技术架构 → §6 数据模型 → §7 搜索设计 → §8 API
- **想改方案**：§14 决策记录写了每个取舍的理由和被否掉的选项
- **想知道每一轮改了什么**：直接看 §19 修订记录 —— 每轮改动的简表；审查报告文件改完即删，不在仓库里留

---

## 1. 产品定义

### 1.1 一句话

把「我踩过的坑、看过的测评」变成一张张**可检索、可溯源、可转发**的经验卡。

### 1.2 要解决的问题

日常踩坑的知识散在收藏夹、聊天记录、短视频评论区里，检索全靠"我好像记得看过"。这个项目要做的是：

1. **随时能查** —— 出门前、进超市、遇纠纷时，掏手机就能搜到
2. **结论先行** —— 每条经验先给结论，再给理由，不是一段散文
3. **依据可溯源** —— 每条判断都能点开看它来自哪篇文章/哪个视频
4. **好坏可分辨** —— 成分、做法、选项的"推荐/避雷"是结构化字段，不是靠人读文字判断
5. **可被纠正** —— 用户发现某条经验对自己不适用，能反馈；管理员能改

### 1.3 非目标（首版明确不做）

| 不做 | 原因 |
| --- | --- |
| 用户投稿/发布经验 | 内容质量不可控，UGC 审核成本高；首版内容由管理员独家维护 |
| 社区/评论/关注/动态流 | 这是知识库，不是社交产品 |
| AI 自动生成经验 | 结论必须人工负责，自动生成无法溯源 |
| 商品比价/导购 | 涉及电商资质，且不是本项目的价值点 |
| 用户等级/积分/勋章 | 早期无必要 |

### 1.4 目标用户

- **主要**：被生活琐事反复消耗的普通人（25-40 岁，独居或租房，决策信息差大）
- **次要**：管理员本人（内容维护 + 反馈处理）

---

## 2. 内容模型（本项目的地基）

### 2.1 三层结构

一个典型需求——"怎么挑洗发水，哪些成分好，哪些不好，依据是什么"——天然是三层。把它固化成数据结构：

| 层 | 表 | 是什么 | 例 |
| --- | --- | --- | --- |
| **经验** | `experiences` | 一条完整经验 | 「怎么挑洗发水不踩雷」 |
| **要点** | `points` | 可独立成立、**可判定立场**的原子结论 | 「二甲基硅油」→ 立场 `neutral` |
| **依据** | `sources` | 支撑**某个具体要点**的外部材料 | 某测评视频链接 → 关联到「二甲基硅油」 |

### 2.2 关键设计：依据挂在要点上，不是挂在经验末尾

`sources.point_ids` 存它支撑了哪几条要点。用户点开「含硅油」这一行，右侧直接显示"依据：B站某测评 / 丁香医生科普"。

如果只把来源挂在经验末尾，用户就得自己在长文里翻——**溯源能力等于没有**。

### 2.3 要点的立场（stance）

每个要点带一个立场字段，让"好/不好"成为可查询、可筛选、可排序的数据：

| 值 | 含义 | 贴纸（颜色 + 符号 + 文字） |
| --- | --- | --- |
| `good` | 推荐、值得做 | 绿色 · `✓ 推荐` |
| `bad` | 避雷、不要做 | 红色 · `✕ 避雷` |
| `neutral` | 中立、因人而异 | 中性色 · `— 中立` |

**贴纸必须同时给颜色、符号、文字三个通道**，不能只给颜色 + 符号：只靠颜色区分，
色弱用户与截图场景（黑白打印、微信里转发的图）都会失效。

**中立用破折号 `—`，不用问号 `?`**：问号在用户眼里是"不确定 / 存疑"，
而中立说的是"因人而异"；问号留给"有争议"（`confidence = disputed`）。

同时 `applies_to` 存适用条件（"油性头皮"、"孕 3 个月以上"、"预算 200 以内"）。这条很关键——**"含硅油不能用"和"油头用高硅洗发水会更难洗"都是对的**，区别只在前提。

**立场只到「要点」一级，经验本身没有立场字段。** 一条经验里既有推荐要点又有避雷要点是常态，
所以经验卡不能贴"整条是推荐 / 整条是避雷"的标签 —— 读者会把"这条经验里有避雷点"
误读成"这条经验是避雷"，正好伤到 §1.2 的"结论先行"。
经验卡上只写**要点级的计数**（"2 推荐 · 1 避雷"），立场贴纸（✓ 推荐 / ✕ 避雷 / — 中立）只出现在要点旁边。

### 2.4 分类体系

**一级领域固定 9 个**（用户指定），后台不可删，只能改名/排序：

| id | 名称 | 典型二级标签（示例，可后台增删） |
| --- | --- | --- |
| `shopping` | 买买买 | 洗护、家电、数码、服饰、食品、母婴、清洁、宠物 |
| `food` | 吃喝 | 外食、做饭、饮品、食材储存、厨房 |
| `home` | 住家 | 清洁、收纳、装修、维修、家电养护 |
| `travel` | 出行 | 通勤、机票火车、自驾、住宿、打包 |
| `health` | 健康 | 睡眠、饮食、体检、用药常识、运动 |
| `money` | 钱财 | 记账、砍订阅、保险、理财常识、退款 |
| `rights` | 办事维权 | 投诉、快递、合同、社保、网购纠纷 |
| `mind` | 人际心态 | 沟通、边界、职场、情绪 |
| `skill` | 技能效率 | 工具、自动化、笔记、方法 |

**二级标签由管理员在后台自由维护**，不写死在代码里。新增领域标签时不需要发版。

**二级标签就是 `tags` 表里的行，用 `category_id` 指向所属的一级领域。**
（早期版本里 `categories` 表自关联（`parent_id`）和 `tags` 表并存，两套机制打架 ——
schema 支撑不了原型已经展示的"按领域筛标签"。v1.1 定稿：`categories` 只放 9 个一级领域，
`tags` 表加 `category_id` 承担二级标签。`categories` 的 `parent_id` 字段保留，
供将来真的要做多级分类时用，首版不写入。）

**同名标签可以跨领域存在**：「清洁」既属买买买（洗护、清洁）也属住家（家居清洁），
两边的读者都该能按"清洁"筛到。所以 `tags` 的唯一键是 **`UNIQUE(category_id, name)`**，不是 `UNIQUE(name)`；
筛选按 `tag_id` 走。跨域同义不靠全局字典，靠每条经验自己的**搜索关键词**（§2.6）。

**领域页的标签筛选是单选**：一次只看一个标签，再点一次取消。
不做多选是因为多选很容易组合出空结果，读者看到"0 张便签"会以为这个领域是空的。

### 2.5 时效与可信度

生活经验会过期，尤其是健康、钱财、维权类。所以：

- `reviewed_at` —— 最后确认日期（管理员确认「这条还成立」的那天），必填
- `next_review_at` —— 建议下次确认日期，健康/钱财/维权类默认建议设置
- `confidence` —— `normal` / `high` / `disputed`（"存在争议"通常意味着有用户反馈说在某些情况下不适用）
- 详情页固定展示「更新于：YYYY-MM-DD · 内容可能随时间变化」

**这个机制不是装饰**。一条"某个维权流程有效"的经验如果半年没人确认，用户照着做会出事。

**口径说明（2026-11-19 调整）**：内容全部由管理员自己录入、自己维护，没有第二双眼睛，
所以「复核」这个词不准 —— 它不是审核别人的稿子，是管理员回头确认这条还成立。
读者侧因此**只展示一个日期（`updated_at`）**，`reviewed_at` / `next_review_at` 只在管理端出现。
两个日期手工维护必然漂移（内容改了却没刷新确认日期，页面就开始说谎）；
而「下次确认」这种承诺如果没人真去回头看，就只是又一条没人维护的元数据。

### 2.6 搜索关键词（替代别名表）

每条经验带 0-3 个**搜索关键词**：别人可能怎么问这件事。
检索时把关键词并进匹配串，命中后如实显示「命中关键词：洗头水」。

- **写在内容上，不单独维护字典**：写作时顺手填，内容删了关键词跟着消失，不会留下过期条目。
- **只在搜索里生效**：读者侧页面上看不到关键词，卡片也不会显示。
- **可留空**：不填就退化成字面匹配（标题 / 结论 / 要点 / 标签）。
- **与标签分得清**：标签用于**归类与筛选**（是谁的下级分类）；关键词只用于**召回**（用户会怎么问）。

**为什么删掉原来那张别名表**：它解决的是真问题（用户搜「洗头水」而内容写的是「洗发水」），
但维护方式错了 —— 需要单独一张表、一个管理页、一组接口和一次归一化实现，维护责任却落在同一个管理员身上。
实测那份初始数据：4 条里 2 条指向的「正式说法」在内容里根本不存在（消费者投诉、市场监督管理总局都是 0 命中）、
1 条本来就是子串匹配（搜「硅油」已能命中「二甲基硅油」），真正有效的只有 1 条。
为一处真实增量养一套独立机制不划算，所以改成挂在经验上的一个字段。

---

## 3. 信息架构与页面

### 3.1 tabBar（原生，3 项）

用**原生 tabBar**（`app.json` 里配 `iconPath`），不用自定义组件。原因见 §11 微信小程序特有坑。

| tab | 页面 | 职责 |
| --- | --- | --- |
| 首页 | `pages/home` | 9 个领域入口（横向一条）+ 最近更新 + 热门 |
| 搜索 | `pages/search` | 语义+关键词混合搜索，支持领域/立场筛选 |
| 我的 | `pages/mine` | 收藏夹；普通用户另有「我的反馈」，管理员另有「管理」入口 |

### 3.2 页面清单

| 页面 | 路径 | 职责 |
| --- | --- | --- |
| 首页 | `pages/home/home` | 领域卡片网格、最近更新经验流 |
| 领域详情 | `pages/category/category` | 该领域下的经验列表，支持二级标签筛选 |
| 搜索 | `pages/search/search` | 搜索框 + 结果列表 + 领域/立场筛选（**五个状态**：默认 / 输入中 / 结果 / 无结果 / 超时，见 §3.5） |
| 经验详情 | `pages/detail/detail` | **核心页**：结论、要点列表（**依据内联折叠**）、反馈、收藏、分享；底部**吸底操作条**常驻投票与反馈 |
| 依据来源 | `pages/source/source` | **「要点 ↔ 依据」映射视图**：按要点分组，每条依据标「依据 i/N」与它同时支撑哪些要点；含 **复制链接**（个人主体配不了业务域名，外链无法在小程序里直接打开，见 §16 第 8 条） |
| 我的 | `pages/mine/mine` | 收藏夹；普通用户另有「我的反馈」，管理员另有「管理」入口。管理员不提交反馈（§4.3） |
| 收藏夹 | `pages/favorites/favorites` | 收藏列表 |
| 反馈提交 | `pages/feedback/feedback` | 条目级反馈（从详情页进）/ 项目级反馈（从「我的反馈」页进）；反馈内容仅管理员可见。**只给普通用户**，管理员不提交反馈（§4.3）。反馈类型只有内容层面的几类：纠错 / 补充说明 / 提问 / 建议 |
| 我的反馈 | `pages/inbox/inbox` | 我提交过的反馈及处理状态（仅自己可见）。**只给普通用户**，管理员不提交反馈（§4.3） |
| 管理-列表 | `pages/admin/list/list` | 经验/要点/来源/标签/反馈的入口与管理列表 |
| 管理-编辑 | `pages/admin/edit/edit` | 经验编辑器（结论/要点/来源/标签） |
| 管理-标签 | `pages/admin/tags/tags` | 二级标签管理（标签归属领域、改名、新增） |
| 管理-反馈 | `pages/admin/feedback/feedback` | 反馈审核与回复 |
| 关于与隐私 | `pages/about/about` | 关于本库 + 隐私指引（隐私走 `wx.openPrivacyContract` 官方协议，不自写协议正文） |

### 3.3 路由参数

| 页面 | 参数 | 说明 |
| --- | --- | --- |
| `pages/detail/detail` | `id` | 经验 id；分享链接带的就是它 |
| `pages/category/category` | `categoryId`、`tagId?` | 领域与二级标签 |
| `pages/search/search` | `q?` | 预填关键词（外部进入时）。搜索页是 tabBar 页：冷启动能从 `onLoad` 拿到 `q`，热启动（应用已在后台）参数不会重新进 `onLoad`。一期只分享详情页（§10.1），这条路径踩不到 |
| `pages/source/source` | `experienceId` | 来源清单 |

### 3.4 交互要点

- **详情页要点列表**：立场用色标 + 符号 + 文字；要点默认折叠，点开就地展开「为什么」「适用条件」和**该要点挂着的依据卡**。依据全文只在详情页出现一次 —— 详情页不再整段列全部依据，来源页也不再把依据全文重写一遍
- **依据来源页是映射视图，不是清单**：按要点分组，每条依据标「依据 i/N」，并写明它**同时支撑**哪几条要点。这两页是分工不是重复：详情页回答「这条结论的出处是什么」，来源页回答「这些出处各自在支撑什么」
- **详情页操作条吸底**：投票 / 反馈不再排在要点、依据、相关经验之后，长页面不用滚很久才够得着
- **外链一律复制**：来源链接给「复制链接」按钮 + 「已复制，去浏览器打开」的反馈。
  个人主体的小程序配不了业务域名，`web-view` 打开外链这条路封死（§16 第 8 条）
- **搜索页**：输入 300ms 防抖（沿用 `internet_slang_translation` 的写法）；**输入过程不写搜索历史**，避免中间态污染
- **搜索历史只存在用户本机**：不做「大家常搜 / 热门搜索」——
  那需要把所有人的搜索词汇总到服务端，等于多一份要存、要脱敏、要维护的数据，
  而它换来的只是几个入口词。搜索页默认态只给两样东西：**用户自己的历史** + **最近收录的内容**
- **联想词同样不依赖搜索记录**：从本机历史与本地已拉取的经验标题 / 标签里就地匹配，
  联想面板上要标明此刻选词来自「本机历史与已收录内容」，免得用户以为是别人搜过的
- **搜索结果**：显示命中原因（`matchedOn`），比如"命中要点：二甲基硅油" / "语义相近"
- **降级提示**：当 `mode !== 'hybrid'` 时，在结果区顶部如实显示「语义检索暂不可用，当前为关键词匹配」
- **筛选分组**：搜索页的"领域"与"立场"是两组筛选，分开摆。
  同一组里"全部"和具体项不能同时选中 —— 那是两个互斥的口径，并排亮着会让人以为能叠加

### 3.5 页面状态（加载 / 错误 / 空）

每个会取数的页面都要有这三种状态，缺一个就等于把异常甩给用户：

| 状态 | 表现 | 恢复动作 |
| --- | --- | --- |
| 加载中 | 骨架屏（列表页用占位便签，不用转圈） | —— |
| 出错 | 一句人话（「网络不太好，没连上」）+ 重试按钮 | 点重试重新拉一次，**保留用户已输入的内容** |
| 空 | 说明为什么空 + 一个出口（回首页 / 去掉筛选） | —— |
| 内容已下线 | 分享出去的链接可能指向一条被撤回的内容 | 给「回到便签墙」与「去搜索」两个出口 |
| 未登录 | 收藏 / 投票 / 反馈需要账号 | 先说清「阅读无需登录」，再给登录按钮 |
| 无权限 | 读者误入管理页 | 说清这一页只有管理员能进 |
| 失败 | 收藏 / 投票失败 | 明确说「未生效，请稍后重试」，不假装成功 |

- **搜索历史只记"提交过"的查询**，不记输入过程中的中间词；点历史项直接重新检索
- **搜索历史存 `wx.setStorageSync('lifebetter_search_hist')`**，最多 8 条，
  重复搜索同一词只把它挪到最前；默认态给「清空」入口，清空只动本机数据。
  历史**不上传、不参与任何统计或排序**
- 搜索接口超时按错误处理，不按"没找到"处理 —— 这两件事在页面上必须长得不一样

---

## 4. 核心流程

### 4.1 管理员录入一条经验

```
管理端新建 → 填结论(title + summary) → 加要点(选立场/写理由/写适用条件)
→ 关联依据来源(选平台/贴链接/勾选这条来源支撑哪几个要点)
→ 打二级标签 → 存草稿 → 发布
```

发布时后端同步做三件事：写库、算 embedding、写入搜索索引。embedding 失败**不阻塞发布**——内容先可见，索引进入重试队列（§7.6）。

**发布前先校验，不通过不让发**（对应 §6.3 的完整性断言 —— 写入端必须有护栏）：

| 校验 | 不通过时的提示 |
| --- | --- |
| 标题、结论非空 | 「标题不能为空」 |
| 至少 1 条要点 | 「尚未填写要点，请先补充。」 |
| 至少 1 条依据 | 「至少需要 1 条依据，发布前请补充。」 |
| 每条依据都关联了至少一条要点 | 「存在未关联要点的依据，请先为其指定所支撑的要点。」 |

把"依据能勾选"这种写入端打开时，校验必须同时装上 —— 否则管理员自己就能造出
`point_ids` 为空的坏数据，而 §6.3 的断言要等事后查库才发现。

### 4.2 用户搜一条经验

```
输入查询 → 大小写归一 → 切 bigram（关键词字段与标签一起参与匹配）
  ├─ 路A: query embedding → 向量库 top30
  └─ 路B: bigram 逐个 ILIKE 命中 → 关键词分 top30
→ RRF 融合排序 → top20
→ 按经验聚合(要点级命中回溯到所属经验) → 返回
```

### 4.3 用户反馈

**反馈仅管理员可见。** 不公开给其他用户，用户只能看到自己提交过什么、处理到哪一步了。

**投票和反馈是两条线，不是一件事的两层皮：**

| | 投票（votes） | 反馈（feedbacks） |
| --- | --- | --- |
| 表达什么 | 「这条对我有用 / 没用」 | 「这条内容有问题 / 我有疑问」 |
| 要不要文字 | 不要，一键 | 要，可写可不写（问题类必须写） |
| 走不走审核 | 不走 | 走内容安全审核 |
| 谁处理 | 没人处理，只计数 | 管理员逐条处理并回复 |
| 谁能用 | 普通用户 | 普通用户（管理员不提交，§4.3） |

同一个用户既投"没用"又提一条"这条没用"的反馈，**算两件事**，不合并、不去重：
投票是匿名的群体信号，反馈是要管理员逐条看的内容问题。早期版本把"有用 / 没用"
同时放进 votes 和 feedbacks.kind，同一条意见会被记两次、还要解释两个口径怎么汇总 ——
v1.1 定稿：**feedbacks.kind 去掉 useful / not_useful**，只留内容层面的几类。

```
条目级：详情页点「反馈」→ 选类型（纠错 / 补充说明 / 提问 / 建议）+ 写内容（可附最多 3 张图）→ 走内容安全审核 → 落库
项目级：「我的反馈」页点「再写一条」→ 选类型 + 写内容（可附最多 3 张图）→ 走内容安全审核 → 落库
（后台）管理员看到待处理 → 点「处理」：选结论（采纳 / 不采纳 / 只回话）+ 可选回复 → 一次提交 → 用户在「我的反馈」看到进展
```

**处理反馈时要不要写理由：不强制。** 采纳 / 不采纳只是给这条反馈下一个结论，
理由属于可选补充；只有「只回话」必须写回复 —— 不写就等于没答复。
这条护栏落在 `submitFb`（数据层）而不是只靠界面拦：界面拦住了不代表别的入口拦得住。
界面上也要把这句写清楚，别让管理员以为「采纳」等于「必须解释」。

**反馈可以带图，最多 3 张。** 图片走异步审核（§9.4），与文本审核不是一条流程 ——
带图的反馈是「先落库、图片标审核中」，不是「审核通过才落库」。

「不公开」是**类目合规的前提**，不是实现细节——改成公开就要换类目、换主体（§16.1）。

**只有用户提反馈，管理员不提交。** 库里每条经验都是管理员自己写的，他发现问题直接改就行，
绕一圈给自己提反馈没有意义 —— 提了还得自己回复自己。所以管理员视角下不出现任何提交反馈的入口：

- 「我的」页没有「我的反馈」，只剩收藏夹；
- 经验详情页没有「反馈」按钮；
- 「我的反馈」页与「反馈提交」页对管理员只渲染一句说明 + 指向「反馈盒」/「经验编辑器」的按钮。

管理员那边只有一个动作：在「反馈盒」处理用户提的问题。

### 4.4 收藏与分享

- 收藏：需登录（`wx.login` → token）→ `POST /api/me/favorites/:id`
- 分享：`onShareAppMessage` 带 `/pages/detail/detail?id=xxx`，落地即详情页
- 首次进入未登录也能看全部内容——**浏览完全公开**

---

## 5. 技术架构

### 5.1 分层

```
┌─ 小程序端（原生，无构建、无 npm 依赖）
│   pages/ components/ utils/ data/ styles/
│   utils/api.js    ← 唯一取数入口，页面只认它
│   utils/cloud.js  ← 唯一后端出口，换后端只改这里
└──── HTTPS ────┐
                ▼
┌─ 后端（Node ≥18 + Express + PostgreSQL）
│   routes/ controllers/ services/ dao/ middleware/
│   services/embedding.js    EmbeddingProvider 抽象
│   services/vector-store.js VectorStore 抽象（pgvector | memory）
│   services/search.js       两路召回 + RRF 融合
│   services/seccheck.js      微信内容安全审核
└──────┬─────────┘
           ▼
     PostgreSQL
     experiences / points / sources / tags / experience_tags
     favorites / votes / feedbacks / users / search_documents
```

### 5.2 沿用油走势项目的既有铁律

| 铁律 | 说明 |
| --- | --- |
| 单一取数入口 | 页面只调 `utils/api.js`，不直接调 `wx.request` |
| 单一后端出口 | `utils/api.js` → `utils/cloud.js` → 后端，换后端只改 `cloud.js` |
| 数据层与来源分离 | 后端不可用时自动回落本地演示数据，页面只认结构不认来源 |
| **如实展示来源** | 演示数据不能包装成真实数据；降级的搜索结果不能包装成语义结果 |
| 库表 snake_case，业务层 camelCase | 转换集中在 DAO 层的 `toCamel` |
| 不写可选链 `?.` / 空值合并 `??` | 小程序运行时对高版本语法支持不稳（仅 `scripts/` 下的脚本可用现代语法） |
| 注释用中文，文件头 `/** */` 说明职责与关键约定 | |
| 视觉令牌走 `styles/tokens.wxss` | 页面根节点加 `class="tk"` 继承 |

### 5.3 目录结构（实施后的实际样子）

> 下面是**实施完成后**的仓库结构 —— 与仓库现状一致。
> 与初稿的差别：没有 `controllers/` 这一层（服务层直接对外，薄控制器没必要），
> 组件从 4 个增加到 7 个，工具模块从 6 个增加到 11 个。

```
life-better/
├─ app.js / app.json / app.wxss / sitemap.json
├─ project.config.json
├─ config/index.js            全局配置（apiBaseUrl / embedding 开关）
├─ pages/                     14 个页面，四件套 .js/.json/.wxml/.wxss
├─ components/
│  ├─ nav-bar/                全站自定义导航（§14 D12）
│  ├─ experience-card/        经验卡片（列表/搜索通用）
│  ├─ point-item/             要点卡（折叠展开 + 内联依据）
│  ├─ source-item/            来源条目（含复制链接，§16 第 8 条）
│  ├─ stance-badge/           要点立场色标
│  ├─ tag-pills/              标签组
│  └─ state-view/             加载 / 错误 / 空 状态视图
├─ utils/
│  ├─ api.js                  ★ 唯一取数入口（后端优先，失败回落演示数据）
│  ├─ cloud.js                ★ 唯一后端出口（页面里不得出现 wx.request）
│  ├─ auth.js                 token 存取与登录态
│  ├─ storage.js              本机存储封装
│  ├─ role.js                 角色与权限判定（三层校验的前端那一层）
│  ├─ local.js                本地演示数据
│  ├─ view.js                 视图模型（便签色、命中原因、依据分组）
│  ├─ format.js               时间/数字/计数格式化
│  ├─ share.js                分享参数拼装
│  ├─ search.js               防抖、归一、结果聚合
│  └─ nav.js                  导航与角色入口裁剪
├─ data/                      演示数据集（离线可跑通全流程）
├─ styles/
│  ├─ tokens.wxss             设计令牌
│  └─ components.wxss         通用类
├─ server/
│  ├─ src/
│  │  ├─ index.js / app.js
│  │  ├─ config.js            环境配置（自写 .env 解析）
│  │  ├─ db.js                双后端（PostgreSQL / pg-mem）+ 事务与主键
│  │  ├─ schema.sql           建表脚本（11 张表）
│  │  ├─ routes/              public.js / me.js / admin.js / search.js / seccheck.js
│  │  ├─ services/            业务逻辑（见 §5.1）
│  │  ├─ dao/                 数据库访问 + camelCase 转换
│  │  ├─ lib/to-camel.js      snake_case ↔ camelCase 转换
│  │  └─ middleware/          error.js / auth.js
│  ├─ scripts/                seed.js / selftest.js / http-test.js / reindex.js / cases.js
│  ├─ sql/seed.sql            由 data/ 生成的种子 SQL（可 review）
│  └─ package.json
├─ scripts/                   仓库级自检（见 §12）
│  ├─ _kit.js                 共享断言套件与 WXML 树解析
│  ├─ lint-wxml.js / check-modules.js / verify-*.js
│  └─ gen-*.mjs               图标、占位图、种子 SQL 的生成脚本
├─ docs/
│  └─ better-life-design.md   本设计文档
└─ design/                    视觉稿与高保真原型（已在仓库里）
```

### 5.4 依赖

**小程序端：零依赖**（原生，无 npm，无构建）。

**后端：**

```json
{
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "pg-mem": "^3.0.14"
  }
}
```

刻意不引入：ORM（手写 SQL 更可控）、向量库（PostgreSQL + pgvector 足够）、中文分词库（见 §7.4）、任何前端框架。

---

## 6. 数据模型

### 6.1 ER 概览

```
users ──────┬── favorites ──── experiences ──┬── points
            │                    │  ↑         ├── sources
            └── votes ──────────┘  │         └── experience_tags ── tags
                                 │
              feedbacks (target_type: experience|project)
              search_documents (doc_type: experience|point)
              （曾有一张 synonyms 别名表，2026-11-23 删除，改由 experiences.search_keywords 承担）
```

### 6.2 表定义

**categories —— 一级领域（固定 9 个）**

> v1.1 定稿：一级领域与二级标签**分表**。
> `categories` 只放 9 个一级领域；二级标签是 `tags` 表的行，靠 `tags.category_id` 指向领域。
> 早期版本让 `categories` 自关联、同时装一级和二级，与 `tags` 表两套机制打架（§2.4）。
> `parent_id` 字段保留但首版不写入 —— 将来真要做多级分类时再启用。

```sql
CREATE TABLE IF NOT EXISTS categories (
  id         BIGSERIAL PRIMARY KEY,
  parent_id  BIGINT REFERENCES categories(id) ON DELETE CASCADE,
  -- 首版不写入；保留字段，等真要做多级分类时再启用
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories (parent_id);
```

> **对外标识统一用数字主键 `id`**，`slug` 只用于后台可读性与将来的可读 URL。小程序路由参数 `categoryId` 传数字，搜索结果里的 `categoryId` 也是数字。
>
> **slug 生成规则**：管理员在编辑器里手填，小写英文 + 短横线（如 `pick-shampoo`），全局唯一；
> 不填时用 `exp-{id}` 占位，发布前再改。**不做自动 slugify** —— 中文标题转拼音要引词典，
> 出来的结果还不如手填好看，而 slug 只在后台可见，收益不足以背这个依赖。

**experiences —— 经验**

```sql
CREATE TABLE IF NOT EXISTS experiences (
  id             BIGSERIAL PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  -- summary 是一句话结论，先结论后理由
  summary        TEXT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',
  category_id    BIGINT NOT NULL REFERENCES categories(id),
  -- 搜索关键词：别人可能怎么问（洗头水 / 洗发露）。只影响检索召回，不展示给读者。
  -- 这一列替代了原来那张全局别名表，见 §2.6
  search_keywords TEXT[] NOT NULL DEFAULT '{}',
  cover_url      TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  -- draft | published | archived
  confidence     TEXT NOT NULL DEFAULT 'normal',
  -- normal | high | disputed
  reviewed_at    DATE NOT NULL, -- 最后确认日期（管理端用）
  next_review_at DATE,          -- 建议下次确认日期（管理端待办）
  view_count     INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  useful_count     INTEGER NOT NULL DEFAULT 0,
  not_useful_count INTEGER NOT NULL DEFAULT 0,
  feedback_count INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS experiences_category_idx ON experiences (category_id, status);
CREATE INDEX IF NOT EXISTS experiences_status_idx ON experiences (status, updated_at DESC);
```

**points —— 要点**

```sql
CREATE TABLE IF NOT EXISTS points (
  id            BIGSERIAL PRIMARY KEY,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  stance        TEXT NOT NULL DEFAULT 'neutral',
  -- good | bad | neutral
  title         TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  applies_to    TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS points_experience_idx ON points (experience_id, sort_order);
```

**sources —— 依据来源**

```sql
CREATE TABLE IF NOT EXISTS sources (
  id            BIGSERIAL PRIMARY KEY,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  source_type   TEXT NOT NULL DEFAULT 'article',
  -- video | article | post | paper | official | review
  platform      TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT '',
  published_at  DATE,
  note          TEXT NOT NULL DEFAULT '',
  -- 引用理由：这段来源为什么可信 / 讲了什么
  point_ids     BIGINT[] NOT NULL DEFAULT '{}',
  -- ★ 溯源到要点级：这条来源支撑了哪几个要点
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sources_experience_idx ON sources (experience_id, sort_order);
```

> `point_ids` 用 PG 原生数组：只查不 join，比关联表简单。查询时用 `WHERE $id = ANY(point_ids)`。
>
> **数组没有外键，删要点会留下悬空 id。** 删除一条要点时，必须在同一个事务里把这条要点 id
> 从所有 `sources.point_ids` 里剔掉（`UPDATE sources SET point_ids = array_remove(point_ids, $id)`），
> 否则"这条依据支撑第 3 条要点"会指向一条已经不存在的要点。§6.3 的断言会检出残留。

**tags / experience_tags**

```sql
CREATE TABLE IF NOT EXISTS tags (
  id          BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  -- 所属一级领域。NULL = 还没归类（后台待处理），界面上的"未归类"标签
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 同名标签可以跨领域存在：「清洁」既属买买买也属住家（§2.4）。
  -- 所以唯一键是「领域 + 名称」，不是名称本身。
  CONSTRAINT tags_category_name_uniq UNIQUE (category_id, name)
);
CREATE INDEX IF NOT EXISTS tags_category_idx ON tags (category_id);

CREATE TABLE IF NOT EXISTS experience_tags (
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  tag_id        BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (experience_id, tag_id)
);
CREATE INDEX IF NOT EXISTS experience_tags_tag_idx ON experience_tags (tag_id);
```

**users —— 微信用户**

```sql
CREATE TABLE IF NOT EXISTS users (
  openid       TEXT PRIMARY KEY,
  unionid      TEXT,
  nickname     TEXT NOT NULL DEFAULT '',
  avatar       TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'user',
  -- user | admin
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);
```

> 管理员就是 `role='admin'` 的那几行 openid。首次部署时由服务端脚本按环境变量里的 openid 列表写入。

**favorites —— 收藏**

```sql
CREATE TABLE IF NOT EXISTS favorites (
  openid       TEXT NOT NULL,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (openid, experience_id)
);
CREATE INDEX IF NOT EXISTS favorites_openid_idx ON favorites (openid, created_at DESC);
```

> `experiences.favorite_count` 是冗余计数，列表页直接读，不做实时 count。
>
> `useful_count` / `not_useful_count` 同理。详情页要展示「有用 12 · 没用 3」（§16.1 第 2 条），
> 这两个数从 `votes` 表按经验 id 聚合后冗余回 `experiences` —— 否则每次读详情页都要 count 一遍 votes。
> 投票是"取消投 / 改投"的语义（`votes` 的主键是 openid + experience_id），
> 改投时要把两个计数都改对，§6.3 的断言会核。

**votes —— 有用/没用**

```sql
CREATE TABLE IF NOT EXISTS votes (
  openid       TEXT NOT NULL,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  useful       BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (openid, experience_id)
);
```

> **投票只对普通用户开放。** 内容全部由管理员自己录入，管理员给自己写的内容投票等于自刷计数，
> 没有信息量。实现上：投票接口校验 `role != 'admin'`，管理员视角的界面上不出现投票按钮
> （和"管理员不提交反馈"是同一个理由，§4.3）。

**feedbacks —— 反馈（条目级 + 项目级共用一张表）**

```sql
CREATE TABLE IF NOT EXISTS feedbacks (
  id          BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL,
  -- experience | project
  target_id   BIGINT,
  -- target_type='experience' 时填经验 id；'project' 时为 NULL
  openid      TEXT NOT NULL,
  kind        TEXT NOT NULL,
  -- correction 纠错 | supplement 补充说明 | question 提问 | suggestion 建议
  -- （"有用 / 没用"是投票，不是反馈，见 §4.3）
  content     TEXT NOT NULL DEFAULT '',
  images      JSONB NOT NULL DEFAULT '[]',
  -- [{ media_id, url }]，最多 3 张（一条反馈最多 3 张图够用，不为它单开一张表）
  media_status    TEXT NOT NULL DEFAULT 'none',
  -- none 无图 | checking 审核中 | passed 通过 | rejected 未通过
  media_trace_id  TEXT,
  media_checked_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- pending 待处理 | accepted 采纳（内容改了）| ignored 不采纳 | replied 只回话（答复了，内容不用改）
  reply       TEXT NOT NULL DEFAULT '',
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 条目级必须有 target_id，项目级必须为空 —— 靠约束兜住，不靠应用层自觉
  CONSTRAINT feedbacks_target_check CHECK (
    (target_type = 'experience' AND target_id IS NOT NULL) OR
    (target_type = 'project'    AND target_id IS NULL)
  ),
  CONSTRAINT feedbacks_kind_check CHECK (kind IN ('correction','supplement','question','suggestion')),
  CONSTRAINT feedbacks_media_status_check CHECK (media_status IN ('none','checking','passed','rejected'))
);

> **反馈带图**：`images` 存 `[{ media_id, url }]`，最多 3 张；`media_status` 是这条反馈
> **所有图**的汇总结论 —— 全部通过才算 `passed`，任意一张被拒整条记 `rejected`，
> 还有没回的就记 `checking`。异步审核的状态机见 §9.4。
CREATE INDEX IF NOT EXISTS feedbacks_target_idx ON feedbacks (target_type, target_id, status);
CREATE INDEX IF NOT EXISTS feedbacks_openid_idx ON feedbacks (openid, created_at DESC);
```

**~~synonyms —— 同义词/别名表~~（已删，2026-11-23）**

原来有一张管理员维护的全局别名表，做查询归一（洗头水 → 洗发水）。删掉的理由是实测回报率太低：
4 条别名里 2 条指向的词库里根本没有、1 条本来就是子串匹配（搜「硅油」已能命中「二甲基硅油」），
真正有效的只剩 1 条；而它需要单独一张表、一个管理页、一组接口和一次归一化实现，
维护责任却落在同一个管理员身上，很容易变成过期数据。

**改法**：`experiences.search_keywords TEXT[]`（见上），每条经验自己带 0-3 个
「别人可能怎么问」，写作时顺手填。检索时把关键词并进匹配串，命中后如实显示「命中关键词」。
详见 §2.6。

```sql
-- （历史遗留，不要再建这张表）
```
```

**search_documents —— 统一搜索索引**

```sql
CREATE TABLE IF NOT EXISTS search_documents (
  id         BIGSERIAL PRIMARY KEY,
  doc_type   TEXT NOT NULL,
  -- experience | point
  ref_id     BIGINT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  embedding  vector NOT NULL,
  model      TEXT NOT NULL,
  dim        INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS search_documents_uniq
  ON search_documents (doc_type, ref_id);
CREATE INDEX IF NOT EXISTS search_documents_model_idx
  ON search_documents (model);
```

> **`embedding` 列不写死维度**（`vector` 而非 `vector(1024)`）。换 embedding 模型维度会变（bge-m3 是 1024，MiniMax embo-01 是 1536），写死会导致换模型要改表结构。现在靠 `model` + `dim` 两个字段区分，查询时 `WHERE model = $model` 过滤。
>
> ⚠️ **但裸 `vector` 列建不了 ANN 索引** —— pgvector 的 HNSW / IVFFlat 必须建在定长向量列上。
> 首版不建 ANN 索引（§7.8、§14 D7），所以现在没问题；**真到了要建索引的那天，列必须改成
> `vector(1024)` 或按模型分表**，迁移步骤见 §7.8。别以为"不写死维度"是免费的。

**索引策略**：首版**不建 HNSW/IVFFlat 索引**。pgvector 的 ANN 索引是为 10 万+ 条设计的，生活经验库首版几千条，精确余弦（`ORDER BY embedding <=> $1 LIMIT 30`）在几千条内是毫秒级。数据量涨到 5 万条以上再建索引。

### 6.3 数据完整性约束

`scripts/verify-data.js` 里钉死以下断言（每条都失败即 exit 1）：

1. 每条 `status='published'` 的经验：有 ≥1 个要点、≥1 个来源、`reviewed_at` 非空、`category_id` 指向一级领域
2. 每个要点：`title` 非空、`stance` 是合法枚举值
3. 每条来源：`url` 是合法的 http(s) 地址、`title` 非空、`point_ids` 非空且都指向本经验下的要点
4. 每个已发布经验的搜索索引存在，且 `model` 与当前配置一致（调库阶段可用 `--skip-index` 跳过）
5. 所有 `experience_tags` 指向存在的经验与标签
6. 一级领域恰好 9 个
7. 所有 `tags.category_id` 为 NULL 或指向存在的一级领域
8. 所有 `sources.point_ids` 里的 id 都指向**本经验**下真实存在的要点（防悬空，§6.2）
9. 所有 `feedbacks` 的 `(target_type, target_id)` 组合合法，且 `kind` 在枚举内
10. 每条 `feedbacks` 的 `status` 与 `reply` 自洽：`status='replied'` 必须有 `reply`
11. 每条 `feedbacks` 的 `media_status` 与图片自洽：有图必非 `none`、无图必为 `none`，
    取值在 `none|checking|passed|rejected` 内；图片不超过 3 张
12. `experiences.useful_count` / `not_useful_count` 与 `votes` 表的实际行数一致（投票改投时两个数都要改对）
13. 同一领域内没有同名标签（`UNIQUE(category_id, name)`）；**同名标签跨领域是允许的** —— 「清洁」同时存在于买买买与住家是合法的

---

## 7. 语义搜索设计

这是本项目的核心竞争力，单开一节写透。

### 7.1 总体：两路召回 + RRF 融合

```
查询
 ├─ 归一化：去标点 → 大小写归一 → 切 bigram
 │  （经验的 search_keywords 与标签一起并进匹配串，不再有全局同义词表）
 │
 ├─ 路 A 向量召回
 │    query → embedQuery → search_documents
 │    ORDER BY embedding <=> $1 LIMIT 30
 │
 └─ 路 B 关键词召回
      bigram 逐个 ILIKE 命中
      标题(权重3) / 摘要(2) / 要点标题(3) / 要点详情(1)
      LIMIT 30
 │
 └─ RRF 融合：score = Σ 1/(60 + rank_i)
       ↓
    top 20 → 按经验聚合 → 返回
```

### 7.2 为什么是混合，不是纯向量

纯向量检索会**漏掉精确词**。「二甲基硅油」「Sulfa」这种成分名、「罗列地素」这种具体品牌，用户搜的就是这几个字，向量模型很可能给不出高相似度。关键词路只检索会**漏掉同义表达**。用户搜「宝宝能用吗」，正文里写的是「婴幼儿适用」。

两头都要，所以混合。

### 7.3 为什么用 RRF 而不是加权求和

向量相似度在 `[-1, 1]` 或 `[0, 1]`，关键词命中数是整数，两者量纲完全不同。要加权就得调系数，系数还依赖 embedding 模型——换模型就得重调。

RRF（Reciprocal Rank Fusion）只看排名不看分数：

```js
const K = 60
score = Σ_i (weight_i / (K + rank_i))
```

两路 `weight_i = 1.0`。零调参、换模型不用重调、天然处理"某一路没结果"的情况（分母只看该路的 rank）。

### 7.4 为什么不做中文分词扩展

PG 的 `zhparser` / `pg_jieba` 都要编译装扩展，部署摩擦大、跨 PG 版本容易坏，升级 PG 时还可能出事。

改用**应用层 bigram 切分 + 每条经验自带的搜索关键词**：

```js
function bigrams (text) {
  const clean = String(text || '').replace(/[\s\p{P}\p{S}]+/gu, '')
  const out = []
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2))
  if (clean.length === 1) out.push(clean)
  return out
}
```

「洗发水推荐」→ `['洗发','发水','水推','推荐']`。bigram 对中文短查询召回效果足够，且零依赖。

同义表达靠 `experiences.search_keywords` 补：「洗头水」「洗发露」写在洗发水那条经验上，
检索时并进匹配串。**它跟着内容走** —— 内容删了关键词一起消失，不会像全局字典那样留下过期条目。
（原来有一张全局别名表，实测 4 条里 2 条指向的词库里根本没有，已删，见 §2.6。）

### 7.5 Embedding Provider 抽象

```js
// server/src/services/embedding.js
// 接口：
//   embedDocuments(texts: string[]) => Promise<number[][]>
//   embedQuery(text: string)          => Promise<number[]>
//   model: string
//   dim: number
const providers = {
  siliconflow: {
    name: 'siliconflow',
    endpoint: 'https://api.siliconflow.cn/v1/embeddings',
    model: 'BAAI/bge-m3',
    dim: 1024,
    batchSize: 16,
    // OpenAI 兼容：{ model, input: [...] } → { data: [{ embedding }] }
  },
  minimax: {
    name: 'minimax',
    endpoint: 'https://api.minimaxi.com/v1/embeddings',
    model: 'embo-01',
    dim: 1536,
    batchSize: 16,
    // ⚠️ 不兼容 OpenAI：
    //    请求 { model, texts: [...], type: 'query'|'db' }
    //    响应 { vectors: [[...]] }
    //    走 OpenAI SDK 一定 400，必须自己拼 body
  }
}
```

**默认 `siliconflow`（bge-m3）**：中文检索质量最好、1024 维、OpenAI 兼容零 adapter 风险。
**备选 `minimax`（embo-01）**：已有 key 不用再开账号，但必须自己拼请求体。

> bge-m3 的 query 前缀 `Represent this sentence for searching relevant passages: ` 做成配置项 `queryPrefix`，默认开启；如果实测反而降低召回，改配置关掉即可，不需要改代码。

**换模型 = 重灌一次向量库**（§7.8）。所以模型在 `server/src/config.js` 里配死，切换是一次性操作。

### 7.6 Vector Store 抽象与降级

```js
// server/src/services/vector-store.js
// 接口：
//   upsert(docs)        批量写入/更新
//   remove(docType, refIds)
//   query(vector, topK)  => [{ docType, refId, score }]
//   searchKeyword(...)   由 DAO 层实现，不在这
// 实现：
//   pgvector —— SELECT ... WHERE model=$1 ORDER BY embedding <=> $2 LIMIT $3
//   memory   —— 启动时全量载入内存，暴力余弦（零依赖降级）
```

**探测**：服务启动时执行 `SELECT 1 FROM pg_extension WHERE extname='vector'`。查不到就用 `memory` 实现，并在 `/api/health` 返回 `vectorStore: 'memory'`、前端如实提示「语义检索为简化模式」。

**为什么需要降级**：服务器装不上 `pgvector` 扩展不该阻塞整个项目上线。几千条数据量下，内存暴力余弦完全够用（3000 条 × 1024 维 ≈ 300 万次浮点运算，Node 里几毫秒）。

### 7.7 搜索结果返回结构

```json
{
  "query": "宝宝洗发水有没有硅油",
  "mode": "hybrid",
  "tookMs": 128,
  "items": [
    {
      "experience": {
        "id": 12,
        "title": "怎么挑洗发水不踩雷",
        "summary": "油头选无硅或弱硅，干头可以放心用硅油……",
        "categoryId": 1,
        "categoryName": "买买买",
        "reviewedAt": "2026-10-12"
      },
      "score": 0.0312,
      "matchedOn": ["point:二甲基硅油", "vector"],
      "highlights": {
        "summary": [["洗发", true], ["水", false], ["硅油", true]]
      }
    }
  ]
}
```

**`mode` 字段是铁律**，前端据此如实展示：

| mode | 含义 | 前端表现 |
| --- | --- | --- |
| `hybrid` | 向量 + 关键词都走了 | 正常展示 |
| `vector` | 关键词路无结果 | 正常展示，但标注「仅语义匹配」 |
| `keyword` | 向量服务不可用，降级 | 顶部提示「语义检索暂不可用，当前为关键词匹配」；命中原因写「关键词命中」 |
| `degraded` | 服务端整体降级（演示数据） | 顶部提示「当前为演示数据」 |

### 7.8 索引重建

```bash
node server/scripts/reindex.js              # 全量重建
node server/scripts/reindex.js --since=2026-11-01   # 增量
node server/scripts/reindex.js --exp=12     # 单条
```

流程：读所有 `published` 经验 → 拼装 embedding 文本 → 批量调 embedding API（限速，带断点续跑）→ upsert `search_documents`。

> CLI 脚本用于批量与自动化，管理端 API（`POST /api/admin/reindex`）用于「刚改完这一条，立刻重建它的索引」。两者共用同一个 `buildEmbeddingText()` 与 `vectorStore.upsert()`。

**换 embedding 模型 = 重灌一次向量库**，具体步骤（换模型只影响索引，不影响内容）：

1. 改 `server/src/config.js` 里的 provider（`model` + `dim` 一起改）
2. **建新列**：`ALTER TABLE search_documents ADD COLUMN embedding_new vector;`（新模型是 1024 维就写 `vector(1024)`，
   顺手解决裸 `vector` 列建不了 ANN 索引的问题）
3. 全量重灌到新列（`reindex.js --column=embedding_new`），旧列保留
4. 校验：新列条数 = 已发布经验数 + 要点数，且 `dim` 与配置一致
5. 切换读取：查询改成 `ORDER BY embedding_new <=> $1`，`model` 过滤条件换成新模型名
6. 观察一周无异常后删旧列与旧 `model` 的数据

> 第 2 步的顺序不能颠倒 —— 先建新列再灌数据，中途失败可以重来；反过来先删旧列再灌，
> 中途失败就是线上没有索引可用。

embedding 文本拼装规则（写死在 `services/search.js` 的 `buildEmbeddingText()`）：

- 经验文档：`title + summary + body + 所有要点的 title + detail + applies_to + 标签名 + 二级分类名`
- 要点文档：`title + detail + applies_to + 所属经验 title`

### 7.9 写入路径的容错

发布一条经验时，embedding 失败**不阻塞发布**：

1. 内容先写主库并可见
2. embedding 失败 → 该经验在 `search_documents` 里没有对应行，**这就是待重试标记**
3. `scripts/verify-data.js` 会检出缺失索引
4. 管理端提供"重建索引"按钮

**重试队列的具体做法**（不额外建表，靠"已发布但没索引"这个状态本身当队列）：

- 后台任务每 10 分钟跑一次：扫出 `status='published'` 且在 `search_documents` 里缺行的经验
- 逐条重试 embedding；连续失败的按退避间隔重试：**1 分钟 → 5 分钟 → 30 分钟 → 2 小时 → 6 小时**，最多 5 次
- 5 次还失败的不再自动重试，转进管理端「待处理」列表（和「待确认内容」并排显示），由人处理
- 单条失败不影响其它经验；队列里有多少条在管理端显示多少条，不假装"一切正常"

**内容永远比索引重要**。索引可以重灌，内容丢了就没了。

---

## 8. API 设计

### 8.1 公开接口（无需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | body：`{ code }`（`wx.login()` 拿的 code）。服务端 `code2session` 换 openid → 建/查 `users` 行 → 签 token（HMAC，7 天），返回 `{ token, user }`。**这个接口本身不需要带 token** |
| GET | `/api/health` | 健康检查，返回 `vectorStore`、`embeddingModel`、`dataSource` |
| GET | `/api/categories` | 一级领域 + 二级标签树 |
| GET | `/api/tags` | 标签列表 |
| GET | `/api/experiences` | 列表。query：`categoryId`、`tagId`、`stance`、`page`、`size`。**`stance` 是要点级字段，筛选含义是「这条经验至少有一条该立场的要点」** —— 经验本身没有立场字段（§2.3），不要理解成"这条经验是推荐还是避雷" |
| GET | `/api/experiences/:id` | 详情：含 points、sources、tags、相关经验，以及有用/没用计数 |
| GET | `/api/experiences/:id/related` | 相关经验（同分类 + 标签重叠） |
| GET | `/api/experiences/:id/sources` | 该经验的来源清单 |
| POST | `/api/search` | 混合检索，body：`{ query, categoryIds?, stance?, limit? }` |

### 8.2 需登录接口（Bearer token）

> `POST /api/auth/login` **不属于这一类** —— 登录本身就是拿 token 的那一步，它不需要携带 token。
> 它是「无鉴权的鉴权接口」，列在 §8.1 的公开接口表里更容易被看到（小程序端第一件事就是调它）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/me` | 当前用户信息 |
| GET | `/api/me/favorites` | 收藏列表 |
| POST | `/api/me/favorites/:id` | 收藏 |
| DELETE | `/api/me/favorites/:id` | 取消收藏 |
| POST | `/api/me/votes/:id` | body：`{ useful }`。**只有普通用户能投**（管理员不给自己写的内容投票，§6.2） |
| POST | `/api/feedbacks` | body：`{ targetType, targetId?, kind, content, images? }`。`images` 是已上传的 `media_id` 数组（最多 3 个），服务端逐张送 `mediaCheckAsync`，汇总成这条反馈的 `media_status`（§9.4） |
| GET | `/api/me/feedbacks` | 我的反馈及处理状态 |

### 8.3 管理接口（`role=admin`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/admin/experiences` | 列表（含 draft）/ 新建。GET 支持 query `q`（搜标题 / 结论 / 标签）与 `cat` |
| GET/PUT/DELETE | `/api/admin/experiences/:id` | 详情 / 更新 / 删除 |
| POST/PUT/DELETE | `/api/admin/points[/:id]` | 要点增改删 |
| POST/PUT/DELETE | `/api/admin/sources[/:id]` | 来源增改删 |
| PUT/DELETE | `/api/admin/categories[/:id]` | 分类管理（一级不可删） |
| PUT/DELETE | `/api/admin/tags[/:id]` | 标签管理 |
| GET | `/api/admin/feedbacks` | 反馈列表，query：`status`、`targetType`、`q`（搜反馈内容 / 提交人 / 关联经验标题） |
| PATCH | `/api/admin/feedbacks/:id` | body：`{ status, reply }` |
| POST | `/api/admin/reindex` | body：`{ scope: 'all'|'experience', id? }` 重建索引 |

### 8.4 通用约定

- **响应包**：成功 `{ ok: true, data }`，失败 `{ ok: false, error: { code, message } }`
- **分页**：`{ items, page, size, total }`
- **鉴权**：`Authorization: Bearer <token>`。token 是服务端自签（HMAC，payload 含 **openid + role + 过期时间**）。
  中间件要校验 role 就必须能从 token 里读到 role（§9.2 第二层），所以 payload 里带着它。
  ⚠️ 代价是：管理员身份被取消后，旧 token 在有效期内仍带着旧 role —— 所以第三层（数据层查库）不能省，
  管理接口必须再查一次 `users.role`。或者把 token 有效期压到 1 天、role 变更时主动作废该 openid 的 token。
- **登录**：`wx.login()` 拿 code → 服务端 `code2session` 换 openid → 签 token。**AppSecret 只在服务端**
- **错误码**：`UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `RATE_LIMITED` / `CONTENT_REJECTED`（内容安全审核不通过）
- **限流**：写接口按 openid 限流——反馈 ≤ 5 条/天，投票/收藏 ≤ 60 次/分钟
- **搜索也要限流**：`POST /api/search` 每次都要调 embedding，有真金白银的成本。
  按 openid（未登录时按 IP）限 **30 次/分钟**，超了返回 `RATE_LIMITED`。
  缓存命中率上来之后再考虑放宽，别一上来就开大闸

---

## 9. 身份、权限与审核

### 9.1 身份

```
小程序 wx.login() → code
  → POST /api/auth/login
  → 服务端 code2Session(code) → openid
  → 查/建 users 行 → 签 token（HMAC，7 天有效）
  → 返回 { token, user }
```

**浏览完全公开，不触发登录**。只有收藏、投票、反馈才需要登录，且登录是静默的（用户点收藏时才唤起），不打断阅读。

### 9.2 权限三层校验

1. **前端**：管理入口只在 `role==='admin'` 时渲染（用户看不到）；反过来，提交反馈的入口只在 `role!=='admin'` 时渲染（管理员不给自己提反馈，见 §4.3）
2. **中间件**：`middleware/admin.js` 校验 token 里的 `role==='admin'`（token payload 里带 role，§8.4）
3. **数据层**：DAO 里管理方法再查一次角色 —— 这一层不是冗余，是防 token 里 role 过期的兜底（§8.4）

**不能只靠前端隐藏**。前端隐藏只是体验，不是安全。

### 9.3 内容安全审核

用户提交的反馈文本与图片，**必须**走微信内容安全接口：

- 文本：`msgSecCheck`（同步）
- 多媒体（图片/音频/视频）：`mediaCheckAsync`（异步）

> ⚠️ 早期文档里的 `imgSecCheck` 已被 `mediaCheckAsync` 取代，按现行官方接口实现。
- 审核不通过 → 返回 `CONTENT_REJECTED`，**不落库**
- 审核通过 → 落库，`status='pending'`，进管理员审核队列
- **带图片的反馈不是同步流程**：`mediaCheckAsync` 先返回 `trace_id`，结果靠回调。
  按同步接口写会直接卡死"审核通过才落库"，单独见 §9.4

⚠️ 内容安全接口有调用配额，触发频率限制时要有降级策略（返回明确的"稍后再试"，而不是静默放行）。

---

### 9.4 图片审核是异步的（mediaCheckAsync）

文本审核是同步的（`msgSecCheck` 返回就出结果），**多媒体审核不是**：`mediaCheckAsync`
先返回一个 `trace_id`，真正的结论要等微信的异步回调，或者自己拿 trace_id 去轮询。
"审核通过才落库"这句话对带图的反馈根本落不了库 —— 这条是提审硬要求，单独开一节写清楚。

**状态机**

```
上传图片 → 拿 media_id
  → 调 mediaCheckAsync → 拿 trace_id
  → 反馈落库：status='pending'，media_status='checking'，media_trace_id=trace_id
  → 微信异步回调 POST /api/seccheck/callback（带 trace_id 与结论）
       ├─ 通过   → media_status='passed'，图片正常显示
       ├─ 不通过 → media_status='rejected'，图片不展示，反馈标为「内容未通过审核」
       └─ 没回调 → 30 分钟超时：服务端拿 trace_id 主动查询一次 mediaCheckAsync 的查询接口兜底
```

**表字段**（已经写进 §6.2 的 `feedbacks` 表定义，这里只解释语义）

```sql
  images          JSONB NOT NULL DEFAULT '[]',
  -- [{ media_id, url }]，最多 3 张（一条反馈最多 3 张图够用，不为它单开一张表）
  media_status    TEXT NOT NULL DEFAULT 'none',
  -- none 无图 | checking 审核中 | passed 通过 | rejected 未通过
  media_trace_id  TEXT,
  media_checked_at TIMESTAMPTZ
```

**多张图怎么汇总成一条结论**：服务端对每个 `media_id` 各调一次 `mediaCheckAsync`，
**全部通过**才算 `passed`；**任意一张被拒**整条记 `rejected`；还有没回的就记 `checking`。
一张图不过，整条反馈的图都不展示 —— 不做「有的能看有的不能」，
读者侧看到的是一个确定的状态，而不是半张图。

**前端口径：读者侧和管理侧是两种样子**

| | 审核中 | 已通过 | 未通过 |
| --- | --- | --- | --- |
| 读者侧（「我的反馈」） | 显示「审核中」占位，**不显示图片本身** | 正常显示 | **不展示图片**，标「图片未通过审核」 |
| 管理侧（「反馈盒」） | 显示图片 + 「审核中」标签 | 显示图片 + 「已通过」标签 | 显示图片 + 「未通过」标签 |

管理员就是审的人 —— 管理侧必须看得见图，否则没法判。读者侧相反：
没过审的内容不给他看，但**用户写的文字照常留在「我的反馈」里** ——
图片没过审不等于整条反馈作废。

**前端怎么选图**：`wx.chooseMedia({ count: 3, mediaType: ['image'], sizeType: ['compressed'] })`
拿到临时文件 → 逐个 `wx.uploadFile` 到自己的服务器 → 服务端上传到微信素材库换 `media_id` → 再调 `mediaCheckAsync`。
**临时文件路径不能直接送审** —— 审核接口只认 `media_id`。

**相关接口**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/seccheck/callback` | 微信异步审核回调。要做签名校验 + 幂等（同一 trace_id 重复回调只处理一次） |
| GET | `/api/seccheck/trace/:traceId` | 服务端主动查询审核结果（超时兜底用） |

⚠️ 回调端点是公网入口，别裸奔：验签 + 幂等 + 记录原始报文，出问题要能查。

---

## 10. 分享、收藏与社交

### 10.1 分享

**一期：微信小程序卡片**

```js
onShareAppMessage () {
  return {
    title: this.data.experience.title,
    path: '/pages/detail/detail?id=' + this.data.experience.id,
    imageUrl: this.data.experience.coverUrl || ''
  }
}
```

落地即详情页。分享出去的内容自带来源可信度——别人点进来能直接看到依据链接。

**二期：Canvas 生成图片卡片**（发朋友圈/微信群）。不进本次交付，见 §15。

### 10.2 收藏

- 需登录，`POST /api/me/favorites/:id`
- 详情页收藏按钮即时反馈（乐观更新，失败回滚）
- **收藏按钮只保留星标图标**（配 `aria-label` 与按下态），**不加「点这里可以收藏」这类首次引导浮层** ——
  详情页正文本身已经很密，再插一条解释会打断阅读；图标是通用语汇，不需要教
- 「我的 → 收藏夹」列表
- 冗余计数 `favorite_count` 写主表，列表页直接读

### 10.3 明确不做

评论楼、点赞、关注、动态流、排行榜、**公开的反馈墙**。**这是知识库，不是社交产品**（见 §1.3）。反馈只进管理员后台，不对外公开（§16.1）。

---

## 11. 微信小程序特有坑

均来自油走势项目的实战踩坑记录，**改代码前先看**。

| 坑 | 正确做法 |
| --- | --- |
| `require('../config')` 报 `module 'config.js' is not defined` | 运行时不做目录 index 解析，写 `require('../config/index')` |
| `<br>` / `<hr>` 不是 WXML 内置标签 | 报 `unexpected end tag` 导致整页编译失败；用 `<view>` / `<text>` 代替 |
| `wx:for` 里写 `{{path}}` | 应为 `{{item.path}}`，否则 `switchTab` 拿到 undefined |
| 自定义 tabBar 的 `position: fixed` 真机不生效 | 改用**原生 tabBar**：`app.json` 去掉 `"custom": true`，`list` 里配 `iconPath` |
| 原生 tabBar 画不出自定义选中态 | 原生 tabBar 只有「图标 + 文字 + 选中色」，没有气泡底 / 圆角胶囊。视觉稿按原生能力画，别画一个真机做不出来的样子 |
| 页面右上角按钮撞上微信胶囊 | 胶囊按钮固定在右上角（约 87×32），页面自己的操作按钮只能排在它**左边**，不能占右上角 |
| `web-view` 打开外部网页 | **个人主体不支持配置业务域名**，这条路封死 → 外链一律「复制链接 + 提示去浏览器打开」（§16 第 8 条） |
| canvas 是独立原生渲染层，z-index 压不住 | 弹层打开时用 `wx:if` 把 canvas 从 DOM 摘掉 |
| 动态 `src` 漏 `.png` 后缀 | 图标显示白方块 |
| 运行时代码用 `?.` / `??` | 小程序运行时对高版本语法支持不稳，只在 `scripts/` 下用现代语法 |
| 主包超 2MB，上传预览包被拒 | `project.config.json` 的 `packOptions.ignore` 排除 `server` `scripts` `docs` `design` `.tooling` |
| AppID 被 GitHub 密钥扫描误报 | AppID 放 `project.private.config.json`（不入库），AppSecret 永远不进代码 |
| `LIMIT $1` 占位符 | 一律内联整数（`Number()` + 取整净化） |
| JSONB / NUMERIC 读出来是字符串 | pg 不自动解析，在 DAO 的 `toCamel` 里用列名白名单转数字，**不能见数字就转** |

---

## 12. 自检与验证策略

沿用油走势项目的 `scripts/verify-*.js` 风格，有错 exit 1，改完必跑。

> **实施后的脚本清单**（服务于真机与后端）。九支仓库级自检里有八支是断言脚本（共 **342 项断言**），
> 第九支 `verify-links.js` 逐条探测 62 条来源链接（当前 **62/62 可达**）。
> 服务端另有 `selftest.js` 与 `http-test.js`，**各 101 项断言全绿**（19 组）。
> 原型阶段的自检 `scripts/verify-prototype.mjs` 仍在仓库里（§12.1），当前 **174 项断言全绿**：
> 14 页 × 2 身份 × 10 场景渲染冒烟、状态级行为断言、CSS 对比度复算、口径守护。

| 脚本 | 检查内容 | 状态 |
| --- | --- | --- |
| `scripts/verify-prototype.mjs` | 原型自检。渲染冒烟 + 状态级行为断言 + 对比度复算 + 口径守护（§12.1） | 已存在（174 项全绿） |
| `scripts/lint-wxml.js` | WXML 静态检查（非法标签、事件绑定缺失、路径写错） | 已存在（127 项全绿） |
| `scripts/check-modules.js` | 运行时模块 + 服务端模块加载冒烟，挡"删了函数体留着引用" | 已存在（68 项全绿） |
| `scripts/verify-data.js` | 数据层自检（§6.3 的完整性断言） | 已存在（16 项全绿） |
| `scripts/verify-search.js` | 检索自检：固定查询集 → 期望命中（回归），RRF 排序稳定，降级链可用 | 已存在（42 项全绿） |
| `scripts/verify-tokens.js` | 样式令牌自检：小程序 `styles/tokens.wxss` 与原型 `design/assets/dir-c.css` 逐令牌对照 + 全矩阵对比度复算 | 已存在（11 项全绿） |
| `scripts/verify-copy.js` | 界面文案自检：读者侧不出现角色术语、口吻书面语、角色词必须落在守卫内 | 已存在（24 项全绿） |
| `scripts/verify-pages.js` | 页面自检：14 页结构、路由参数、组件与状态覆盖 | 已存在（42 项全绿） |
| `scripts/verify-links.js` | 来源链接可达性自检：62 条依据的真实链接逐条探测 + 占位域名黑名单 | 已存在（62/62 可达） |
| `scripts/verify-contract.js` | 端到端契约自检：前端每个调用都有后端路由 + 响应包结构 + 检索结果结构 | 已存在（12 项全绿） |
| `server/scripts/selftest.js` | 服务端单元自检：DAO 的 camelCase 转换、RRF 融合、embedding 文本拼装 | 已存在（101 项全绿） |
| `server/scripts/http-test.js` | 服务端接口冒烟：真起一个服务逐个打 API，校验响应包结构与鉴权行为 | 已存在（101 项全绿） |
| `server/scripts/reindex.js` | 索引重建：重算已发布经验的索引文档（30 条经验 → 121 个文档） | 已存在 |
| `scripts/gen-seed-sql.mjs` | 由 `data/*.json` 生成可 review 的 `server/sql/seed.sql` | 已存在 |
| `scripts/verify-embedding.js` | embedding provider 自检：维度对得上、批量接口正常、中文不乱码 | 未建 —— 一期 embedding 用本地 bigram-hash，不调外部接口；维度与文本拼装已由 `selftest.js` 覆盖，接外部 provider 时再补 |
| `scripts/verify-in-devtools.js` | 微信开发者工具自动化：逐页截图 + 运行时异常捕获 | 未建 —— 本机不装开发者工具，改用 `wechat-miniprogram-preview` 插件逐页截图巡检 |

**检索自检用例集**（首批，随种子内容一起写）：

| 查询 | 期望命中 |
| --- | --- |
| 宝宝能用吗 | 洗发水类经验 |
| 二甲基硅油 | 命中要点「二甲基硅油」 |
| 洗头水 | 命中洗发水类经验（该条的 `search_keywords` 里写了「洗头水」） |
| 快递丢了怎么赔 | 维权类经验 |
| 怎么退掉健身房 | 维权类经验 |

### 12.1 原型自检的口径：断言写「状态级」

原型自检脚本 `scripts/verify-prototype.mjs` 的断言**不写「DOM 存在级」**。
「按钮在」证明不了「按下去对不对」——第三轮审查之前就有三处真 bug 是这样漏掉的：
投票状态用一个全局单值（在 A 上投票，B 也显示「已投」）、筛选器少写一个分支（点「已采纳」看到的是全部）、
管理端计数读的是加载时算好的快照。所以涉及状态机的行为一律这样测：

```js
LBC.vote(exp1, 'up');
assert(exp2.useful 未变 && votedUseful(exp2) === false);
```

**写进文档的口径必须有对应断言守着**，否则代码照样会漂。
例：读者侧不出现「管理员」，断言就钉在「role=user 的 9 个页面渲染结果里不出现该词」，而不是只写一句在文档里。

改色之后必须重新实测对比度（正文 ≥4.5:1、贴纸白字 ≥5.3:1）——
脚本会解析 `dir-c.css` 的 token 复算全矩阵（7 种文字色 × 12 种底色）。
**当前最低值是 `bad-ink` 4.51:1，离下限只剩 0.01** —— 再动一次色就会红。

---

## 13. 内容录入规范

### 13.1 一条经验的必填项

| 字段 | 要求 |
| --- | --- |
| `title` | 一个问题或一个判断，不是"关于洗发的经验"这种废话标题 |
| `summary` | **一句话结论**，先结论再理由 |
| `body` | 补充说明（可不填） |
| `categoryId` | 一级领域 |
| `points` | **2-6 条**，每条有立场、理由；涉及条件差异的写 `applies_to` |
| `sources` | **1-3 条**，每条有真实 URL、平台、类型、引用理由，**必须关联到要点** |
| `tags` | 1-4 个二级标签 |
| `reviewed_at` | 最后确认日期（管理端用；读者侧展示 `updated_at`） |
| `next_review_at` | 建议下次确认日期，健康/钱财/维权类必填 |

### 13.2 来源合规

- 只存**标题 + 链接 + 平台 + 引用理由**
- **不抓取、不转载、不大段摘抄原文**
- 引用第三方内容按合理引用处理，页面展示为「依据」并给原链接

### 13.3 种子内容计划（首版约 30 条）

9 个领域各 3-5 条，覆盖常见决策场景：

| 领域 | 计划条数 | 示例选题 |
| --- | --- | --- |
| 买买买 | 4 | 挑洗发水看成分 / 洗衣液怎么选 / 家电值不值得买 / 母婴用品避雷 |
| 吃喝 | 3 | 外食怎么选 / 食材储存 / 厨房小家电 |
| 住家 | 4 | 收纳 / 清洁顺序 / 装修避坑 / 家电养护 |
| 出行 | 3 | 通勤 / 机票 / 自驾 |
| 健康 | 4 | 睡眠 / 体检报告怎么看 / 饮食常识 / 常用药常识 |
| 钱财 | 3 | 砍订阅 / 记账 / 保险常识 |
| 办事维权 | 3 | 快递纠纷 / 消费投诉 / 合同 |
| 人际心态 | 3 | 沟通边界 / 职场 / 情绪 |
| 技能效率 | 3 | 工具 / 自动化 / 笔记方法 |

合计约 30 条。每条都要查真实来源链接——**这是首版工作量最大的一块**，不批量灌水，宁可少而准。

### 13.4 界面文案口吻

界面上的**说明性文案**（隐私说明、关于、免责、争议提示、校验提示、操作引导）用**书面语**；
**经验正文**（管理员写的经验本体）保持**口语化**。两者不要混。

| 场景 | 写法 | 例 |
| --- | --- | --- |
| 说明 / 提示 / 校验 | 书面语 | 「本小程序会记录你的微信标识，用于登录与收藏，不会用于其他用途。」 |
| 操作引导 | 书面语 +「点击」 | 「点击查看依据」 |
| 经验标题 / 摘要 / 要点 | 口语化，好读 | 「先把头皮类型摸清，再决定要不要用硅油」 |
| 空状态 | 保留便签墙的比喻 | 「墙上还空着」 |

理由：生活经验内容本来就该好读，改成公文腔反而更难读；但**界面**上的说明是在代表
「一份有人维护、逐条标了来源的资料」，口吻太随意会削弱可信度。

读者侧不出现角色名（「管理员」），只写「经验库维护者」这类说法。

**没有内容时不要写一段话解释机制**。空着的地方写「还没有搜索记录，搜过一次之后这里会留下你查过的词 ——
只存在这台设备上」这类句子，只是在拿界面解释产品怎么工作，用户第一次进来看到的应该是**有内容的东西**。
规则：某一块没有内容就整块不渲染；确实需要留白说明时（如空列表），写「为什么空 + 一个出口」，
不写「这个功能是怎么设计的」。

---

### 13.5 交付清单（原型 → 真机还差什么）

第三轮审查把下面几项标成「真实存在但本轮未做」，集中放在这里，避免下轮回来时误以为已经完成：

| # | 缺什么 | 影响 | 什么时候做 |
| --- | --- | --- | --- |
| 1 | 设计令牌表 `tokens.wxss`（颜色 / 字号 / 圆角 / 阴影 / 间距，px 与 rpx 双份 + 字体回退栈） | 现在只能从 `dir-c.css` 抄，`tokens.wxss` 无从对照验收 | 实施前 |
| 2 | 原生 tabBar 图标（6 张 81×81 PNG，常态 / 选中） | `app.json` 配不了，开发第一步就卡 | 实施前 |
| 3 | 小程序头像 / 名称 / 简介 | 提审资料缺失 | 提审前 |
| 4 | 组件状态表（按下 / 禁用 / 加载 / 失败） | 实现阶段各自发挥 | 实施前 |
| 5 | `hover-class` 按下态 | 真机上「点了没反应」 | 真机端 |
| 6 | 健康 / 钱财 / 维权三域降饱和 | 对比度余量只剩 0.01，改色后必须立刻复算 | 视觉收尾 |

---

## 14. 决策记录（ADR）

### D1：后端自建 Node + Express + PostgreSQL

**决定**：不用微信云开发，自建后端，部署在 `life-better.uwakeme.top`（与油走势同服务器）。
**理由**：语义检索需要向量能力，云开发的向量检索能力弱；且已有现成部署套路（nginx 配置、证书脚本、pm2 配置）可照抄。
**代价**：需要自己管一台服务器。

### D2：向量 + 关键词混合检索 + RRF 融合

**决定**：不纯向量、不纯关键词。
**理由**：纯向量漏精确词，纯关键词漏同义表达。RRF 只看排名、零调参、换模型不用重调。
**代价**：两路都要实现与维护。

### D3：结构化要点 + 要点级溯源

**决定**：经验 / 要点 / 依据三层，依据用 `point_ids` 关联到具体要点。
**理由**：直接对应"哪些成分好、哪些不好、依据是什么"这个需求；结构化立场才能做筛选、对比、卡片。
**代价**：录入比写一篇长文慢。
**被否**：纯富文本长文 + 文末链接 —— 后期做结构化检索和对比卡片时会卡住。

### D4：管理端做在小程序内

**决定**：小程序内隐藏管理页，openid 白名单识别管理员。
**理由**：管理员就是用户本人；免去第二套前端和登录系统。
**代价**：管理体验不如 Web 后台（不能多端编辑、不能批量导入）。
**被否**：独立 Web 后台（多做一套前端不值）；后端 API + 脚本改文件（改内容要发版，不适合高频录入）。

### D5：embedding 用硅基流动 bge-m3

**决定**：默认 `BAAI/bge-m3`（1024 维），OpenAI 兼容。备选 MiniMax `embo-01`（1536 维，需自定义 adapter）。
**理由**：bge-m3 中文检索质量最好且零 adapter 风险；provider 做成可插拔，换模型成本可控（只需重灌索引）。
**代价**：需要开一个硅基流动账号拿 key。
**注意**：bge-m3 的 query 前缀行为需实测校准，做成配置项。

### D6：不做中文分词扩展

**决定**：应用层 bigram 切分，同义表达靠每条经验的 `search_keywords` 补。
**理由**：`zhparser`/`pg_jieba` 要编译装扩展，部署摩擦大、升级 PG 易坏。
**代价**：召回精度不如真分词 —— 靠关键词字段补，覆盖不到的就搜不到（接受）。
**历史**：一度设计成「管理员维护的全局别名表」，2026-11-23 删掉（§2.6）——
实测 4 条里 2 条指向内容里没有的词、1 条是子串冗余，为 1 条真实增量养一张表不划算。

### D7：首版不上 ANN 索引

**决定**：`search_documents` 用精确余弦，暂不建 HNSW/IVFFlat。
**理由**：首版几千条，毫秒级足够；ANN 索引是为 10 万+ 设计的，提前建只会增加运维面。
**代价**：数据量涨到 5 万条以上需要改（届时加索引即可，不改代码结构）。

### D8：向量能力可降级，不阻塞上线

**决定**：`pgvector` 不可用时降级到内存暴力余弦，API 返回 `mode` 字段，前端如实提示。
**理由**：装不上扩展不该卡住整个项目；符合"如实展示数据来源"的既有铁律。
**代价**：降级模式下数据量大了会变慢。

### D9：相关经验推荐 = 同领域优先，标签重叠兜底

**决定**：详情页底部「相关经验」先给**同一领域**的其他经验，不够 3 条再用**标签有重叠**的补齐。
**理由**：同领域的内容天然可比（同一个「买买买」领域下的挑选逻辑），
用户看到的是「同类问题还有别的答案」。标签重叠只作兜底 ——
标签是管理员自己加的，覆盖面不完整，靠它召回经常凑不满 3 条。
**代价**：热门领域的推荐会偏同质 —— 这是有意的，「同质可比」比「多样但不相关」更符合这个库的定位。
**被否**：纯标签优先 —— 冷门领域会整块空掉。

### D10：处理反馈不强制写理由

**决定**：选「采纳」或「不采纳」时**不要求写理由**；只有「只回话」必须写回复。
**理由**：理由是可选的补充，强制它只会把管理员的时间花在凑格式上；
真正必须写的是「只回话」—— 不写就等于没答复。
**护栏位置**：校验放在 `submitFb`（数据层），界面只做提示。
只靠界面拦，等于换个入口就能提交一条没有回复的「已回复」。

### D11：管理端搜索在应用层做，不开后端检索

**决定**：管理端的两个搜索框（经验列表、反馈盒）用前端过滤实现，首版不开后端搜索接口。
**理由**：管理端搜的是标题 / 结论 / 标签 / 反馈内容这种**精确字段**，
30 条量级一次拉全量在前端过滤毫秒级就够；为还不存在的问题开检索接口是给难度上杠杆。
**代价**：条目涨到几百条后要改 —— 那时再换后端 `ILIKE` 或 `pg_trgm`，接口形状不变。
**注意**：管理端搜索与读者侧搜索**不是一回事** —— 读者侧是语义 + 关键词混合检索（§7），
管理端不做语义匹配：管理员知道自己在找什么。

### D12：全站自定义导航

**决定**：全站自定义导航，不用微信默认导航栏。
**理由**：详情页顶栏要放「返回 + 收藏 + 分享」三个动作，默认导航栏会多出一条标题栏、挤掉一个动作位。
**代价**：必须自己做胶囊避让 —— 胶囊固定在右上角，页面自己的按钮只能排在它左边。
避让按真机几何做（胶囊占 y 6–38px、x 282–369px）：搜索行下移到 46px、
详情页动作右移留出 96px、首页贴纸下移 44px。
**被否**：默认导航 —— 详情页放不下三个动作，而「收藏 + 分享」是这个库的两个关键动作。

### D13：统一默认头像，不取真实头像昵称

**决定**：不接 `wx.getUserProfile` 拿真实头像昵称，统一用默认头像，不显示「周小满」这类占位昵称。
**理由**：这个产品不需要真名 —— 内容全部由管理员自己写，读者只是来查经验的。
为省一套合规流程去接真实头像不划算。
**代价**：少了一点「这是我的收藏」的人味 —— 接受。

### D14：首版不上向量检索

**决定**：首版只跑关键词，向量检索延后；接口与 `mode` 字段保留，
等条目过百再上。
**理由**：30 条内容的召回里关键词匹配已经够用（§7.2）；
而向量链路要额外背 embedding 成本、索引重建与降级链三件事。
**代价**：用词和内容不一致时召回会差 —— 靠经验自带的搜索关键词补一部分，其余接受。
**接口不变**：搜索结果结构里的 `mode` 字段保留 `vector` / `keyword` / `degraded` 三值（§7.7）。

### D15：反馈回复走一次性订阅消息

**决定**：反馈被处理后给提交者发一次性订阅消息。
**理由**：反馈是**唯一的纠错通道** —— 内容全是管理员自己写的，没有通知闭环，
读者提了意见就永远不知道结果，下次也就不会再提。
**代价**：需要用户在小程序里主动授权订阅（一次性），转化率不会高 —— 但没有通知比转化率低更糟。
**原型**：读者侧「我的反馈」页留了通知位（「反馈已处理」），接口层尚未接入。

### D16：标签同名跨领域，唯一键是 (领域, 名称)

**决定**：`tags` 表唯一键改为 `UNIQUE(category_id, name)`，同名标签可以存在于不同领域。
**理由**：IA 里「清洁」本来就同时属于买买买（洗护清洁）和住家（家居清洁），
全局唯一会把其中一个挤掉，或者逼管理员造出「家居清洁」「日用清洁」这种绕圈的标签。
**代价**：按标签搜索时同名会命中多个领域 —— 筛选一律按 `tag_id` 走，不按 `name` 模糊匹配。
**同义说法**（「洗头水」→「洗发水」）交给每条经验的 `search_keywords`，与标签是两回事：
标签用于归类与筛选，关键词只影响搜索召回、不出现在读者侧页面上。

---

## 15. 开发计划

### 15.1 交付方式

**一次性交付，不分阶段。** 由 Agent 在一个工作日内从零写出完整可运行的工程：后端 + 小程序端 + 种子内容 + 自检脚本 + 部署配置，一次跑通。

因此本节不是里程碑，而是**批次顺序**——每批依赖前一批的产出，按序批量落地；同批内的任务彼此独立，可并行。

### 15.2 批次安排

| 批次 | 内容 | 产出 | 验收 |
| --- | --- | --- | --- |
| **B0 地基** | 工程初始化、app.json、tokens.wxss、config、目录骨架 | 小程序能编译，空页能跑 | IDE 编译无错 |
| **B1 数据层** | schema.sql（12 张表）、DAO、种子 SQL | PG 建表成功，DAO 能读写 | `verify-data.js` 结构断言通过 |
| **B2 服务端** | Express 应用、公开/登录/管理三组路由、中间件、code2session | 26 组 API 可用 | `http-test.js` 全通 |
| **B3 小程序读端** | api.js / cloud.js / auth.js、首页、分类、详情、搜索页 | 能浏览能查 | IDE 截图无运行时异常 |
| **B4 搜索链路** | embedding provider、vector store、RRF 融合、搜索关键词匹配、索引重建 | 语义 + 关键词混合检索 | `verify-search.js` 用例集全绿 |
| **B5 管理端** | 经验列表/编辑器（结论·要点·来源·标签）、反馈审核 | 能录入并发布一条经验 | 管理端操作闭环 |
| **B6 社交** | 收藏、投票、反馈、意见箱、内容安全审核、分享卡片 | 反馈能落库→审核→回复 | 端到端链路自检通过 |
| **B7 内容** | 30 条种子经验（真实来源链接）、9 领域二级标签 | 内容库非空 | `verify-data.js` 完整性断言全绿 |
| **B8 收尾** | verify-* 全套、devtools 截图、README、GitHub Pages 主页、nginx 配置 | 可交付 | 全套脚本 exit 0 |

> **实施进度（2026-11-23）**：B0–B7 全部完成；B8 完成了三件 —— **九支仓库级自检**、**14 页预览截图巡检**、
> **README 与设计文档收口**。**GitHub Pages 主页与 nginx 配置未做**：本轮不部署，服务器上的动作由本人执行。

### 15.3 依赖关系

```
B0
 └─ B1 ─┬─ B2 ─┬─ B3 ─┐
        │      ├─ B4 ─┤
        │      └─ B5 ─┤
        └─ B7（内容调研，与代码并行）─┤
                                    └─ B6 ── B8
```

三条可并行的线：

- **代码线**：B0 → B1 → B2 → B3
- **能力线**：B4（搜索）、B5（管理端）—— B2 完成后即可并行
- **内容线**：B7 —— 与代码线完全独立，30 条经验的调研与来源核实全程并行

### 15.4 Agent 执行约束

| 约束 | 说明 |
| --- | --- |
| 单一出入口 | 小程序只走 `utils/api.js` → `utils/cloud.js`；页面里出现 `wx.request` 即视为违规 |
| 运行时禁高版本语法 | `pages/` `utils/` `components/` 里不出现 `?.` 与 `??`，改用 `a && a.b` 显式写法 |
| 命名分层 | 库表 snake_case、业务层 camelCase，转换只在 DAO 的 `toCamel` |
| 业务知识不进代码 | 30 条经验内容放 `data/` + 种子 SQL，不散落在页面代码里 |
| 每批结束立刻跑该批自检 | 不攒到最后一起验 |
| 出错先读日志 | 禁止靠猜改代码 |

### 15.5 范围收缩策略

**砍内容，不砍功能。** 若范围需要收缩，先交 15 条（9 个领域每领域 1-2 条）保证全链路可演示，内容后续补。反过来做（砍掉反馈/收藏让演示更短）不划算——那些正是本项目区别于静态文档站的地方。

**明确排除项**见 §17 未决事项。

---

## 16. 上线前置（合规与账号）

⚠️ **这些是硬门槛，不解决会被微信驳回或留下合规风险。**

| # | 事项 | 说明 |
| --- | --- | --- |
| 1 | **小程序类目资质** | 选【工具-信息查询】（个人主体可用）。反馈仅管理员可见，不构成 UGC 传播，无需社交类目。**提审前把类目定死**：类目不是不能改，但改有成本 —— 非游戏类目不得改为游戏类目，普通服务类目每月修改次数有限（§16.1） |
| 2 | **内容安全审核接口** | 必须接 `msgSecCheck`（文本，同步）/ `mediaCheckAsync`（多媒体，**异步**，见 §9.4）。文本审核通过才落库；带图的反馈先落库、图片标"审核中"，回调后再定 |
| 3 | **健康类免责** | 健康领域只做生活经验与科普，不做医疗诊断建议。免责条固定在**健康类经验详情页顶部**，不只是文档里写一句 |
| 4 | **来源引用合规** | 只存标题+链接，不转载原文正文 |
| 5 | **隐私说明** | 收集 openid（登录）、nickname/avatar（可选授权）。填写《小程序用户隐私保护指引》，声明用途；**「我的」页要有隐私指引入口**，不能只在后台文档里躺着 |
| 6 | **AppID 与 AppSecret** | AppID 放 `project.private.config.json`（不入库），AppSecret 只在服务端 `.env` |
| 7 | **服务器域名 ICP 备案** | `wx.request` 的合法域名**必须已备案**，新备案域名要 24 小时后才能配置。域名没备案，API 根本调不通（与主体是不是个人无关，§16.1） |
| 8 | **外链打开方式** | 个人主体配不了业务域名，来源链接不能在小程序里直接打开 → 统一「复制链接 + 提示去浏览器打开」 |

### 16.1 类目判定规则（UGC 的真实分界）

微信判定是否属于 UGC，**关键不是「用户能不能提交内容」，而是「内容会不会被传播、公开展示给其他用户看」**。

官方类目文档里的原话：

- 工具-图片处理：「该类目**不可涉及用户原创内容的传播及公开访问**」
- 工具-图片处理：「如提供**传播和公开访问服务**，属于社交范畴，需补充【社交-笔记】类目」
- 社交-社区/论坛：「适用于提供 **UGC 内容的发布与交流**，如论坛、贴吧、社群等功能性服务」

据此，本项目的反馈有两条走法：

| 反馈可见范围 | 判定 | 走什么类目 | 主体要求 |
| --- | --- | --- | --- |
| 仅管理员可见（用户只看自己的反馈与处理状态） | 不构成 UGC 发布与交流 | 工具-信息查询 | 个人主体即可 |
| 对所有用户公开可见 | 构成 UGC 发布与交流 | 社交-笔记 或 社交-社区/论坛 | **企业主体** + 《非经营性互联网信息服务备案核准》 |

⚠️ 两个硬约束：

1. **个人主体的小程序不开放「社交」整组类目**。官方类目表里个人主体只有物流服务、教育服务、生活服务、餐饮服务、旅游服务、工具、商业服务、体育，没有社交。
2. **类目不是不能改，是改了有成本。** 官方规则是**非游戏类目不得改为游戏类目**；
   普通服务类目可以改，但每月修改次数有限（微信开放社区官方答复：上限 5 次 / 月）。
   社交类目首次提审还需经当地互联网主管机关审核确认，官方标注约 7 天。
   所以"提审前定死"是稳妥建议，**依据是改的成本与审核周期，不是"类目不可再改"** ——
   写错依据会让后来人以为改类目是死路。

**✅ 本项目已确定：反馈仅管理员可见**（用户只看自己的反馈与处理状态）。

因此 life-better 走的是上表第一行——类目选【工具-信息查询】，个人主体即可上线，也不用等网信审核。

⚠️ **这里有两个不同的"备案"，混成一句话就会漏事：**

| 备案 | 管的是 | 本项目的情况 |
| --- | --- | --- |
| **小程序备案**（工信部 APP 备案：主体 + 小程序） | 微信平台能不能上架 | 个人主体按平台流程办理，不涉及企业主体资质 |
| **服务器域名 ICP 备案** | 域名 `life-better.uwakeme.top` 能不能被 `wx.request` 调用 | **必须已备案**，否则合法域名配不上去，API 调不通 |

前一个回答的是"个人主体能不能上线小程序"，后一个回答的是"你的 API 域名能不能被微信调" ——
**后者跟主体是不是个人一点关系都没有**。提审前先查域名的备案状态（§16 第 7 条）。

**这条决定的连带约束，写进实现里别忘了：**

1. **不提供任何公开的反馈读取接口**。`GET /api/feedbacks` 这类接口不存在，反馈只有 `GET /api/me/feedbacks`（自己的）和 `GET /api/admin/feedbacks`（管理员的）两条路。
2. **详情页不展示反馈内容**，只展示有用率统计数字（如「有用 12 · 没用 3」）。
3. **反馈页与隐私说明里写明「反馈内容仅管理员可见，不会公开给其他用户」**，避免审核时被判定为社区功能。
4. 若日后要改成公开，等于把项目推到「企业主体 + ICP 备案 + 7 天网信审核」的位置上——那是一次产品级重估，不是改个开关。

---

## 17. 风险与未决事项

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 反馈被改成公开展示 | 类目不符 → 驳回；若要保留则需企业主体 + ICP 备案 + 约 7 天网信审核 | 已定「仅管理员可见」（§16.1）；代码不提供公开反馈接口，从源头杜绝误改 |
| 硅基流动 API 限流/额度 | 灌库失败 | 批量限速 + 断点续跑 + 失败重试队列（§7.9） |
| 服务器装不上 `pgvector` | 语义检索降级 | `memory` 实现兜底（§7.6） |
| 种子内容的来源链接失效 | 内容可信度下降 | `next_review_at` + 管理端"待确认"视图 |
| embedding 模型效果不及预期 | 搜索体验差 | `verify-search.js` 用例集做回归；换模型只需重灌索引 |
| 30 条内容的调研工作量被低估 | 拖期 | 砍内容不砍功能：先交 15 条覆盖 9 个领域（§15.5） |
| 服务器域名未 ICP 备案 | `wx.request` 直接被拦，小程序是个空壳 | 提审前确认 `life-better.uwakeme.top` 备案状态（§16 第 7 条）；新备案后等 24 小时再配 |
| 误以为外链能在小程序里直接打开 | 来源点不开，"可溯源"这个卖点打折 | 统一走「复制链接 + 去浏览器打开」（§16 第 8 条） |
| 改一次色就跌破对比度下限 | 正文在便签底上读不清 | 当前最低 `bad-ink` 4.51:1，余量只有 0.01 —— 改色后必须立刻跑 `scripts/verify-prototype.mjs`（§12.1） |
| 原型只在网页上验证过，真机未验证 | 字体回退 / 原生 tabBar 高度 / 安全区 / 键盘遮挡都可能翻车 | 微信开发者工具跑一轮再定稿；未验证项已列在 §13.5 |

**未决（需要后续拍板，不阻塞本次交付）**：

- 图片卡片的具体样式
- 是否给健康/钱财领域单独做"到期再确认"推送（依赖订阅消息模板）
- 分类是否需要"多分类"支持（一条经验能否同时属于两个领域）

**已定（2026-11-22）**：

- 相关经验（`related`）的推荐策略 → **同领域优先 + 标签重叠兜底**，见 §14 D9
- 列表要不要加「紧凑」密度档 → **不做**。首版内容密度已经合适，
  再加一档等于让管理员多记一个开关，却没解决真问题

**已定（2026-11-23 · 第三轮设计审查）**：

| 事项 | 结论 | 落在 |
| --- | --- | --- |
| 导航形态 | **全站自定义**，胶囊避让按真机几何做 | §14 D12 / §13.5 |
| 头像昵称 | **统一默认头像**，不接真实头像昵称 | §14 D13 |
| 首版是否上向量检索 | **延后**；接口与 `mode` 字段保留 | §14 D14 |
| 反馈回复通知 | **做一次性订阅消息**；原型留通知位 | §14 D15 |
| 标签模型 | **同名跨领域**，唯一键 `UNIQUE(category_id, name)` | §14 D16 / §2.4 / §6.2 |
| 中立符号 | **`—`**，问号留给「存疑 / 有争议」 | §2.3 |

---

## 18. 附：速查

**数据库**：11 张表（categories / experiences / points / sources / tags / experience_tags / users / favorites / votes / feedbacks / search_documents）

**页面**：13 个（3 个 tab + 10 个二级页）

**API**：9 组公开（含登录）+ 7 组需登录 + 10 组管理

**一级领域**：9 个固定

**首批内容**：约 30 条，覆盖 9 个领域

**交付**：Agent 一次性交付，按 §15 的 B0→B8 批次顺序执行

---

## 19. 修订记录

> **本节自包含。** 前几轮的问题清单已内联在本节；从第 6 轮起改为**直接改正式文档**，
> 审查报告文件改完即删，逐条清单不在本文档内联。文中提到「自检脚本」的地方记的是当时的状态 ——
> 那套原型自检脚本（`scripts/verify-prototype.mjs`）已于 2026-11-23 重建，现仍在仓库里（见 §12 与 §12.1）。

### 第 1 轮 · v1.1（2026-11-20 · 首轮审查）

首轮审查把问题分成 blocker / major / minor / debt。逐条处理如下，
"文档"指本文件，"原型"指 `design/` 下的高保真原型。

**P0 · 上线阻断与核心承诺**

| # | 问题 | 处理 | 落在 |
| --- | --- | --- | --- |
| 11 | 外链跳转对个人主体不可行 | 业务域名仅非个人主体可配，web-view 打开外链这条路封死 → 全文改为「复制链接 + 提示去浏览器打开」 | 文档 §3.2 / §11 / §16 第 8 条；原型来源页加复制按钮 |
| 1 | 卡片立场贴纸误导 | 立场只到要点级，经验卡去掉整体贴纸，只留「N 推荐 · M 避雷」计数 | 文档 §2.3；原型 c-1.js |
| 2 | 大面积文字对比度不达标 | 便签底提亮一档、墨色与语义色压深，正文级文字在任意便签底上 ≥ 4.5:1 | 原型 dir-c.css；数值由当时的自检脚本复算 |
| 3 | 反馈主流程是死的 | 选类型 + 写内容 + 寄出，真的落一条进数据，「我的反馈」立刻可见，管理端反馈盒同步 | 原型 c-3.js |
| 12 | 「类目一旦选定不可再改」表述失实 | 改为准确表述（非游戏类目不得改为游戏类目；普通类目每月修改次数有限），保留"慎选"建议但给出正确依据 | 文档 §16 / §16.1 |
| 13 | 「不需要 ICP 备案」混淆两个备案 | 小程序备案与服务器域名 ICP 备案分开写清楚，并列为提审硬门槛 | 文档 §16 第 7 条 / §16.1 / §17 |

**P1 · 核心价值与数据模型**

| # | 问题 | 处理 | 落在 |
| --- | --- | --- | --- |
| 6 | 「依据挂要点」断链 | 要点里的「看 N 条依据」可点，跳来源页并锚定到对应依据；来源页的「支撑：…」可反跳回要点 | 文档 §3.4；原型 c-2.js |
| 5 | 演示数据自相矛盾 | 统计全部由数据派生；草稿用独立数据（不再拿已发布的经验冒充草稿） | 原型 data.js |
| 4 | 管理入口导航错误 | 「标签与别名」指向新建的标签管理页；「重建搜索索引」给反馈不再跳回本页 | 文档 §3.2（13 页）；原型 c-3.js |
| 7 | 首页信息密度失衡 | 九宫格压成横向一条，首屏露得出经验卡 | 原型 c-1.js |
| 8 | categories / tags 模型矛盾 | 定稿：`categories` 只放一级领域，`tags` 加 `category_id` 承担二级标签 | 文档 §2.4 / §6.2 |
| 9 | votes 与 feedbacks.kind 语义重叠 | 拆成两条线：投票是轻量计数，反馈只留纠错 / 补充说明 / 提问 / 建议；管理员不投票 | 文档 §4.3 / §6.2 / §8.2 |
| 10 | mediaCheckAsync 按同步接口写 | 补异步审核状态机、回调端点、字段与超时兜底 | 文档 §9.3 / §9.4 |
| 14 | 缺微信形态占位 | 外壳加胶囊按钮占位，详情页操作按钮移到左侧；tabBar 按原生能力重画（无气泡底） | 原型 shell.js / shell.css / dir-c.css |
| 15 | 健康类无免责、无隐私入口 | 健康类详情页固定免责条；「我的」页加隐私指引与关于入口 | 文档 §16 第 3、5 条；原型 c-2.js |

**P2 · 打磨与设计债**

- 筛选 pill 全部接上逻辑；搜索页的「领域 / 立场」拆成两组，同组互斥（原文案两处同时选中）
- 投票按钮接上 handler；「有用 / 没用」从反馈类型里移除
- 编辑器不再只读：立场可切、要点 / 依据 / 标签可加、引用理由可改、存草稿 / 发布有反馈
- 状态不再跨页泄漏：换页清掉展开面板与筛选；收藏状态按身份分开
- 来源类型中文化（文章 / 视频 / 帖子 / 官方…）；界面里不再出现设计文档章节号
- 文档补：token payload 与 role 校验对齐、`login` 归类、embedding 维度与 ANN 索引的关系、
  `point_ids` 悬空清理、`stance` 筛选语义、slug 生成规则、搜索限流、重试队列定义、页面状态规范
- 补上自检脚本 `scripts/verify-prototype.mjs`（此前文档声称有自检脚本，仓库里其实没有），
  README 改成描述真实存在的东西

> 首轮审查里"问题是否存在"的结论写在原审查报告的复核说明里（该报告文件已删除）。
> 平台相关的三条（外链、类目、备案）以微信官方文档为准 —— 结论已写死在本文档里：
> 个人主体配不了业务域名（§11 / §16 第 8 条）、类目按"是否传播公开"判定（§16.1）、
> 服务器域名必须已 ICP 备案（§16 第 7 条）。

### 第 2 轮 · v1.2（2026-11-20 · 第二轮复审）

首轮审查的 15 条 major 复核后全部属实且真修到位。第二轮复审在"已修好的东西"里又挖出
7 个原型缺陷 + 4 处文档不一致（自检脚本 228 项全绿也照样漏掉了其中三个 ——
断言只查"按钮在不在"，查不出"按下去对不对"）。

| 问题 | 处理 | 落在 |
| --- | --- | --- |
| 投票状态是全局单值，不按经验隔离 | `voteState[exp.id]`，在 A 上投票不动 B，取消投票能把计数减回去 | 原型 c-1.js；§6.2 votes 语义对齐 |
| 反馈盒「已采纳」筛选落到兜底分支，等于看全部 | 筛选改成按 status 一一对应，5 个 pill 覆盖全部状态 | 原型 c-3.js |
| 管理列表的待处理数吃加载时的静态快照 | 改成实时算 | 原型 c-3.js |
| 管理列表写「共 14 条」只列 3 条 | 全部列出，条数实时 | 原型 c-3.js |
| 搜索页领域筛选硬编码了 2 个（9 个领域里选不到另外 7 个） | 改成从 `categories` 生成 | 原型 c-1.js |
| 编辑器里标题 / 结论 / 补充说明是只读的 | 改成可输入，失焦落库并刷新更新时间 | 原型 c-3.js |
| 依据「支撑哪条要点」在编辑器里不能勾（写入端是空的） | 改成可勾选贴条，直接写 `sources.point_ids` | 原型 c-3.js |
| 详情页「看全部依据」是误导（依据本来就全列了） | 改为「看依据与要点的对应关系」，并在依据条上直接写出支撑哪条要点 | 原型 c-2.js |
| 详情页的「N 人收藏」不跟着自己的操作变 | 收藏 / 取消收藏时同步改数 | 原型 c-2.js |
| §6.2 仍写「categories 一级二级共用一张表」 | 改成「一级领域（固定 9 个）」，写清 `parent_id` 首版不写入 | 文档 §6.2 |
| 登录接口没列进任何一张接口表 | 补进 §8.1 公开接口表 | 文档 §8.1 |
| §18 速查表 API 条数与实际条数对不上 | 改成 9 + 7 + 10，并加自动核对断言 | 文档 §18 |
| §16.1 要求展示「有用 / 没用」计数，但表里没定义来源 | 加 `useful_count` / `not_useful_count` 两个冗余列 + §6.3 第 12 条断言 | 文档 §6.2 / §6.3 |

复审还核对了上一轮 15 条 major 的修复效果，并**独立复算了一遍 WCAG 对比度**
（13 页 × 2 身份 + 展开态 / 面板态 / 争议态，988 处文本，零违规）。
自检脚本当时从 228 项涨到 263 项 —— 新增的 35 条把本轮每个 bug 都钉住了。

### 第 2 轮补 · v1.2（2026-11-20 · 复审之后的追加修订）

第二轮复审自己修的 10 条**逐条独立验证属实**（投票按经验隔离、反馈盒五态互斥筛选、
管理端计数实时、编辑器四个字段可改可勾、详情页依据写明支撑关系等，都不是改文案糊弄过去的）。
但独立复核又挖出它没抓到的 3 个问题，一并修掉：

| # | 问题 | 后果 | 处理 |
| --- | --- | --- | --- |
| A | **发布没有校验** | 上一轮复审把"依据能勾选"这个写入端开出来了，却没装护栏：把某条依据的支撑全部取消（`point_ids` 变空）照样能发布；0 条依据的草稿也能直接贴出去 | 发布前校验：标题结论非空、≥1 要点、≥1 依据、每条依据都关联了要点；不通过给出具体缺什么（§4.1） |
| B | **搜索演示结果只覆盖 1 个领域** | 上一轮复审给搜索页加了 9 个领域筛选，但演示结果只有 3 条、全在「买买买」—— 点其余 8 个全是空态，看着像筛选坏了 | 演示结果扩到 7 个领域 10 条，筛选与领域页口径一致 |
| C | **筛选状态看不见也清不掉** | 选了「健康 + 含避雷」筛出空结果，页面不显示当前筛选，空态只说"把筛选去掉"却没说怎么去 | 搜索页显示「当前筛选：…」，给「清空筛选」出口 |

另外补了一处演示数据：反馈盒的「已忽略」筛选项此前永远筛不到东西，补了一条 `ignored` 状态的反馈。

> 上一轮复审把"每个状态都筛得到"写成了断言，但没验"演示数据里真的有那条状态的数据" ——
> 断言全绿、筛选项是空的，这种事静态检查抓不到，得跑起来点。

### 第 3 轮 · v1.3（2026-11-21 · 界面文案统一书面语）

原型第一版的说明性文案偏口语（「该知道的事」「不会拿去做别的」「点一下看为什么」…），
和产品要呈现的「可信经验库」形象对不上 —— 用户会把这种口吻理解成随手写的小工具，
而不是一份有人维护、逐条标了来源的资料。界面文案统一改成书面语（原型共改 60 余处），
分界线见 §13.4。

| 改了什么 | 例 |
| --- | --- |
| 说明类（隐私 / 关于 / 免责 / 争议） | 「不会拿去做别的」→「不会用于其他用途」 |
| 角色术语从读者侧清掉 | 「内容全是管理员一条条写进来的」→「内容逐条录入」（普通用户本来不知道有管理员） |
| 操作提示 | 「点一下看为什么」→「点击查看依据」 |
| 动作按钮与术语统一 | 「寄出反馈」→「提交反馈」，「贴出去」→「发布」 |
| 发布校验提示 | 「还差 1 条依据，发出去之前得补上」→「至少需要 1 条依据，发布前请补充」（§4.1 表格同步） |

当时还补上一条一直缺的回归断言：**读者侧页面不出现「管理员」**。
这条口径此前只写在 README 里、没有断言守着 —— 「我的」页的关于说明就一直写着
「内容全是管理员一条条写进来的」，普通用户直接看得到。

### 第 4 轮 · v1.4（2026-11-22 · 五项产品决策落地）

第二轮复审留下的五个产品口味决策已拍板，本轮全部落地（原型 + 文档 + 回归断言）。

| 决策 | 结论 | 落在 |
| --- | --- | --- |
| 采纳 / 不采纳要不要强制写理由 | **不强制**；只有「只回话」必填回复，护栏下沉到 `submitFb` | §4.3 / §14 D10；原型处理面板 |
| 管理端要不要加搜索 | **加**：经验列表 + 反馈盒各一个搜索框，应用层过滤 | §8.3 / §14 D11；原型 c-3.js |
| 反馈图片上传要不要做 | **做**：最多 3 张，异步审核，读者侧与管理侧两种视觉状态 | §9.4 / §6.2 断言 11；原型 c-3.js |
| 列表要不要加「紧凑」密度档 | **不做** | §17 已定清单 |
| 相关经验推荐策略 | **同领域优先 + 标签重叠兜底** | §14 D9 |

**图片这一项连带改了数据结构**：`feedbacks` 表加 `images JSONB`（存 `media_id` 与 url）
与 `media_status` 汇总字段；一张图不过整条记 `rejected`，不做「有的能看有的不能」。
（当时只在 §9.4 写了字段语义，§6.2 的建表语句没跟上 —— v1.5 补齐。）

**顺手修了一处护栏位置**：原先端点「只回话」必填回复只在界面拦，
换成别的入口就能提交一条没有回复的「已回复」。现在校验落在 `submitFb`。

> 五个决策里有三个是「加功能」，这类改动最容易只做界面不做护栏 ——
> 所以每一条都配了回归断言（搜索要真筛得出东西、图片三态要真渲染、
> 不写理由要真能提交），自检当时从 300 项涨到 329 项。
### 第 5 轮 · v1.5（2026-11-23 · 文档整理）

仓库做了一次文档清理：早期那几份单独的审查 / 复审报告文件已删除，原型自检脚本也一并移除。
本轮把两份文档改成**自包含** —— 不再指向任何已删除的文件，并把几处对不上的地方补齐。

| 改了什么 | 说明 |
| --- | --- |
| 去掉已删报告的外链 | §0 阅读指引、§19 三个小节标题、本节开头说明，都不再引用 `docs/2026-11-20-better-life-*.md` |
| §19 修订记录重排 | 原来的物理顺序是 v1.2 → v1.1 → v1.2，读起来像乱序；改成按轮次时间顺序：v1.1 → v1.2 → v1.2 补 → v1.3 → v1.4 → v1.5 |
| `feedbacks` 表补齐媒体字段 | §6.2 的建表语句原本只有 `images TEXT[]`，没有 `media_status` 等四列，而 §6.3 断言 11 与 §9.4 的状态机都依赖它们。现在表定义与 §9.4 一致：`images` 改 JSONB，补四个媒体列，并加 `media_status` 取值约束 |
| §6.3 断言编号修正 | 原本有两条都编成「11」，后一条改为 12；§12 表格里的「6 条完整性断言」同步改成 12 条 |
| §5.3 目录结构标清是目标 | 那一节画的是实施后的仓库结构，不是现状；加了说明，`docs/` 子目录改成真实路径 |
| §12 标注脚本为待实现 | 那张表里的 `scripts/verify-*.js` 是实施时待建的，仓库当前没有 `scripts/` 目录，原型自检也已移除 |

**没改的**：产品口径一条没动 —— §2.3 立场只到要点级、§2.5 读者侧只留一个日期、
§4.3 管理员不提交反馈、§16.1 反馈仅管理员可见，这些结论与原型行为都保持原样。

### 第 6 轮 · v1.6（2026-11-23 · 第三轮设计审查落地）

第三轮设计审查提了 **39 条问题**（5 A + 10 B + 18 C + 6 附录 A）。
**逐条核对结论：全部真实存在** —— 没有一条是误读，差异只在报告对**严重程度**的判断上。
问题清单随审查报告一起清理，不在本文档内联；本轮对设计文档的改动如下：

| 改了什么 | 说明 |
| --- | --- |
| §2.3 立场贴纸补第三个通道 | 颜色 + 符号 + 文字（`✓ 推荐` / `✕ 避雷` / `— 中立`）；中立由 `?` 改 `—`，问号留给「有争议」 |
| §2.4 / §6.2 / §6.3 标签模型 | `tags` 唯一键改 `UNIQUE(category_id, name)`，同名标签可跨领域；§6.3 加断言 13 |
| §2.6 新增 · 删掉别名表 | 全局别名表（`synonyms`）删除，改为 `experiences.search_keywords`：写作时顺手填 0-3 个「别人可能怎么问」。管理端少一页维护、少一张表、少两组接口；§12 表数 12 → 11 |
| §3.2 页面清单 | 依据来源页职责改为「要点 ↔ 依据」映射视图；详情页补「依据内联折叠」与「吸底操作条」；搜索页标注五个状态；**新增第 14 页「关于与隐私」** |
| §3.4 交互要点 | 详情页要点默认折叠、依据就地展开；来源页是映射视图不是清单；操作条吸底；**搜索历史只存本机**（不做「大家常搜」，历史落 `lifebetter_search_hist`，有「清空」入口） |
| §3.5 页面状态 | 补「内容已下线」「未登录」「无权限」「失败」四种状态 |
| §12.1 新增 | 原型自检的断言口径：**写状态级，不写 DOM 存在级**；写进文档的口径必须有断言守着 |
| §12 脚本清单 | 原型自检脚本已重建，不再是「已移除」（当前 174 项断言全绿） |
| §13.5 新增 | 交付清单：原型到真机还差什么（令牌表 / tabBar 图标 / 头像资料 / 组件状态表 / `hover-class` / 三域降饱和） |
| §14 新增 D12–D16 | 自定义导航、统一默认头像、向量检索延后、订阅消息通知、标签同名跨领域 |
| §17 风险 | 补「对比度余量极窄」「真机未验证」两条风险；把六项待拍板的结论写进「已定」 |

**本轮没做的 6 项**（令牌表 / tabBar 图标 / 头像资料 / 组件状态表 / `hover-class` / 三域降饱和），
连同**真机未验证**项，都记在 §13.5。

**产品口径一条没被推翻**：§2.3 立场只到要点级、§2.5 读者侧只留一个日期、
§4.3 管理员不提交反馈、§16.1 反馈仅管理员可见 —— 这些结论与原型行为都保持原样。
本轮改的是「把没画完的画完」和「把口径写进断言」，不是重新定义产品。

---

### 第 7 轮 · v1.7（2026-11-23 · 小程序端与后端落地）

前六轮是设计与原型审查；这一轮是**把它写出来**。小程序端 14 页、后端 34 个接口、
30 条带真实来源链接的种子内容，按 §15.2 的批次顺序一次做完（**未部署**）。
这一轮把「已经落地的事实」写回设计文档 —— 逐条如下。

**口径层面的改动**

| 改了什么 | 说明 |
| --- | --- |
| §3.3 路由参数 | 搜索页的 `q?` 补注：搜索页是 tabBar 页，冷启动能从 `onLoad` 拿到 `q`，热启动不会。一期只分享详情页（§10.1），这条路径踩不到 |
| §10.1 分享 | 一期只分享详情页。`utils/share.js` 里没人调用的 `searchShare` 已删 —— 它拼的是 tabBar 路径，热启动会丢掉 `q`，留着就是一条走不通的路 |
| §12 脚本清单 | 从「待建」改成实际清单：九支仓库级自检 + 三支服务端脚本，逐支标了断言数；`verify-embedding` 与 `verify-in-devtools` 标「未建」并写明原因 |
| §15.2 批次 | 补实施进度：B0–B7 完成，B8 完成三件，Pages 主页与 nginx 未做（不部署） |
| §5.3 目录结构 | 按实际落地改了文档：`styles/` 单独放两个 wxss，`server/sql/seed.sql` 是生成物 |

**实施中定下的口径（此前文档没写死，现在写死）**

- **标题是任何一次保存的底线**：草稿也必须有标题；结论 / 要点 / 依据三道校验只在发布时追加。前后端同一套口径。
- **slug**：新建时生成唯一值，更新时保持原值；`slug` 上有 UNIQUE 约束。
- **检索泛词表**：38 个无信息量 bigram（如「怎么」「什么」）进表；只命中泛词的正文与要点详情**不单独构成命中**，
  纯泛词查询如实返回空结果，不硬凑。相对阈值落在关键词路的**原始分**上（0.35），不落 RRF 分 —— RRF 分只反映排名，不反映强弱。
- **命中原因用结构化前缀**（`point:` / `keyword:` / `tag:` / `summary:` / `title` / `semantic`），
  中文标签由 `utils/view.js` 的 `hitLabel` 统一翻译，页面不再各自解析前缀。
- **`mode` 如实上报**：本地 embedding 下就是 `keyword`，不报 `hybrid`。

**令牌**：原型 `design/assets/dir-c.css` 补 `--scrim` 令牌，使小程序的 `styles/tokens.wxss` 与原型令牌能逐个对照
（`verify-tokens.js` 的硬性要求）。

**这一轮修掉的真 bug**（都是自检脚本或实跑发现的，不是审查报告里的）：

- `config.envInt` 把空串当 0 —— `Number('') === 0` 不是 NaN，于是 PORT、限流、RRF_K、检索上限、向量维度全被清零，token 一签发就过期
- 管理端路由的 `router.use(requireAuth, requireAdmin)` 没限定路径，所有未匹配路由被拦成 401
- 新建经验的 slug 固定成 `exp-new`，第二条就撞唯一键
- pg-mem 的 `count(*) FILTER` 会忽略过滤条件，投票的两个计数一直不对
- pg-mem 的自增计数器每张表从 1 重开，与种子的显式 id 撞车（改成应用层算 `max(id)+1`；真 PG 仍走数据库自增）
- 反馈盒 `wx:for` 两处嵌套未声明 `wx:for-item`
- 检索四处：`search_keywords` 命中因权重算成 0 被丢弃；只命中正文泛词的条目刷屏；立场过滤用了相关子查询；命中原因的中文标签与前端契约对不上

**自检结果**：仓库级八支断言脚本 **342 项全绿**，链接自检 **62/62 可达**（46 个站点），
服务端 `selftest.js` 与 `http-test.js` **各 101 项全绿**（19 组）。
