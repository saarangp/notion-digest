# Agentic Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GitHub Actions + Discord bot with a token-efficient formatter CLI and two scheduled remote Claude agents (morning + evening), backed by on-demand Claude Code cowork.

**Architecture:** A new `src/formatter.js` reads raw Notion MCP JSON from stdin, reuses `digestService.js` preprocessing/scoring logic, and outputs a compact ~500-token plain-text summary that remote agents reason over. Two `/schedule` remote cron agents (morning 9am PDT, evening 7pm PDT) fetch tasks, pipe through the formatter, reason with Haiku, and post to Discord. Dead code (GitHub Actions workflow, Discord bot files) is deleted.

**Tech Stack:** Node.js 20, `@notionhq/client` (via digestService.js), Claude Code `/schedule`, Notion MCP, Google Calendar MCP, Discord webhook (curl)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/formatter.js` | stdin JSON → compact task summary stdout |
| Modify | `src/config.js` | Add `notionHardDeadlineProp` config key |
| Modify | `src/digestService.js` | Export `preprocessTask`, `scoreTask`, `rankTasks`, `getBucket`, `duePhrase`, `formatMinutes`, `getTodayIso`, `extractProperty`, `isClosed` |
| Create | `test/formatter.test.js` | Tests for formatter output |
| Delete | `.github/workflows/notion-digest.yml` | Replaced by remote agents |
| Delete | `src/discordBotService.js` | Discord bot removed |
| Delete | `src/botActions.js` | Discord bot removed |
| Delete | `src/botStateStore.js` | Discord bot removed |
| Delete | `test/botActions.test.js` | Tests for deleted code |
| Configure | Morning remote agent | `/schedule` cron trigger, 9am PDT |
| Configure | Evening remote agent | `/schedule` cron trigger, 7pm PDT |

---

## Task 1: Add `notionHardDeadlineProp` to config

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add the config key**

In `src/config.js`, find the block of `notion*Prop` keys (around line 62) and add one line:

```js
  notionHardDeadlineProp: process.env.NOTION_HARD_DEADLINE_PROP || "Hard Deadline",
```

The full block should look like:
```js
  notionTaskProp: process.env.NOTION_TASK_PROP || "Task",
  notionPriorityProp: process.env.NOTION_PRIORITY_PROP || "Priority",
  notionStatusProp: process.env.NOTION_STATUS_PROP || "Status",
  notionDueProp: process.env.NOTION_DUE_PROP || "Due",
  notionDoneCheckboxProp: process.env.NOTION_DONE_CHECKBOX_PROP || "done",
  notionProjectProp: process.env.NOTION_PROJECT_PROP || "Project",
  notionEstimatedMinutesProp: process.env.NOTION_ESTIMATED_MINUTES_PROP || "estimated_minutes",
  notionCreatedTimeProp: process.env.NOTION_CREATED_TIME_PROP || "Created time",
  notionLastEditedProp: process.env.NOTION_LAST_EDITED_PROP || "Last edited time",
  notionHardDeadlineProp: process.env.NOTION_HARD_DEADLINE_PROP || "Hard Deadline",
