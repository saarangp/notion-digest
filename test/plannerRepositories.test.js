const test = require("node:test");
const assert = require("node:assert/strict");
const { openDatabase } = require("../src/server/db");
const { migrate } = require("../src/server/schema");
const {
  createProject,
  listProjectSummaries,
  updateProject,
} = require("../src/server/repositories/projectsRepository");
const {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  updateTask,
} = require("../src/server/repositories/tasksRepository");

function testDb() {
  const db = openDatabase(":memory:");
  migrate(db);
  return db;
}

test("projects can be created, updated, and summarized", () => {
  const db = testDb();
  const project = createProject(db, { name: "Thesis", deadlineDate: "2026-05-28" });

  assert.equal(project.name, "Thesis");
  assert.match(project.color, /^#/);

  const updated = updateProject(db, project.id, { deadlineDate: "2026-05-30" });
  assert.equal(updated.deadlineDate, "2026-05-30");

  createTask(db, {
    title: "Draft chapter",
    projectId: project.id,
    dueDate: "2026-05-20",
    priority: "High",
  });
  createTask(db, {
    title: "Send slides",
    projectId: project.id,
    dueDate: "2026-05-18",
    priority: "Medium",
  });

  const summaries = listProjectSummaries(db);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].openTaskCount, 2);
  assert.equal(summaries[0].nextDueDate, "2026-05-18");
});

test("bulk-style tasks start in review and clear only after due date and priority", () => {
  const db = testDb();
  const task = createTask(db, { title: "Follow up", needsReview: true });

  assert.equal(task.needsReview, true);

  const withDate = updateTask(db, task.id, { dueDate: "2026-05-13" });
  assert.equal(withDate.needsReview, true);

  const withPriority = updateTask(db, task.id, { priority: "Low" });
  assert.equal(withPriority.needsReview, false);
});

test("review tasks cannot be cleared explicitly while review fields are missing", () => {
  const db = testDb();
  const task = createTask(db, { title: "Decide owner", needsReview: true });

  const stillReview = updateTask(db, task.id, { needsReview: false });
  assert.equal(stillReview.needsReview, true);

  const withPriorityOnly = updateTask(db, task.id, {
    priority: "Medium",
    needsReview: false,
  });
  assert.equal(withPriorityOnly.needsReview, true);
});

test("manual tasks without review stay out of review on unrelated edits", () => {
  const db = testDb();
  const task = createTask(db, { title: "Someday", needsReview: false });

  const renamed = updateTask(db, task.id, { title: "Someday maybe" });
  assert.equal(renamed.needsReview, false);
});

test("task completion and reopen preserve direct status semantics", () => {
  const db = testDb();
  const task = createTask(db, {
    title: "Submit form",
    dueDate: "2026-05-13",
    priority: "Medium",
  });

  const done = completeTask(db, task.id);
  assert.equal(done.status, "done");
  assert.ok(done.completedAt);

  const reopened = updateTask(db, task.id, { status: "todo" });
  assert.equal(reopened.status, "todo");
  assert.equal(reopened.completedAt, null);
});

test("task delete is a hard delete", () => {
  const db = testDb();
  const task = createTask(db, { title: "Temporary task" });

  assert.equal(deleteTask(db, task.id), true);
  assert.equal(getTask(db, task.id), null);
});
