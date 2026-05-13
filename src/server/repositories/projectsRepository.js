const { randomUUID } = require("node:crypto");
const { mapProject } = require("./rowMapping");

const PROJECT_COLORS = [
  "#C0384E",
  "#1A7A5E",
  "#A06000",
  "#5C38A8",
  "#1E5898",
  "#8A4F7D",
  "#4F6F52",
];

function nowIso() {
  return new Date().toISOString();
}

function nextProjectColor(db) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM projects").get();
  return PROJECT_COLORS[row.count % PROJECT_COLORS.length];
}

function createProject(db, input) {
  const timestamp = nowIso();
  const project = {
    id: randomUUID(),
    name: input.name.trim(),
    color: input.color || nextProjectColor(db),
    deadlineDate: input.deadlineDate || null,
    status: "active",
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(`
    INSERT INTO projects (id, name, color, deadline_date, status, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    project.name,
    project.color,
    project.deadlineDate,
    project.status,
    project.completedAt,
    project.createdAt,
    project.updatedAt,
  );

  return project;
}

function listProjects(db) {
  return db
    .prepare("SELECT * FROM projects ORDER BY lower(name)")
    .all()
    .map(mapProject);
}

function getProject(db, id) {
  return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
}

function findProjectByName(db, name) {
  return mapProject(
    db
      .prepare("SELECT * FROM projects WHERE lower(name) = lower(?) LIMIT 1")
      .get(name.trim()),
  );
}

function findOrCreateProjectByName(db, name) {
  const trimmedName = name.trim();
  const existing = findProjectByName(db, trimmedName);
  if (existing) return { project: existing, created: false };
  return { project: createProject(db, { name: trimmedName }), created: true };
}

function updateProject(db, id, input) {
  const existing = getProject(db, id);
  if (!existing) return null;

  const updated = {
    name: input.name === undefined ? existing.name : input.name.trim(),
    color: input.color === undefined ? existing.color : input.color,
    deadlineDate: input.deadlineDate === undefined ? existing.deadlineDate : input.deadlineDate || null,
    updatedAt: nowIso(),
  };

  db.prepare(`
    UPDATE projects
    SET name = ?, color = ?, deadline_date = ?, updated_at = ?
    WHERE id = ?
  `).run(updated.name, updated.color, updated.deadlineDate, updated.updatedAt, id);

  return getProject(db, id);
}

function completeProject(db, id) {
  const existing = getProject(db, id);
  if (!existing) return null;

  const openCounts = countOpenProjectTasks(db, id);
  if (openCounts.total > 0) {
    throw new Error(`Project has ${openCounts.total} open task${openCounts.total === 1 ? "" : "s"}. Complete or move them before marking the project done.`);
  }

  const timestamp = nowIso();
  db.prepare(`
    UPDATE projects
    SET status = 'done', completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(timestamp, timestamp, id);

  return getProject(db, id);
}

function reopenProject(db, id) {
  const existing = getProject(db, id);
  if (!existing) return null;

  const timestamp = nowIso();
  db.prepare(`
    UPDATE projects
    SET status = 'active', completed_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(timestamp, id);

  return getProject(db, id);
}

function countOpenProjectTasks(db, id) {
  const regular = db
    .prepare("SELECT COUNT(*) AS count FROM tasks WHERE project_id = ? AND status = 'todo'")
    .get(id).count;
  const easy = db
    .prepare("SELECT COUNT(*) AS count FROM easy_tasks WHERE project_id = ? AND done = 0")
    .get(id).count;
  return { regular, easy, total: regular + easy };
}

function deleteProject(db, id) {
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return result.changes > 0;
}

function listProjectSummaries(db) {
  return db
    .prepare(`
      SELECT
        p.id,
        p.name,
        p.color,
        p.deadline_date,
        p.status,
        p.completed_at,
        p.created_at,
        p.updated_at,
        COUNT(t.id) AS open_task_count,
        (
          SELECT COUNT(*)
          FROM easy_tasks e
          WHERE e.project_id = p.id
            AND e.done = 0
        ) AS open_easy_task_count,
        MIN(t.due_date) AS next_due_date
      FROM projects p
      LEFT JOIN tasks t
        ON t.project_id = p.id
       AND t.status = 'todo'
      WHERE p.status = 'active'
      GROUP BY p.id
      ORDER BY
        CASE WHEN p.deadline_date IS NULL THEN 1 ELSE 0 END,
        p.deadline_date,
        lower(p.name)
    `)
    .all()
    .map((row) => ({
      ...mapProject(row),
      openTaskCount: row.open_task_count + row.open_easy_task_count,
      nextDueDate: row.next_due_date,
    }));
}

module.exports = {
  PROJECT_COLORS,
  completeProject,
  createProject,
  findOrCreateProjectByName,
  findProjectByName,
  listProjects,
  getProject,
  updateProject,
  reopenProject,
  deleteProject,
  listProjectSummaries,
};