```

- [ ] **Step 2: Commit**

```bash
git add src/config.js
git commit -m "feat: add notionHardDeadlineProp config key"
```

---

## Task 2: Export helper functions from digestService.js

**Files:**
- Modify: `src/digestService.js:2305-2321`

`formatter.js` needs these functions that are currently private. Add them to `module.exports` without changing any function bodies.

- [ ] **Step 1: Update module.exports**

Replace the existing `module.exports` block at the bottom of `src/digestService.js` with:

```js
module.exports = {
  notion,
  mapPageToTask,
  runDigest,
  computeDigest,
  pickFutureLoadRisks,
  buildPlanningCandidates,
  buildProjectPlans,
  buildProjectBlocks,
  buildOneOffProjectPlan,
  buildDeterministicMorningDecisionIds,
  computeFreeSlots,
  reserveFocusBuffer,
  shouldRunThisHour,
  getLocalHour,
  truncate,
  // Exported for formatter.js
  preprocessTask,
  scoreTask,
  rankTasks,
  extractProperty,
  getTodayIso,
  getBucket,
  duePhrase,
  formatMinutes,
  isClosed,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/digestService.js
git commit -m "feat: export formatter helpers from digestService"
```

---

## Task 3: Write failing tests for formatter.js

**Files:**
- Create: `test/formatter.test.js`

- [ ] **Step 1: Create the test file**

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail (formatter.js doesn't exist yet)**

```bash
node --test test/formatter.test.js
```

Expected: errors about missing module `./src/formatter.js`

---

## Task 4: Implement formatter.js

**Files:**
- Create: `src/formatter.js`

- [ ] **Step 1: Create the formatter**

```js
const {
  mapPageToTask,
  preprocessTask,
  scoreTask,
  rankTasks,
  extractProperty,
  getTodayIso,
  duePhrase,
  formatMinutes,
  isClosed,
} = require("./digestService");
const { config, BUCKETS } = require("./config");

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    process.stdout.write("No tasks.\n");
    return;
  }

  const pages = JSON.parse(raw);
  const todayIso = getTodayIso(config.timezone);

  const tasks = pages.map((page) => ({
    ...mapPageToTask(page),
    hardDeadline: extractProperty(page, config.notionHardDeadlineProp) === true,
  }));

  const open = tasks.filter((t) => !isClosed(t));

  if (open.length === 0) {
    process.stdout.write("No open tasks.\n");
    return;
  }

  const withDue = open.filter((t) => t.dueIso);
  const withoutDue = open.filter((t) => !t.dueIso);

  const ranked = rankTasks(withDue.map((t) => scoreTask(preprocessTask(t, todayIso))));

  const buckets = {
    [BUCKETS.OVERDUE]: [],
    [BUCKETS.DUE_TODAY]: [],
    [BUCKETS.DUE_SOON]: [],
    [BUCKETS.LATER]: [],
  };
  for (const task of ranked) buckets[task.bucket].push(task);

  const lines = [];

  for (const [bucket, label] of [
    [BUCKETS.OVERDUE, "OVERDUE"],
    [BUCKETS.DUE_TODAY, "DUE TODAY"],
    [BUCKETS.DUE_SOON, "DUE SOON"],
    [BUCKETS.LATER, "LATER"],
  ]) {
    const group = buckets[bucket];
    if (!group.length) continue;
    lines.push(`${label} (${group.length}):`);
    for (const task of group) {
      const hd = task.hardDeadline ? " [HARD DEADLINE]" : "";
      const mins = formatMinutes(task.estimatedMinutes);
      lines.push(
        `- ${task.title} | ${task.priority || "none"} | ${duePhrase(task.dueInDays)} | ${task.project} | ${mins}${hd}`,
      );
    }
    lines.push("");
  }

  if (withoutDue.length) {
    lines.push(`NO DUE DATE (${withoutDue.length}):`);
    for (const task of withoutDue) {
      const hd = task.hardDeadline ? " [HARD DEADLINE]" : "";
      const mins = formatMinutes(task.estimatedMinutes);
      lines.push(`- ${task.title} | ${task.priority || "none"} | ${task.project} | ${mins}${hd}`);
    }
    lines.push("");
  }

  process.stdout.write(lines.join("\n"));
}

