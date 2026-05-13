const test = require("node:test");
const assert = require("node:assert/strict");
const { openDatabase } = require("../src/server/db");
const { migrate } = require("../src/server/schema");
const { listProjects } = require("../src/server/repositories/projectsRepository");
const { listTasks } = require("../src/server/repositories/tasksRepository");
const {
  importMappedTasks,
  resolveProjectName,
  shouldImportTask,
} = require("../src/importers/notionImport");

function testDb() {
  const db = openDatabase(":memory:");
  migrate(db);
  return db;
}

function mappedTask(overrides = {}) {
  return {
    title: "Write chapter",
    priority: "Medium",
    status: "todo",
    dueDate: "2026-05-13",
    projectName: null,
    relationProjectIds: [],
    estimatedMinutes: 45,
    completedAt: null,
    importedFrom: "notion",
    importedId: overrides.importedId || "page-id",
    importedUrl: "https://notion.so/page-id",
    ...overrides,
  };
}

test("Notion import cutoff keeps open tasks and recent completed tasks", () => {
  const now = new Date("2026-05-13T12:00:00.000Z");

  assert.equal(shouldImportTask(mappedTask(), { now, completedImportDays: 90 }), true);
  assert.equal(
    shouldImportTask(
      mappedTask({
        status: "done",
        completedAt: "2026-05-01T12:00:00.000Z",
      }),
      { now, completedImportDays: 90 },
    ),
    true,
  );
  assert.equal(
    shouldImportTask(
      mappedTask({
        status: "done",
        completedAt: "2025-12-01T12:00:00.000Z",
      }),
      { now, completedImportDays: 90 },
    ),
    false,
  );
});

test("Notion import creates and reuses projects while skipping duplicate imported tasks", async () => {
  const db = testDb();
  const tasks = [
    mappedTask({ importedId: "one", projectName: "Thesis" }),
    mappedTask({ importedId: "two", projectName: "Thesis", title: "Send chapter" }),
    mappedTask({ importedId: "one", projectName: "Thesis", title: "Duplicate" }),
  ];

  const stats = await importMappedTasks(db, tasks, {
    now: new Date("2026-05-13T12:00:00.000Z"),
    completedImportDays: 90,
  });

  assert.deepEqual(stats, {
    scanned: 3,
    imported: 2,
    skippedDuplicate: 1,
    skippedOldCompleted: 0,
    projectsCreated: 1,
  });
  assert.deepEqual(listProjects(db).map((project) => project.name), ["Thesis"]);
  assert.deepEqual(listTasks(db).map((task) => task.title).sort(), ["Send chapter", "Write chapter"]);
});

test("Notion import skips completed tasks outside the recent window", async () => {
  const db = testDb();
  const stats = await importMappedTasks(
    db,
    [
      mappedTask({
        importedId: "old",
        status: "done",
        completedAt: "2025-12-01T12:00:00.000Z",
      }),
    ],
    {
      now: new Date("2026-05-13T12:00:00.000Z"),
      completedImportDays: 90,
    },
  );

  assert.equal(stats.imported, 0);
  assert.equal(stats.skippedOldCompleted, 1);
  assert.equal(listTasks(db).length, 0);
});

test("Notion import resolves relation project names when no select project is present", async () => {
  const db = testDb();
  const stats = await importMappedTasks(
    db,
    [mappedTask({ relationProjectIds: ["relation-page-id"] })],
    {
      relationProjectName: async (pageId) => (pageId === "relation-page-id" ? "Research" : null),
    },
  );

  assert.equal(stats.imported, 1);
  assert.deepEqual(listProjects(db).map((project) => project.name), ["Research"]);
  assert.equal(listTasks(db)[0].projectName, "Research");
});

test("select project names take precedence over relation project names", async () => {
  const name = await resolveProjectName(
    mappedTask({ projectName: "Selected", relationProjectIds: ["relation-page-id"] }),
    async () => "Related",
  );

  assert.equal(name, "Selected");
});
