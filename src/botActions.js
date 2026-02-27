function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function shiftIsoDate(isoDate, days) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function createPendingAction({ action, taskId, userId, details, ttlMinutes }) {
  const now = Date.now();
  return {
    id: `pa_${now}_${Math.random().toString(36).slice(2, 10)}`,
    action,
    taskId,
    userId,
    details,
    createdAt: now,
    expiresAt: now + ttlMinutes * 60 * 1000,
  };
}

function buildNotionUpdateForAction({ action, task, details, config }) {
  if (!task || !task.id) {
    throw new Error("Task not found for action.");
  }

  if (action === "done") {
    return {
      properties: {
        [config.notionDoneCheckboxProp]: { checkbox: true },
      },
      summary: `Marked done: ${task.title}`,
    };
  }

  if (action === "reschedule") {
    if (!isIsoDate(details?.targetDate)) {
      throw new Error("Invalid target date. Use YYYY-MM-DD.");
    }

    return {
      properties: {
        [config.notionDueProp]: { date: { start: details.targetDate } },
      },
      summary: `Rescheduled: ${task.title} -> ${details.targetDate}`,
    };
  }

  if (action === "defer") {
    const days = Number(details?.days || 0);
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error("Invalid defer days.");
    }
    if (!isIsoDate(task.dueIso)) {
      throw new Error("Task has no valid due date to defer.");
    }

    const targetDate = shiftIsoDate(task.dueIso, days);
    return {
      properties: {
        [config.notionDueProp]: { date: { start: targetDate } },
      },
      summary: `Deferred: ${task.title} +${days}d -> ${targetDate}`,
    };
  }

  throw new Error(`Unsupported action: ${action}`);
}

module.exports = {
  isIsoDate,
  shiftIsoDate,
  createPendingAction,
  buildNotionUpdateForAction,
};
