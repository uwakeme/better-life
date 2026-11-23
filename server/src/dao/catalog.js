/**
 * 目录 DAO：领域与标签
 *
 * 职责：读领域树与标签；标签的写操作（改名 / 增删）也在这里。
 * 约定：返回一律 camelCase（toCamel 在这里统一做，调用方不再看到 snake_case）。
 *       不用相关子查询 —— pg-mem 不支持，改成独立 GROUP BY 查询后合并（§ DAO 约定）。
 */
const db = require('../db');
const { toCamel, toCamelList } = require('../lib/to-camel');

/** 全部一级领域（含标签数与经验数） */
async function listCategories () {
  const res = await db.query(
    'SELECT c.id, c.slug, c.name, c.icon, c.description, c.sort_order ' +
    'FROM categories c ORDER BY c.sort_order, c.id'
  );
  const rows = toCamelList(res.rows, { numeric: true });

  const tagRows = await db.query('SELECT category_id, count(*) AS n FROM tags GROUP BY category_id');
  const expRows = await db.query(
    "SELECT category_id, count(*) AS n FROM experiences WHERE status = 'published' GROUP BY category_id"
  );
  const tagCount = {};
  for (const r of tagRows.rows) tagCount[String(r.category_id)] = Number(r.n);
  const expCount = {};
  for (const r of expRows.rows) expCount[String(r.category_id)] = Number(r.n);
  for (const c of rows) {
    c.tagCount = tagCount[String(c.id)] || 0;
    c.experienceCount = expCount[String(c.id)] || 0;
  }
  return rows;
}

/** 全部标签 */
async function listTags () {
  const res = await db.query(
    'SELECT t.id, t.category_id, t.slug, t.name FROM tags t ORDER BY t.category_id, t.id'
  );
  return toCamelList(res.rows, { numeric: true });
}

/** 单个标签 */
async function getTag (id) {
  const row = await db.queryOne(
    'SELECT id, category_id, slug, name FROM tags WHERE id = $1',
    [Number(id)]
  );
  return row ? toCamel(row, { numeric: true }) : null;
}

/** 同名标签查重：唯一键是（领域, 名称） */
async function findByCategoryAndName (categoryId, name, excludeId) {
  const params = [
    categoryId === null || categoryId === undefined ? null : Number(categoryId),
    name
  ];
  /* tags.category_id 是 NOT NULL，等值比较与 IS NOT DISTINCT FROM 等价；
     而且 IS NOT DISTINCT FROM 在 pg-mem 里直接解析不了 */
  let sql = 'SELECT id FROM tags WHERE name = $2 AND category_id = $1';
  if (excludeId) {
    sql += ' AND id <> $3';
    params.push(Number(excludeId));
  }
  const row = await db.queryOne(sql, params);
  return row ? toCamel(row, { numeric: true }) : null;
}

/** 新增标签 */
async function insertTag (tag) {
  const params = [
    tag.categoryId === null || tag.categoryId === undefined ? null : Number(tag.categoryId),
    tag.slug,
    tag.name
  ];
  const ins = await db.buildInsert({
    table: 'tags',
    columns: ['category_id', 'slug', 'name'],
    values: params
  });
  const res = await db.query(
    ins.sql + ' RETURNING id, category_id, slug, name',
    ins.params
  );
  return toCamel(res.rows[0], { numeric: true });
}

/** 改标签（名称与归属领域） */
async function updateTag (id, tag) {
  const params = [
    Number(id),
    tag.categoryId === null || tag.categoryId === undefined ? null : Number(tag.categoryId),
    tag.name
  ];
  const res = await db.query(
    'UPDATE tags SET category_id = $2, name = $3 WHERE id = $1 RETURNING id, category_id, slug, name',
    params
  );
  return res.rows[0] ? toCamel(res.rows[0], { numeric: true }) : null;
}

/** 删标签（经验与标签的关联由外键级联清掉） */
async function deleteTag (id) {
  const res = await db.query('DELETE FROM tags WHERE id = $1 RETURNING id', [Number(id)]);
  return res.rows.length > 0;
}

module.exports = {
  listCategories: listCategories,
  listTags: listTags,
  getTag: getTag,
  findByCategoryAndName: findByCategoryAndName,
  insertTag: insertTag,
  updateTag: updateTag,
  deleteTag: deleteTag
};
