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
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(`
    INSERT INTO projects (id, name, color, deadline_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    project.name,
    project.color,
    project.deadlineDate,
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
        p.created_at,
        p.updated_at,
        COUNT(t.id) AS open_task_count,
        MIN(t.due_date) AS next_due_date
      FROM projects p
      LEFT JOIN tasks t
        ON t.project_id = p.id
       AND t.status = 'todo'
      GROUP BY p.id
      ORDER BY
        CASE WHEN p.deadline_date IS NULL THEN 1 ELSE 0 END,
        p.deadline_date,
        lower(p.name)
    `)
    .all()
    .map((row) => ({
      ...mapProject(row),
      openTaskCount: row.open_task_count,
      nextDueDate: row.next_due_date,
    }));
}

module.exports = {
  PROJECT_COLORS,
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  listProjectSummaries,
};
