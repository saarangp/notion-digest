const { mapProject } = require("./rowMapping");

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function monthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const endDate = new Date(year, monthNumber, 0);
  const end = `${month}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function currentMonth(today = todayIso()) {
  return today.slice(0, 7);
}

function clampDate(date, start, end) {
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

function listCalendarData(db, options = {}) {
  const today = options.today || todayIso();
  const month = options.month || currentMonth(today);
  const { start, end } = monthBounds(month);

  const projectBars = [
    ...listProjectBars(db, start, end),
    ...listDeadlineOnlyBars(db, start, end),
  ].sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate) || a.project.name.localeCompare(b.project.name));

  return {
    month,
    startDate: start,
    endDate: end,
    today,
    taskCounts: listTaskCounts(db, start, end),
    deadlines: listDeadlines(db, start, end),
    projectBars,
    todayInboxCount: countTodayInbox(db, today),
  };
}

function listTaskCounts(db, start, end) {
  return db
    .prepare(`
      SELECT due_date, COUNT(*) AS count
      FROM tasks
      WHERE status = 'todo'
        AND due_date BETWEEN ? AND ?
      GROUP BY due_date
      ORDER BY due_date
    `)
    .all(start, end)
    .map((row) => ({ date: row.due_date, count: row.count }));
}

function listDeadlines(db, start, end) {
  return db
    .prepare(`
      SELECT *
      FROM projects
      WHERE deadline_date BETWEEN ? AND ?
        AND status = 'active'
      ORDER BY deadline_date, lower(name)
    `)
    .all(start, end)
    .map((row) => ({
      project: mapProject(row),
      date: row.deadline_date,
    }));
}

function listProjectBars(db, start, end) {
  return db
    .prepare(`
      SELECT
        p.*,
        MIN(t.due_date) AS earliest_due_date
      FROM projects p
      JOIN tasks t
        ON t.project_id = p.id
       AND t.status = 'todo'
       AND t.due_date IS NOT NULL
      WHERE p.deadline_date IS NOT NULL
        AND p.status = 'active'
        AND p.deadline_date >= ?
      GROUP BY p.id
      HAVING earliest_due_date <= p.deadline_date
         AND earliest_due_date <= ?
      ORDER BY p.deadline_date, lower(p.name)
    `)
    .all(start, end)
    .map((row) => ({
      project: mapProject(row),
      startDate: clampDate(row.earliest_due_date, start, end),
      endDate: clampDate(row.deadline_date, start, end),
      earliestDueDate: row.earliest_due_date,
      deadlineDate: row.deadline_date,
      type: "span",
    }));
}

function listDeadlineOnlyBars(db, start, end) {
  return db
    .prepare(`
      SELECT p.*
      FROM projects p
      WHERE p.deadline_date BETWEEN ? AND ?
        AND p.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM tasks t
          WHERE t.project_id = p.id
            AND t.status = 'todo'
            AND t.due_date IS NOT NULL
            AND t.due_date <= p.deadline_date
        )
      ORDER BY p.deadline_date, lower(p.name)
    `)
    .all(start, end)
    .map((row) => ({
      project: mapProject(row),
      startDate: row.deadline_date,
      endDate: row.deadline_date,
      earliestDueDate: null,
      deadlineDate: row.deadline_date,
      type: "deadline",
    }));
}

function countTodayInbox(db, today) {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM tasks
      WHERE status = 'todo'
        AND needs_review = 1
    `)
    .get();

  return row.count > 0 ? { date: today, count: row.count } : null;
}

module.exports = {
  listCalendarData,
};
