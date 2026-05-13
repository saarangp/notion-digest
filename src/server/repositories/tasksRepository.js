const { randomUUID } = require("node:crypto");
const { mapTask } = require("./rowMapping");

const TASK_SELECT = `
  SELECT
    t.*,
    p.name AS project_name,
    p.color AS project_color
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
`;

function nowIso() {
  return new Date().toISOString();
}

function normalizeNeedsReview(input) {
  if (input.needsReview !== undefined) return input.needsReview ? 1 : 0;
  return input.dueDate && input.priority ? 0 : 1;
}

function reviewState(dueDate, priority, requestedNeedsReview) {
  if (dueDate && priority) return 0;
  if (requestedNeedsReview !== undefined) return requestedNeedsReview ? 1 : 0;
  return 1;
}

function createTask(db, input) {
  const timestamp = nowIso();
  const task = {
    id: randomUUID(),
    title: input.title.trim(),
    projectId: input.projectId || null,
    dueDate: input.dueDate || null,
    priority: input.priority || null,
    status: input.status || "todo",
    needsReview: normalizeNeedsReview(input),
    estimatedMinutes: input.estimatedMinutes || null,
    completedAt: input.status === "done" ? input.completedAt || timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    importedFrom: input.importedFrom || null,
    importedId: input.importedId || null,
    importedUrl: input.importedUrl || null,
  };

  db.prepare(`
    INSERT INTO tasks (
      id, title, project_id, due_date, priority, status, needs_review, estimated_minutes,
      completed_at, created_at, updated_at, imported_from, imported_id, imported_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.title,
    task.projectId,
    task.dueDate,
    task.priority,
    task.status,
    task.needsReview,
    task.estimatedMinutes,
    task.completedAt,
    task.createdAt,
    task.updatedAt,
    task.importedFrom,
    task.importedId,
    task.importedUrl,
  );

  return getTask(db, task.id);
}

function getTask(db, id) {
  return mapTask(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id));
}

function listTasks(db, filters = {}) {
  const where = [];
  const params = [];

  if (filters.status) {
    where.push("t.status = ?");
    params.push(filters.status);
  }

  if (filters.projectId) {
    where.push("t.project_id = ?");
    params.push(filters.projectId);
  }

  const sql = `
    ${TASK_SELECT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date,
      t.created_at DESC
  `;

  return db.prepare(sql).all(...params).map(mapTask);
}

function updateTask(db, id, input) {
  const existing = getTask(db, id);
  if (!existing) return null;

  const dueDate = input.dueDate === undefined ? existing.dueDate : input.dueDate || null;
  const priority = input.priority === undefined ? existing.priority : input.priority || null;
  const status = input.status === undefined ? existing.status : input.status;
  const timestamp = nowIso();
  const completedAt =
    status === "done"
      ? existing.completedAt || input.completedAt || timestamp
      : null;

  db.prepare(`
    UPDATE tasks
    SET
      title = ?,
      project_id = ?,
      due_date = ?,
      priority = ?,
      status = ?,
      needs_review = ?,
      estimated_minutes = ?,
      completed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.title === undefined ? existing.title : input.title.trim(),
    input.projectId === undefined ? existing.projectId : input.projectId || null,
    dueDate,
    priority,
    status,
    reviewState(dueDate, priority, input.needsReview),
    input.estimatedMinutes === undefined ? existing.estimatedMinutes : input.estimatedMinutes || null,
    completedAt,
    timestamp,
    id,
  );

  return getTask(db, id);
}

function completeTask(db, id) {
  return updateTask(db, id, { status: "done" });
}

function reopenTask(db, id) {
  return updateTask(db, id, { status: "todo" });
}

function deleteTask(db, id) {
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

module.exports = {
  createTask,
  getTask,
  listTasks,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
};
