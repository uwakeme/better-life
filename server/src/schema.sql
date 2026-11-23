-- better-life 建表脚本（设计文档 §6.2 逐字照抄）
--
-- 约定：
--   1. 库表与列一律 snake_case；业务层用 camelCase，转换只在 DAO 的 toCamel 里做。
--   2. 搜索索引的 embedding 列不写死维度（vector 而非 vector(1024)），
--      换 embedding 模型不用改表结构；首版不建 ANN 索引（§7.8 / §14 D7）。
--   3. 本文件不写 CREATE EXTENSION —— pgvector 扩展由部署方装好；
--      本地 pg-mem 自检时由 db.js 先建 vector 域再跑本文件。

CREATE TABLE IF NOT EXISTS categories (
  id         BIGSERIAL PRIMARY KEY,
  parent_id  BIGINT REFERENCES categories(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  icon       TEXT,
  -- 一句话说明（"洗护、家电、数码…"）。§6.2 原表没有这一列，
  -- 但首页「全部领域」列表要显示领域说明，先在原型里就有 —— 这里补一个可空列，
  -- 属于对 §6.2 的向后兼容扩展，不影响任何断言。
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories (parent_id);

CREATE TABLE IF NOT EXISTS experiences (
  id             BIGSERIAL PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',
  category_id    BIGINT NOT NULL REFERENCES categories(id),
  search_keywords TEXT[] NOT NULL DEFAULT '{}',
  cover_url      TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  confidence     TEXT NOT NULL DEFAULT 'normal',
  reviewed_at    DATE NOT NULL,
  next_review_at DATE,
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

CREATE TABLE IF NOT EXISTS points (
  id            BIGSERIAL PRIMARY KEY,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  stance        TEXT NOT NULL DEFAULT 'neutral',
  title         TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  applies_to    TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS points_experience_idx ON points (experience_id, sort_order);

CREATE TABLE IF NOT EXISTS sources (
  id            BIGSERIAL PRIMARY KEY,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  source_type   TEXT NOT NULL DEFAULT 'article',
  platform      TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT '',
  published_at  DATE,
  note          TEXT NOT NULL DEFAULT '',
  point_ids     BIGINT[] NOT NULL DEFAULT '{}',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sources_experience_idx ON sources (experience_id, sort_order);

CREATE TABLE IF NOT EXISTS tags (
  id          BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tags_category_name_uniq UNIQUE (category_id, name)
);
CREATE INDEX IF NOT EXISTS tags_category_idx ON tags (category_id);

CREATE TABLE IF NOT EXISTS experience_tags (
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  tag_id        BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (experience_id, tag_id)
);
CREATE INDEX IF NOT EXISTS experience_tags_tag_idx ON experience_tags (tag_id);

CREATE TABLE IF NOT EXISTS users (
  openid       TEXT PRIMARY KEY,
  unionid      TEXT,
  nickname     TEXT NOT NULL DEFAULT '',
  avatar       TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'user',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS favorites (
  openid       TEXT NOT NULL,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (openid, experience_id)
);
CREATE INDEX IF NOT EXISTS favorites_openid_idx ON favorites (openid, created_at DESC);

CREATE TABLE IF NOT EXISTS votes (
  openid       TEXT NOT NULL,
  experience_id BIGINT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  useful       BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (openid, experience_id)
);

CREATE TABLE IF NOT EXISTS feedbacks (
  id          BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id   BIGINT,
  openid      TEXT NOT NULL,
  kind        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  images      JSONB NOT NULL DEFAULT '[]',
  media_status    TEXT NOT NULL DEFAULT 'none',
  media_trace_id  TEXT,
  media_checked_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'pending',
  reply       TEXT NOT NULL DEFAULT '',
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feedbacks_target_check CHECK (
    (target_type = 'experience' AND target_id IS NOT NULL) OR
    (target_type = 'project'    AND target_id IS NULL)
  ),
  CONSTRAINT feedbacks_kind_check CHECK (kind IN ('correction','supplement','question','suggestion')),
  CONSTRAINT feedbacks_media_status_check CHECK (media_status IN ('none','checking','passed','rejected'))
);
CREATE INDEX IF NOT EXISTS feedbacks_target_idx ON feedbacks (target_type, target_id, status);
CREATE INDEX IF NOT EXISTS feedbacks_openid_idx ON feedbacks (openid, created_at DESC);

CREATE TABLE IF NOT EXISTS search_documents (
  id         BIGSERIAL PRIMARY KEY,
  doc_type   TEXT NOT NULL,
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