main().catch((err) => {
  process.stderr.write(`formatter error: ${err.message}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run the tests**

```bash
node --test test/formatter.test.js
```

Expected: all 9 tests pass

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all existing tests pass

- [ ] **Step 4: Smoke test with empty input**

```bash
echo '[]' | node src/formatter.js
```

Expected output:
```
No open tasks.
```

- [ ] **Step 5: Commit**

```bash
git add src/formatter.js test/formatter.test.js
git commit -m "feat: add token-efficient task formatter CLI"
```

---

## Task 5: Delete dead code

**Files:**
- Delete: `.github/workflows/notion-digest.yml`
- Delete: `src/discordBotService.js`
- Delete: `src/botActions.js`
- Delete: `src/botStateStore.js`
- Delete: `test/botActions.test.js`

- [ ] **Step 1: Delete the files**

```bash
git rm .github/workflows/notion-digest.yml \
       src/discordBotService.js \
       src/botActions.js \
       src/botStateStore.js \
       test/botActions.test.js
```

- [ ] **Step 2: Run tests to confirm nothing breaks**

```bash
npm test
```

Expected: all remaining tests pass (botActions tests are gone, formatter tests pass)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove GitHub Actions workflow and Discord bot files"
```

---

## Task 6: Push to GitHub

The remote agents check out the repo fresh on each run. Changes must be on `main` before creating the agents.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Verify on GitHub**

Confirm `src/formatter.js` is visible and `.github/workflows/notion-digest.yml` is gone.

---

## Task 7: Create the morning remote agent

Use the `/schedule` skill to create this trigger. The prompt below is complete and self-contained — paste it exactly when prompted.

**Schedule:** `0 16 * * *` (9am PDT = 16:00 UTC)
**Model:** `claude-haiku-4-5-20251001`
**MCP connections:** Notion, Google Calendar (once connected)
**Repo:** `https://github.com/saarangp/notion-digest`

**Agent prompt** (fill in `[NOTION_DATABASE_ID]` and `[DISCORD_WEBHOOK_URL]` before creating):

```
You are a personal task planning agent. Run each morning to generate a focused plan for the day.

## Setup
Run these first:
```bash
cd /workspace
npm install --silent
```

## Step 1: Get today's date
```bash
node -e "console.log(new Date().toLocaleDateString('en-CA', {timeZone: 'America/Los_Angeles'}))"
```

## Step 2: Fetch open tasks from Notion
Use the Notion MCP to query database [NOTION_DATABASE_ID] for all pages where:
- Status is not "done" / "Done"
- Due date is within the next 14 days, OR is overdue

Write the resulting pages array as JSON to /tmp/tasks.json.

## Step 3: Compress tasks
```bash
node src/formatter.js < /tmp/tasks.json > /tmp/formatted.txt
cat /tmp/formatted.txt
```

## Step 4: Fetch today's calendar (if Google Calendar MCP is available)
Get today's events. Note total blocked time.

## Step 5: Generate morning plan
Reason over /tmp/formatted.txt. Rules:
- Tasks marked [HARD DEADLINE] are immovable — always include in focus list
- Pick top 3 focus tasks (hard deadlines take priority over score)
- Note calendar capacity if available

## Step 6: Post to Discord
```bash
curl -s -X POST "[DISCORD_WEBHOOK_URL]" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"$(cat /tmp/morning-plan.txt | sed 's/"/\\"/g')\"}"
```

Write your message to /tmp/morning-plan.txt first, then post it. Format:

```
MORNING PLAN — [date]

🔴 MUST DO:
[list [HARD DEADLINE] tasks only — omit section if none]

🎯 TOP 3 FOCUS:
1. [task name] — [why / due context]
2. [task name] — [why / due context]
3. [task name] — [why / due context]

⏱ CAPACITY: [e.g. "2 meetings (~3h blocked). Keep focus tasks realistic." — omit if no calendar]
```

Keep the message under 20 lines. No filler. Be direct.
```

- [ ] **Step 1: Connect Google Calendar MCP first (if not done)**

Go to https://claude.ai/settings/connectors and connect Google Calendar.

- [ ] **Step 2: Invoke `/schedule` and create the morning trigger**

Use the `/schedule` skill. Fill in `[NOTION_DATABASE_ID]` (from your `.env` or GitHub secrets) and `[DISCORD_WEBHOOK_URL]` in the prompt above before creating.

- [ ] **Step 3: Test it immediately**

Use "Run now" in the schedule UI or via `/schedule` → run. Confirm a Discord message arrives.

---

## Task 8: Create the evening remote agent

**Schedule:** `0 2 * * *` (7pm PDT = 02:00 UTC next calendar day)
**Model:** `claude-haiku-4-5-20251001`
**MCP connections:** Notion
**Repo:** `https://github.com/saarangp/notion-digest`

**Agent prompt** (fill in `[NOTION_DATABASE_ID]` and `[DISCORD_WEBHOOK_URL]`):

```
You are a personal task planning agent. Run each evening to sweep today's incomplete tasks.

## Setup
```bash
cd /workspace
npm install --silent
```

## Step 1: Get today's date
```bash
node -e "console.log(new Date().toLocaleDateString('en-CA', {timeZone: 'America/Los_Angeles'}))"
```

## Step 2: Fetch today's open tasks from Notion
Use the Notion MCP to query database [NOTION_DATABASE_ID] for pages where:
- Due date is today's date
- Status is not "done" / "Done"

Also fetch tasks completed today if the MCP supports filtering by last_edited_time.

Write the open tasks array as JSON to /tmp/tasks-open.json.

## Step 3: Compress open tasks
```bash
node src/formatter.js < /tmp/tasks-open.json > /tmp/formatted.txt
cat /tmp/formatted.txt
```

## Step 4: Generate evening sweep
Reason over the open tasks. Rules:
- Tasks marked [HARD DEADLINE] that are NOT done: escalate with urgency. Do NOT silently defer.
- Soft tasks still open: they will naturally roll to tomorrow (Notion due date stays, you just note them)
- Keep tone direct, no judgment

## Step 5: Post to Discord
Write your message to /tmp/evening-sweep.txt, then post:
```bash
curl -s -X POST "[DISCORD_WEBHOOK_URL]" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"$(cat /tmp/evening-sweep.txt | sed 's/"/\\"/g')\"}"
```

Format:
```
EVENING SWEEP — [date]

✅ DONE TODAY: [count] tasks [or "none tracked"]

⚠️ STILL OPEN:
[for each open task:]
- [HARD DEADLINE] [task name] — NOT DONE. Address tonight or first thing tomorrow.
- [task name] — carries to tomorrow

📋 TOMORROW: [1-2 sentence summary of what tomorrow looks like given open items]
```

Keep under 20 lines. No filler.
```

- [ ] **Step 1: Invoke `/schedule` and create the evening trigger**

Use the `/schedule` skill with the prompt above (filled in).

- [ ] **Step 2: Test it immediately**

Use "Run now". Confirm a Discord message arrives.

---

## Self-Review

**Spec coverage check:**
- ✅ `src/formatter.js` built — token-efficient compression (Tasks 3-4)
- ✅ Hard Deadline checkbox detection (Tasks 1, 4)
- ✅ Morning agent with hard deadline escalation (Task 7)
- ✅ Evening agent with no-silent-defer rule (Task 8)
- ✅ Dead code removed — GH Actions, Discord bot (Task 5)
- ✅ Tests cover: formatting, hard deadline flag, overdue bucket, done filtering, empty input, no-due-date tasks
- ✅ On-demand cowork: no build needed — works via Notion MCP in any Claude Code session

**No placeholders present.** All code is complete. Agent prompts are fully specified.

**Type consistency:** `mapPageToTask`, `preprocessTask`, `scoreTask`, `rankTasks` signatures match across digestService.js and formatter.js. `extractProperty` is the same function used in digestService.js.
