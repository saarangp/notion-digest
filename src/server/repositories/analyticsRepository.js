function localCompletionDate(column) {
  return `substr(datetime(${column}, 'localtime'), 1, 10)`;
}

function listCompletionHeatmap(db, options = {}) {
  const filters = completionDateFilters(options);

  return db
    .prepare(`
      SELECT completed_date, SUM(count) AS count
      FROM (
        SELECT ${localCompletionDate("completed_at")} AS completed_date, COUNT(*) AS count
        FROM tasks
        WHERE status = 'done'
          AND completed_at IS NOT NULL
          ${filters.sql}
        GROUP BY completed_date

        UNION ALL

        SELECT ${localCompletionDate("completed_at")} AS completed_date, COUNT(*) AS count
        FROM easy_tasks
        WHERE done = 1
          AND completed_at IS NOT NULL
          ${filters.sql}
        GROUP BY completed_date
      )
      GROUP BY completed_date
      ORDER BY completed_date
    `)
    .all(...filters.params, ...filters.params)
    .map((row) => ({ date: row.completed_date, count: row.count }));
}

function listCompletedArchive(db, options = {}) {
  const filters = archiveFilters(options);

  return db
    .prepare(`
      SELECT *
      FROM (
        SELECT
          t.id,
          t.title,
          t.project_id,
          p.name AS project_name,
          p.color AS project_color,
          t.completed_at,
          ${localCompletionDate("t.completed_at")} AS completed_date,
          'task' AS type
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.status = 'done'
          AND t.completed_at IS NOT NULL

        UNION ALL

        SELECT
          e.id,
          e.title,
          e.project_id,
          p.name AS project_name,
          p.color AS project_color,
          e.completed_at,
          ${localCompletionDate("e.completed_at")} AS completed_date,
          'easy' AS type
        FROM easy_tasks e
        LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.done = 1
          AND e.completed_at IS NOT NULL
      )
      ${filters.sql}
      ORDER BY completed_at DESC, lower(title)
      LIMIT ?
    `)
    .all(...filters.params, options.limit || 100)
    .map(mapArchiveRow);
}

function archiveFilters(options) {
  if (!options.search?.trim()) return { sql: "", params: [] };

  const query = `%${options.search.trim().toLowerCase()}%`;
  return {
    sql: `
      WHERE lower(title) LIKE ?
         OR lower(COALESCE(project_name, '')) LIKE ?
         OR type LIKE ?
    `,
    params: [query, query, query],
  };
}

function completionDateFilters(options) {
  const where = [];
  const params = [];

  if (options.startDate) {
    where.push(`${localCompletionDate("completed_at")} >= ?`);
    params.push(options.startDate);
  }

  if (options.endDate) {
    where.push(`${localCompletionDate("completed_at")} <= ?`);
    params.push(options.endDate);
  }

  return {
    sql: where.length ? `AND ${where.join(" AND ")}` : "",
    params,
  };
}

function mapArchiveRow(row) {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    projectName: row.project_name,
    projectColor: row.project_color,
    completedAt: row.completed_at,
    completedDate: row.completed_date,
    type: row.type,
  };
}

module.exports = {
  listCompletedArchive,
  listCompletionHeatmap,
};
