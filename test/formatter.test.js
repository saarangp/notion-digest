const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function runFormatter(pages) {
  const result = spawnSync("node", ["src/formatter.js"], {
    input: JSON.stringify(pages),
    encoding: "utf8",
    cwd: ROOT,
  });
  if (result.error) throw result.error;
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

// Builds a minimal valid Notion page object
function makePage({
  title = "Test Task",
  priority = "p2",
  status = "In Progress",
  dueDate = "2099-12-31",
  estimatedMinutes = 30,
  project = "Work",
  hardDeadline = false,
  done = false,
} = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: "2026-01-01T00:00:00.000Z",
    url: "https://notion.so/test",
    properties: {
      Task: { type: "title", title: [{ plain_text: title }] },
      Priority: { type: "select", select: priority ? { name: priority } : null },
      Status: { type: "status", status: status ? { name: status } : null },
      Due: { type: "date", date: dueDate ? { start: dueDate } : null },
      estimated_minutes: { type: "number", number: estimatedMinutes },
      Project: { type: "select", select: project ? { name: project } : null },
      done: { type: "checkbox", checkbox: done },
      "Hard Deadline": { type: "checkbox", checkbox: hardDeadline },
      "Created time": { type: "created_time", created_time: "2026-01-01T00:00:00.000Z" },
      "Last edited time": {
        type: "last_edited_time",
        last_edited_time: "2026-01-01T00:00:00.000Z",
      },
    },
  };
}

test("formats a single open task into compact output", () => {
  const pages = [makePage({ title: "Write report", dueDate: "2099-12-31" })];
  const { stdout, status } = runFormatter(pages);
  assert.strictEqual(status, 0);
  assert.match(stdout, /Write report/);
  assert.match(stdout, /LATER/);
  assert.match(stdout, /p2/);
  assert.match(stdout, /Work/);
});

test("flags hard deadline tasks with [HARD DEADLINE]", () => {
  const pages = [
    makePage({ title: "Submit paper", dueDate: "2099-12-31", hardDeadline: true }),
  ];
  const { stdout, status } = runFormatter(pages);
  assert.strictEqual(status, 0);
  assert.match(stdout, /\[HARD DEADLINE\]/);
});

test("does not flag normal tasks as hard deadline", () => {
  const pages = [makePage({ title: "Buy milk", dueDate: "2099-12-31", hardDeadline: false })];
  const { stdout } = runFormatter(pages);
  assert.doesNotMatch(stdout, /\[HARD DEADLINE\]/);
});

test("places overdue tasks in OVERDUE bucket", () => {
  const pages = [makePage({ title: "Fix old bug", dueDate: "2020-01-01" })];
  const { stdout, status } = runFormatter(pages);
  assert.strictEqual(status, 0);
  assert.match(stdout, /OVERDUE/);
  assert.match(stdout, /Fix old bug/);
});

test("filters out done tasks", () => {
  const pages = [makePage({ title: "Already done", dueDate: "2099-12-31", done: true })];
  const { stdout } = runFormatter(pages);
  assert.doesNotMatch(stdout, /Already done/);
});

test("filters out tasks with Done status", () => {
  const pages = [makePage({ title: "Status done task", dueDate: "2099-12-31", status: "done" })];
  const { stdout } = runFormatter(pages);
  assert.doesNotMatch(stdout, /Status done task/);
});

test("handles empty input gracefully", () => {
  const { stdout, status } = runFormatter([]);
  assert.strictEqual(status, 0);
  assert.match(stdout, /No open tasks/);
});

test("includes estimated minutes in output", () => {
  const pages = [makePage({ title: "Long task", dueDate: "2099-12-31", estimatedMinutes: 90 })];
  const { stdout } = runFormatter(pages);
  assert.match(stdout, /1h 30m/);
});

test("handles tasks without due dates separately", () => {
  const pages = [makePage({ title: "Undated task", dueDate: null })];
  const { stdout, status } = runFormatter(pages);
  assert.strictEqual(status, 0);
  assert.match(stdout, /Undated task/);
});
