-- 种子数据（由 scripts/gen-seed-sql.mjs 生成，请勿手改）
-- 来源：data/categories.json、data/experiences.json、data/feedbacks.json
-- 生成时间：2026-11-23T09:32:20.939Z
BEGIN;

-- 领域
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (1, 'shopping', '买买买', 'bag', '洗护、家电、数码、服饰、食品、母婴、清洁、宠物', 1);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (2, 'food', '吃喝', 'bowl', '外食、做饭、饮品、食材储存、厨房', 2);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (3, 'home', '住家', 'house', '清洁、收纳、装修、维修、家电养护', 3);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (4, 'travel', '出行', 'plane', '通勤、机票火车、自驾、住宿、打包', 4);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (5, 'health', '健康', 'heart', '睡眠、饮食、体检、用药常识、运动', 5);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (6, 'money', '钱财', 'wallet', '记账、砍订阅、保险、理财常识、退款', 6);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (7, 'rights', '办事维权', 'shield', '投诉、快递、合同、社保、网购纠纷', 7);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (8, 'mind', '人际心态', 'chat', '沟通、边界、职场、情绪', 8);
INSERT INTO categories (id, slug, name, icon, description, sort_order) VALUES (9, 'skill', '技能效率', 'tools', '工具、自动化、笔记、方法', 9);

-- 标签
INSERT INTO tags (id, category_id, slug, name) VALUES (1, 1, 'tag-1', '洗护');
INSERT INTO tags (id, category_id, slug, name) VALUES (2, 1, 'tag-2', '成分');
INSERT INTO tags (id, category_id, slug, name) VALUES (3, 1, 'tag-3', '数码');
INSERT INTO tags (id, category_id, slug, name) VALUES (4, 1, 'tag-4', '母婴');
INSERT INTO tags (id, category_id, slug, name) VALUES (5, 1, 'tag-5', '清洁');
INSERT INTO tags (id, category_id, slug, name) VALUES (6, 1, 'tag-6', '家电');
INSERT INTO tags (id, category_id, slug, name) VALUES (7, 2, 'tag-7', '食材储存');
INSERT INTO tags (id, category_id, slug, name) VALUES (8, 2, 'tag-8', '外食');
INSERT INTO tags (id, category_id, slug, name) VALUES (9, 2, 'tag-9', '厨房');
INSERT INTO tags (id, category_id, slug, name) VALUES (10, 3, 'tag-10', '收纳');
INSERT INTO tags (id, category_id, slug, name) VALUES (11, 3, 'tag-11', '装修');
INSERT INTO tags (id, category_id, slug, name) VALUES (12, 3, 'tag-12', '家电养护');
INSERT INTO tags (id, category_id, slug, name) VALUES (13, 4, 'tag-13', '机票火车');
INSERT INTO tags (id, category_id, slug, name) VALUES (14, 4, 'tag-14', '通勤');
INSERT INTO tags (id, category_id, slug, name) VALUES (15, 5, 'tag-15', '睡眠');
INSERT INTO tags (id, category_id, slug, name) VALUES (16, 5, 'tag-16', '体检');
INSERT INTO tags (id, category_id, slug, name) VALUES (17, 5, 'tag-17', '用药常识');
INSERT INTO tags (id, category_id, slug, name) VALUES (18, 6, 'tag-18', '记账');
INSERT INTO tags (id, category_id, slug, name) VALUES (19, 6, 'tag-19', '砍订阅');
INSERT INTO tags (id, category_id, slug, name) VALUES (20, 6, 'tag-20', '保险');
INSERT INTO tags (id, category_id, slug, name) VALUES (21, 7, 'tag-21', '快递');
INSERT INTO tags (id, category_id, slug, name) VALUES (22, 7, 'tag-22', '合同');
INSERT INTO tags (id, category_id, slug, name) VALUES (23, 7, 'tag-23', '投诉');
INSERT INTO tags (id, category_id, slug, name) VALUES (24, 8, 'tag-24', '沟通');
INSERT INTO tags (id, category_id, slug, name) VALUES (25, 8, 'tag-25', '边界');
INSERT INTO tags (id, category_id, slug, name) VALUES (26, 8, 'tag-26', '情绪');
INSERT INTO tags (id, category_id, slug, name) VALUES (27, 9, 'tag-27', '工具');
INSERT INTO tags (id, category_id, slug, name) VALUES (28, 9, 'tag-28', '自动化');
INSERT INTO tags (id, category_id, slug, name) VALUES (29, 9, 'tag-29', '笔记方法');
INSERT INTO tags (id, category_id, slug, name) VALUES (30, 3, 'tag-30', '清洁');
INSERT INTO tags (id, category_id, slug, name) VALUES (31, 2, 'tag-31', '做饭');
INSERT INTO tags (id, category_id, slug, name) VALUES (32, 3, 'tag-32', '维修');
INSERT INTO tags (id, category_id, slug, name) VALUES (33, 4, 'tag-33', '自驾');
INSERT INTO tags (id, category_id, slug, name) VALUES (34, 4, 'tag-34', '住宿');
INSERT INTO tags (id, category_id, slug, name) VALUES (35, 5, 'tag-35', '运动');
INSERT INTO tags (id, category_id, slug, name) VALUES (36, 5, 'tag-36', '饮食常识');
INSERT INTO tags (id, category_id, slug, name) VALUES (37, 6, 'tag-37', '退款');
INSERT INTO tags (id, category_id, slug, name) VALUES (38, 8, 'tag-38', '职场');

