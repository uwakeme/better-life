/**
 * better-life 原型 · 共享演示数据
 *
 * 单一视觉方向（便签墙）共用这一份内容与语义（经验 / 要点 / 依据 / 反馈）。
 *
 * 两条口径（2026-11-20 审核修订）：
 * ① 统计数字一律由数据派生（见 build()），不写死 —— 写死的数字会和内容漂移。
 * ② 立场只到「要点」一级（设计文档 §2.3）：经验本身没有好/坏标签，
 *    所以经验卡不贴立场贴纸，只写「N 推荐 · M 避雷」这种诚实的计数。
 *
 * ⚠️ 数据性质：原型演示数据。来源链接为示意占位，不指向真实测评文章。
 */
(function (global) {
  'use strict';

  /* ---------- 领域（一级分类固定 9 个） ---------- */
  var CATEGORIES = [
    { id: 1,  slug: 'shopping', name: '买买买',   icon: 'bag',    desc: '洗护、家电、数码、服饰、食品、母婴、清洁、宠物' },
    { id: 2,  slug: 'food',     name: '吃喝',     icon: 'bowl',   desc: '外食、做饭、饮品、食材储存、厨房' },
    { id: 3,  slug: 'home',     name: '住家',     icon: 'house',  desc: '清洁、收纳、装修、维修、家电养护' },
    { id: 4,  slug: 'travel',   name: '出行',     icon: 'plane',  desc: '通勤、机票火车、自驾、住宿、打包' },
    { id: 5,  slug: 'health',   name: '健康',     icon: 'heart',  desc: '睡眠、饮食、体检、用药常识、运动' },
    { id: 6,  slug: 'money',    name: '钱财',     icon: 'wallet', desc: '记账、砍订阅、保险、理财常识、退款' },
    { id: 7,  slug: 'rights',   name: '办事维权', icon: 'shield', desc: '投诉、快递、合同、社保、网购纠纷' },
    { id: 8,  slug: 'mind',     name: '人际心态', icon: 'chat',   desc: '沟通、边界、职场、情绪' },
    { id: 9,  slug: 'skill',    name: '技能效率', icon: 'tools',  desc: '工具、自动化、笔记、方法' }
  ];

  /* ---------- 二级标签（后台可维护） ---------- */
  var TAGS = [
    { id: 1,  name: '洗护',     cat: 1 }, { id: 2,  name: '成分',   cat: 1 },
    { id: 3,  name: '数码',     cat: 1 }, { id: 4,  name: '母婴',   cat: 1 },
    { id: 5,  name: '清洁',     cat: 1 }, { id: 6,  name: '家电',   cat: 1 },
    { id: 7,  name: '食材储存', cat: 2 }, { id: 8,  name: '外食',   cat: 2 },
    { id: 9,  name: '厨房',     cat: 2 }, { id: 10, name: '收纳',   cat: 3 },
    { id: 11, name: '装修',     cat: 3 }, { id: 12, name: '家电养护', cat: 3 },
    { id: 13, name: '机票火车', cat: 4 }, { id: 14, name: '通勤',  cat: 4 },
    { id: 15, name: '睡眠',     cat: 5 }, { id: 16, name: '体检',   cat: 5 },
    { id: 17, name: '用药常识', cat: 5 }, { id: 18, name: '记账',   cat: 6 },
    { id: 19, name: '砍订阅',   cat: 6 }, { id: 20, name: '保险',   cat: 6 },
    { id: 21, name: '快递',     cat: 7 }, { id: 22, name: '合同',   cat: 7 },
    { id: 23, name: '投诉',     cat: 7 }, { id: 24, name: '沟通',   cat: 8 },
    { id: 25, name: '边界',     cat: 8 }, { id: 26, name: '情绪',   cat: 8 },
    { id: 27, name: '工具',     cat: 9 }, { id: 28, name: '自动化', cat: 9 },
    { id: 29, name: '笔记方法', cat: 9 },
    /* 同名标签可以分属不同领域：「清洁」在买买买与住家各有一条，
       唯一约束是 (category_id, name) 而不是全局 name（设计文档 §6.2）。 */
    { id: 30, name: '清洁',     cat: 3 },
    { id: 31, name: '做饭',     cat: 2 }, { id: 32, name: '维修',     cat: 3 },
    { id: 33, name: '自驾',     cat: 4 }, { id: 34, name: '住宿',     cat: 4 },
    { id: 35, name: '运动',     cat: 5 }, { id: 36, name: '饮食常识', cat: 5 },
    { id: 37, name: '退款',     cat: 6 }, { id: 38, name: '职场',     cat: 8 }
  ];

  /* ---------- 立场 ---------- */
  var STANCE = {
    good:    { key: 'good',    label: '推荐', short: '推荐', tone: 'good' },
    bad:     { key: 'bad',     label: '避雷', short: '避雷', tone: 'bad' },
    neutral: { key: 'neutral', label: '中立', short: '中立', tone: 'neutral' }
  };

  /* ---------- 经验（含要点与依据） ----------
   * points[].s 立场 / t 标题 / d 理由 / a 适用条件
   * sources[].pt 支撑哪几条要点（1 起，按本经验内要点序号）
   * keywords[]. 别人可能怎么问 —— 写作时顺手填 0-3 个，检索时一起匹配。
   *   原来用一张全局「别名表」做同义归一，但它要单独维护、还容易和内容脱节
   *   （实测 4 条里 2 条指向的词库里根本没有）。改成挂在经验上：
   *   维护动作发生在写作当下，删掉内容时关键词跟着消失，不会留下过期字典。
   */
  var EXPERIENCES = [
    {
      id: 1, cat: 1, title: '怎么挑洗发水不踩雷',
      summary: '先定头皮类型，再决定要不要硅油 —— 顺序反了就会买错。',
      body: '大部分人挑洗发水只看「控油」「去屑」这些功效词，但功效靠的是表活和硅油配方，跟头皮出油速度没有直接关系。正确顺序是：先判断自己是油性还是干性，再在这个前提下挑配方。',
      conf: 'high', reviewed: '2026-10-12', nextReview: '2027-04-12',
      views: 1284, favs: 96, useful: 12, notUseful: 3, updatedAt: '2026-11-16',
      tags: ['洗护', '成分'],
      /* 别人可能怎么问 —— 用户说的是「洗头水」而不是「洗发水」 */
      keywords: ['洗头水', '洗发露'],
      points: [
        { s: 'neutral', t: '二甲基硅油', d: '硅油是成膜剂，作用是让发丝表面更顺滑、更好梳理，本身不堵塞毛囊。', a: '所有发质；干燥受损发质收益最大' },
        { s: 'bad', t: '油性头皮用高硅会更难洗', d: '高浓度硅油在油性头皮上成膜，需要更用力冲洗才能彻底去掉，反而洗完更油。', a: '油性头皮、下午就出油' },
        { s: 'neutral', t: '无硅油不等于更温和', d: '无硅油洗发水靠表活做清洁，刺激性取决于表活种类，跟有没有硅油是两件事。', a: '成分表里没硅油，但表活是皂基' },
        { s: 'good', t: '敏感头皮优先看表活', d: '氨基酸类表活（如椰油酰谷氨酸钠）对头皮刺激小，是敏感头皮更稳的选择。', a: '敏感头皮、孕期、哺乳期' }
      ],
      sources: [
        { pt: [1], t: '硅油到底对头皮有没有伤害', url: 'https://dxy.com/article/silicone-shampoo-review', type: 'article', platform: '丁香医生', author: '皮肤科医生专栏', date: '2026-03-18', note: '解释了成膜剂的作用机制与冲洗残留的判断方法，是「硅油不堵毛孔」这个判断的出处。' },
        { pt: [1, 2], t: '油头洗发水成分横评', url: 'https://www.bilibili.com/video/BV1xx411c7mD', type: 'video', platform: 'B站', author: '成分实验室', date: '2026-05-02', note: '用半边头对照实验测了六款洗发水的冲洗残留量，支撑「油头高硅更难洗」。' },
        { pt: [3, 4], t: '氨基酸表活 vs 皂基表活', url: 'https://dxy.com/article/surfactant-comparison', type: 'article', platform: '丁香医生', author: '成分科普组', date: '2026-06-21', note: '按 pH 和去脂力对比两类表活，给出敏感头皮的选购区间。' }
      ]
    },
    {
      id: 2, cat: 1, title: '无线充电板怎么选',
      summary: '标称功率不等于实际功率，先看输入功率和发热控制。',
      body: '无线充电标的「15W / 30W」多数是线圈中心点的峰值，充电板本身发热降功率后，实际稳定输出会掉到一半左右。选的时候看输入功率上限，而不是输出标称值。',
      conf: 'normal', reviewed: '2026-09-30', nextReview: null,
      views: 742, favs: 41, useful: 6, notUseful: 1, updatedAt: '2026-11-12',
      tags: ['数码', '家电'],
      points: [
        { s: 'good', t: '先看输入功率上限', d: '输入决定了能给多少，标称输出只是上限。充电宝供电一般给不满。', a: '出差 / 户外使用' },
        { s: 'bad', t: '边充边玩会导致降速', d: '手和手机散热不同步，充电板温度上升后会自动降功率。', a: '边充电边打游戏' },
        { s: 'neutral', t: '线圈对位比功率更重要', d: '偏移超过线圈中心会导致充不进去或发热集中。', a: '手机没有无线充电对位标记' }
      ],
      sources: [
        { pt: [1], t: '无线充电功率标称与实测差异', url: 'https://www.ithome.com/0/739/201.htm', type: 'article', platform: 'IT 之家', author: '数码组', date: '2026-04-09', note: '实测六款充电板持续输出功率与标称值的差距。' },
        { pt: [2, 3], t: '充电发热与降功率机制', url: 'https://zhuanlan.zhihu.com/p/wireless-charging-thermal', type: 'post', platform: '知乎专栏', author: '硬件工程师', date: '2026-02-27', note: '从温控曲线解释降功率触发条件，附对位误差实测。' }
      ]
    },
    {
      id: 3, cat: 1, title: '婴儿车和安全座椅怎么挑',
      summary: '看认证标准和结构，不看宣传里的「可躺平」「一键折叠」。',
      body: '',
      conf: 'high', reviewed: '2026-08-21', nextReview: '2027-02-21',
      views: 903, favs: 128, useful: 15, notUseful: 2, updatedAt: '2026-11-05',
      tags: ['母婴'],
      points: [
        { s: 'good', t: '认准 3C 认证和年龄分段', d: '安全座椅有明确的体重/身高区间，买错分段等于白买。', a: '0-4 岁全周期使用' },
        { s: 'bad', t: '别用「几斤重也能坐」当卖点', d: '超重段的骨架和约束带强度不达标，出事故时保护失效。', a: '低价杂牌车' },
        { s: 'neutral', t: '可躺平角度看有没有支撑', d: '角度调节方便，但真躺平后靠背是否托住腰背要单独试。', a: '小月龄需要平躺' }
      ],
      sources: [
        { pt: [1, 2], t: '儿童安全座椅抽检结果通报', url: 'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zljds/art/2026/art_a1b2.html', type: 'official', platform: '市场监管总局', author: '产品质量监督司', date: '2026-05-30', note: '抽检通报里列出了不合格项目的具体判定依据。' },
        { pt: [3], t: '婴儿车结构对比', url: 'https://www.bilibili.com/video/BV1zz411c7aB', type: 'video', platform: 'B站', author: '育儿测评组', date: '2026-01-15', note: '实际推车测试躺平后的腰部支撑情况。' }
      ]
    },
    {
      id: 4, cat: 1, title: '洗手液和沐浴露怎么选',
      summary: '手和身体的要求不一样，用同一瓶是最常见的浪费。',
      body: '',
      conf: 'normal', reviewed: '2026-06-08', nextReview: null,
      views: 415, favs: 22, useful: 4, notUseful: 0, updatedAt: '2026-10-19',
      tags: ['清洁'],
      points: [
        { s: 'good', t: '洗手用免洗型，洗澡用冲洗型', d: '免洗洗手液靠酒精，秋冬对干手容易紧绷；沐浴露需要冲洗，残留感更低。', a: '冬天手部干燥' },
        { s: 'neutral', t: '沐浴露看表活而不是香精', d: '香精只影响气味和致敏概率，真正决定清洁力的是表活浓度。', a: '敏感肌' }
      ],
      sources: [
        { pt: [1], t: '免洗洗手液与流水洗手的对比', url: 'https://dxy.com/article/hand-hygiene-compare', type: 'article', platform: '丁香医生', author: '感染科医生专栏', date: '2026-03-04', note: '两种方式对皮肤屏障影响的对照数据。' },
        { pt: [2], t: '表活浓度与清洁力', url: 'https://dxy.com/article/surfactant-cleaning-power', type: 'article', platform: '丁香医生', author: '成分科普组', date: '2026-06-08', note: '给出可以按浓度判断清洁力的区间。' }
      ]
    },
    {
      id: 5, cat: 2, title: '冰箱里的肉怎么存才不坏',
      summary: '生熟分格、0-4℃冷藏、-18℃冷冻超三个月就别吃了。',
      body: '',
      conf: 'high', reviewed: '2026-10-02', nextReview: '2027-04-02',
      views: 1567, favs: 143, useful: 21, notUseful: 1, updatedAt: '2026-11-14',
      tags: ['食材储存'],
      points: [
        { s: 'good', t: '生熟必须分格放', d: '生肉的汁水滴到熟食上会二次污染，冷藏室下层放生肉是硬规矩。', a: '所有家庭' },
        { s: 'bad', t: '冷冻超过三个月的肉不建议吃', d: '风味下降是小事，风险在于解冻后细菌重新繁殖。', a: '长期囤冻的冰箱' },
        { s: 'neutral', t: '分装比整块冻更好用', d: '按实际用量分装，避免反复解冻；但也别分太碎影响口感。', a: '一周做一次饭的家庭' }
      ],
      sources: [
        { pt: [1], t: '生熟分开存放的指南', url: 'https://www.chinacdc.cn/jkzt/yyb/202601/t20260112_190213.html', type: 'official', platform: '中国疾控中心', author: '食品安全所', date: '2026-01-12', note: '官方给出的家庭冰箱分区存放建议。' },
        { pt: [2], t: '冷冻肉类的保存期限', url: 'https://www.chinacdc.cn/jkzt/yyb/202604/t20260403_190612.html', type: 'official', platform: '中国疾控中心', author: '食品安全所', date: '2026-04-03', note: '不同肉类的推荐冷冻期限与解冻方式。' },
        { pt: [3], t: '家庭分装储存实测', url: 'https://www.bilibili.com/video/BV1qM4y1c7eF', type: 'video', platform: 'B站', author: '厨房实验室', date: '2026-07-19', note: '连续三周的解冻复冻对照。' }
      ]
    },
    {
      id: 6, cat: 2, title: '外食怎么挑不踩雷',
      summary: '看菜单、看出餐动线、看出餐速度，三样都能在坐下前判断。',
      body: '',
      conf: 'normal', reviewed: '2026-07-15', nextReview: null,
      views: 836, favs: 54, useful: 8, notUseful: 2, updatedAt: '2026-10-29',
      tags: ['外食'],
      points: [
        { s: 'good', t: '先看菜单再坐下', d: '菜单价目混乱、后厨和前厅不隔开的店，卫生风险明显更高。', a: '第一次去的店' },
        { s: 'neutral', t: '出餐快的店不一定不安全', d: '预制和现做都能很快，关键看食材是不是现点现做。', a: '快餐 / 简餐' },
        { s: 'bad', t: '避开长期只有一道主推的店', d: '菜单长期不换，通常意味着后厨动线固定且已定型，风险集中。', a: '写字楼下的固定快餐店' }
      ],
      sources: [
        { pt: [1, 3], t: '餐饮单位食品安全等级公示', url: 'https://spaqjg.eastmoney.com/', type: 'official', platform: '市场监管公示平台', author: '', date: '2026-06-01', note: '可按地址查该店动态评级等级，是线下判断最省事的入口。' },
        { pt: [2], t: '中央厨房与现做现炒的区别', url: 'https://www.bilibili.com/video/BV1xx411c7nY', type: 'video', platform: 'B站', author: '餐饮观察', date: '2026-05-11', note: '后厨动线实拍，解释为什么出餐速度不能作为唯一判据。' }
      ]
    },
    {
      id: 7, cat: 3, title: '装修最容易超预算的五项',
      summary: '水电、防水、门窗、定制柜、灯具 —— 超支的八成在这五项里。',
      body: '',
      conf: 'high', reviewed: '2026-09-18', nextReview: '2027-03-18',
      views: 2241, favs: 214, useful: 33, notUseful: 4, updatedAt: '2026-11-13',
      tags: ['装修'],
      points: [
        { s: 'good', t: '水电按实际点位报价', d: '按米数报价的师傅几乎一定会多走线，务必按点位结算。', a: '包工包料以外的任何报价单' },
        { s: 'good', t: '防水做闭水试验再贴砖', d: '闭水试验不过就返工，返工成本远高于试验成本。', a: '卫生间、阳台' },
        { s: 'bad', t: '定制柜别在水电完工前定', d: '柜体尺寸依赖最终墙面尺寸，提前下单大概率要改。', a: '全屋定制' },
        { s: 'neutral', t: '门窗按面积单列，别混进总价', d: '系统门窗单价高，混在整包里最容易看不出超支。', a: '预算 20 万以上的房子' }
      ],
      sources: [
        { pt: [1, 2], t: '家庭装修验收流程与闭水试验规范', url: 'https://www.mohurd.gov.cn/gongkai/zhengce/zhengcefilelib/202601/20260115_778001.html', type: 'official', platform: '住建部', author: '住宅产业化中心', date: '2026-01-15', note: '验收节点与检验方法的官方口径。' },
        { pt: [3, 4], t: '装修报价单里的常见坑', url: 'https://zhuanlan.zhihu.com/p/renovation-quote-traps', type: 'post', platform: '知乎专栏', author: '十年监理', date: '2026-04-22', note: '拿真实报价单逐项拆解，指出单价与点位换算的差别。' }
      ]
    },
    {
      id: 8, cat: 3, title: '房子小，收纳怎么做才不挤',
      summary: '先减物，再定尺寸，最后才买柜子 —— 顺序反了就是买更多垃圾。',
      body: '',
      conf: 'normal', reviewed: '2026-05-11', nextReview: null,
      views: 1108, favs: 87, useful: 10, notUseful: 2, updatedAt: '2026-09-19',
      tags: ['收纳'],
      points: [
        { s: 'good', t: '先扔再量尺寸', d: '收纳设计的第一步是清空，清空之后的物品量才是真实需求。', a: '第一次做收纳规划' },
        { s: 'bad', t: '别按物品尺寸做柜子', d: '按物品尺寸做，柜子会塞满还留缝；按使用频率分层更省空间。', a: '衣柜、鞋柜' },
        { s: 'neutral', t: '留出可调整的余量', d: '收纳物品会变，格子全做死的柜子两年后就是一堆废板。', a: '长期居住' }
      ],
      sources: [
        { pt: [1], t: '整理收纳的断舍离顺序', url: 'https://www.bilibili.com/video/BV1Zt4y1c7nR', type: 'video', platform: 'B站', author: '整理师', date: '2025-12-20', note: '提出「先减量再设计」的顺序，并给了具体执行清单。' },
        { pt: [2, 3], t: '小户型收纳尺寸研究', url: 'https://zhuanlan.zhihu.com/p/small-apartment-storage', type: 'post', platform: '知乎专栏', author: '居住研究', date: '2026-03-30', note: '对比不同物品量的实际占用体积，给出分层建议。' }
      ]
    },
    {
      id: 9, cat: 4, title: '机票怎么买最便宜',
      summary: '便宜的前提是「同航线总时长」接近，光看价格会踩中转陷阱。',
      body: '',
      conf: 'normal', reviewed: '2026-08-05', nextReview: null,
      views: 1387, favs: 102, useful: 13, notUseful: 3, updatedAt: '2026-10-19',
      tags: ['机票火车'],
      points: [
        { s: 'good', t: '比价时先对齐总时长', d: '便宜 200 块但多转一次机、晚到三小时，实际更贵。', a: '临时出行的商务出差' },
        { s: 'neutral', t: '周二出发、周三返回最便宜', d: '是统计规律不是保证，热门时段照样贵。', a: '有灵活行程的人' },
        { s: 'bad', t: '别在平台比完价直接买', d: '同航班不同平台价差可达两成，值机柜台和航司官网都要看一眼。', a: '任何一次购票' }
      ],
      sources: [
        { pt: [1, 2], t: '机票价格周期与总时长对比', url: 'https://www.bilibili.com/video/BV1mK4y1c7xA', type: 'video', platform: 'B站', author: '旅行数据组', date: '2026-02-08', note: '半年价格曲线，并演示了含中转时长的真实成本计算。' },
        { pt: [3], t: '同一航班多平台价差统计', url: 'https://zhuanlan.zhihu.com/p/flight-price-across-platforms', type: 'post', platform: '知乎专栏', author: '比价工具开发者', date: '2026-06-19', note: '抓取公开价格做的价差分布。' }
      ]
    },
    {
      id: 10, cat: 5, title: '体检报告怎么看',
      summary: '先看箭头，再看参考范围，最后才看数值大小。',
      body: '',
      conf: 'high', reviewed: '2026-10-09', nextReview: '2027-04-09',
      views: 1932, favs: 176, useful: 26, notUseful: 2, updatedAt: '2026-11-15',
      tags: ['体检'],
      points: [
        { s: 'good', t: '有箭头的项目先复查', d: '单次异常多数是生理波动，同项目连续两次异常才需要进一步查。', a: '体检报告上的上升下降标记' },
        { s: 'neutral', t: '参考范围以报告单为准', d: '不同实验室的参考区间不一样，别拿网上看到的范围套自己的单子。', a: '换了体检机构' },
        { s: 'bad', t: '不要自己上网对症', d: '搜索结果会把轻微异常和严重疾病放在一起，越查越慌。', a: '看到结节或指标偏高' }
      ],
      sources: [
        { pt: [1, 2], t: '体检报告解读的一般原则', url: 'https://www.nhc.gov.cn/jkj/s3581/202602/t20260226_197455.html', type: 'official', platform: '国家卫健委', author: '医政司', date: '2026-02-26', note: '明确异常复查的建议区间与参考范围的机构差异。' },
        { pt: [3], t: '为什么不要自己查症状', url: 'https://dxy.com/article/health-anxiety-searching', type: 'article', platform: '丁香医生', author: '循证医学组', date: '2026-04-16', note: '解释信息检索在无症状焦虑里的放大效应。' }
      ]
    },
    {
      id: 11, cat: 7, title: '快递丢了怎么赔',
      summary: '先让快递员出「丢失证明」，赔款走公司流程比直接报警快。',
      body: '',
      conf: 'high', reviewed: '2026-11-16', nextReview: '2027-05-16',
      views: 2664, favs: 289, useful: 41, notUseful: 5, updatedAt: '2026-11-16',
      tags: ['快递'],
      keywords: ['丢件', '快递不见了'],
      points: [
        { s: 'good', t: '先书面申请出丢失证明', d: '有快递员盖章的丢失证明，赔付走公司流程通常几天到账。', a: '所有丢件场景' },
        { s: 'good', t: '保价件要按保价条款主张', d: '保价是约定赔偿上限，不是自动全额赔，但需要主动主张。', a: '购买了保价' },
        { s: 'bad', t: '直接报警不会加快赔付', d: '未经立案的报警记录对快递公司赔付基本无效，还容易耽误时间。', a: '怀疑被人为盗窃' }
      ],
      sources: [
        { pt: [1, 3], t: '快递服务国家标准与丢失处理', url: 'https://www.spb.gov.cn/gjyzj/202602/t20260205_998877.html', type: 'official', platform: '国家邮政局', author: '邮政市场司', date: '2026-02-05', note: '官方对丢件查证和赔偿流程的规定。' },
        { pt: [2], t: '保价条款的适用范围', url: 'https://www.12315.cn/knowledge/detail-8812.html', type: 'official', platform: '12315', author: '消费维权平台', date: '2026-05-08', note: '保价理赔的举证要求与上限规则。' }
      ]
    },
    {
      id: 12, cat: 7, title: '怎么退掉健身房会员',
      summary: '退费的关键是找到合同里的退费条款，并且用书面形式提。',
      body: '',
      conf: 'normal', reviewed: '2026-06-20', nextReview: null,
      views: 1785, favs: 121, useful: 17, notUseful: 4, updatedAt: '2026-11-05',
      tags: ['合同'],
      points: [
        { s: 'good', t: '先书面申请，不要只打电话', d: '电话沟通不留痕，书面申请能形成时效证据。', a: '所有退费场景' },
        { s: 'good', t: '找合同里的退费条款', d: '正规健身房合同里都有退费规则，没写清楚本身就是可以主张的点。', a: '有纸质或电子合同' },
        { s: 'neutral', t: '协商无果再走投诉', d: '12315 受理后调解周期通常两周，比直接起诉轻。', a: '金额较大且长期不回复' }
      ],
      sources: [
        { pt: [1, 2], t: '预付费式消费合同指引', url: 'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/ggjgs/art/2026/art_66d31.html', type: 'official', platform: '市场监管总局', author: '消费者权益保护局', date: '2026-03-11', note: '对预付卡退费与合同条款的监管口径。' },
        { pt: [3], t: '12315 投诉受理与调解流程', url: 'https://www.12315.cn/help/faq-3011.html', type: 'official', platform: '12315', author: '消费维权平台', date: '2026-04-02', note: '投诉受理条件、材料清单与调解周期。' }
      ]
    },
    {
      id: 13, cat: 6, title: '怎么退掉订阅服务',
      summary: '先在 App 里关掉自动续费再申请退订，否则会被按已享受服务扣费。',
      body: '',
      conf: 'normal', reviewed: '2026-08-28', nextReview: null,
      views: 1451, favs: 109, useful: 14, notUseful: 3, updatedAt: '2026-11-12',
      tags: ['砍订阅'],
      points: [
        { s: 'good', t: '先关自动续费再申请退款', d: '不关就退款，平台会按「已享受服务」直接扣掉整个周期。', a: '所有订阅退订' },
        { s: 'good', t: '按消费记录算已用天数', d: '按天折算的退款通常比按月折算高，先确认平台的折算方式。', a: '年付会员' },
        { s: 'neutral', t: '在订阅管理里批量取消', d: '系统设置里能看到全部订阅入口，比逐个 App 找更快。', a: '订阅超过五个' }
      ],
      sources: [
        { pt: [1, 2], t: '自动续费与退款规则', url: 'https://www.cac.gov.cn/2026-03/22/c_1756625881028861.htm', type: 'official', platform: '网信办 / 消协联合指引', author: '中国消费者协会', date: '2026-03-22', note: '针对自动续费类服务的知情权与退款口径。' },
        { pt: [3], t: '手机订阅管理入口整理', url: 'https://zhuanlan.zhihu.com/p/manage-subscriptions', type: 'post', platform: '知乎专栏', author: '效率工具党', date: '2026-01-30', note: '各系统订阅入口路径与批量取消方法。' }
      ]
    },
    {
      id: 14, cat: 8, title: '跟父母说不通怎么办',
      summary: '别辩论对错，先把他们的顾虑翻译成担心，再给具体能做的事。',
      body: '',
      conf: 'normal', reviewed: '2026-09-05', nextReview: null,
      views: 1024, favs: 134, useful: 19, notUseful: 1, updatedAt: '2026-11-05',
      tags: ['沟通', '边界'],
      points: [
        { s: 'good', t: '先复述对方的担心', d: '复述准确了，对方才会听后面的内容；复述错了说明还没懂。', a: '任何一次反对' },
        { s: 'good', t: '给具体的、能立刻做的事', d: '「你以后少玩手机」没法执行，「今天我陪你去医院」可以。', a: '涉及健康、就医' },
        { s: 'neutral', t: '不必一次谈完', d: '代际冲突靠次数不靠单次强度，每次推进一点更现实。', a: '长期议题' }
      ],
      sources: [
        { pt: [1, 2], t: '代际沟通中的倾听与反馈技巧', url: 'https://www.bilibili.com/video/BV1rK4y1c7pQ', type: 'video', platform: 'B站', author: '家庭关系咨询师', date: '2026-02-14', note: '示范复述式回应的具体句式。' },
        { pt: [3], t: '长期议题的沟通节奏', url: 'https://dxy.com/article/family-communication-rhythm', type: 'article', platform: '丁香医生', author: '心理健康组', date: '2026-05-25', note: '把沟通目标拆成可执行的小步。' }
      ]
    },
    /* ---- 2026-11-23 补录：把 9 个领域都补到 3 条以上 ----
       原型评审发现「技能效率 0 条、四个领域各 1 条」，首页九色便签簇里
       有一张写着「0 张便签」，搜索结果也只横跨 7 个领域 ——
       空领域看久了会让人以为这个库本身就这么少。
       下面这些条目的来源链接同样是示意占位，不是真实测评文章。 */
    {
      id: 17, cat: 2, title: '剩菜第二天怎么热才不坏',
      summary: '带汤的菜和绿叶菜要分开处理，冷藏不超过两天，复热要热透。',
      body: '剩菜变质主要来自两件事：细菌繁殖和油脂氧化。带汤汁的菜降温慢，给细菌留出了繁殖时间；绿叶菜反复加热则口感发黄、营养一起掉。',
      conf: 'normal', reviewed: '2026-09-20', nextReview: null,
      views: 632, favs: 48, useful: 9, notUseful: 2, updatedAt: '2026-10-24',
      tags: ['食材储存', '做饭'],
      points: [
        { s: 'good', t: '汤多的菜摊开放凉', d: '把汤汁倒进浅盘或用保鲜盒分装，表面积变大降温就快，进冰箱时细菌还没起来。', a: '红烧、炖菜、火锅汤底' },
        { s: 'bad', t: '绿叶菜隔夜就别再热了', d: '绿叶菜纤维短，反复加热后叶绿素分解，口感发黄、营养流失，部分还会滋生亚硝酸盐。', a: '炒青菜、拌菠菜' },
        { s: 'neutral', t: '复热要热透再吃', d: '整体加热到中心冒热气才算热透；微波炉加热中途翻拌一次，受热更均匀。', a: '米饭、炖菜、炒菜' }
      ],
      sources: [
        { pt: [1, 3], t: '家庭剩余饭菜的保存与复热建议', url: 'https://www.chinacdc.cn/jkzt/yyb/202602/t20260211_190011.html', type: 'official', platform: '中国疾控中心', author: '食品安全所', date: '2026-02-11', note: '给出剩菜分装、冷藏时限与复热方式的官方口径。' },
        { pt: [2], t: '隔夜绿叶菜的营养变化实测', url: 'https://dxy.com/article/leftover-greens-nutrition', type: 'article', platform: '丁香医生', author: '营养科普组', date: '2026-04-22', note: '测了炒青菜隔夜后亚硝酸盐与维生素损失的数据。' }
      ]
    },
    {
      id: 18, cat: 2, title: '菜刀怎么保养才不生锈不卷刃',
      summary: '用完立刻擦干、洗完不要泡水、磨刀保持同一个角度。',
      body: '厨房里最常见的两种报废方式正好相反：菜刀泡在水里会锈，用蛮力斜磨会把刃口磨成波浪。两者都跟「随手」有关。',
      conf: 'normal', reviewed: '2026-08-14', nextReview: null,
      views: 455, favs: 35, useful: 6, notUseful: 1, updatedAt: '2026-09-30',
      tags: ['厨房'],
      points: [
        { s: 'good', t: '洗完立刻擦干', d: '水汽和钢里的残碳一起作用才会生锈，擦干这一步比选什么刀都管用。', a: '所有菜刀' },
        { s: 'bad', t: '别把刀泡在水池里', d: '长时间泡水会在刃口形成锈点，还容易让塑料柄和刀身结合处松动。', a: '洗完还没接着洗菜的时候' },
        { s: 'neutral', t: '磨刀要同一个角度来回磨', d: '磨的时候保持同一个倾角来回走，中途换角度就容易磨出波浪刃。', a: '日常钝化处理' }
      ],
      sources: [
        { pt: [1, 2], t: '不锈钢刀具锈蚀的成因与预防', url: 'https://zhuanlan.zhihu.com/p/knife-rust-prevention', type: 'post', platform: '知乎专栏', author: '厨具维修师', date: '2026-03-08', note: '从钢材与残留水的关系解释了为什么擦干最关键。' },
        { pt: [3], t: '刃口角度与磨刀手法', url: 'https://www.bilibili.com/video/BV1Tk4y1c7pQ', type: 'video', platform: 'B站', author: '厨具评测组', date: '2026-05-16', note: '演示了错误磨刀导致卷刃的过程。' }
      ]
    },
    {
      id: 19, cat: 3, title: '空调滤网自己怎么洗',
      summary: '每年至少两次，取下来清水冲洗、阴干后再装回，别用洗涤剂。',
      body: '空调吹出来的脏，来源基本都在滤网上。滤网堵住后风量下降，机器为了吹出同样的风会提高转速，耗电和噪音一起上来。',
      conf: 'normal', reviewed: '2026-07-30', nextReview: null,
      views: 1288, favs: 156, useful: 24, notUseful: 3, updatedAt: '2026-10-30',
      tags: ['家电养护'],
      points: [
        { s: 'good', t: '拆下来用清水冲', d: '灰尘和絮状物用清水加轻拍就能下来，洗涤剂和洗洁精会伤滤材。', a: '柜式与壁挂式滤网' },
        { s: 'bad', t: '晾干前不要装回去', d: '湿着装回去等于把水闷在机体里，霉味和细菌都是这么来的。', a: '所有需要清洗的滤网' },
        { s: 'neutral', t: '清洗频率看使用强度', d: '每天开八小时以上的机器三个月一次，普通家用半年一次。', a: '空调使用频率高的家庭' }
      ],
      sources: [
        { pt: [1, 3], t: '空调使用与滤网维护指引', url: 'https://www.gov.cn/zhengce/202601/content_7001288.htm', type: 'official', platform: '中国政府网', author: '住房和城乡建设部', date: '2026-01-21', note: '官方指引里给出的滤网清洗周期与操作要求。' },
        { pt: [2], t: '空调滤网清洗演示', url: 'https://www.bilibili.com/video/BV1Lw4y1c7nD', type: 'video', platform: 'B站', author: '家电养护组', date: '2026-06-30', note: '完整演示拆洗与阴干的步骤。' }
      ]
    },
    {
      id: 20, cat: 3, title: '家里换灯泡、换开关怎么算安全',
      summary: '先断总闸、确认断电、再动手；灯座漏电或发烫要请电工。',
      body: '换灯泡看着简单，出事基本都出在「以为关了开关就断电了」这一步。灯座和线路不是自己能改的部分。',
      conf: 'high', reviewed: '2026-06-18', nextReview: null,
      views: 874, favs: 92, useful: 11, notUseful: 2, updatedAt: '2026-09-12',
      tags: ['维修'],
      points: [
        { s: 'good', t: '先断总闸再动手', d: '关墙上的开关只是断了火线，灯座里仍可能带电，断总闸才是真的断电。', a: '所有换灯泡与换开关操作' },
        { s: 'bad', t: '手湿的时候不要碰灯座', d: '潮湿会大幅降低人体电阻，本来安全的一下也可能出事。', a: '洗手后未擦干' },
        { s: 'neutral', t: '灯座发烫或有焦味要请电工', d: '这两种情况说明接线端已经松动或老化，不是换个灯泡能解决的。', a: '换灯泡时发现异常' }
      ],
      sources: [
        { pt: [1, 2], t: '家庭电气安全操作规范', url: 'https://www.mem.gov.cn/gk/yjgl/202602/t20260214_450112.html', type: 'official', platform: '应急管理部', author: '安全生产宣教中心', date: '2026-02-14', note: '明确断电验电与禁止湿手操作的要求。' },
        { pt: [3], t: '常见家庭电气故障排查', url: 'https://zhuanlan.zhihu.com/p/home-electrical-troubleshooting', type: 'post', platform: '知乎专栏', author: '持证电工', date: '2026-04-09', note: '列出灯座松动、发热、异味等该叫师傅的情况。' }
      ]
    },
    {
      id: 21, cat: 4, title: '自驾长途出发前要检查什么',
      summary: '胎压、机油、备胎、玻璃水这四项，出发前一晚做完。',
      body: '长途自驾出问题的案例里，相当一部分不是路上发生的，而是出发前没做那几件小事。绕车一圈花不到五分钟。',
      conf: 'normal', reviewed: '2026-09-05', nextReview: null,
      views: 1502, favs: 187, useful: 22, notUseful: 4, updatedAt: '2026-11-01',
      tags: ['自驾'],
      points: [
        { s: 'good', t: '出发前一晚就把胎压查一遍', d: '冷胎胎压才是标准值，热车测出来的数值偏高，会掩盖慢漏气。', a: '任何长途自驾' },
        { s: 'bad', t: '上高速前没绕车一圈', d: '备胎没装、玻璃水见底、机油盖没拧紧，都是绕车一圈就能发现的。', a: '刚洗完车直接上高速' },
        { s: 'neutral', t: '备胎比等救援靠谱', d: '偏远路段救援可能等几小时，备胎换胎一般十几分钟能搞定。', a: '走国道、山路' }
      ],
      sources: [
        { pt: [1, 3], t: '车辆出行前检查项目与标准', url: 'https://www.mot.gov.cn/jiaotongyaowen/202601/t20260118_390211.html', type: 'official', platform: '交通运输部', author: '安全监督司', date: '2026-01-18', note: '给出了长途出行前的检查清单与胎压口径。' },
        { pt: [2], t: '出发前绕车检查实拍', url: 'https://www.bilibili.com/video/BV1hQ4y1c7wB', type: 'video', platform: 'B站', author: '自驾纪事', date: '2026-05-24', note: '按清单演示了一遍绕车检查。' }
      ]
    },
    {
      id: 22, cat: 4, title: '订酒店怎么订才不踩坑',
      summary: '先在差评里搜「隔音」「前台」「热水」，再决定订哪种房型。',
      body: '酒店差评的价值集中在几个固定问题上，靠关键词筛出来比通读上百条有效得多。',
      conf: 'normal', reviewed: '2026-08-22', nextReview: null,
      views: 1193, favs: 142, useful: 20, notUseful: 5, updatedAt: '2026-10-12',
      tags: ['住宿'],
      points: [
        { s: 'good', t: '差评只搜三个关键词', d: '隔音、前台、热水，这三处是差评最集中的地方，搜出来基本能判断这家靠不靠谱。', a: '任何平台订房' },
        { s: 'bad', t: '只盯着星级和价格挑', d: '同一家店不同房型差别可以很大，靠窗、楼层、朝向决定了实际噪音和视野。', a: '第一次去某个城市' },
        { s: 'neutral', t: '房型差价买的是位置和楼层', d: '差价常常就花在离电梯近不近、朝不朝街、楼层高不高上。', a: '预算有限但想住得方便' }
      ],
      sources: [
        { pt: [1], t: '酒店常见差评问题分布', url: 'https://zhuanlan.zhihu.com/p/hotel-negative-review-keywords', type: 'post', platform: '知乎专栏', author: '差评分析师', date: '2026-02-27', note: '统计了高频差评关键词的分布，说明该优先看哪几项。' },
        { pt: [2, 3], t: '房型差价花在了哪里', url: 'https://www.bilibili.com/video/BV1nZ4y1c7mE', type: 'video', platform: 'B站', author: '旅行体验官', date: '2026-07-09', note: '对比同一家酒店不同房型的实际差别。' }
      ]
    },
    {
      id: 23, cat: 5, title: '睡不着先别急着吃助眠药',
      summary: '固定起床时间比固定睡觉时间更管用，坚持两周没改善再去评估。',
      body: '入睡困难多数不是「睡不着」，而是作息节律乱了。调节节律的杠杆在起床时间，不在躺下的时间。',
      conf: 'high', reviewed: '2026-10-25', nextReview: '2027-04-25',
      views: 2301, favs: 312, useful: 38, notUseful: 6, updatedAt: '2026-11-17',
      tags: ['睡眠'],
      points: [
        { s: 'good', t: '先固定起床时间', d: '起床时间固定了，入睡时间会自己往前挪；反过来只盯着几点睡，往往越躺越清醒。', a: '长期入睡困难' },
        { s: 'bad', t: '周末补觉会把作息推得更乱', d: '周末多睡两小时，等于把生物钟往回拨，周一又要重新熬，等于每天都在倒时差。', a: '工作日睡得少、周末想补回来' },
        { s: 'neutral', t: '躺一小时睡不着就起来', d: '在床上清醒着超过一小时，大脑会把床和焦虑绑定，起身做点无聊的事反而更容易困。', a: '躺在床上翻来覆去的时候' }
      ],
      sources: [
        { pt: [1, 2], t: '睡眠卫生与作息调整建议', url: 'https://www.nhc.gov.cn/jkj/s3585/202603/t20260310_198822.html', type: 'official', platform: '国家卫健委', author: '医政司', date: '2026-03-10', note: '官方给出的作息调整与光照建议。' },
        { pt: [3], t: '失眠认知行为治疗中的刺激控制', url: 'https://dxy.com/article/insomnia-stimulus-control', type: 'article', platform: '丁香医生', author: '睡眠医学组', date: '2026-04-28', note: '解释了「躺床上一小时就起来」这条建议的来源。' }
      ]
    },
    {
      id: 24, cat: 5, title: '感冒药怎么选才不乱吃',
      summary: '看成分不看品牌；复方制剂最容易重复用到同一种成分。',
      body: '感冒药货架上一半是复方制剂，同时吃两种就可能把同一种成分吃双份。',
      conf: 'high', reviewed: '2026-10-08', nextReview: '2027-04-08',
      views: 1764, favs: 245, useful: 29, notUseful: 7, updatedAt: '2026-11-12',
      tags: ['用药常识'],
      points: [
        { s: 'good', t: '先看成分不看品牌', d: '同成分不同品牌只是换了包装，按成分挑更可控。', a: '普通感冒' },
        { s: 'bad', t: '复方感冒药最容易重复成分', d: '很多复方制剂里都含对乙酰氨基酚，再叠加退烧药就容易超量。', a: '同时吃两种感冒药' },
        { s: 'neutral', t: '用药超过三天没好转要看医生', d: '普通感冒多数一周内自愈，持续不缓解要排查流感、肺炎等别的情况。', a: '症状持续三天以上' }
      ],
      sources: [
        { pt: [1, 2], t: '感冒药说明书与成分提示', url: 'https://www.nmpa.gov.cn/xxgk/ggtg/202603/t20260305_330118.html', type: 'official', platform: '国家药监局', author: '药品评价中心', date: '2026-03-05', note: '官方发布的复方制剂成分提示与合理用药提醒。' },
        { pt: [3], t: '感冒与流感的用药分歧', url: 'https://dxy.com/article/cold-vs-flu-medication', type: 'article', platform: '丁香医生', author: '全科医学组', date: '2026-05-19', note: '说明了什么时候该用药、什么时候该就诊。' }
      ]
    },
    {
      id: 25, cat: 6, title: '记账怎么开始才不放弃',
      summary: '先记大额支出和每月固定项，别从每一笔咖啡记起。',
      body: '大部分记账失败不是因为懒，而是颗粒度定得太细。粒度一细，记账就变成一件比花钱还费劲的事。',
      conf: 'normal', reviewed: '2026-07-15', nextReview: null,
      views: 1420, favs: 198, useful: 27, notUseful: 3, updatedAt: '2026-10-06',
      tags: ['记账'],
      points: [
        { s: 'good', t: '先记大额和每月固定项', d: '房租、房贷、订阅、保洁这些大额项决定了支出结构，先把这几项记准就已经能看出问题。', a: '刚开始记账' },
        { s: 'bad', t: '一开始就记每一笔小额', d: '一天几十笔的记录量很快就压垮坚持，记录本身变成了负担。', a: '没记过账的人' },
        { s: 'neutral', t: '月底对一次账就够', d: '不必天天打开记账软件，月末统一核对一次，数据照样够用。', a: '不想天天记的人' }
      ],
      sources: [
        { pt: [1, 3], t: '个人记账的颗粒度选择', url: 'https://zhuanlan.zhihu.com/p/personal-budget-granularity', type: 'post', platform: '知乎专栏', author: '财务规划师', date: '2026-01-20', note: '分析了不同记账颗粒度对应的坚持时长。' },
        { pt: [2], t: '为什么记账容易半途而废', url: 'https://www.bilibili.com/video/BV1pK4y1c7sF', type: 'video', platform: 'B站', author: '个人财务频道', date: '2026-04-15', note: '复盘了几种记账方式的失败原因。' }
      ]
    },
    {
      id: 26, cat: 6, title: '医疗险怎么挑才不白花钱',
      summary: '先看能不能保证续保、再看免赔额，最后才比价格。',
      body: '医疗险的产品差异主要在续保条件上，不在保费上。只比保费很容易买到第二年不能续的产品。',
      conf: 'normal', reviewed: '2026-09-28', nextReview: '2027-03-28',
      views: 1688, favs: 231, useful: 26, notUseful: 9, updatedAt: '2026-11-03',
      tags: ['保险'],
      points: [
        { s: 'good', t: '先看能不能保证续保', d: '保证续保年限决定了生病那年还能不能继续报销，比保费高低重要得多。', a: '超过一年期的产品' },
        { s: 'bad', t: '只比保费不看免赔额', d: '免赔额一万和一万五的差别，在实际报销时可能远大于保费差额。', a: '纠结哪款便宜的时候' },
        { s: 'neutral', t: '健康告知如实填', d: '健康告知有问必答，隐瞒可能影响后续理赔；如实告知后被拒保也是有效结论。', a: '有慢性病或体检异常' }
      ],
      sources: [
        { pt: [1, 3], t: '医疗保险产品的续保与理赔规则说明', url: 'https://www.nfra.gov.cn/view/pages/ItemDetail.html?docId=1190663', type: 'official', platform: '金融监管总局', author: '保险监管局', date: '2026-03-16', note: '监管口径下关于续保条件与健康告知的要求。' },
        { pt: [2], t: '医疗险免赔额对实际报销的影响', url: 'https://dxy.com/article/medical-insurance-deductible', type: 'article', platform: '丁香医生', author: '保障科普组', date: '2026-06-11', note: '用几个理赔案例算清免赔额的实际影响。' }
      ]
    },
    {
      id: 27, cat: 7, title: '网购质量问题怎么投诉才有用',
      summary: '先找商家并留证据，平台介入要带截图和照片，小额不值得走完全流程。',
      body: '投诉能不能成立，关键在证据链：谁在什么时候说了什么、东西是什么样的。',
      conf: 'high', reviewed: '2026-10-02', nextReview: '2027-04-02',
      views: 2107, favs: 268, useful: 31, notUseful: 3, updatedAt: '2026-11-10',
      tags: ['投诉'],
      points: [
        { s: 'good', t: '先找商家并留证据', d: '平台介入时能提供订单页、与商家的沟通记录和实物照片，处理速度明显更快。', a: '任何网购纠纷' },
        { s: 'bad', t: '只口头描述不拍照', d: '商品与描述不符这类问题，没有照片就没有「不符」的依据。', a: '商品存在外观或功能问题' },
        { s: 'neutral', t: '小额不值得走完流程', d: '几十元的商品走完投诉流程的时间成本远超商品本身，平台退款更快。', a: '争议金额很小的时候' }
      ],
      sources: [
        { pt: [1, 2], t: '网络交易投诉举报处理流程', url: 'https://www.12315.cn/help/faq-4522.html', type: 'official', platform: '12315', author: '消费维权平台', date: '2026-03-08', note: '官方流程里对证据材料的要求。' },
        { pt: [3], t: '投诉处理的时限与成本', url: 'https://zhuanlan.zhihu.com/p/online-complaint-cost', type: 'post', platform: '知乎专栏', author: '消费者权益研究者', date: '2026-05-06', note: '按争议金额给出了一条实用的分流建议。' }
      ]
    },
    {
      id: 28, cat: 8, title: '怎么拒绝临时加的活',
      summary: '不说「我不行」，改成确认优先级，并给出一个你能兑现的时间点。',
      body: '拒绝之所以难，是因为它被当成了态度问题。把它换成优先级问题，就变成了一个可以讨论的技术问题。',
      conf: 'normal', reviewed: '2026-09-12', nextReview: null,
      views: 1875, favs: 256, useful: 34, notUseful: 2, updatedAt: '2026-10-28',
      tags: ['职场'],
      points: [
        { s: 'good', t: '把拒绝换成优先级确认', d: '「这件事和手头这单哪个更急」把决定权交回给对方，你没有说不行，只是说了顺序。', a: '任务明显超出本职范围' },
        { s: 'bad', t: '直接说「不行」最容易起冲突', d: '否定的是人而不是安排，对方只能从态度上回应，矛盾就升级了。', a: '对方是你的直属上级' },
        { s: 'neutral', t: '给一个你能兑现的时间', d: '「我周三下午交」比「我尽快」更有说服力，对方也好安排后面的事。', a: '确实需要帮忙但排不开' }
      ],
      sources: [
        { pt: [1, 2], t: '职场任务优先级沟通方式', url: 'https://zhuanlan.zhihu.com/p/workload-priority-communication', type: 'post', platform: '知乎专栏', author: '组织沟通顾问', date: '2026-02-19', note: '对比了直接拒绝与优先级确认两种说法的后果。' },
        { pt: [3], t: '向上沟通的三句话结构', url: 'https://www.bilibili.com/video/BV1rY4y1c7wR', type: 'video', platform: 'B站', author: '职场沟通频道', date: '2026-06-12', note: '演示了在拒绝时给出可兑现时间点的表达。' }
      ]
    },
    {
      id: 29, cat: 8, title: '被当面否定时怎么接',
      summary: '先确认对方在否定哪一部分，再决定要不要解释。',
      body: '被否定的一瞬间最容易做的事是立刻辩解或全盘接受，这两个反应都跳过了「搞清楚对方在说什么」这一步。',
      conf: 'normal', reviewed: '2026-08-30', nextReview: null,
      views: 1633, favs: 229, useful: 30, notUseful: 1, updatedAt: '2026-10-08',
      tags: ['情绪'],
      points: [
        { s: 'good', t: '先问「你主要在意哪一点」', d: '被否定的原因往往和你以为的不一样，问清楚再回应，效率比马上解释高得多。', a: '会议上方案被否' },
        { s: 'bad', t: '当场全盘否定或全盘接受', d: '前者把一次针对具体点的意见变成对你的否定，后者可能接受一个本来就不该接受的东西。', a: '被否得很突然的时候' },
        { s: 'neutral', t: '重要的否定要留下记录', d: '涉及交付标准的否定，会后用一句话复述确认，既是尊重对方也保护自己。', a: '涉及工作交付标准' }
      ],
      sources: [
        { pt: [1, 3], t: '被否定时的回应与情绪管理', url: 'https://dxy.com/article/responding-to-criticism', type: 'article', platform: '丁香医生', author: '心理健康组', date: '2026-03-22', note: '解释了先确认再回应的两步做法。' },
        { pt: [2], t: '职场中如何承接负面反馈', url: 'https://zhuanlan.zhihu.com/p/handling-negative-feedback-at-work', type: 'post', platform: '知乎专栏', author: '前团队负责人', date: '2026-05-27', note: '用具体场景说明两种反应各自的风险。' }
      ]
    },
    {
      id: 30, cat: 9, title: '笔记记了不看，等于没记',
      summary: '按「以后会用到的场景」分类，不要按主题分类。',
      body: '笔记不产生价值，检索出来并且真的用上才产生价值。分类方式直接决定了将来能不能找得到。',
      conf: 'normal', reviewed: '2026-10-06', nextReview: null,
      views: 1428, favs: 264, useful: 33, notUseful: 2, updatedAt: '2026-11-08',
      tags: ['笔记方法'],
      points: [
        { s: 'good', t: '按使用场景建目录', d: '「以后要在什么场合用」而不是「这属于哪个领域」，前者能直接对应到具体任务。', a: '刚开始整理旧笔记' },
        { s: 'bad', t: '按主题分类越分越乱', d: '主题之间互相嵌套，收藏夹里几十个主题，最后一条都找不到。', a: '收藏夹已经堆到几十个目录' },
        { s: 'neutral', t: '每条笔记写成能直接用的句子', d: '「用得上的一句结论」比一整段摘抄更容易被复用。', a: '想留下操作步骤或结论' }
      ],
      sources: [
        { pt: [1, 3], t: '个人知识库的场景化分类实践', url: 'https://www.bilibili.com/video/BV1ka4y1c7nK', type: 'video', platform: 'B站', author: '知识管理实践者', date: '2026-04-02', note: '演示了从主题分类改成场景分类后的检索差别。' },
        { pt: [2], t: '为什么按主题分类会失效', url: 'https://zhuanlan.zhihu.com/p/why-topic-based-notes-fail', type: 'post', platform: '知乎专栏', author: '信息架构师', date: '2026-06-25', note: '从分类树的角度分析了主题分类越分越乱的原因。' }
      ]
    },
    {
      id: 31, cat: 9, title: '文件批量改名怎么不搞乱',
      summary: '先在副本上试规则、文件名里留序号占位、原始目录先备份。',
      body: '批量改名最贵的不是时间，是改完之后发现规则不是你想要的，而文件已经找不到原来的名字了。',
      conf: 'normal', reviewed: '2026-09-19', nextReview: null,
      views: 986, favs: 141, useful: 19, notUseful: 2, updatedAt: '2026-10-22',
      tags: ['自动化'],
      points: [
        { s: 'good', t: '先拿一份副本试规则', d: '在几十个文件的副本上跑一遍，确认结果符合预期再对全量执行。', a: '第一次使用改名脚本' },
        { s: 'bad', t: '规则写完直接跑整个目录', d: '出错的代价是整个目录的文件名都变了，回收站里未必找得回来。', a: '目录里有成千上万个文件' },
        { s: 'neutral', t: '文件名里留序号占位', d: '用 001、002 这样的序号占位，排序永远稳定，补文件时也不会乱。', a: '需要按顺序归档' }
      ],
      sources: [
        { pt: [1, 3], t: '批量改名的安全操作流程', url: 'https://zhuanlan.zhihu.com/p/safe-batch-rename-workflow', type: 'post', platform: '知乎专栏', author: '运维工程师', date: '2026-01-27', note: '给出先副本试跑再全量的标准流程。' },
        { pt: [2], t: '一次改错几千个文件名的复盘', url: 'https://www.bilibili.com/video/BV1yc4y1c7qP', type: 'video', platform: 'B站', author: '效率工具党', date: '2026-05-15', note: '真实案例复盘，说明为什么要留备份。' }
      ]
    },
    {
      id: 32, cat: 9, title: '密码怎么管才安全又不至于自己忘',
      summary: '一个主密码加一个密码管理器，别用同一个密码改数字。',
      body: '安全性和管理成本是一对需要权衡的东西。方案太好记就容易被猜，方案太复杂就会有人退回老办法。',
      conf: 'high', reviewed: '2026-09-30', nextReview: '2027-03-30',
      views: 1742, favs: 268, useful: 28, notUseful: 4, updatedAt: '2026-11-14',
      tags: ['工具'],
      points: [
        { s: 'good', t: '每个网站用独立密码', d: '一个站点的密码泄露不会波及其他站点，这是密码管理器最有价值的地方。', a: '账号多起来之后' },
        { s: 'bad', t: '同一套密码改个数字到处用', d: '撞库会拿已知账号密码去试，规律一旦被识别，几十个账号一起沦陷。', a: '图省事的时候' },
        { s: 'neutral', t: '主密码要能背下来', d: '主密码记不住就等于把全部密码的钥匙交给了别人，宁可多练几遍。', a: '选密码管理器的时候' }
      ],
      sources: [
        { pt: [1, 3], t: '个人密码管理建议', url: 'https://www.cert.org.cn/publish/main/46/202603/t20260312_880112.html', type: 'official', platform: '国家互联网应急中心', author: '网络安全应急处', date: '2026-03-12', note: '给出了主密码与密码库的管理口径。' },
        { pt: [2], t: '撞库与密码复用风险', url: 'https://dxy.com/article/credential-stuffing-risk', type: 'article', platform: '丁香医生', author: '信息安全科普组', date: '2026-07-02', note: '用真实泄露数据集说明密码复用的连带风险。' }
      ]
    },
    /* 草稿：读者侧看不到，只在管理端出现。草稿不放依据是常态 ——
       发出去之前要把依据补齐（设计文档 §4.1 的发布流程） */
    {
      id: 15, cat: 3, status: 'draft', title: '干洗机真的能省事吗',
      summary: '初步结论还没定稿，依据也还没找齐。',
      body: '',
      conf: 'normal', reviewed: '2026-11-18', nextReview: null,
      views: 0, favs: 0, useful: 0, notUseful: 0, updatedAt: '2026-11-18',
      tags: ['清洁'],
      points: [
        { s: 'neutral', t: '看整机重量和悬挂结构', d: '干洗机的差别主要在滚筒结构和洗涤剂量，选之前先量清楚放得下放不下。', a: '第一次买' }
      ],
      sources: []
    },
    {
      id: 16, cat: 2, status: 'draft', title: '空气炸锅到底值不值',
      summary: '结论还没想好，先把几条要点记下来。',
      body: '',
      conf: 'normal', reviewed: '2026-11-18', nextReview: null,
      views: 0, favs: 0, useful: 0, notUseful: 0, updatedAt: '2026-11-18',
      tags: ['厨房'],
      points: [
        { s: 'neutral', t: '先看容量够不够一顿的量', d: '小容量一次装不满，大容量用一次洗很久。', a: '一两个人吃' }
      ],
      sources: []
    }
  ];

  /* ---------- 反馈（仅管理员可见） ----------
     kind 只有内容层面的几类：纠错 / 补充说明 / 提问 / 建议。
     「有用 / 没用」不属于反馈 —— 那是投票（votes），一键无文字，
     两个口径混在一起会导致同一条意见被记两次（设计文档 §2.3 / §6.2）。 */
  /* 图片占位：原型里不真的存图，用一张按序号换色的矢量图占位。
     够看出「已通过 / 审核中 / 未通过」三种状态的区别（设计文档 §9.4）。 */
  function imgUri (i) {
    var hues = [['#f2ddb0', '#d8b981'], ['#d3e4da', '#a9c9b8'], ['#ded5ea', '#b6a9cf'], ['#f4d3c6', '#d9a992']];
    var h = hues[((i % hues.length) + hues.length) % hues.length];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
      '<rect width="120" height="120" fill="' + h[0] + '"/>' +
      '<circle cx="40" cy="42" r="13" fill="' + h[1] + '"/>' +
      '<path d="M10 106 L44 64 L68 90 L86 72 L110 106 Z" fill="' + h[1] + '"/>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var FEEDBACKS = [
    { id: 1, targetType: 'experience', targetId: 1, kind: 'correction', content: '我油头用了两年高硅洗发水，也没觉得更难洗。是不是要看具体配方？', status: 'pending', reply: '', createdAt: '2026-11-17', author: '匿名用户 0f2a', openid: 'demo-user',
      images: [{ id: 101, uri: imgUri(0), name: '洗发水成分表截图' }], mediaStatus: 'checking' },
    { id: 2, targetType: 'experience', targetId: 11, kind: 'correction', content: '邮政局的说法改了，现在丢件必须先在 APP 上报案生成工单，纸质证明已经没有出了。', status: 'accepted', reply: '已核实并更新第 1 条要点，补充了 APP 报案入口。', createdAt: '2026-11-15', repliedAt: '2026-11-16', author: '匿名用户 91bd', openid: 'demo-user-b',
      images: [], mediaStatus: 'none' },
    { id: 3, targetType: 'experience', targetId: 10, kind: 'question', content: '照着说的看了箭头安心多了。不过还想问一句：如果同一个指标连续两次都偏高，是不是就得去挂专科门诊了？', status: 'accepted', reply: '连续两次异常建议挂对应科室的普通门诊，带上报告单就行，不用挂急诊。', repliedAt: '2026-11-19', createdAt: '2026-11-12', author: '匿名用户 3c07', openid: 'demo-user',
      images: [{ id: 301, uri: imgUri(1), name: '体检报告截图' }], mediaStatus: 'passed' },
    { id: 4, targetType: 'project', targetId: null, kind: 'suggestion', content: '希望能加一个「常见误会的对照表」，比如「无硅油=温和」这种。', status: 'pending', reply: '', createdAt: '2026-11-18', author: '匿名用户 5e21', openid: 'demo-user-c',
      images: [], mediaStatus: 'none' },
    { id: 5, targetType: 'experience', targetId: 13, kind: 'question', content: '年付会员按天折算退款，平台只按整月折算，这算合理吗？', status: 'replied', reply: '按整月折算确实不合理，我们记下了，等平台有明确说法再来更新这条。', repliedAt: '2026-11-19', createdAt: '2026-11-18', author: '匿名用户 77aa', openid: 'demo-user-d',
      images: [], mediaStatus: 'none' },
    /* 一条「不采纳」的：反馈盒的「已忽略」筛选项得真有东西可筛，
       否则那个筛选入口永远是空的，看着像功能没做完 */
    { id: 6, targetType: 'experience', targetId: 4, kind: 'correction', content: '我家用的就是同一瓶洗手液和沐浴露，没觉得有问题，这条是不是太绝对了？', status: 'ignored', reply: '你说得对，这条的结论写得太满，我改成「分开用更省」而不是「一定要分开」。', repliedAt: '2026-11-19', createdAt: '2026-11-18', author: '匿名用户 2c8f', openid: 'demo-user-e',
      images: [{ id: 601, uri: imgUri(2), name: '商品页截图' }], mediaStatus: 'rejected' },
    /* 「图片没过审 ≠ 整条反馈作废」：这条的文字照常走完处理流程，
       只是图片不展示 —— 用户侧能看到「我的反馈」里这条还在，管理员也能回复。 */
    { id: 7, targetType: 'experience', targetId: 4, kind: 'correction', content: '这瓶洗手液我用了三个月，泵头已经开始渗水了，是不是批次问题？', status: 'pending', reply: '', createdAt: '2026-11-19', author: '匿名用户 6f0c', openid: 'demo-user',
      images: [{ id: 701, uri: imgUri(3), name: '泵头渗水照片' }], mediaStatus: 'rejected' }
  ];

  var USER = { openid: 'demo', nickname: '生活经验库管理员', role: 'admin', avatarText: '管' };

  /* 普通用户视角：同一份内容，只是不给管理入口（设计文档 §9.2 前端权限渲染） */
  var USER_NORMAL = {
    openid: 'demo-user', nickname: '周小满', role: 'user', avatarText: '周'
  };
  var USERS = { admin: USER, user: USER_NORMAL };

  /* 管理端统计不写死：全部由下面的 build() 从数据派生。
     「要点 / 依据」只统计已发布经验 —— 草稿里的半成品不该算进内容体量。 */
  var NEED_REVIEW_CATS = [5, 6, 7]; /* 健康 / 钱财 / 办事维权：设计文档 §13.1 要求必填下次确认日期 */

  /* ---------- 搜索演示结果 ---------- */
  /* 搜索演示结果。
     上一版只放了 3 条、全在「买买买」一个领域 —— 搜索页加了 9 个领域筛选之后，
     点其余 8 个全是空态，看起来像筛选坏了。这里扩到 7 个领域，
     让每个有内容的领域都能筛出东西来（技能效率本来就没有经验，空着是对的）。 */
  var SEARCH_DEMO = {
    query: '怎么挑才不踩坑',
    mode: 'hybrid',
    tookMs: 128,
    items: [
      { expId: 1, score: 0.0312, matchedOn: ['point:二甲基硅油', 'vector'], hit: '命中要点：二甲基硅油' },
      { expId: 3, score: 0.0241, matchedOn: ['vector'], hit: '语义相近：婴童适用性' },
      { expId: 4, score: 0.0193, matchedOn: ['point:表活', 'keyword'], hit: '命中要点：表活' },
      { expId: 10, score: 0.0186, matchedOn: ['vector'], hit: '语义相近：先看箭头再看数值' },
      { expId: 11, score: 0.0172, matchedOn: ['keyword'], hit: '命中要点：先出丢失证明' },
      { expId: 13, score: 0.0154, matchedOn: ['vector'], hit: '语义相近：先关自动续费' },
      { expId: 7, score: 0.0141, matchedOn: ['keyword'], hit: '命中要点：闭水试验' },
      { expId: 5, score: 0.0129, matchedOn: ['vector'], hit: '语义相近：生熟分格' },
      { expId: 9, score: 0.0117, matchedOn: ['keyword'], hit: '命中要点：先对齐总时长' },
      { expId: 14, score: 0.0103, matchedOn: ['vector'], hit: '语义相近：先复述对方的担心' },
      { expId: 30, score: 0.0096, matchedOn: ['vector'], hit: '语义相近：按场景建目录' },
      { expId: 26, score: 0.0089, matchedOn: ['keyword'], hit: '命中要点：保证续保' },
      { expId: 21, score: 0.0081, matchedOn: ['vector'], hit: '语义相近：出发前绕车检查' },
      { expId: 32, score: 0.0074, matchedOn: ['keyword'], hit: '命中要点：主密码要能背下来' },
      { expId: 24, score: 0.0068, matchedOn: ['keyword'], hit: '命中要点：先看成分不看品牌' },
      { expId: 22, score: 0.0061, matchedOn: ['vector'], hit: '语义相近：差评搜关键词' },
      { expId: 17, score: 0.0055, matchedOn: ['vector'], hit: '语义相近：剩菜摊开放凉' },
      { expId: 19, score: 0.0049, matchedOn: ['keyword'], hit: '命中要点：晾干前不要装回去' }
    ]
  };

  /* ---------- 构造与查询辅助 ---------- */
  function build () {
    var tagById = {};
    TAGS.forEach(function (t) { tagById[t.id] = t; });
    EXPERIENCES.forEach(function (e) {
      if (!e.status) e.status = 'published';
      /* 搜索关键词：写作时顺手填，不填就退化成空数组（不影响任何展示） */
      e.keywords = (e.keywords || []).slice(0, 3);
      e.points.forEach(function (p, i) {
        p.id = e.id * 100 + (i + 1);
        p.experienceId = e.id;
      });
      e.sources.forEach(function (s, i) {
        s.id = e.id * 1000 + (i + 1);
        s.experienceId = e.id;
        s.pointIds = s.pt.map(function (n) { return e.points[n - 1].id; });
        delete s.pt;
      });
      /* 标签按 (领域, 名称) 定位：同名标签允许分属不同领域（「清洁」在买买买与住家各有一条），
         所以先在经验自己的领域里找，找不到再退回全局同名匹配。 */
      e.tagIds = e.tags.map(function (name) {
        var i, j;
        for (i = 0; i < TAGS.length; i++) {
          if (TAGS[i].name === name && TAGS[i].cat === e.cat) return TAGS[i].id;
        }
        for (j = 0; j < TAGS.length; j++) {
          if (TAGS[j].name === name) return TAGS[j].id;
        }
        return 0;
      });
    });
    return {
      categories: CATEGORIES, tags: TAGS, tagById: tagById,
      experiences: EXPERIENCES, feedbacks: FEEDBACKS, user: USER,
      searchDemo: SEARCH_DEMO, stance: STANCE
    };
  }

  var F = build();
  F.imgUri = imgUri;

  /* 管理端统计：每次读取都重新从数据派生。
     原先是启动时算一次的快照 —— 管理员在原型里发布一条经验，
     指标数字还是旧的，看着像没生效。 */
  F.stats = function () {
    var published = EXPERIENCES.filter(function (e) { return e.status === 'published'; });
    return {
      experiences: EXPERIENCES.length,
      published: published.length,
      drafts: EXPERIENCES.length - published.length,
      points: published.reduce(function (s, e) { return s + e.points.length; }, 0),
      sources: published.reduce(function (s, e) { return s + e.sources.length; }, 0),
      tags: TAGS.length,
      pendingFeedback: FEEDBACKS.filter(function (f) { return f.status === 'pending'; }).length,
      /* 待确认：健康 / 钱财 / 维权类必须有「下次确认」日期，缺了就是待办 */
      needReview: published.filter(function (e) {
        return NEED_REVIEW_CATS.indexOf(e.cat) >= 0 && !e.nextReview;
      }).length,
      /* 来源信息待补：依据缺作者或平台，溯源页上的信息就不完整 */
      sourceMetaGap: EXPERIENCES.reduce(function (s, e) {
        return s + e.sources.filter(function (src) { return !src.author || !src.platform; }).length;
      }, 0)
    };
  };
  /* 旧写法 LB.adminStats.xxx 继续可用 —— 换成实时取值，不是快照 */
  Object.defineProperty(F, 'adminStats', {
    get: function () { return F.stats(); }
  });

  /* ---------- 身份视角：管理员 / 普通用户 ---------- */
  F.userFor = function (role) {
    return role === 'user' ? USERS.user : USERS.admin;
  };
  /* 普通用户只看得到自己提交过的反馈（设计文档 §3.2「仅自己可见」）。
     按 openid 取，不用 id 白名单 —— 新提交的那条能自然出现在「我的反馈」里。 */
  F.feedbacksFor = function (role) {
    if (role !== 'user') return FEEDBACKS;
    return FEEDBACKS.filter(function (f) {
      return f.openid === USER_NORMAL.openid;
    });
  };
  /* 我寄出去的（进「我的反馈」页），和「我收到的」不是一个数 */
  F.myFeedbacks = function (role) {
    /* 管理员不提交反馈：内容都是他自己写的，有问题直接改 */
    if (role !== 'user') return [];
    return F.feedbacksFor('user');
  };

  /* 演示数据的「今天」固定在设计文档日期，避免原型每次打开相对时间都在变 */
  F.today = '2026-11-19';
  /* 相对时间：< 7 天说「N 天前」，< 30 天说「N 周前」，再往后说「N 个月前」 */
  F.ago = function (dateStr) {
    if (!dateStr) return '';
    var days = Math.round((Date.parse(F.today) - Date.parse(dateStr)) / 86400000);
    if (days <= 0) return '今天';
    if (days < 7) return days + ' 天前';
    if (days < 30) return Math.round(days / 7) + ' 周前';
    return Math.round(days / 30) + ' 个月前';
  };

  /* 读者侧只看已发布；管理端传 includeDraft 才把草稿算进来 */
  F.published = function () {
    return EXPERIENCES.filter(function (e) { return e.status === 'published'; });
  };
  F.drafts = function () {
    return EXPERIENCES.filter(function (e) { return e.status === 'draft'; });
  };
  /* 来源类型、反馈类型的中文口径（界面里不出现英文枚举） */
  F.sourceTypeLabel = {
    article: '文章', video: '视频', post: '帖子', official: '官方', paper: '论文', review: '评测'
  };
  F.feedbackKindLabel = {
    correction: '纠错', supplement: '补充说明', question: '提问', suggestion: '建议'
  };
  /* 相关经验：同领域优先，标签重叠次之（设计文档 §8.1 的 /related 接口） */
  F.relatedOf = function (expId, limit) {
    var e = F.expById(expId);
    if (!e) return [];
    var same = F.published().filter(function (x) {
      return x.id !== e.id && x.cat === e.cat;
    });
    var overlap = F.published().filter(function (x) {
      if (x.id === e.id || x.cat === e.cat) return false;
      return x.tags.some(function (t) { return e.tags.indexOf(t) >= 0; });
    });
    return same.concat(overlap).slice(0, limit || 3);
  };
  F.catById = function (id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  };
  F.expById = function (id) {
    for (var i = 0; i < EXPERIENCES.length; i++) if (EXPERIENCES[i].id === id) return EXPERIENCES[i];
    return null;
  };
  F.tagsOf = function (catId) {
    return TAGS.filter(function (t) { return t.cat === catId; });
  };
  F.expsOfCat = function (catId, includeDraft) {
    return EXPERIENCES.filter(function (e) {
      if (e.cat !== catId) return false;
      if (includeDraft) return true;
      return e.status === 'published';
    });
  };
  F.sourcesOfExp = function (expId) {
    var e = F.expById(expId);
    return e ? e.sources : [];
  };
  F.pointsOfSource = function (src) {
    var e = F.expById(src.experienceId);
    return src.pointIds.map(function (pid) {
      for (var i = 0; i < e.points.length; i++) if (e.points[i].id === pid) return e.points[i];
      return null;
    }).filter(Boolean);
  };

  /* ---------- 图标（24×24，stroke 风格，各方向可再着色/变形） ---------- */
  var ICON = {
    bag:    '<path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
    bowl:   '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 7c0-1.4 1-1.8 1-3"/><path d="M13 7c0-2 1-2.4 1-3.6"/>',
    house:  '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    plane:  '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
    heart:  '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/>',
    wallet: '<path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M16 12h5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z"/>',
    chat:   '<path d="M4 5h16v11H9l-5 4V5z"/>',
    tools:  '<path d="M14.5 6.5a4 4 0 0 1 5 5L9 22l-7-7z"/><path d="M6 9l3 3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/>',
    star:   '<path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6L3.2 9.6l6.1-.9z"/>',
    share:  '<path d="M4 12v7h16v-7"/><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/>',
    chevron:'<path d="M9 6l6 6-6 6"/>',
    back:   '<path d="M15 6l-6 6 6 6"/>',
    filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
    check:  '<path d="M5 13l4 4L19 7"/>',
    clock:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    warn:   '<path d="M12 3.5l9 16.5H3z"/><path d="M12 10v4.2"/><path d="M12 17.3h.01"/>',
    link:   '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.2"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.2"/>',
    inbox:  '<path d="M4 13h4l1.2 3h5.6L16 13h4"/><path d="M4 13l2-7h12l2 7v6H4z"/>',
    edit:   '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    plus:   '<path d="M12 5v14"/><path d="M5 12h14"/>',
    external:'<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    bookmark:'<path d="M6 4h12v16l-6-4-6 4z"/>',
    grid:   '<path d="M4 4h7v7H4z"/><path d="M13 4h7v7h-7z"/><path d="M4 13h7v7H4z"/><path d="M13 13h7v7h-7z"/>',
    close:  '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    down:   '<path d="M6 9l6 6 6-6"/>',
    thumbsup:'<path d="M7 11v9H4v-9z"/><path d="M7 11l4-8a2 2 0 0 1 2 2v5h5a2 2 0 0 1 2 2.4l-1 5A2 2 0 0 1 17 20H7z"/>',
    thumbdown:'<path d="M17 13V4h3v9z"/><path d="M17 13l-4 8a2 2 0 0 1-2-2v-5H6a2 2 0 0 1-2-2.4l1-5A2 2 0 0 1 7 4h10z"/>',
    list:   '<path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    doc:    '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    user:   '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>'
  };

  F.ICON = ICON;
  F.icon = function (name, cls) {
    var body = ICON[name] || '';
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };
  F.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  /* 来源链接只显示域名：完整 URL 在 375px 宽下要占两行，挤掉别的信息；
     想看完整地址有「复制链接」，复制出来就是完整的。 */
  F.host = function (url) {
    var s = String(url || '');
    var m = s.match(/^https?:\/\/([^\/]+)/i);
    return m ? m[1] : s;
  };
  /* 命中词高亮：先转义再包 <mark>，顺序反了会把标签也转义掉。 */
  F.hl = function (text, terms) {
    var out = F.esc(text);
    var list = (terms || []).filter(function (t) { return t && t.length > 1; });
    list.sort(function (a, b) { return b.length - a.length; });
    list.forEach(function (t) {
      var safe = F.esc(t);
      var re = new RegExp(safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      out = out.replace(re, function (m) { return '<mark>' + m + '</mark>'; });
    });
    return out;
  };

  global.LB = F;
})(window);
