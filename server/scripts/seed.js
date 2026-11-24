/**
 * 种子数据装载
 *
 * 职责：把仓库根目录 data/*.json 灌进数据库。
 * 为什么不用 SQL 文件灌：JSON 是唯一事实源（前端离线演示读的是同一份），
 * 两份数据各写一遍必然漂移。
 *
 * 用法：
 *   node server/scripts/seed.js              # 灌到配置的库
 *   node server/scripts/seed.js --memory     # 灌到内存库（自检用，跑完即弃）
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const ROOT = path.resolve(__dirname, '..', '..');

function readJson (name) {
  const file = path.join(ROOT, 'data', name);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 重置序列（显式指定 id 插入后必须把序列推到后面） */
async function resetSequences (client) {
  const tables = ['categories', 'tags', 'experiences', 'points', 'sources', 'feedbacks'];
  for (const t of tables) {
    try {
      await client.query(
        "SELECT setval(pg_get_serial_sequence('" + t + "', 'id'), " +
        "COALESCE((SELECT MAX(id) FROM " + t + "), 1))"
      );
    } catch (e) {
      /* pg-mem 不一定有 setval，忽略 —— 内存库里不会真的自增 */
    }
  }
}

/**
 * 灌种子
 * @param {object} client 可选，传了就用事务
 */
async function seed (client) {
  const q = client ? client.query.bind(client) : db.query.bind(db);
  const categories = readJson('categories.json');
  const experiences = readJson('experiences.json');
  const feedbacks = readJson('feedbacks.json');

  /* 领域 */
  for (const c of categories.categories) {
    await q(
      'INSERT INTO categories (id, slug, name, icon, description, sort_order) ' +
      'VALUES ($1, $2, $3, $4, $5, $6)',
      [Number(c.id), c.slug, c.name, c.icon || null, c.desc || '', Number(c.id)]
    );
  }

  /* 标签 */
  for (const t of categories.tags) {
    await q(
      'INSERT INTO tags (id, category_id, slug, name) VALUES ($1, $2, $3, $4)',
      [Number(t.id), Number(t.categoryId), 'tag-' + t.id, t.name]
    );
  }

  /* 经验 */
  for (const e of experiences) {
    await q(
      'INSERT INTO experiences (id, slug, title, summary, body, category_id, search_keywords, ' +
      'cover_url, status, confidence, reviewed_at, next_review_at, view_count, favorite_count, ' +
      'useful_count, not_useful_count, feedback_count, created_at, updated_at) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
      [
        Number(e.id),
        e.slug,
        e.title,
        e.summary,
        e.body || '',
        Number(e.categoryId),
        db.arrayLiteral(e.keywords || []),
        e.coverUrl || null,
        e.status || 'draft',
        e.confidence || 'normal',
        e.reviewedAt || e.updatedAt,
        e.nextReviewAt || null,
        Number(e.viewCount || 0),
        Number(e.favoriteCount || 0),
        Number(e.usefulCount || 0),
        Number(e.notUsefulCount || 0),
        Number(e.feedbackCount || 0),
        e.updatedAt || '2026-01-01',
        e.updatedAt || '2026-01-01'
      ]
    );

    /* 要点：沿用原 id，依据的 pointIds 才对得上 */
    for (let i = 0; i < (e.points || []).length; i++) {
      const p = e.points[i];
      await q(
        'INSERT INTO points (id, experience_id, stance, title, detail, applies_to, sort_order) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [Number(p.id), Number(e.id), p.stance || 'neutral', p.title || '', p.detail || '', p.appliesTo || '', i]
      );
    }

    /* 依据 */
    for (let i = 0; i < (e.sources || []).length; i++) {
      const s = e.sources[i];
      await q(
        'INSERT INTO sources (id, experience_id, title, url, source_type, platform, author, ' +
        'published_at, note, point_ids, sort_order) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::bigint[],$11)',
        [
          Number(s.id),
          Number(e.id),
          s.title || '',
          s.url || '',
          s.sourceType || 'article',
          s.platform || '',
          s.author || '',
          s.publishedAt || null,
          s.note || '',
          db.arrayLiteral(s.pointIds || []),
          i
        ]
      );
    }

    /* 标签关联 */
    for (const tagId of e.tagIds || []) {
      await q(
        'INSERT INTO experience_tags (experience_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [Number(e.id), Number(tagId)]
      );
    }
  }

  /* 反馈 */
  for (const f of feedbacks) {
    await q(
      'INSERT INTO feedbacks (id, target_type, target_id, openid, kind, content, images, media_status, ' +
      'status, reply, replied_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)',
      [
        Number(f.id),
        f.targetType || 'project',
        f.targetId === null || f.targetId === undefined ? null : Number(f.targetId),
        f.openid || 'dev-user',
        f.kind || 'suggestion',
        f.content || '',
        JSON.stringify(f.images || []),
        f.mediaStatus || 'none',
        f.status || 'pending',
        f.reply || '',
        f.repliedAt || null,
        f.createdAt || '2026-11-01'
      ]
    );
  }

  /* 两个演示账号：openid 与 utils/auth.js 的开发模式登录一致。
     ⚠️ 只在内存模式灌 —— 真库里留着 dev-admin 就是留了一个公开后门
     （配合开发密钥可以自签管理员 token）。生产环境的管理员只从
     ADMIN_OPENIDS 环境变量提权。 */
  if (db.isMemory()) {
    await q(
      "INSERT INTO users (openid, nickname, role) VALUES ('dev-user', '读者', 'user') " +
      "ON CONFLICT (openid) DO NOTHING"
    );
    await q(
      "INSERT INTO users (openid, nickname, role) VALUES ('dev-admin', '维护者', 'admin') " +
      "ON CONFLICT (openid) DO NOTHING"
    );
  }

  /* 给 dev-user 几条收藏与投票，让计数不是 0 */
  const firstIds = experiences.slice(0, 3).map(function (e) { return Number(e.id); });
  for (const id of firstIds) {
    await q(
      'INSERT INTO favorites (openid, experience_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ['dev-user', id]
    );
  }
  await q(
    'INSERT INTO votes (openid, experience_id, useful) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    ['dev-user', firstIds[0], true]
  );
  await q(
    'INSERT INTO votes (openid, experience_id, useful) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    ['dev-user', firstIds[1], false]
  );
  const allIds = experiences.map(function (e) { return Number(e.id); });
  const counts = await recountExperienceCounts(q, allIds);
  await assertExperienceCounts(q, allIds, counts);

  /* ⚠️ 必须传 client —— 传 null 会让 client.query 抛 TypeError，
     而 resetSequences 里的 try/catch 会把它吞掉，setval 一次都不执行。
     结果：显式指定 id 插入之后序列还停在 1，真库上下一次插入就撞主键。 */
  await resetSequences(client);
  return {
    categories: categories.categories.length,
    tags: categories.tags.length,
    experiences: experiences.length,
    feedbacks: feedbacks.length,
    favorites: counts.favorites,
    votes: counts.votes,
    processedFeedbacks: counts.processedFeedbacks
  };
}