-- 经验
INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (1, 'exp-1', '怎么挑洗发水不踩雷', '先定头皮类型，再决定要不要硅油 —— 顺序反了就会买错。', '大部分人挑洗发水只看「控油」「去屑」这些功效词，但功效靠的是表活和硅油配方，跟头皮出油速度没有直接关系。正确顺序是：先判断自己是油性还是干性，再在这个前提下挑配方。', 1, ARRAY['洗头水', '洗发露', '宝宝能用吗']::text[], NULL, 'published', 'high', '2026-10-12', '2027-04-12', 1284, 96, 12, 3, 0, '2026-11-16', '2026-11-16');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (101, 1, 'neutral', '二甲基硅油', '硅油是成膜剂，作用是让发丝表面更顺滑、更好梳理，本身不堵塞毛囊。', '所有发质；干燥受损发质收益最大', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (102, 1, 'bad', '油性头皮用高硅会更难洗', '高浓度硅油在油性头皮上成膜，需要更用力冲洗才能彻底去掉，反而洗完更油。', '油性头皮、下午就出油', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (103, 1, 'neutral', '无硅油不等于更温和', '无硅油洗发水靠表活做清洁，刺激性取决于表活种类，跟有没有硅油是两件事。', '成分表里没硅油，但表活是皂基', 2);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (104, 1, 'good', '敏感头皮优先看表活', '氨基酸类表活（如椰油酰谷氨酸钠）对头皮刺激小，是敏感头皮更稳的选择。', '敏感头皮、孕期、哺乳期', 3);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (1001, 1, '洗发水里的那些“有害”成分会伤害头发吗', 'https://www.ce.cn/cysc/newmain/yc/jsxw/202104/19/t20210419_36484488.shtml', 'article', '中国经济网', '中国经济网记者 李燕京', '2021-04-19', '逐条讲清防腐剂、硫酸盐表活、硅油各自的实际作用，是“硅油不堵毛孔”这一判断的出处。', ARRAY[101]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (1002, 1, '硅油“谋杀”发际线？这些洗发水的真相你可能并不清楚', 'https://www.ce.cn/cysc/newmain/yc/jsxw/202004/13/t20200413_34667126.shtml', 'article', '中国经济网', '中国经济网', '2020-04-13', '说明硅油是成膜剂、靠冲洗残留判断头皮是否油腻，支撑“油性头皮用高硅会更难洗”这一条。', ARRAY[101, 102]::bigint[], 1);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (1003, 1, '各种功效型的洗发水该如何买？认清这3点，才能正确挑选洗发水', 'https://www.peopleapp.com/rmharticle/30021309816', 'article', '人民日报客户端', '人民日报客户端', '2021-04-22', '给出选购时该看哪几项（表活体系、适用发质、宣称是否有依据），支撑“无硅油不等于更温和”和“敏感头皮优先看表活”这两条。', ARRAY[103, 104]::bigint[], 2);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (1, 1) ON CONFLICT DO NOTHING;
INSERT INTO experience_tags (experience_id, tag_id) VALUES (1, 2) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (2, 'exp-2', '无线充电板怎么选', '标称功率不等于实际功率，先看输入功率和发热控制。', '无线充电标的「15W / 30W」多数是线圈中心点的峰值，充电板本身发热降功率后，实际稳定输出会掉到一半左右。选的时候看输入功率上限，而不是输出标称值。', 1, ARRAY[]::text[], NULL, 'published', 'normal', '2026-09-30', NULL, 742, 41, 6, 1, 0, '2026-11-12', '2026-11-12');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (201, 2, 'good', '先看输入功率上限', '输入决定了能给多少，标称输出只是上限。充电宝供电一般给不满。', '出差 / 户外使用', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (202, 2, 'bad', '边充边玩会导致降速', '手和手机散热不同步，充电板温度上升后会自动降功率。', '边充电边打游戏', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (203, 2, 'neutral', '线圈对位比功率更重要', '偏移超过线圈中心会导致充不进去或发热集中。', '手机没有无线充电对位标记', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (2001, 2, '多品牌无线充上新：Qi2.2磁吸与主动散热让无线充更稳更安静', 'https://www.chongdiantou.com/archives/1763374898133.html', 'article', '充电头网', '充电头网', '2025-01-01', '说明无线充在高温下会主动降功率、磁吸对位如何影响稳定性，支撑“边充边玩会降速”和“线圈对位比标称功率更重要”。', ARRAY[201]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (2002, 2, '测无线充兼容性？我们有真机库，无线充手机矩阵已就绪', 'https://www.chongdiantou.com/archives/1779786404952.html', 'article', '充电头网', '充电头网', '2025-01-01', '给出不同机型与无线充协议的匹配实测口径，支撑“先看输入功率上限”这一条。', ARRAY[202, 203]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (2, 3) ON CONFLICT DO NOTHING;
INSERT INTO experience_tags (experience_id, tag_id) VALUES (2, 6) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (3, 'exp-3', '婴儿车和安全座椅怎么挑', '看认证标准和结构，不看宣传里的「可躺平」「一键折叠」。', '', 1, ARRAY[]::text[], NULL, 'published', 'high', '2026-08-21', '2027-02-21', 903, 128, 15, 2, 0, '2026-11-05', '2026-11-05');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (301, 3, 'good', '认准 3C 认证和年龄分段', '安全座椅有明确的体重/身高区间，买错分段等于白买。', '0-4 岁全周期使用', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (302, 3, 'bad', '别用「几斤重也能坐」当卖点', '超重段的骨架和约束带强度不达标，出事故时保护失效。', '低价杂牌车', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (303, 3, 'neutral', '可躺平角度看有没有支撑', '角度调节方便，但真躺平后靠背是否托住腰背要单独试。', '小月龄需要平躺', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (3001, 3, '市场监管总局发布儿童安全座椅等8类产品消费提示', 'https://www.samr.gov.cn/xw/mtjj/art/2023/art_1c731e1fafd043f4881cd57a4ad67a2e.html', 'article', '市场监管总局', '市场监管总局', '2023-05-19', '官方消费提示给出认准3C认证、按年龄体重分段选型的方法，支撑“认准3C认证和年龄分段”“别用几斤重也能坐当卖点”。', ARRAY[301, 302]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (3002, 3, '科学选配、正确使用儿童安全座椅', 'https://scjgj.suining.gov.cn/xinwen/show/2b38b2472f364335b178e596ae84226f.html', 'article', '遂宁市市场监督管理局', '遂宁市市场监督管理局', '2017-06-14', '讲解可躺角度与支撑结构对婴幼儿坐姿的影响，支撑“可躺平角度看有没有支撑”这一条。', ARRAY[303]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (3, 4) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (4, 'exp-4', '洗手液和沐浴露怎么选', '手和身体的要求不一样，用同一瓶是最常见的浪费。', '', 1, ARRAY[]::text[], NULL, 'published', 'normal', '2026-06-08', NULL, 415, 22, 4, 0, 0, '2026-10-19', '2026-10-19');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (401, 4, 'good', '洗手用免洗型，洗澡用冲洗型', '免洗洗手液靠酒精，秋冬对干手容易紧绷；沐浴露需要冲洗，残留感更低。', '冬天手部干燥', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (402, 4, 'neutral', '沐浴露看表活而不是香精', '香精只影响气味和致敏概率，真正决定清洁力的是表活浓度。', '敏感肌', 1);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (4001, 4, '【防疫科普】洗手这件小事，你做对了吗？', 'https://www.thepaper.cn/newsDetail_forward_14012031', 'article', '澎湃新闻', '澎湃新闻政务号', '2021-08-12', '讲清洗手液与流动水在去污上的差别、以及用量与揉搓时间，支撑“洗手液不能替代流动水冲洗”。', ARRAY[401]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (4002, 4, '全球洗手日，正确洗手小贴士', 'https://wsjkj.guiyang.gov.cn/jkbj1/202304/t20230419_79143100.html', 'article', '贵阳市卫生健康局', '贵阳市卫生健康局', '2020-10-15', '给出七步洗手法与各类清洁剂的适用部位，支撑“沐浴露按部位用、洗手液按手用”这一条。', ARRAY[402]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (4, 5) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (5, 'exp-5', '冰箱里的肉怎么存才不坏', '生熟分格、0-4℃冷藏、-18℃冷冻超三个月就别吃了。', '', 2, ARRAY[]::text[], NULL, 'published', 'high', '2026-10-02', '2027-04-02', 1567, 143, 21, 1, 0, '2026-11-14', '2026-11-14');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (501, 5, 'good', '生熟必须分格放', '生肉的汁水滴到熟食上会二次污染，冷藏室下层放生肉是硬规矩。', '所有家庭', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (502, 5, 'bad', '冷冻超过三个月的肉不建议吃', '风味下降是小事，风险在于解冻后细菌重新繁殖。', '长期囤冻的冰箱', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (503, 5, 'neutral', '分装比整块冻更好用', '按实际用量分装，避免反复解冻；但也别分太碎影响口感。', '一周做一次饭的家庭', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (5001, 5, '冰箱里的肉最多能“冻”多久？', 'https://www.cncn.gov.cn/art/2025/6/4/art_1229459287_59084681.html', 'article', '中国消费网', '中国消费网', '2025-06-04', '给出各类肉在冷冻室的可存时长上限，支撑“按肉类种类定冷冻时限”这一条。', ARRAY[501]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (5002, 5, '冰箱里的肉最多能冻多久？答案出乎意料', 'https://app.xinhuanet.com/news/article.html?articleId=e889395867ff16b803554af9f5fa3427', 'article', '新华网', '新华网', '2025-06-05', '说明冷冻与冷藏的适用场景差异，支撑“分装冷冻比整块冻更利于安全”。', ARRAY[502]::bigint[], 1);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (5003, 5, '告诉家人们：冻货不能无限期冷藏', 'https://www.hami.gov.cn/hami/c120182/202512/5cea17b86ac34b49a09ae5e9d7f045ae.shtml', 'article', '哈密市人民政府', '哈密市人民政府', '2025-12-16', '消费者提示强调解冻后不宜再次冷冻，支撑“解冻后不能再冻回去”。', ARRAY[503]::bigint[], 2);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (5, 7) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (6, 'exp-6', '外食怎么挑不踩雷', '看菜单、看出餐动线、看出餐速度，三样都能在坐下前判断。', '', 2, ARRAY[]::text[], NULL, 'published', 'normal', '2026-07-15', NULL, 836, 54, 8, 2, 0, '2026-10-29', '2026-10-29');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (601, 6, 'good', '先看菜单再坐下', '菜单价目混乱、后厨和前厅不隔开的店，卫生风险明显更高。', '第一次去的店', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (602, 6, 'neutral', '出餐快的店不一定不安全', '预制和现做都能很快，关键看食材是不是现点现做。', '快餐 / 简餐', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (603, 6, 'bad', '避开长期只有一道主推的店', '菜单长期不换，通常意味着后厨动线固定且已定型，风险集中。', '写字楼下的固定快餐店', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (6001, 6, '甄选舌尖美味 共筑外卖防线——四川省市场监管局发布网络餐饮外卖选购指引及风险防控提示', 'https://www.cfsn.cn/news/detail/585/348946.html', 'article', '中国食品安全网', '四川省市场监督管理局', '2026-05-14', '给出外卖下单与到餐环节的可自查项，支撑“选有门店实体、评分与差评一起看”。', ARRAY[601, 603]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (6002, 6, '外卖点餐莫大意 舌尖安全记心间——市场监督管理局外卖食品安全消费提示', 'https://www.zhalantun.gov.cn/Elderly/OpennessContent/show/578795.html', 'article', '扎兰屯市人民政府', '扎兰屯市市场监督管理局', '2026-09-20', '提示如何保存剩余餐食与复热，支撑“剩下的要尽快冷藏、彻底加热”。', ARRAY[602]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (6, 8) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (7, 'exp-7', '装修最容易超预算的五项', '水电、防水、门窗、定制柜、灯具 —— 超支的八成在这五项里。', '', 3, ARRAY[]::text[], NULL, 'published', 'high', '2026-09-18', '2027-03-18', 2241, 214, 33, 4, 0, '2026-11-13', '2026-11-13');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (701, 7, 'good', '水电按实际点位报价', '按米数报价的师傅几乎一定会多走线，务必按点位结算。', '包工包料以外的任何报价单', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (702, 7, 'good', '防水做闭水试验再贴砖', '闭水试验不过就返工，返工成本远高于试验成本。', '卫生间、阳台', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (703, 7, 'bad', '定制柜别在水电完工前定', '柜体尺寸依赖最终墙面尺寸，提前下单大概率要改。', '全屋定制', 2);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (704, 7, 'neutral', '门窗按面积单列，别混进总价', '系统门窗单价高，混在整包里最容易看不出超支。', '预算 20 万以上的房子', 3);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (7001, 7, '防范装修恶意增项', 'https://zxb.ccn.com.cn/html/zxb/20240610/127268.html', 'article', '中国消费者报', '中国消费者报', '2024-06-10', '梳理常见增项名目与合同写法，支撑“先看报价单里哪些项写的是‘据实结算’”。', ARRAY[701, 702]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (7002, 7, '警惕家装低价套餐陷阱', 'https://zxb.ccn.com.cn/html/zxb/20260827/139922.html', 'article', '中国消费者报', '中国消费者报', '2026-08-27', '说明低价套餐的漏项套路，支撑“主材辅料人工分开报才看得出真实总价”。', ARRAY[703, 704]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (7, 11) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (8, 'exp-8', '房子小，收纳怎么做才不挤', '先减物，再定尺寸，最后才买柜子 —— 顺序反了就是买更多垃圾。', '', 3, ARRAY[]::text[], NULL, 'published', 'normal', '2026-05-11', NULL, 1108, 87, 10, 2, 0, '2026-09-19', '2026-09-19');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (801, 8, 'good', '先扔再量尺寸', '收纳设计的第一步是清空，清空之后的物品量才是真实需求。', '第一次做收纳规划', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (802, 8, 'bad', '别按物品尺寸做柜子', '按物品尺寸做，柜子会塞满还留缝；按使用频率分层更省空间。', '衣柜、鞋柜', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (803, 8, 'neutral', '留出可调整的余量', '收纳物品会变，格子全做死的柜子两年后就是一堆废板。', '长期居住', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (8001, 8, '四条秘诀“玩转”时尚小户型', 'https://zxb.ccn.com.cn/html/zxb/20120217/40706.html', 'article', '中国消费者报', '中国消费者报', '2012-02-17', '给出按动线而不是按柜子做收纳的思路，支撑“先按使用频率和动线分区”。', ARRAY[801]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (8002, 8, '提高利用率拯救小房间 小户型也有春天', 'https://dzb.xfrb.com.cn/Html/2016-11-29/3001.html', 'article', '消费日报', '消费日报', '2016-11-29', '介绍墙面与垂直空间的利用方式，支撑“把墙面和垂直空间当收纳面”。', ARRAY[802, 803]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (8, 10) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (9, 'exp-9', '机票怎么买最便宜', '便宜的前提是「同航线总时长」接近，光看价格会踩中转陷阱。', '', 4, ARRAY[]::text[], NULL, 'published', 'normal', '2026-08-05', NULL, 1387, 102, 13, 3, 0, '2026-10-19', '2026-10-19');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (901, 9, 'good', '比价时先对齐总时长', '便宜 200 块但多转一次机、晚到三小时，实际更贵。', '临时出行的商务出差', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (902, 9, 'neutral', '周二出发、周三返回最便宜', '是统计规律不是保证，热门时段照样贵。', '有灵活行程的人', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (903, 9, 'bad', '别在平台比完价直接买', '同航班不同平台价差可达两成，值机柜台和航司官网都要看一眼。', '任何一次购票', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (9001, 9, '超低心动价？乘机出行小心机票陷阱（附图片）', 'https://k.sina.cn/article_7517400647_1c0126e4705904vbuy.html', 'article', '新浪新闻', '新浪新闻', '2024-03-18', '梳理特价票的退改签限制与里程票陷阱，支撑“先看清退改规则再下手”。', ARRAY[901, 902]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (9002, 9, '今天起，这笔费用上调！暑期机票抢手，有人提前囤票，“早买几天省了300元”', 'https://m.gmw.cn/toutiao/2026-05/16/content_1304458896.htm', 'article', '光明网', '光明网', '2026-05-16', '以暑期机票价格变化说明提前量与折扣周期，支撑“提前订、避开高峰时段”这两条。', ARRAY[903]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (9, 13) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (10, 'exp-10', '体检报告怎么看', '先看箭头，再看参考范围，最后才看数值大小。', '', 5, ARRAY[]::text[], NULL, 'published', 'high', '2026-10-09', '2027-04-09', 1932, 176, 26, 2, 0, '2026-11-15', '2026-11-15');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1001, 10, 'good', '有箭头的项目先复查', '单次异常多数是生理波动，同项目连续两次异常才需要进一步查。', '体检报告上的上升下降标记', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1002, 10, 'neutral', '参考范围以报告单为准', '不同实验室的参考区间不一样，别拿网上看到的范围套自己的单子。', '换了体检机构', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1003, 10, 'bad', '不要自己上网对症', '搜索结果会把轻微异常和严重疾病放在一起，越查越慌。', '看到结节或指标偏高', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (10001, 10, '教您看懂体检报告单', 'https://big5.cctv.com/gate/big5/news.cctv.com/2021/12/23/ARTI6cWZ6u6o07kOwbDAzyzK211223.shtml', 'article', '央视网', '央视网', '2021-12-23', '逐项解释常见体检指标的含义与异常提示，支撑“看懂关键指标而不是逐项对号入座”。', ARRAY[1001, 1002]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (10002, 10, '【健康畅谈——手把手读懂体检报告】', 'https://www.ndrc.gov.cn/fggz/fgjh/xxyd/202010/t20201029_1381945.html', 'article', '国家发展和改革委员会', '国家发展和改革委员会', '2022-11-09', '给出异常指标的复查与就医路径，支撑“报告上写的复查建议要当真”。', ARRAY[1003]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (10, 16) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (11, 'exp-11', '快递丢了怎么赔', '先让快递员出「丢失证明」，赔款走公司流程比直接报警快。', '', 7, ARRAY['丢件', '快递不见了']::text[], NULL, 'published', 'high', '2026-11-16', '2027-05-16', 2664, 289, 41, 5, 0, '2026-11-16', '2026-11-16');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1101, 11, 'good', '先书面申请出丢失证明', '有快递员盖章的丢失证明，赔付走公司流程通常几天到账。', '所有丢件场景', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1102, 11, 'good', '保价件要按保价条款主张', '保价是约定赔偿上限，不是自动全额赔，但需要主动主张。', '购买了保价', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1103, 11, 'bad', '直接报警不会加快赔付', '未经立案的报警记录对快递公司赔付基本无效，还容易耽误时间。', '怀疑被人为盗窃', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (11001, 11, '快递丢了该怎么赔', 'https://www.ce.cn/cysc/newmain/yc/jsxw/202512/t20251215_2641979.shtml', 'article', '中国经济网', '中国经济网', '2025-12-15', '说明保价与理赔流程、保价条款如何生效，支撑“先寄之前确认保价条款并保留凭证”。', ARRAY[1101, 1103]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (11002, 11, '【知识库】快递包裹丢失、物品损坏、错发等问题应该如何解决？', 'http://www.jieyang.gov.cn/jtys/zwgk/qt/qt/content/post_613086.html', 'article', '揭阳市交通运输局', '揭阳市交通运输局', '2021-12-31', '给出理赔申请的渠道与时限要求，支撑“丢件先找承运方、留存面单与聊天记录”。', ARRAY[1102]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (11, 21) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (12, 'exp-12', '怎么退掉健身房会员', '退费的关键是找到合同里的退费条款，并且用书面形式提。', '', 7, ARRAY[]::text[], NULL, 'published', 'normal', '2026-06-20', NULL, 1785, 121, 17, 4, 0, '2026-11-05', '2026-11-05');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1201, 12, 'good', '先书面申请，不要只打电话', '电话沟通不留痕，书面申请能形成时效证据。', '所有退费场景', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1202, 12, 'good', '找合同里的退费条款', '正规健身房合同里都有退费规则，没写清楚本身就是可以主张的点。', '有纸质或电子合同', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1203, 12, 'neutral', '协商无果再走投诉', '12315 受理后调解周期通常两周，比直接起诉轻。', '金额较大且长期不回复', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (12001, 12, '中消协发布健身预付消费提示：理性办卡、优选信托监管', 'https://jnzstatic.cs.com.cn/zzb/htmlInfo/126852.html', 'article', '中国证券报', '中国消费者协会', '2026-07-06', '中消协给出的“三看两不”选机构标准，支撑“先看机构有没有资金监管、合同能不能退”。', ARRAY[1201, 1202]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (12002, 12, '中消协发布健身预付消费提示：优选通过信托监管资金的机构', 'http://jjckb.xinhuanet.com/20260706/184baf715d924a7aa69cabc52e99c2c1/c.html', 'article', '经济参考报', '新华社《经济参考报》', '2026-07-06', '说明预付资金监管机制的作用，支撑“优先选资金进信托监管的机构”。', ARRAY[1203]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (12, 22) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (13, 'exp-13', '怎么退掉订阅服务', '先在 App 里关掉自动续费再申请退订，否则会被按已享受服务扣费。', '', 6, ARRAY[]::text[], NULL, 'published', 'normal', '2026-08-28', NULL, 1451, 109, 14, 3, 0, '2026-11-12', '2026-11-12');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1301, 13, 'good', '先关自动续费再申请退款', '不关就退款，平台会按「已享受服务」直接扣掉整个周期。', '所有订阅退订', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1302, 13, 'good', '按消费记录算已用天数', '按天折算的退款通常比按月折算高，先确认平台的折算方式。', '年付会员', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1303, 13, 'neutral', '在订阅管理里批量取消', '系统设置里能看到全部订阅入口，比逐个 App 找更快。', '订阅超过五个', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (13001, 13, 'App自动续费将迎强监管', 'https://www.workercn.cn/c/2026-01-13/8707566.shtml', 'article', '中工网', '中工网', '2026-01-13', '说明自动续费的明示告知义务与整改方向，支撑“先确认扣费方式与扣费时间”。', ARRAY[1301, 1302]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (13002, 13, '《互联网平台价格行为规则》正式施行 向“大数据杀熟”“自动续费”说不！', 'https://www.sichuanpeace.gov.cn/llqy/20260414/2996042.html', 'article', '四川长安网', '四川长安网', '2026-04-14', '介绍针对自动续费的新规要求，支撑“退订入口要自己找、留存扣费凭证”。', ARRAY[1303]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (13, 19) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (14, 'exp-14', '跟父母说不通怎么办', '别辩论对错，先把他们的顾虑翻译成担心，再给具体能做的事。', '', 8, ARRAY[]::text[], NULL, 'published', 'normal', '2026-09-05', NULL, 1024, 134, 19, 1, 0, '2026-11-05', '2026-11-05');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1401, 14, 'good', '先复述对方的担心', '复述准确了，对方才会听后面的内容；复述错了说明还没懂。', '任何一次反对', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1402, 14, 'good', '给具体的、能立刻做的事', '「你以后少玩手机」没法执行，「今天我陪你去医院」可以。', '涉及健康、就医', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1403, 14, 'neutral', '不必一次谈完', '代际冲突靠次数不靠单次强度，每次推进一点更现实。', '长期议题', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (14001, 14, '青听｜明明可以好好说话，为什么会和父母吵个天翻地覆？', 'https://www.peopleapp.com/rmharticle/30019957508', 'article', '人民日报客户端', '人民日报客户端', '2020-11-12', '分析亲子冲突中“表达方式”与“未被理解”的关系，支撑“先换话题时机、再谈对错”。', ARRAY[1401, 1402]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (14002, 14, '拉开距离、改变焦距，用正确的方式打开爱的沟通渠道', 'https://www.peopleapp.com/rmharticle/30027271756', 'article', '人民日报客户端', '人民日报客户端', '2022-03-15', '给出降低对抗感的沟通节奏建议，支撑“先接住情绪再讲事实”。', ARRAY[1403]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (14, 24) ON CONFLICT DO NOTHING;
INSERT INTO experience_tags (experience_id, tag_id) VALUES (14, 25) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (17, 'exp-17', '剩菜第二天怎么热才不坏', '带汤的菜和绿叶菜要分开处理，冷藏不超过两天，复热要热透。', '剩菜变质主要来自两件事：细菌繁殖和油脂氧化。带汤汁的菜降温慢，给细菌留出了繁殖时间；绿叶菜反复加热则口感发黄、营养一起掉。', 2, ARRAY[]::text[], NULL, 'published', 'normal', '2026-09-20', NULL, 632, 48, 9, 2, 0, '2026-10-24', '2026-10-24');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1701, 17, 'good', '汤多的菜摊开放凉', '把汤汁倒进浅盘或用保鲜盒分装，表面积变大降温就快，进冰箱时细菌还没起来。', '红烧、炖菜、火锅汤底', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1702, 17, 'bad', '绿叶菜隔夜就别再热了', '绿叶菜纤维短，反复加热后叶绿素分解，口感发黄、营养流失，部分还会滋生亚硝酸盐。', '炒青菜、拌菠菜', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1703, 17, 'neutral', '复热要热透再吃', '整体加热到中心冒热气才算热透；微波炉加热中途翻拌一次，受热更均匀。', '米饭、炖菜、炒菜', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (17001, 17, '冰箱不是保险箱，剩菜的正确处理要点请收好', 'https://m.gmw.cn/toutiao/2026-11/10/content_1304584465.htm', 'article', '光明网', '光明网', '2026-11-10', '讲清剩菜入冰箱的时限与分装要求，支撑“剩菜要尽快摊凉冷藏”。', ARRAY[1701, 1703]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (17002, 17, '老人家应科学认识“剩饭菜” 剩饭菜加热次数不应超过1次', 'https://cfsn.cn/news/detail/250/145995.html', 'article', '中国食品安全网', '中国食品安全网', '2022-07-18', '明确加热次数上限与复热方式，支撑“彻底加热一次到位，不要反复回锅”。', ARRAY[1702]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (17, 7) ON CONFLICT DO NOTHING;
INSERT INTO experience_tags (experience_id, tag_id) VALUES (17, 31) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (18, 'exp-18', '菜刀怎么保养才不生锈不卷刃', '用完立刻擦干、洗完不要泡水、磨刀保持同一个角度。', '厨房里最常见的两种报废方式正好相反：菜刀泡在水里会锈，用蛮力斜磨会把刃口磨成波浪。两者都跟「随手」有关。', 2, ARRAY[]::text[], NULL, 'published', 'normal', '2026-08-14', NULL, 455, 35, 6, 1, 0, '2026-09-30', '2026-09-30');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1801, 18, 'good', '洗完立刻擦干', '水汽和钢里的残碳一起作用才会生锈，擦干这一步比选什么刀都管用。', '所有菜刀', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1802, 18, 'bad', '别把刀泡在水池里', '长时间泡水会在刃口形成锈点，还容易让塑料柄和刀身结合处松动。', '洗完还没接着洗菜的时候', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1803, 18, 'neutral', '磨刀要同一个角度来回磨', '磨的时候保持同一个倾角来回走，中途换角度就容易磨出波浪刃。', '日常钝化处理', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (18001, 18, '厨刀的选购、使用和保养常识', 'https://www.gslnwd.gov.cn/zfxxgk/public/32128642/73841834.html', 'article', '武都区人民政府', '武都区人民政府', '2022-03-14', '讲清刃口保养与防锈做法，支撑“用完擦干、别泡水”。', ARRAY[1801, 1802]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (18002, 18, '食品相关产品消费知识普及之厨刀', 'https://www.cqn.com.cn/pp/content/2020-06/21/content_8612127.htm', 'article', '中国质量新闻网', '中国质量新闻网', '2020-06-21', '介绍砧板与刀具的配合使用与磨刀要点，支撑“定期磨刀、砧板要分生熟”。', ARRAY[1803]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (18, 9) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (19, 'exp-19', '空调滤网自己怎么洗', '每年至少两次，取下来清水冲洗、阴干后再装回，别用洗涤剂。', '空调吹出来的脏，来源基本都在滤网上。滤网堵住后风量下降，机器为了吹出同样的风会提高转速，耗电和噪音一起上来。', 3, ARRAY[]::text[], NULL, 'published', 'normal', '2026-07-30', NULL, 1288, 156, 24, 3, 0, '2026-10-30', '2026-10-30');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1901, 19, 'good', '拆下来用清水冲', '灰尘和絮状物用清水加轻拍就能下来，洗涤剂和洗洁精会伤滤材。', '柜式与壁挂式滤网', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1902, 19, 'bad', '晾干前不要装回去', '湿着装回去等于把水闷在机体里，霉味和细菌都是这么来的。', '所有需要清洗的滤网', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1903, 19, 'neutral', '清洗频率看使用强度', '每天开八小时以上的机器三个月一次，普通家用半年一次。', '空调使用频率高的家庭', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (19001, 19, '夏季高温来临前，四步骤清洗家里的空调', 'https://www.peopleapp.com/rmharticle/30028760942', 'article', '人民日报客户端', '人民日报客户端', '2022-06-12', '给出拆洗滤网的具体步骤与频率，支撑“滤网自己拆洗、别只喷点水”。', ARRAY[1901, 1903]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (19002, 19, '【健康】夏天吹空调，缺了这一步，真的容易吹出病！', 'https://www.huidong.gov.cn/hdxwz/wsfw/ggfw/wsfw/jk/content/post_5277741.html', 'article', '惠东县人民政府', '惠东县人民政府', '2024-06-04', '从健康角度说明滤网积尘的后果，支撑“滤网脏了要洗、别对着人直吹”。', ARRAY[1902]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (19, 12) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (20, 'exp-20', '家里换灯泡、换开关怎么算安全', '先断总闸、确认断电、再动手；灯座漏电或发烫要请电工。', '换灯泡看着简单，出事基本都出在「以为关了开关就断电了」这一步。灯座和线路不是自己能改的部分。', 3, ARRAY[]::text[], NULL, 'published', 'high', '2026-06-18', NULL, 874, 92, 11, 2, 0, '2026-09-12', '2026-09-12');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2001, 20, 'good', '先断总闸再动手', '关墙上的开关只是断了火线，灯座里仍可能带电，断总闸才是真的断电。', '所有换灯泡与换开关操作', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2002, 20, 'bad', '手湿的时候不要碰灯座', '潮湿会大幅降低人体电阻，本来安全的一下也可能出事。', '洗手后未擦干', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2003, 20, 'neutral', '灯座发烫或有焦味要请电工', '这两种情况说明接线端已经松动或老化，不是换个灯泡能解决的。', '换灯泡时发现异常', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (20001, 20, '秋冬季节注意用电安全', 'https://www.fuzhou.gov.cn/xfzdzt/rcxf/xfcs/201710/t20171030_1807721.htm', 'article', '福州市人民政府', '福州市人民政府', '2017-10-30', '提示更换灯泡前必须断电并验电，支撑“先断总闸、确认不带电再动手”。', ARRAY[2001, 2002]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (20002, 20, '警方提示：秋冬季节注意用电安全', 'http://gaj.hengshui.gov.cn/art/2018/10/29/art_6412_116011.html', 'article', '衡水市公安局', '衡水市公安局', '2018-10-29', '给出开关、插座、线路的常见隐患与排查方法，支撑“插拔发烫的插座要停用”。', ARRAY[2003]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (20, 32) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (21, 'exp-21', '自驾长途出发前要检查什么', '胎压、机油、备胎、玻璃水这四项，出发前一晚做完。', '长途自驾出问题的案例里，相当一部分不是路上发生的，而是出发前没做那几件小事。绕车一圈花不到五分钟。', 4, ARRAY[]::text[], NULL, 'published', 'normal', '2026-09-05', NULL, 1502, 187, 22, 4, 0, '2026-11-01', '2026-11-01');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2101, 21, 'good', '出发前一晚就把胎压查一遍', '冷胎胎压才是标准值，热车测出来的数值偏高，会掩盖慢漏气。', '任何长途自驾', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2102, 21, 'bad', '上高速前没绕车一圈', '备胎没装、玻璃水见底、机油盖没拧紧，都是绕车一圈就能发现的。', '刚洗完车直接上高速', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2103, 21, 'neutral', '备胎比等救援靠谱', '偏远路段救援可能等几小时，备胎换胎一般十几分钟能搞定。', '走国道、山路', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (21001, 21, '国庆假期，这份自驾出行提示请收好', 'https://news.qq.com/rain/a/20261004A057E200', 'article', '腾讯新闻', '腾讯新闻', '2026-10-04', '列出长途自驾前的车辆与装备检查项，支撑“出发前查胎压、机油、备胎与三角警示牌”。', ARRAY[2101, 2103]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (21002, 21, '高速“安全地带”你找对了吗？春节自驾必看', 'https://jtyst.shanxi.gov.cn/jtzx/spyw/202602/t20260215_10063816.shtml', 'article', '山西省交通运输厅', '山西省交通运输厅', '2026-02-15', '说明高速故障处置与人员撤离规范，支撑“先挪到安全区域再报警、设三角牌”。', ARRAY[2102]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (21, 33) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (22, 'exp-22', '订酒店怎么订才不踩坑', '先在差评里搜「隔音」「前台」「热水」，再决定订哪种房型。', '酒店差评的价值集中在几个固定问题上，靠关键词筛出来比通读上百条有效得多。', 4, ARRAY[]::text[], NULL, 'published', 'normal', '2026-08-22', NULL, 1193, 142, 20, 5, 0, '2026-10-12', '2026-10-12');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2201, 22, 'good', '差评只搜三个关键词', '隔音、前台、热水，这三处是差评最集中的地方，搜出来基本能判断这家靠不靠谱。', '任何平台订房', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2202, 22, 'bad', '只盯着星级和价格挑', '同一家店不同房型差别可以很大，靠窗、楼层、朝向决定了实际噪音和视野。', '第一次去某个城市', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2203, 22, 'neutral', '房型差价买的是位置和楼层', '差价常常就花在离电梯近不近、朝不朝街、楼层高不高上。', '预算有限但想住得方便', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (22001, 22, '超实用！长假出行“住店避坑指南”请查收', 'https://news.cnr.cn/native/gd/20251001/t20251001_527382621.shtml', 'article', '央广网', '央广网', '2025-10-01', '给出订房前核对房型、位置与取消政策的顺序，支撑“先看清房型与位置再付钱”。', ARRAY[2201]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (22002, 22, '潮州市市场监督管理局关于中秋、国庆假期网络平台预订住宿服务的消费提示', 'https://www.chaozhou.gov.cn/zwgk/zwdt/bmdt/content/post_4004454.html', 'article', '潮州市市场监督管理局', '潮州市市场监督管理局', '2026-09-09', '提示线上订房要看清经营主体、保存订单与聊天记录，支撑“保留订单与聊天记录以便维权”。', ARRAY[2202, 2203]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (22, 34) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (23, 'exp-23', '睡不着先别急着吃助眠药', '固定起床时间比固定睡觉时间更管用，坚持两周没改善再去评估。', '入睡困难多数不是「睡不着」，而是作息节律乱了。调节节律的杠杆在起床时间，不在躺下的时间。', 5, ARRAY[]::text[], NULL, 'published', 'high', '2026-10-25', '2027-04-25', 2301, 312, 38, 6, 0, '2026-11-17', '2026-11-17');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2301, 23, 'good', '先固定起床时间', '起床时间固定了，入睡时间会自己往前挪；反过来只盯着几点睡，往往越躺越清醒。', '长期入睡困难', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2302, 23, 'bad', '周末补觉会把作息推得更乱', '周末多睡两小时，等于把生物钟往回拨，周一又要重新熬，等于每天都在倒时差。', '工作日睡得少、周末想补回来', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2303, 23, 'neutral', '躺一小时睡不着就起来', '在床上清醒着超过一小时，大脑会把床和焦虑绑定，起身做点无聊的事反而更容易困。', '躺在床上翻来覆去的时候', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (23001, 23, '睡不着、睡不醒、睡不好——神经内科医生解析全龄段睡眠障碍', 'https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202607/t20260722_4777112.html', 'article', '北京市卫生健康委员会', '北京市卫生健康委员会', '2026-07-22', '医生给出失眠的成因分层与就医判断标准，支撑“先分清是入睡难还是早醒”。', ARRAY[2301, 2302]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (23002, 23, '睡不着可以吃安眠药吗？会产生依赖吗？请收下这份用药手册', 'https://kepu.wjw.gz.gov.cn/zs/content/post_1754.html', 'article', '广州市卫生健康局', '广州市卫生健康局', '2024-03-21', '讲清助眠药的适应症、依赖风险与不能自行用药的情形，支撑“先别急着吃助眠药”。', ARRAY[2303]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (23, 15) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (24, 'exp-24', '感冒药怎么选才不乱吃', '看成分不看品牌；复方制剂最容易重复用到同一种成分。', '感冒药货架上一半是复方制剂，同时吃两种就可能把同一种成分吃双份。', 5, ARRAY[]::text[], NULL, 'published', 'high', '2026-10-08', '2027-04-08', 1764, 245, 29, 7, 0, '2026-11-12', '2026-11-12');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2401, 24, 'good', '先看成分不看品牌', '同成分不同品牌只是换了包装，按成分挑更可控。', '普通感冒', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2402, 24, 'bad', '复方感冒药最容易重复成分', '很多复方制剂里都含对乙酰氨基酚，再叠加退烧药就容易超量。', '同时吃两种感冒药', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2403, 24, 'neutral', '用药超过三天没好转要看医生', '普通感冒多数一周内自愈，持续不缓解要排查流感、肺炎等别的情况。', '症状持续三天以上', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (24001, 24, '【2026年药品安全宣传周原创科普文章】如何选择合适的感冒药？', 'https://yjj.scjgj.fujian.gov.cn/ztzl/kpzl/qgaqyyy/202610/t20261028_7241565.htm', 'article', '福建省药品监督管理局', '福建省药品监督管理局', '2026-09-18', '按症状给出对症选药与联合用药禁忌，支撑“按症状选成分、不重复吃同类药”。', ARRAY[2401, 2402]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (24002, 24, '感冒了该选什么药？专家提醒：看清成分避免重复用药', 'https://m.gmw.cn/toutiao/2025-12/20/content_38488914.htm', 'article', '光明网', '光明网', '2025-12-20', '举例说明复方感冒药里重复成分会导致过量，支撑“看清成分、别叠加吃”。', ARRAY[2403]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (24, 17) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (25, 'exp-25', '记账怎么开始才不放弃', '先记大额支出和每月固定项，别从每一笔咖啡记起。', '大部分记账失败不是因为懒，而是颗粒度定得太细。粒度一细，记账就变成一件比花钱还费劲的事。', 6, ARRAY[]::text[], NULL, 'published', 'normal', '2026-07-15', NULL, 1420, 198, 27, 3, 0, '2026-10-06', '2026-10-06');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2501, 25, 'good', '先记大额和每月固定项', '房租、房贷、订阅、保洁这些大额项决定了支出结构，先把这几项记准就已经能看出问题。', '刚开始记账', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2502, 25, 'bad', '一开始就记每一笔小额', '一天几十笔的记录量很快就压垮坚持，记录本身变成了负担。', '没记过账的人', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2503, 25, 'neutral', '月底对一次账就够', '不必天天打开记账软件，月末统一核对一次，数据照样够用。', '不想天天记的人', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (25001, 25, '2025年1月30日｜理财小百科：四招记好个人理财账', 'https://dfjrjgj.hunan.gov.cn/dfjrjgj/jrbk/jrzs/202501/t20250121_33570169.html', 'article', '湖南省地方金融管理局', '湖南省地方金融管理局', '2025-01-30', '给出四类账户分账记的做法，支撑“先把钱分成几个固定去向”。', ARRAY[2501, 2503]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (25002, 25, '最可怕的“穷人陷阱”：拿铁效应', 'https://www.peopleapp.com/rmharticle/30002398941', 'article', '人民日报客户端', '人民日报客户端', '2023-12-29', '解释小额重复支出累积成大额支出的机制，支撑“先盯住大额和重复的小额支出”。', ARRAY[2502]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (25, 18) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (26, 'exp-26', '医疗险怎么挑才不白花钱', '先看能不能保证续保、再看免赔额，最后才比价格。', '医疗险的产品差异主要在续保条件上，不在保费上。只比保费很容易买到第二年不能续的产品。', 6, ARRAY[]::text[], NULL, 'published', 'normal', '2026-09-28', '2027-03-28', 1688, 231, 26, 9, 0, '2026-11-03', '2026-11-03');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2601, 26, 'good', '先看能不能保证续保', '保证续保年限决定了生病那年还能不能继续报销，比保费高低重要得多。', '超过一年期的产品', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2602, 26, 'bad', '只比保费不看免赔额', '免赔额一万和一万五的差别，在实际报销时可能远大于保费差额。', '纠结哪款便宜的时候', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2603, 26, 'neutral', '健康告知如实填', '健康告知有问必答，隐瞒可能影响后续理赔；如实告知后被拒保也是有效结论。', '有慢性病或体检异常', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (26001, 26, '2026百万医疗险避坑：健康告知、既往症、社保结算、等待期、保额误区', 'https://www.xfrb.com.cn/content/202611/19/c1644342.html', 'article', '消费日报网', '消费日报网', '2026-11-19', '逐条讲清健康告知与既往症除外、等待期等容易白花钱的点，支撑“先看健康告知和免赔额”。', ARRAY[2601, 2603]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (26002, 26, '如何选择百万医疗保险？2026年4月推荐评测', 'https://www.bjnews.com.cn/detail/1775128761129266.html', 'article', '新京报', '新京报', '2026-04-02', '对比同类产品的续保条件与赔付口径，支撑“续保条件比保费更重要”。', ARRAY[2602]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (26, 20) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (27, 'exp-27', '网购质量问题怎么投诉才有用', '先找商家并留证据，平台介入要带截图和照片，小额不值得走完全流程。', '投诉能不能成立，关键在证据链：谁在什么时候说了什么、东西是什么样的。', 7, ARRAY[]::text[], NULL, 'published', 'high', '2026-10-02', '2027-04-02', 2107, 268, 31, 3, 0, '2026-11-10', '2026-11-10');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2701, 27, 'good', '先找商家并留证据', '平台介入时能提供订单页、与商家的沟通记录和实物照片，处理速度明显更快。', '任何网购纠纷', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2702, 27, 'bad', '只口头描述不拍照', '商品与描述不符这类问题，没有照片就没有「不符」的依据。', '商品存在外观或功能问题', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2703, 27, 'neutral', '小额不值得走完流程', '几十元的商品走完投诉流程的时间成本远超商品本身，平台退款更快。', '争议金额很小的时候', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (27001, 27, '如何在全国12315平台上进行消费投诉？', 'https://www.beijing.gov.cn/fuwu/bmfw/bmjy/202504/t20250409_4060597.html', 'article', '北京市人民政府', '北京市人民政府', '2025-04-09', '给出12315投诉的具体入口与提交材料清单，支撑“先在平台提交并保存受理编号”。', ARRAY[2701, 2702]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (27002, 27, '社区团购买到假冒伪劣如何赔偿？网购商品出现问题怎么办？', 'https://scjgj.cq.gov.cn/zz/ddkq/zfxxgkml/spypjglyjczwgkzl/ggfw/spyyaqxchd/202111/t20211126_10038004.html', 'article', '重庆市市场监督管理局', '重庆市市场监督管理局', '2021-11-26', '说明网购纠纷中商家、平台与平台的先后责任，支撑“先找商家、平台未处理再投诉平台”。', ARRAY[2703]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (27, 23) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (28, 'exp-28', '怎么拒绝临时加的活', '不说「我不行」，改成确认优先级，并给出一个你能兑现的时间点。', '拒绝之所以难，是因为它被当成了态度问题。把它换成优先级问题，就变成了一个可以讨论的技术问题。', 8, ARRAY[]::text[], NULL, 'published', 'normal', '2026-09-12', NULL, 1875, 256, 34, 2, 0, '2026-10-28', '2026-10-28');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2801, 28, 'good', '把拒绝换成优先级确认', '「这件事和手头这单哪个更急」把决定权交回给对方，你没有说不行，只是说了顺序。', '任务明显超出本职范围', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2802, 28, 'bad', '直接说「不行」最容易起冲突', '否定的是人而不是安排，对方只能从态度上回应，矛盾就升级了。', '对方是你的直属上级', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2803, 28, 'neutral', '给一个你能兑现的时间', '「我周三下午交」比「我尽快」更有说服力，对方也好安排后面的事。', '确实需要帮忙但排不开', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (28001, 28, '我的劳动有价值 我的时间有边界', 'https://zqb.cyol.com/pc/content/202601/26/content_421641.html', 'article', '中国青年报', '中国青年报', '2026-01-26', '讨论职场中表达时间边界的正当性，支撑“先说明手头优先级，再谈能不能接”。', ARRAY[2801, 2802]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (28002, 28, '面具之下，职场情绪表达的边界在哪', 'https://zqb.cyol.com/pc/content/202604/11/content_424494.html', 'article', '中国青年报', '中国青年报', '2026-04-11', '谈拒绝时如何不伤关系又不委屈自己，支撑“把拒绝说成安排而不是否定”。', ARRAY[2803]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (28, 38) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (29, 'exp-29', '被当面否定时怎么接', '先确认对方在否定哪一部分，再决定要不要解释。', '被否定的一瞬间最容易做的事是立刻辩解或全盘接受，这两个反应都跳过了「搞清楚对方在说什么」这一步。', 8, ARRAY[]::text[], NULL, 'published', 'normal', '2026-08-30', NULL, 1633, 229, 30, 1, 0, '2026-10-08', '2026-10-08');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2901, 29, 'good', '先问「你主要在意哪一点」', '被否定的原因往往和你以为的不一样，问清楚再回应，效率比马上解释高得多。', '会议上方案被否', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2902, 29, 'bad', '当场全盘否定或全盘接受', '前者把一次针对具体点的意见变成对你的否定，后者可能接受一个本来就不该接受的东西。', '被否得很突然的时候', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (2903, 29, 'neutral', '重要的否定要留下记录', '涉及交付标准的否定，会后用一句话复述确认，既是尊重对方也保护自己。', '涉及工作交付标准', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (29001, 29, '十个让人舒畅的沟通技巧', 'https://www.peopleapp.com/rmharticle/30014450624', 'article', '人民日报客户端', '人民日报客户端', '2019-12-29', '给出先接住情绪再回应的沟通顺序，支撑“先承认对方说话有道理”。', ARRAY[2901, 2903]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (29002, 29, '夜读｜沟通能力强的人，说话都是有顺序的（附10条沟通技巧）', 'https://www.peopleapp.com/column/30051715199-500007408679', 'article', '人民日报客户端', '人民日报客户端', '2026-03-24', '强调表达顺序与留白的作用，支撑“先问清楚对方的判断依据再回应”。', ARRAY[2902]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (29, 26) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (30, 'exp-30', '笔记记了不看，等于没记', '按「以后会用到的场景」分类，不要按主题分类。', '笔记不产生价值，检索出来并且真的用上才产生价值。分类方式直接决定了将来能不能找得到。', 9, ARRAY[]::text[], NULL, 'published', 'normal', '2026-10-06', NULL, 1428, 264, 33, 2, 0, '2026-11-08', '2026-11-08');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3001, 30, 'good', '按使用场景建目录', '「以后要在什么场合用」而不是「这属于哪个领域」，前者能直接对应到具体任务。', '刚开始整理旧笔记', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3002, 30, 'bad', '按主题分类越分越乱', '主题之间互相嵌套，收藏夹里几十个主题，最后一条都找不到。', '收藏夹已经堆到几十个目录', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3003, 30, 'neutral', '每条笔记写成能直接用的句子', '「用得上的一句结论」比一整段摘抄更容易被复用。', '想留下操作步骤或结论', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (30001, 30, '背过了能想起来？聊聊记忆的“存”和“取”', 'https://cloud.kepuchina.cn/newSearch/imgText?id=7517352380584497152', 'article', '科普中国', '科普中国', '2026-11-04', '讲清“存进去”与“取出来”是两种不同机制，支撑“记笔记要留下能自问自答的东西”。', ARRAY[3001, 3003]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (30002, 30, '学霸揭秘：同样上课记笔记，为什么别人效率高你却学习差？', 'https://www.peopleapp.com/rmharticle/30019645498', 'article', '人民日报客户端', '人民日报客户端', '2021-01-29', '对比不同记笔记方式的差别，说明“抄写式笔记”为什么留不下来，支撑“笔记要留下能自问自答的东西”。', ARRAY[3002]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (30, 29) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (31, 'exp-31', '文件批量改名怎么不搞乱', '先在副本上试规则、文件名里留序号占位、原始目录先备份。', '批量改名最贵的不是时间，是改完之后发现规则不是你想要的，而文件已经找不到原来的名字了。', 9, ARRAY[]::text[], NULL, 'published', 'normal', '2026-09-19', NULL, 986, 141, 19, 2, 0, '2026-10-22', '2026-10-22');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3101, 31, 'good', '先拿一份副本试规则', '在几十个文件的副本上跑一遍，确认结果符合预期再对全量执行。', '第一次使用改名脚本', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3102, 31, 'bad', '规则写完直接跑整个目录', '出错的代价是整个目录的文件名都变了，回收站里未必找得回来。', '目录里有成千上万个文件', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3103, 31, 'neutral', '文件名里留序号占位', '用 001、002 这样的序号占位，排序永远稳定，补文件时也不会乱。', '需要按顺序归档', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (31001, 31, '适用于 PowerRename 的 Windows 实用工具 - 批量文件重命名工具', 'https://learn.microsoft.com/zh-cn/windows/powertoys/powerrename', 'article', 'Microsoft Learn', 'Microsoft', '2025-01-23', '官方文档说明用正则与序号做批量重命名，支撑“先拿副本试一次批量规则”。', ARRAY[3101, 3103]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (31002, 31, '重命名文件', 'https://support.microsoft.com/zh-cn/office/%E9%87%8D%E5%91%BD%E5%90%8D%E6%96%87%E4%BB%B6-baea7aab-760b-4ee0-af58-06e940d505a4', 'article', 'Microsoft 支持', 'Microsoft', '2026-06-15', '说明系统自带重命名与查找替换的操作方式，支撑“用序号模板保证命名一致”。', ARRAY[3102]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (31, 28) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (32, 'exp-32', '密码怎么管才安全又不至于自己忘', '一个主密码加一个密码管理器，别用同一个密码改数字。', '安全性和管理成本是一对需要权衡的东西。方案太好记就容易被猜，方案太复杂就会有人退回老办法。', 9, ARRAY[]::text[], NULL, 'published', 'high', '2026-09-30', '2027-03-30', 1742, 268, 28, 4, 0, '2026-11-14', '2026-11-14');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3201, 32, 'good', '每个网站用独立密码', '一个站点的密码泄露不会波及其他站点，这是密码管理器最有价值的地方。', '账号多起来之后', 0);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3202, 32, 'bad', '同一套密码改个数字到处用', '撞库会拿已知账号密码去试，规律一旦被识别，几十个账号一起沦陷。', '图省事的时候', 1);
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (3203, 32, 'neutral', '主密码要能背下来', '主密码记不住就等于把全部密码的钥匙交给了别人，宁可多练几遍。', '选密码管理器的时候', 2);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (32001, 32, '杜绝弱密码、弱口令 给个人账户上把锁', 'https://www.cac.gov.cn/2015-05/28/c_1115427442.htm', 'article', '中央网信办', '中央网络安全和信息化委员会办公室', '2015-05-28', '官方提示给出密码长度与复杂度要求，支撑“密码要长、多个账号不复用”。', ARRAY[3201, 3203]::bigint[], 0);
INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, published_at, note, point_ids, sort_order) VALUES (32002, 32, '“弱口令”密码易泄密！这些安全提示要牢记', 'https://app.xinhuanet.com/news/article.html?articleId=a6e5620f-f0fb-4205-9269-4945758b5966', 'article', '新华网', '新华网', '2024-08-22', '说明弱口令被破解的机制与防护做法，支撑“别用生日和手机号当密码”。', ARRAY[3202]::bigint[], 1);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (32, 27) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (15, 'exp-15', '干洗机真的能省事吗', '初步结论还没定稿，依据也还没找齐。', '', 3, ARRAY[]::text[], NULL, 'draft', 'normal', '2026-11-18', NULL, 0, 0, 0, 0, 0, '2026-11-18', '2026-11-18');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1501, 15, 'neutral', '看整机重量和悬挂结构', '干洗机的差别主要在滚筒结构和洗涤剂量，选之前先量清楚放得下放不下。', '第一次买', 0);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (15, 30) ON CONFLICT DO NOTHING;

INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, useful_count, not_useful_count, feedback_count, created_at, updated_at) VALUES (16, 'exp-16', '空气炸锅到底值不值', '结论还没想好，先把几条要点记下来。', '', 2, ARRAY[]::text[], NULL, 'draft', 'normal', '2026-11-18', NULL, 0, 0, 0, 0, 0, '2026-11-18', '2026-11-18');
INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) VALUES (1601, 16, 'neutral', '先看容量够不够一顿的量', '小容量一次装不满，大容量用一次洗很久。', '一两个人吃', 0);
INSERT INTO experience_tags (experience_id, tag_id) VALUES (16, 9) ON CONFLICT DO NOTHING;

-- 反馈
INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, status, reply, replied_at, created_at) VALUES (1, 'experience', 1, 'demo-user', 'correction', '我油头用了两年高硅洗发水，也没觉得更难洗。是不是要看具体配方？', '[{"mediaId":"demo-101","url":"/assets/placeholder/photo-1.png","name":"洗发水成分表截图"}]'::jsonb, 'checking', 'pending', '', NULL, '2026-11-17');
INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, status, reply, replied_at, created_at) VALUES (2, 'experience', 11, 'demo-user-b', 'correction', '邮政局的说法改了，现在丢件必须先在 APP 上报案生成工单，纸质证明已经没有出了。', '[]'::jsonb, 'none', 'accepted', '已核实并更新第 1 条要点，补充了 APP 报案入口。', '2026-11-16', '2026-11-15');
INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, status, reply, replied_at, created_at) VALUES (3, 'experience', 10, 'demo-user', 'question', '照着说的看了箭头安心多了。不过还想问一句：如果同一个指标连续两次都偏高，是不是就得去挂专科门诊了？', '[{"mediaId":"demo-301","url":"/assets/placeholder/photo-1.png","name":"体检报告截图"}]'::jsonb, 'passed', 'accepted', '连续两次异常建议挂对应科室的普通门诊，带上报告单就行，不用挂急诊。', '2026-11-19', '2026-11-12');
INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, status, reply, replied_at, created_at) VALUES (4, 'project', NULL, 'demo-user-c', 'suggestion', '希望能加一个「常见误会的对照表」，比如「无硅油=温和」这种。', '[]'::jsonb, 'none', 'pending', '', NULL, '2026-11-18');
INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, status, reply, replied_at, created_at) VALUES (5, 'experience', 13, 'demo-user-d', 'question', '年付会员按天折算退款，平台只按整月折算，这算合理吗？', '[]'::jsonb, 'none', 'replied', '按整月折算确实不合理，我们记下了，等平台有明确说法再来更新这条。', '2026-11-19', '2026-11-18');
INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, status, reply, replied_at, created_at) VALUES (6, 'experience', 4, 'demo-user-e', 'correction', '我家用的就是同一瓶洗手液和沐浴露，没觉得有问题，这条是不是太绝对了？', '[{"mediaId":"demo-601","url":"/assets/placeholder/photo-1.png","name":"商品页截图"}]'::jsonb, 'rejected', 'ignored', '你说得对，这条的结论写得太满，我改成「分开用更省」而不是「一定要分开」。', '2026-11-19', '2026-11-18');
INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, status, reply, replied_at, created_at) VALUES (7, 'experience', 4, 'demo-user', 'correction', '这瓶洗手液我用了三个月，泵头已经开始渗水了，是不是批次问题？', '[{"mediaId":"demo-701","url":"/assets/placeholder/photo-1.png","name":"泵头渗水照片"}]'::jsonb, 'rejected', 'pending', '', NULL, '2026-11-19');

-- 演示账号
INSERT INTO users (openid, nickname, role) VALUES ('dev-user', '读者', 'user') ON CONFLICT (openid) DO NOTHING;
INSERT INTO users (openid, nickname, role) VALUES ('dev-admin', '维护者', 'admin') ON CONFLICT (openid) DO NOTHING;

-- 序列推到显式 id 之后，否则后续插入会撞主键
SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories), 1));
SELECT setval(pg_get_serial_sequence('tags', 'id'), COALESCE((SELECT MAX(id) FROM tags), 1));
SELECT setval(pg_get_serial_sequence('experiences', 'id'), COALESCE((SELECT MAX(id) FROM experiences), 1));
SELECT setval(pg_get_serial_sequence('points', 'id'), COALESCE((SELECT MAX(id) FROM points), 1));
SELECT setval(pg_get_serial_sequence('sources', 'id'), COALESCE((SELECT MAX(id) FROM sources), 1));
SELECT setval(pg_get_serial_sequence('feedbacks', 'id'), COALESCE((SELECT MAX(id) FROM feedbacks), 1));

COMMIT;
