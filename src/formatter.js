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
