const { randomUUID } = require("node:crypto");
const { mapEasyTask } = require("./rowMapping");

const EASY_TASK_SELECT = `
  SELECT
    e.*,
    p.name AS project_name,
    p.color AS project_color
  FROM easy_tasks e
  LEFT JOIN projects p ON p.id = e.project_id
`;

function nowIso() {
  return new Date().toISOString();
}

function createEasyTask(db, input) {
  const timestamp = nowIso();
  const done = input.done ? 1 : 0;
  const easyTask = {
    id: randomUUID(),
    title: input.title.trim(),
    projectId: input.projectId || null,
    done,
    completedAt: done ? input.completedAt || timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(`
    INSERT INTO easy_tasks (id, title, project_id, done, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    easyTask.id,
    easyTask.title,
    easyTask.projectId,
    easyTask.done,
    easyTask.completedAt,
    easyTask.createdAt,
    easyTask.updatedAt,
  );

  return getEasyTask(db, easyTask.id);
}

function getEasyTask(db, id) {
  return mapEasyTask(db.prepare(`${EASY_TASK_SELECT} WHERE e.id = ?`).get(id));
}

function listEasyTasks(db, filters = {}) {
  const where = [];
  const params = [];

  if (filters.done !== undefined) {
    where.push("e.done = ?");
    params.push(filters.done ? 1 : 0);
  }

  if (filters.projectId) {
    where.push("e.project_id = ?");
    params.push(filters.projectId);
  }

  const sql = `
    ${EASY_TASK_SELECT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY e.done, e.created_at DESC
  `;

  return db.prepare(sql).all(...params).map(mapEasyTask);
}

function updateEasyTask(db, id, input) {
  const existing = getEasyTask(db, id);
  if (!existing) return null;

  const done = input.done === undefined ? existing.done : Boolean(input.done);
  const timestamp = nowIso();
  const completedAt = done ? existing.completedAt || input.completedAt || timestamp : null;

  db.prepare(`
    UPDATE easy_tasks
    SET title = ?, project_id = ?, done = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.title === undefined ? existing.title : input.title.trim(),
    input.projectId === undefined ? existing.projectId : input.projectId || null,
    done ? 1 : 0,
    completedAt,
    timestamp,
    id,
  );

  return getEasyTask(db, id);
}

function completeEasyTask(db, id) {
  return updateEasyTask(db, id, { done: true });
}

function reopenEasyTask(db, id) {
  return updateEasyTask(db, id, { done: false });
}

function deleteEasyTask(db, id) {
  const result = db.prepare("DELETE FROM easy_tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

module.exports = {
  completeEasyTask,
  createEasyTask,
  deleteEasyTask,
  getEasyTask,
  listEasyTasks,
  reopenEasyTask,
  updateEasyTask,
};
