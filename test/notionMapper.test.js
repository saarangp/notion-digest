const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapNotionPageToImportTask,
  mapPriority,
} = require("../src/importers/notionMapper");

function page({ priority, status = "In Progress", done = false, project = null } = {}) {
  return {
    id: "page-id",
    url: "https://notion.so/page-id",
    last_edited_time: "2026-05-01T12:00:00.000Z",
    properties: {
      Task: { type: "title", title: [{ plain_text: "Write chapter" }] },
      Priority: { type: "select", select: priority ? { name: priority } : null },
      Status: { type: "status", status: status ? { name: status } : null },
      Due: { type: "date", date: { start: "2026-05-13" } },
      Project: { type: "select", select: project ? { name: project } : null },
      done: { type: "checkbox", checkbox: done },
      estimated_minutes: { type: "number", number: 45 },
      "Completed time": { type: "date", date: null },
    },
  };
}

test("maps Notion priority values to planner priority labels", () => {
  assert.equal(mapPriority("p0"), "High");
  assert.equal(mapPriority("p1"), "Medium");
  assert.equal(mapPriority("p2"), "Medium");
  assert.equal(mapPriority("p3"), "Low");
  assert.equal(mapPriority(null), "Low");
});

test("maps a Notion page to local import task shape", () => {
  const task = mapNotionPageToImportTask(page({ priority: "p1", project: "Thesis" }));

  assert.equal(task.title, "Write chapter");
  assert.equal(task.priority, "Medium");
  assert.equal(task.status, "todo");
  assert.equal(task.dueDate, "2026-05-13");
  assert.equal(task.projectName, "Thesis");
  assert.equal(task.importedFrom, "notion");
  assert.equal(task.importedId, "page-id");
});

test("closed Notion pages map to done tasks", () => {
  const task = mapNotionPageToImportTask(page({ status: "done" }));

  assert.equal(task.status, "done");
  assert.equal(task.completedAt, "2026-05-01T12:00:00.000Z");
});
