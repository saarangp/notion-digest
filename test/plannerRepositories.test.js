const test = require("node:test");
const assert = require("node:assert/strict");
const { openDatabase } = require("../src/server/db");
const { migrate } = require("../src/server/schema");
const {
  completeProject,
  createProject,
  listProjectSummaries,
  reopenProject,
  updateProject,
} = require("../src/server/repositories/projectsRepository");
const { listCalendarData } = require("../src/server/repositories/calendarRepository");
const {
  listCompletedArchive,
  listCompletionHeatmap,
} = require("../src/server/repositories/analyticsRepository");
const {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  updateTask,
} = require("../src/server/repositories/tasksRepository");
const {
  completeEasyTask,
  createEasyTask,
  deleteEasyTask,
  getEasyTask,
  listEasyTasks,
  updateEasyTask,
} = require("../src/server/repositories/easyTasksRepository");

function testDb() {
  const db = openDatabase(":memory:");
  migrate(db);
  return db;
}

test("projects can be created, updated, and summarized", () => {
  const db = testDb();
  const project = createProject(db, { name: "Thesis", deadlineDate: "2026-05-28" });

  assert.equal(project.name, "Thesis");
  assert.equal(project.status, "active");
  assert.match(project.color, /^#/);

  const updated = updateProject(db, project.id, { deadlineDate: "2026-05-30" });
  assert.equal(updated.deadlineDate, "2026-05-30");

  const recolored = updateProject(db, project.id, { color: "#123456" });
  assert.equal(recolored.color, "#123456");

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

test("projects can only be completed when regular and easy tasks are closed", () => {
  const db = testDb();
  const project = createProject(db, { name: "Launch" });
  const task = createTask(db, {
    title: "Ship",
    projectId: project.id,
    priority: "High",
  });
  const easyTask = createEasyTask(db, {
    title: "Clean notes",
    projectId: project.id,
  });

  assert.throws(() => completeProject(db, project.id), /open tasks/);

  completeTask(db, task.id);
  assert.throws(() => completeProject(db, project.id), /open task/);

  completeEasyTask(db, easyTask.id);
  const done = completeProject(db, project.id);
  assert.equal(done.status, "done");
  assert.ok(done.completedAt);

  const summaries = listProjectSummaries(db);
  assert.equal(summaries.length, 0);
});

test("completed projects can be reopened", () => {
  const db = testDb();
  const project = createProject(db, { name: "Paper" });

  const done = completeProject(db, project.id);
  assert.equal(done.status, "done");

  const reopened = reopenProject(db, project.id);
  assert.equal(reopened.status, "active");
  assert.equal(reopened.completedAt, null);
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

test("easy tasks can be created, completed, reopened, and deleted", () => {
  const db = testDb();
  const project = createProject(db, { name: "Admin" });
  const easyTask = createEasyTask(db, {
    title: "Email receipt",
    projectId: project.id,
  });

  assert.equal(easyTask.title, "Email receipt");
  assert.equal(easyTask.projectId, project.id);
  assert.equal(easyTask.projectName, "Admin");
  assert.equal(easyTask.done, false);

  const renamed = updateEasyTask(db, easyTask.id, {
    title: "Email signed receipt",
    projectId: null,
  });
  assert.equal(renamed.title, "Email signed receipt");
  assert.equal(renamed.projectId, null);

  const done = completeEasyTask(db, easyTask.id);
  assert.equal(done.done, true);
  assert.ok(done.completedAt);

  const reopened = updateEasyTask(db, easyTask.id, { done: false });
  assert.equal(reopened.done, false);
  assert.equal(reopened.completedAt, null);

  assert.equal(deleteEasyTask(db, easyTask.id), true);
  assert.equal(getEasyTask(db, easyTask.id), null);
});

test("easy task listing supports open and completed filters", () => {
  const db = testDb();
  createEasyTask(db, { title: "Open easy" });
  createEasyTask(db, { title: "Done easy", done: true });

  const open = listEasyTasks(db, { done: false });
  const done = listEasyTasks(db, { done: true });

  assert.equal(open.length, 1);
  assert.equal(open[0].title, "Open easy");
  assert.equal(done.length, 1);
  assert.equal(done[0].title, "Done easy");
});

test("calendar data creates project bars only for projects with deadlines", () => {
  const db = testDb();
  const withDeadline = createProject(db, { name: "Paper", deadlineDate: "2026-05-28" });
  const deadlineOnly = createProject(db, { name: "Deadline Only", deadlineDate: "2026-05-20" });
  const withoutDeadline = createProject(db, { name: "Loose Admin" });

  createTask(db, {
    title: "Draft results",
    projectId: withDeadline.id,
    dueDate: "2026-05-14",
    priority: "High",
  });
  createTask(db, {
    title: "Book room",
    projectId: withoutDeadline.id,
    dueDate: "2026-05-16",
    priority: "Low",
  });

  const calendar = listCalendarData(db, { month: "2026-05", today: "2026-05-13" });

  assert.equal(calendar.projectBars.length, 2);
  assert.equal(calendar.projectBars[0].project.id, deadlineOnly.id);
  assert.equal(calendar.projectBars[0].type, "deadline");
  assert.equal(calendar.projectBars[0].startDate, "2026-05-20");
  assert.equal(calendar.projectBars[0].endDate, "2026-05-20");
  assert.equal(calendar.projectBars[1].project.id, withDeadline.id);
  assert.equal(calendar.projectBars[1].type, "span");
  assert.equal(calendar.projectBars[1].startDate, "2026-05-14");
  assert.equal(calendar.projectBars[1].endDate, "2026-05-28");
});

test("calendar project bars use earliest open dated task and ignore done tasks", () => {
  const db = testDb();
  const project = createProject(db, { name: "Chapter", deadlineDate: "2026-05-30" });

  createTask(db, {
    title: "Completed old item",
    projectId: project.id,
    dueDate: "2026-05-10",
    priority: "Medium",
    status: "done",
  });
  createTask(db, {
    title: "Open later item",
    projectId: project.id,
    dueDate: "2026-05-18",
    priority: "High",
  });

  const calendar = listCalendarData(db, { month: "2026-05", today: "2026-05-13" });

  assert.equal(calendar.projectBars.length, 1);
  assert.equal(calendar.projectBars[0].earliestDueDate, "2026-05-18");
  assert.equal(calendar.projectBars[0].deadlineDate, "2026-05-30");
});

test("calendar counts dated open tasks but leaves undated inbox out of dated work", () => {
  const db = testDb();
  const project = createProject(db, { name: "Ops", deadlineDate: "2026-05-25" });

  createTask(db, {
    title: "Dated inbox",
    projectId: project.id,
    dueDate: "2026-05-13",
    priority: "Medium",
    needsReview: true,
  });
  createTask(db, {
    title: "Reviewed dated",
    dueDate: "2026-05-13",
    priority: "Low",
  });
  createTask(db, {
    title: "Undated inbox",
    needsReview: true,
  });
  createTask(db, {
    title: "Done dated",
    dueDate: "2026-05-13",
    priority: "High",
    status: "done",
  });

  const calendar = listCalendarData(db, { month: "2026-05", today: "2026-05-13" });

  assert.deepEqual(calendar.taskCounts, [{ date: "2026-05-13", count: 2 }]);
  assert.deepEqual(calendar.todayInboxCount, { date: "2026-05-13", count: 2 });
});

test("calendar includes deadline markers without task titles", () => {
  const db = testDb();
  const project = createProject(db, { name: "Defense", deadlineDate: "2026-05-20" });

  createTask(db, {
    title: "Private task title",
    projectId: project.id,
    dueDate: "2026-05-18",
    priority: "High",
  });

  const calendar = listCalendarData(db, { month: "2026-05", today: "2026-05-13" });

  assert.equal(calendar.deadlines.length, 1);
  assert.equal(calendar.deadlines[0].date, "2026-05-20");
  assert.equal(calendar.deadlines[0].project.name, "Defense");
  assert.equal(JSON.stringify(calendar).includes("Private task title"), false);
});

test("calendar excludes completed project deadlines and bars", () => {
  const db = testDb();
  const project = createProject(db, { name: "Done Project", deadlineDate: "2026-05-20" });

  completeProject(db, project.id);
  const calendar = listCalendarData(db, { month: "2026-05", today: "2026-05-13" });

  assert.equal(calendar.deadlines.length, 0);
  assert.equal(calendar.projectBars.length, 0);
});

test("analytics heatmap groups completed regular and easy tasks by local completion date", () => {
  const db = testDb();
  const project = createProject(db, { name: "Writing" });

  createTask(db, {
    title: "Finish draft",
    projectId: project.id,
    status: "done",
    completedAt: "2026-05-02T12:00:00.000Z",
  });
  createTask(db, {
    title: "Send draft",
    status: "done",
    completedAt: "2026-05-02T20:00:00.000Z",
  });
  createEasyTask(db, {
    title: "Clear desk",
    done: true,
    completedAt: "2026-05-02T21:00:00.000Z",
  });
  createEasyTask(db, {
    title: "Later admin",
    done: true,
    completedAt: "2026-05-03T12:00:00.000Z",
  });
  createTask(db, {
    title: "Open item",
    completedAt: "2026-05-02T12:00:00.000Z",
  });

  const heatmap = listCompletionHeatmap(db, {
    startDate: "2026-05-02",
    endDate: "2026-05-03",
  });

  assert.deepEqual(heatmap, [
    { date: "2026-05-02", count: 3 },
    { date: "2026-05-03", count: 1 },
  ]);
});

test("analytics completed archive includes regular and easy tasks with project metadata", () => {
  const db = testDb();
  const project = createProject(db, { name: "Admin", color: "#123456" });

  const regular = createTask(db, {
    title: "Submit receipt",
    projectId: project.id,
    status: "done",
    completedAt: "2026-05-03T12:00:00.000Z",
  });
  const easy = createEasyTask(db, {
    title: "Email office",
    done: true,
    completedAt: "2026-05-04T12:00:00.000Z",
  });

  const archive = listCompletedArchive(db);

  assert.equal(archive.length, 2);
  assert.deepEqual(archive[0], {
    id: easy.id,
    title: "Email office",
    projectId: null,
    projectName: null,
    projectColor: null,
    completedAt: "2026-05-04T12:00:00.000Z",
    completedDate: "2026-05-04",
    type: "easy",
  });
  assert.deepEqual(archive[1], {
    id: regular.id,
    title: "Submit receipt",
    projectId: project.id,
    projectName: "Admin",
    projectColor: "#123456",
    completedAt: "2026-05-03T12:00:00.000Z",
    completedDate: "2026-05-03",
    type: "task",
  });
});

test("analytics completed archive search matches title, project, and type", () => {
  const db = testDb();
  const project = createProject(db, { name: "Dissertation" });

  createTask(db, {
    title: "Archive notes",
    projectId: project.id,
    status: "done",
    completedAt: "2026-05-03T12:00:00.000Z",
  });
  createTask(db, {
    title: "Pay invoice",
    status: "done",
    completedAt: "2026-05-04T12:00:00.000Z",
  });
  createEasyTask(db, {
    title: "Stretch",
    done: true,
    completedAt: "2026-05-05T12:00:00.000Z",
  });

  assert.deepEqual(
    listCompletedArchive(db, { search: "notes" }).map((row) => row.title),
    ["Archive notes"],
  );
  assert.deepEqual(
    listCompletedArchive(db, { search: "dissertation" }).map((row) => row.title),
    ["Archive notes"],
  );
  assert.deepEqual(
    listCompletedArchive(db, { search: "easy" }).map((row) => row.title),
    ["Stretch"],
  );
});