/** 一次读取源表后重算所有经验，避免逐经验 N+1。 */
async function recountExperienceCounts (q, ids) {
  const favorites = await q('SELECT experience_id, count(*) AS n FROM favorites GROUP BY experience_id');
  const votes = await q('SELECT experience_id, useful FROM votes');
  const feedbacks = await q(
    "SELECT target_id, count(*) AS n FROM feedbacks WHERE target_type = 'experience' " +
    "AND status <> 'pending' GROUP BY target_id"
  );
  const counts = {};
  for (const id of ids) counts[String(id)] = { favorites: 0, good: 0, bad: 0, feedback: 0 };
  for (const row of favorites.rows) {
    if (counts[String(row.experience_id)]) counts[String(row.experience_id)].favorites = Number(row.n);
  }
  for (const row of votes.rows) {
    const item = counts[String(row.experience_id)];
    if (!item) continue;
    if (row.useful) item.good++;
    else item.bad++;
  }
  for (const row of feedbacks.rows) {
    if (counts[String(row.target_id)]) counts[String(row.target_id)].feedback = Number(row.n);
  }
  for (const id of ids) {
    const item = counts[String(id)];
    await q(
      'UPDATE experiences SET favorite_count = $2, useful_count = $3, not_useful_count = $4, ' +
      'feedback_count = $5 WHERE id = $1',
      [id, item.favorites, item.good, item.bad, item.feedback]
    );
  }
  return {
    favorites: favorites.rows.reduce(function (sum, row) { return sum + Number(row.n); }, 0),
    votes: votes.rows.length,
    processedFeedbacks: feedbacks.rows.reduce(function (sum, row) { return sum + Number(row.n); }, 0),
    byExperience: counts
  };
}

async function assertExperienceCounts (q, ids, totals) {
  const rows = await q('SELECT id, favorite_count, useful_count, not_useful_count, feedback_count FROM experiences');
  let favorites = 0;
  let votes = 0;
  let feedback = 0;
  for (const row of rows.rows) {
    if (ids.map(String).indexOf(String(row.id)) < 0) continue;
    const expected = totals.byExperience[String(row.id)];
    const actual = [Number(row.favorite_count), Number(row.useful_count),
      Number(row.not_useful_count), Number(row.feedback_count)];
    const wanted = [expected.favorites, expected.good, expected.bad, expected.feedback];
    if (actual.some(function (n, i) { return n !== wanted[i]; })) {
      throw new Error('种子计数断言失败：经验 ' + row.id + ' 存储值与源表不一致');
    }
    favorites += Number(row.favorite_count);
    votes += Number(row.useful_count) + Number(row.not_useful_count);
    feedback += Number(row.feedback_count);
  }
  if (favorites !== totals.favorites || votes !== totals.votes || feedback !== totals.processedFeedbacks) {
    throw new Error('种子计数断言失败：存储合计与源表不一致');
  }
}

/** 直接跑：node server/scripts/seed.js */
async function main () {
  const memory = process.argv.indexOf('--memory') >= 0;
  const mode = await db.init({ memory: memory });
  /* 真库上灌数据前先把表建好 —— 空库直接灌会报「relation does not exist」。
     schema.sql 全是 IF NOT EXISTS，重复执行不会破坏已有数据。 */
  if (mode.mode === 'postgres') {
    await db.applySchema();
    console.log('已按 schema.sql 建表（IF NOT EXISTS，幂等）。');
  }
  const out = await db.tx(async function (client) {
    return seed(client);
  });
  console.log('种子数据已装载（' + mode.mode + '）：' + JSON.stringify(out));
  await db.close();
}

if (require.main === module) {
  main().catch(function (err) {
    console.error('装载失败：' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}

module.exports = { seed: seed, readJson: readJson };
