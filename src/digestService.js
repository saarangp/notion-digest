const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("@notionhq/client");
const {
  config,
  MODE_MORNING,
  MODE_EVENING,
  BUCKETS,
  PRIORITY_TO_NUMERIC,
  parseInteger,
} = require("./config");
const { log } = require("./logger");

const notion = new Client({ auth: config.notionApiKey });
const PLANNER_EVENT_SOURCE = "notion-digest/day-planner";
const GEMINI_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["s"],
  properties: {
    s: {
      type: "string",
      description: "Single concise summary sentence (<=120 chars).",
    },
  },
};

const GEMINI_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["order", "start_now", "if_constrained"],
  properties: {
    order: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
    start_now: {
      type: "string",
      description: "First focused block suggestion (<=120 chars).",
    },
    if_constrained: {
      type: "string",
      description: "Single fallback if the day gets constrained (<=120 chars).",
    },
  },
};

const GEMINI_PROJECT_ORDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["project_order"],
  properties: {
    project_order: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", minLength: 1 },
    },
  },
};

async function runDigest(mode) {
  const digest = await computeDigest(mode);
  const operations =
    mode === MODE_EVENING
      ? await runEveningAutoRollover(digest.todayIso, digest.ranked)
      : mode === MODE_MORNING
        ? await runMorningBlockPlanner(digest.todayIso, digest.ranked)
        : null;

  await postNotification(appendOperationalNotes(digest.text, operations));
  await writeDailyLog({
    todayIso: digest.todayIso,
    ranked: digest.ranked,
    top3: digest.top3,
    capacity: digest.capacity,
    mode,
    operations,
  });
}

async function computeDigest(mode) {
  const todayIso = getTodayIso(config.timezone);
  const horizonDays =
    mode === MODE_EVENING ? 0 : Math.max(config.dueWindowDays, config.planningHorizonDays);
  const endIso = addDaysIso(todayIso, horizonDays);
  const tasks = await fetchTasks(mode, todayIso, endIso);
  const eveningProgress =
    mode === MODE_EVENING ? await fetchEveningProgressStats(todayIso) : null;

  const preprocessed = tasks.map((task) => preprocessTask(task, todayIso));
  const scored = preprocessed.map((task) => scoreTask(task));
  const ranked = rankTasks(scored);
  const top3 = pickTop3(ranked);

  const capacity = await getCapacity(top3, todayIso);
  const suggestedDefer = pickSuggestedDefer(top3, capacity);

  const aiSummary = await maybeGenerateGeminiSummary({
    tasks: ranked,
    todayIso,
  });
  const aiPlan =
    mode === MODE_EVENING
      ? null
      : await maybeGenerateGeminiPlan({
          tasks: ranked,
          top3,
          capacity,
          todayIso,
        });

  const text = buildDigestText({
    mode,
    todayIso,
    ranked,
    top3,
    capacity,
    suggestedDefer,
    aiSummary,
    aiPlan,
    eveningProgress,
  });

  return {
    mode,
    todayIso,
    ranked,
    top3,
    capacity,
    suggestedDefer,
    aiSummary,
    aiPlan,
    eveningProgress,
    text,
  };
}

async function fetchTasks(mode, todayIso, endIso) {
  const dueFilter =
    mode === MODE_EVENING
      ? { property: config.notionDueProp, date: { on_or_before: todayIso } }
      : { property: config.notionDueProp, date: { on_or_before: endIso } };

  let cursor;
  const pages = [];

  do {
    const response = await notion.databases.query({
      database_id: config.notionDatabaseId,
      filter: dueFilter,
      page_size: 100,
      start_cursor: cursor,
    });

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  const tasks = pages
    .map((page) => mapPageToTask(page))
    .filter((task) => task.dueIso)
    .filter((task) => !isClosed(task));

  await resolveProjectNames(tasks);
  return tasks;
}

async function fetchEveningProgressStats(todayIso) {
  const tomorrowIso = addDaysIso(todayIso, 1);

  const [editedTodayPages, dueTodayPages] = await Promise.all([
    queryPages({
      and: [
        {
          timestamp: "last_edited_time",
          last_edited_time: { on_or_after: todayIso },
        },
        {
          timestamp: "last_edited_time",
          last_edited_time: { before: tomorrowIso },
        },
      ],
    }),
    queryPages({
      property: config.notionDueProp,
      date: { equals: todayIso },
    }),
  ]);

  const completedToday = editedTodayPages
    .map((page) => mapPageToTask(page))
    .filter((task) => isClosed(task)).length;

  const pendingDueToday = dueTodayPages
    .map((page) => mapPageToTask(page))
    .filter((task) => !isClosed(task)).length;

  return {
    completedToday,
    pendingDueToday,
  };
}

async function queryPages(filter) {
  let cursor;
  const pages = [];

  do {
    const response = await notion.databases.query({
      database_id: config.notionDatabaseId,
      filter,
      page_size: 100,
      start_cursor: cursor,
    });

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function mapPageToTask(page) {
  const title = extractProperty(page, config.notionTaskProp) || "Untitled";
  const priority = String(extractProperty(page, config.notionPriorityProp) || "").toLowerCase();
  const status = extractProperty(page, config.notionStatusProp) || "";
  const dueRaw = extractProperty(page, config.notionDueProp);
  const doneChecked = extractProperty(page, config.notionDoneCheckboxProp) === true;
  const projectProperty = page.properties[config.notionProjectProp];
  const relationProjectIds =
    projectProperty && projectProperty.type === "relation"
      ? projectProperty.relation.map((item) => item.id)
      : [];
  const projectRaw = extractProperty(page, config.notionProjectProp) || "unassigned";
  const estimated = parseInteger(extractProperty(page, config.notionEstimatedMinutesProp), config.defaultEstimatedMinutes);
  const createdRaw =
    extractProperty(page, config.notionCreatedTimeProp) || page.created_time || null;
  const lastEditedRaw =
    extractProperty(page, config.notionLastEditedProp) || page.last_edited_time || null;

  return {
    id: page.id,
    title,
    priority,
    status,
    dueIso: normalizeIsoDate(dueRaw),
    doneChecked,
    project: normalizeProject(projectRaw),
    relationProjectIds,
    estimatedMinutes: clampMinutes(estimated, config.defaultEstimatedMinutes),
    createdIso: normalizeIsoDateTime(createdRaw),
    lastEditedIso: normalizeIsoDateTime(lastEditedRaw),
    url: page.url,
  };
}

async function resolveProjectNames(tasks) {
  const allRelationIds = new Set();
  for (const task of tasks) {
    for (const relationId of task.relationProjectIds || []) {
      if (relationId) allRelationIds.add(relationId);
    }
  }

  if (allRelationIds.size === 0) return;

  const cache = new Map();
  await Promise.all(
    [...allRelationIds].map(async (pageId) => {
      const title = await fetchPageTitle(pageId);
      cache.set(pageId, title);
    }),
  );

  for (const task of tasks) {
    if (!Array.isArray(task.relationProjectIds) || task.relationProjectIds.length === 0) {
      continue;
    }

    const resolved = task.relationProjectIds
      .map((id) => cache.get(id))
      .filter((name) => typeof name === "string" && name.trim().length > 0);

    if (resolved.length > 0) {
      task.project = resolved.join(", ");
    }
  }
}

async function fetchPageTitle(pageId) {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const title = extractTitleFromPage(page);
    if (title) return title;
  } catch (error) {
    log(`Could not resolve relation title for ${pageId}: ${error.message}`);
  }
  return pageId;
}

function extractTitleFromPage(page) {
  if (!page || !page.properties) return "";

  for (const prop of Object.values(page.properties)) {
    if (prop && prop.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title.map((item) => item.plain_text).join("").trim();
      if (text) return text;
    }
  }

  return "";
}

function extractProperty(page, propertyName) {
  const prop = page.properties[propertyName];
  if (!prop) return null;

  switch (prop.type) {
    case "title":
      return prop.title.map((part) => part.plain_text).join("").trim();
    case "rich_text":
      return prop.rich_text.map((part) => part.plain_text).join("").trim();
    case "select":
      return prop.select ? prop.select.name : null;
    case "status":
      return prop.status ? prop.status.name : null;
    case "date":
      return prop.date ? prop.date.start : null;
    case "number":
      return prop.number;
    case "checkbox":
      return prop.checkbox;
    case "created_time":
      return prop.created_time;
    case "last_edited_time":
      return prop.last_edited_time;
    case "multi_select":
      return prop.multi_select.map((item) => item.name).join(",");
    case "relation":
      return prop.relation.map((item) => item.id).join(",");
    default:
      return null;
  }
}

function preprocessTask(task, todayIso) {
  const dueInDays = dateDiffDays(todayIso, task.dueIso);
  const isOverdue = dueInDays < 0;
  const remainingDays = Math.max(1, dueInDays + 1);
  const requiredDailyMinutes = Math.ceil(task.estimatedMinutes / remainingDays);
  const isFutureLoadRisk =
    dueInDays > config.dueSoonDays &&
    requiredDailyMinutes >= config.futureRiskDailyMinutesThreshold;

  const touchReference = task.lastEditedIso || task.createdIso;
  const touchDate = touchReference ? normalizeIsoDate(touchReference) : todayIso;
  const daysSinceLastTouch = Math.max(0, dateDiffDays(touchDate, todayIso));
  const daysSinceCreated = task.createdIso
    ? Math.max(0, dateDiffDays(normalizeIsoDate(task.createdIso), todayIso))
    : 0;

  return {
    ...task,
    dueInDays,
    isOverdue,
    remainingDays,
    requiredDailyMinutes,
    isFutureLoadRisk,
    daysSinceLastTouch,
    daysSinceCreated,
    bucket: getBucket(dueInDays),
  };
}

function scoreTask(task) {
  const priorityValue = PRIORITY_TO_NUMERIC[task.priority] || 1;
  const pScore = priorityValue / 5;
  const dScore = 1 / (Math.max(task.dueInDays, 0) + 1);
  const staleRaw = Math.log1p(task.daysSinceLastTouch);
  const staleDen = Math.log1p(Math.max(1, config.stalenessCapDays));
  const sScore = Math.min(1, staleRaw / staleDen);

  let score = config.wPriority * pScore + config.wDue * dScore + config.wStale * sScore;
  if (task.isOverdue) {
    score += config.overdueBoost;
  }

  return {
    ...task,
    score,
    pScore,
    dScore,
    sScore,
  };
}

function rankTasks(tasks) {
  const bucketOrder = {
    [BUCKETS.OVERDUE]: 0,
    [BUCKETS.DUE_TODAY]: 1,
    [BUCKETS.DUE_SOON]: 2,
    [BUCKETS.LATER]: 3,
  };

  return [...tasks].sort((a, b) => {
    const bucketDelta = bucketOrder[a.bucket] - bucketOrder[b.bucket];
    if (bucketDelta !== 0) return bucketDelta;
    if (a.score !== b.score) return b.score - a.score;
    if (a.dueIso !== b.dueIso) return a.dueIso.localeCompare(b.dueIso);
    return a.title.localeCompare(b.title);
  });
}

function pickTop3(ranked) {
  const selected = [];
  const deferred = [];
  const perProjectCount = new Map();

  for (const task of ranked) {
    if (selected.length >= 3) break;

    const count = perProjectCount.get(task.project) || 0;
    if (count < config.projectDiversityMaxPerProject) {
      selected.push(task);
      perProjectCount.set(task.project, count + 1);
    } else {
      deferred.push(task);
    }
  }

  for (const task of deferred) {
    if (selected.length >= 3) break;
    selected.push(task);
  }

  return selected;
}

async function getCapacity(top3, todayIso) {
  const requiredMinutes = top3.reduce((acc, task) => acc + task.estimatedMinutes, 0);

  if (!hasCalendarConfig()) {
    return {
      available: false,
      freeMinutes: null,
      requiredMinutes,
      status: "unknown",
      busyMinutes: null,
    };
  }

  const events = await fetchTodayCalendarEvents(todayIso);
  const workWindow = getWorkWindow(todayIso);

  let busyMinutes = 0;
  for (const event of events) {
    if (event.start.date || event.end.date) continue;
    if (isSelfDeclined(event)) continue;

    const eventStart = new Date(event.start.dateTime);
    const eventEnd = new Date(event.end.dateTime);

    const clippedStart = new Date(Math.max(eventStart.getTime(), workWindow.start.getTime()));
    const clippedEnd = new Date(Math.min(eventEnd.getTime(), workWindow.end.getTime()));

    if (clippedEnd > clippedStart) {
      busyMinutes += minutesBetween(clippedStart, clippedEnd);
    }
  }

  const rawWindowMinutes = minutesBetween(workWindow.start, workWindow.end);
  const freeBeforeBuffer = Math.max(0, rawWindowMinutes - busyMinutes);
  const freeMinutes = Math.max(0, freeBeforeBuffer - config.focusBufferMinutes);
  const status = requiredMinutes <= freeMinutes ? "balanced_day" : "constrained_day";

  return {
    available: true,
    freeMinutes,
    requiredMinutes,
    status,
    busyMinutes,
  };
}

function hasCalendarConfig() {
  return !!(config.googleClientEmail && config.googlePrivateKey && config.googleCalendarId);
}

async function getCalendarClient() {
  let google;
  try {
    ({ google } = require("googleapis"));
  } catch {
    throw new Error(
      "Calendar integrations are enabled but 'googleapis' is not installed. Run npm install.",
    );
  }

  const auth = new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return google.calendar({ version: "v3", auth });
}

async function fetchTodayCalendarEvents(todayIso, calendar = null) {
  const calendarClient = calendar || (await getCalendarClient());

  const dayStart = zonedDateTimeToUtc(todayIso, 0, 0, config.timezone);
  const dayEnd = zonedDateTimeToUtc(addDaysIso(todayIso, 1), 0, 0, config.timezone);

  const response = await calendarClient.events.list({
    calendarId: config.googleCalendarId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

function getWorkWindow(todayIso) {
  const start = zonedDateTimeToUtc(todayIso, config.workdayStartHour, 0, config.timezone);
  const end = zonedDateTimeToUtc(todayIso, config.workdayEndHour, 0, config.timezone);

  if (end <= start) {
    throw new Error("Invalid workday window: WORKDAY_END_HOUR must be after WORKDAY_START_HOUR");
  }

  return { start, end };
}

function isSelfDeclined(event) {
  if (!Array.isArray(event.attendees)) return false;
  const selfAttendee = event.attendees.find((attendee) => attendee.self);
  return selfAttendee ? selfAttendee.responseStatus === "declined" : false;
}

function pickSuggestedDefer(top3, capacity) {
  if (!capacity.available || capacity.status !== "constrained_day" || top3.length === 0) {
    return null;
  }

  return [...top3].sort((a, b) => a.score - b.score)[0];
}

function pickFutureLoadRisks(ranked) {
  return ranked
    .filter((task) => task.isFutureLoadRisk)
    .sort((a, b) => {
      if (a.dueInDays !== b.dueInDays) return a.dueInDays - b.dueInDays;
      if (a.requiredDailyMinutes !== b.requiredDailyMinutes) {
        return b.requiredDailyMinutes - a.requiredDailyMinutes;
      }
      return b.score - a.score;
    })
    .slice(0, Math.max(config.maxTasksPerSection, 2));
}

function appendOperationalNotes(text, operations) {
  if (!operations) return text;

  const lines = [text, "", "Automation"];
  if (operations.kind === "planner") {
    lines.push(operations.summary);
    for (const block of operations.preview || []) {
      const start = formatLocalTime(block.start, config.timezone);
      const end = formatLocalTime(block.end, config.timezone);
      lines.push(`- ${start}-${end}: ${truncate(block.project, 18)} | ${truncate(block.title, 54)}`);
    }
  } else if (operations.kind === "rollover") {
    lines.push(operations.summary);
  }

  return lines.join("\n").trim();
}

async function runMorningBlockPlanner(todayIso, ranked) {
  if (!hasCalendarConfig()) {
    return {
      kind: "planner",
      summary: "Planner skipped: Google Calendar is not configured.",
      preview: [],
    };
  }

  const candidates = buildPlanningCandidates(ranked);
  if (candidates.length === 0) {
    return {
      kind: "planner",
      summary: "Planner skipped: no actionable tasks for today.",
      preview: [],
    };
  }

  const calendar = await getCalendarClient();
  const events = await fetchTodayCalendarEvents(todayIso, calendar);
  const managedEvents = events.filter((event) => isManagedPlannerEvent(event));
  const deletedCount = await deleteManagedPlannerEvents(calendar, managedEvents);
  const busyEvents = events.filter((event) => !isManagedPlannerEvent(event));

  const workWindow = getWorkWindow(todayIso);
  const rawSlots = computeFreeSlots(busyEvents, workWindow, config.planMinBlockMinutes);
  const usableSlots = reserveFocusBuffer(rawSlots, config.focusBufferMinutes, config.planMinBlockMinutes).map(
    (slot, index) => ({ ...slot, index }),
  );

  if (usableSlots.length === 0) {
    return {
      kind: "planner",
      summary: "Planner skipped: no free time blocks left in workday.",
      preview: [],
    };
  }

  const projectPlans = buildProjectPlans(candidates).slice(0, Math.max(1, config.planMaxProjects || 3));
  if (projectPlans.length === 0) {
    return {
      kind: "planner",
      summary: "Planner skipped: no project-level candidates available.",
      preview: [],
    };
  }

  const geminiOrder = await maybeGenerateGeminiProjectOrder({
    todayIso,
    slots: usableSlots,
    projects: projectPlans,
  });
  const orderedProjects = applyProjectOrder(projectPlans, geminiOrder);
  const blocks = buildProjectBlocks({
    slots: usableSlots,
    projects: orderedProjects,
    maxBlocks: config.planMaxBlocks,
    minBlockMinutes: config.planMinBlockMinutes,
  });

  if (blocks.length === 0) {
    return {
      kind: "planner",
      summary: "Planner skipped: unable to assign any tasks to free slots.",
      preview: [],
    };
  }

  const createdCount = await createPlannerEvents(calendar, todayIso, blocks);
  const sourceLabel = geminiOrder && geminiOrder.length > 0 ? "Gemini-ordered" : "fallback";
  return {
    kind: "planner",
    summary:
      `Created ${createdCount} busy project block(s) for today` +
      ` (${sourceLabel}, cleared ${deletedCount} previous block(s)).`,
    preview: blocks.slice(0, 4).map((block) => ({
      start: block.start,
      end: block.end,
      project: block.project,
      title: block.taskTitles.slice(0, 2).join(", ") || "Project work",
    })),
  };
}

async function runEveningAutoRollover(todayIso, ranked) {
  const rolloverCandidates = ranked.filter(
    (task) => task.bucket === BUCKETS.OVERDUE || task.bucket === BUCKETS.DUE_TODAY,
  );

  if (rolloverCandidates.length === 0) {
    return {
      kind: "rollover",
      summary: "No overdue or due-today open tasks to move.",
    };
  }

  const targetDate = addDaysIso(todayIso, 1);
  let movedCount = 0;
  for (const task of rolloverCandidates) {
    if (config.dryRun) {
      log(`DRY_RUN evening rollover for ${task.id} -> ${targetDate}`);
      movedCount += 1;
      continue;
    }

    await notion.pages.update({
      page_id: task.id,
      properties: {
        [config.notionDueProp]: { date: { start: targetDate } },
      },
    });
    movedCount += 1;
  }

  const overdueCount = rolloverCandidates.filter((task) => task.bucket === BUCKETS.OVERDUE).length;
  const dueTodayCount = rolloverCandidates.filter((task) => task.bucket === BUCKETS.DUE_TODAY).length;
  return {
    kind: "rollover",
    summary:
      `Auto-moved ${movedCount} task(s) to ${targetDate}` +
      ` (overdue: ${overdueCount}, due today: ${dueTodayCount})` +
      `${config.dryRun ? " [DRY_RUN]" : ""}.`,
  };
}

function buildPlanningCandidates(ranked) {
  return ranked
    .filter((task) => task.bucket !== BUCKETS.LATER || task.isFutureLoadRisk)
    .map((task) => ({
      ...task,
      planningScore: scorePlanningCandidate(task),
    }))
    .sort((a, b) => {
      if (a.bucket !== b.bucket) {
        const order = {
          [BUCKETS.OVERDUE]: 0,
          [BUCKETS.DUE_TODAY]: 1,
          [BUCKETS.DUE_SOON]: 2,
          [BUCKETS.LATER]: 3,
        };
        return order[a.bucket] - order[b.bucket];
      }
      if (a.planningScore !== b.planningScore) return b.planningScore - a.planningScore;
      if (a.requiredDailyMinutes !== b.requiredDailyMinutes) {
        return b.requiredDailyMinutes - a.requiredDailyMinutes;
      }
      return a.dueIso.localeCompare(b.dueIso);
    })
    .slice(0, Math.max(3, config.planCandidateLimit));
}

function scorePlanningCandidate(task) {
  const priorityScore = (PRIORITY_TO_NUMERIC[task.priority] || 1) / 5;
  const dueScore = 1 / (Math.max(task.dueInDays, 0) + 1);
  const loadScore = Math.min(1, task.requiredDailyMinutes / 180);
  const riskBoost = task.isFutureLoadRisk ? 0.25 : 0;
  return dueScore * 0.45 + loadScore * 0.35 + priorityScore * 0.2 + riskBoost;
}

function computeFreeSlots(events, workWindow, minBlockMinutes) {
  const busyIntervals = [];

  for (const event of events) {
    if (!event || !event.start || !event.end) continue;
    if (event.start.date || event.end.date) continue;
    if (isSelfDeclined(event)) continue;

    const eventStart = new Date(event.start.dateTime);
    const eventEnd = new Date(event.end.dateTime);
    if (!Number.isFinite(eventStart.getTime()) || !Number.isFinite(eventEnd.getTime())) continue;

    const clippedStart = new Date(Math.max(eventStart.getTime(), workWindow.start.getTime()));
    const clippedEnd = new Date(Math.min(eventEnd.getTime(), workWindow.end.getTime()));
    if (clippedEnd > clippedStart) {
      busyIntervals.push({ start: clippedStart, end: clippedEnd });
    }
  }

  busyIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged = [];
  for (const interval of busyIntervals) {
    const last = merged[merged.length - 1];
    if (!last || interval.start.getTime() > last.end.getTime()) {
      merged.push(interval);
      continue;
    }
    if (interval.end.getTime() > last.end.getTime()) {
      last.end = interval.end;
    }
  }

  const slots = [];
  let cursor = workWindow.start;
  for (const interval of merged) {
    if (interval.start.getTime() > cursor.getTime()) {
      const gapMinutes = minutesBetween(cursor, interval.start);
      if (gapMinutes >= minBlockMinutes) {
        slots.push({ start: cursor, end: interval.start, minutes: gapMinutes });
      }
    }
    if (interval.end.getTime() > cursor.getTime()) {
      cursor = interval.end;
    }
  }

  if (workWindow.end.getTime() > cursor.getTime()) {
    const gapMinutes = minutesBetween(cursor, workWindow.end);
    if (gapMinutes >= minBlockMinutes) {
      slots.push({ start: cursor, end: workWindow.end, minutes: gapMinutes });
    }
  }

  return slots;
}

function reserveFocusBuffer(slots, bufferMinutes, minBlockMinutes) {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  let remaining = Math.max(0, bufferMinutes);
  const mutable = slots.map((slot) => ({ ...slot, start: new Date(slot.start), end: new Date(slot.end) }));

  for (let i = mutable.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const slot = mutable[i];
    if (slot.minutes <= remaining) {
      remaining -= slot.minutes;
      mutable.splice(i, 1);
      continue;
    }
    const newMinutes = slot.minutes - remaining;
    slot.end = new Date(slot.end.getTime() - remaining * 60000);
    slot.minutes = newMinutes;
    remaining = 0;
  }

  return mutable.filter((slot) => slot.minutes >= minBlockMinutes);
}

function buildProjectPlans(tasks) {
  const grouped = new Map();
  for (const task of tasks) {
    const projectName = String(task.project || "unassigned").trim() || "unassigned";
    const key = projectName.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        projectKey: key,
        project: projectName,
        tasks: [],
        demandMinutes: 0,
        pressureScore: 0,
      });
    }

    const entry = grouped.get(key);
    const triageMinutes = getTriageMinutesForTask(task);
    entry.tasks.push({
      task,
      triageMinutes,
      remainingMinutes: triageMinutes,
    });
    entry.demandMinutes += triageMinutes;
    entry.pressureScore += task.planningScore;
  }

  return [...grouped.values()]
    .map((entry) => {
      entry.tasks.sort((a, b) => {
        if (a.task.bucket !== b.task.bucket) {
          const order = {
            [BUCKETS.OVERDUE]: 0,
            [BUCKETS.DUE_TODAY]: 1,
            [BUCKETS.DUE_SOON]: 2,
            [BUCKETS.LATER]: 3,
          };
          return order[a.task.bucket] - order[b.task.bucket];
        }
        if (a.task.planningScore !== b.task.planningScore) {
          return b.task.planningScore - a.task.planningScore;
        }
        return a.task.dueIso.localeCompare(b.task.dueIso);
      });

      const firstDue = entry.tasks[0]?.task?.dueIso || "9999-12-31";
      const urgentCount = entry.tasks.filter(
        (item) => item.task.bucket === BUCKETS.OVERDUE || item.task.bucket === BUCKETS.DUE_TODAY,
      ).length;

      return {
        ...entry,
        firstDue,
        urgentCount,
      };
    })
    .sort((a, b) => {
      if (a.urgentCount !== b.urgentCount) return b.urgentCount - a.urgentCount;
      if (a.pressureScore !== b.pressureScore) return b.pressureScore - a.pressureScore;
      if (a.demandMinutes !== b.demandMinutes) return b.demandMinutes - a.demandMinutes;
      if (a.firstDue !== b.firstDue) return a.firstDue.localeCompare(b.firstDue);
      return a.project.localeCompare(b.project);
    });
}

function getTriageMinutesForTask(task) {
  const units = Math.max(1, Math.min(4, Math.round(task.planningScore * 3)));
  return units * 30;
}

async function maybeGenerateGeminiProjectOrder({ todayIso, slots, projects }) {
  if (!config.geminiApiKey || !Array.isArray(projects) || projects.length === 0) return null;

  const input = {
    today: todayIso,
    slots: slots.map((slot) => ({ m: slot.minutes })),
    projects: projects.map((project) => ({
      id: project.projectKey,
      p: truncate(project.project, 32),
      demand_m: project.demandMinutes,
      urgent_tasks: project.urgentCount,
      due: project.firstDue,
    })),
  };

  const prompt =
    "Order project IDs for today's focus blocks. " +
    "Prioritize overdue and due-today work, then high daily-pressure projects. " +
    "Return only JSON matching schema.\n" +
    `input=${JSON.stringify(input)}`;
  logAiDebug("project_order.prompt", prompt);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.geminiModel,
  )}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
        responseJsonSchema: GEMINI_PROJECT_ORDER_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    log(`Gemini project ordering skipped (HTTP ${response.status}): ${body}`);
    return null;
  }

  const payload = await response.json();
  const modelText = extractGeminiText(payload);
  logAiDebug("project_order.raw", modelText);
  const parsed = tryParseJsonObject(normalizeModelJsonText(modelText));
  if (!parsed || !Array.isArray(parsed.project_order)) return null;
  return parsed.project_order
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function applyProjectOrder(projects, projectOrder) {
  if (!Array.isArray(projectOrder) || projectOrder.length === 0) {
    return projects;
  }

  const byKey = new Map(projects.map((project) => [project.projectKey, project]));
  const ordered = [];
  const seen = new Set();

  for (const key of projectOrder) {
    if (!byKey.has(key) || seen.has(key)) continue;
    ordered.push(byKey.get(key));
    seen.add(key);
  }

  for (const project of projects) {
    if (!seen.has(project.projectKey)) {
      ordered.push(project);
      seen.add(project.projectKey);
    }
  }

  return ordered;
}

function buildProjectBlocks({ slots, projects, maxBlocks, minBlockMinutes }) {
  if (!Array.isArray(slots) || slots.length === 0 || !Array.isArray(projects) || projects.length === 0) {
    return [];
  }

  const limit = Math.max(1, Number(maxBlocks) || 0);
  const minMinutes = Math.max(30, Number(minBlockMinutes) || 30);
  const slotState = slots.map((slot) => ({
    ...slot,
    cursor: new Date(slot.start),
    remaining: slot.minutes,
  }));
  const projectState = projects.map((project) => ({
    ...project,
    remainingMinutes: project.demandMinutes,
    taskAllocations: project.tasks.map((item) => ({
      ...item,
      remainingMinutes: item.remainingMinutes,
    })),
  }));
  const blocks = [];
  let slotIndex = 0;

  for (const project of projectState) {
    while (project.remainingMinutes >= minMinutes && blocks.length < limit && slotIndex < slotState.length) {
      let slot = slotState[slotIndex];
      if (slot.remaining < minMinutes) {
        slotIndex += 1;
        continue;
      }

      const blockMinutes = Math.min(slot.remaining, project.remainingMinutes);
      const start = new Date(slot.cursor);
      const end = new Date(start.getTime() + blockMinutes * 60000);
      const taskBreakdown = allocateProjectTaskBreakdown(project.taskAllocations, blockMinutes);
      const taskTitles = taskBreakdown.map((entry) => entry.task.title);

      blocks.push({
        slotIndex: slot.index,
        start,
        end,
        minutes: blockMinutes,
        project: project.project,
        projectKey: project.projectKey,
        taskBreakdown,
        taskTitles,
      });

      slot.cursor = end;
      slot.remaining -= blockMinutes;
      project.remainingMinutes -= blockMinutes;

      if (slot.remaining < minMinutes) {
        slotIndex += 1;
      }
    }

    if (blocks.length >= limit) break;
  }

  return blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function allocateProjectTaskBreakdown(taskAllocations, minutes) {
  const breakdown = [];
  let remaining = minutes;

  for (const item of taskAllocations) {
    if (remaining <= 0) break;
    if (item.remainingMinutes <= 0) continue;
    const take = Math.min(item.remainingMinutes, remaining);
    if (take <= 0) continue;
    breakdown.push({ task: item.task, minutes: take });
    item.remainingMinutes -= take;
    remaining -= take;
  }

  return breakdown;
}

function isManagedPlannerEvent(event) {
  return (
    event?.extendedProperties?.private?.source === PLANNER_EVENT_SOURCE
  );
}

async function deleteManagedPlannerEvents(calendar, events) {
  if (!Array.isArray(events) || events.length === 0) return 0;
  if (config.dryRun) {
    log(`DRY_RUN planner would clear ${events.length} prior managed block(s).`);
    return events.length;
  }

  for (const event of events) {
    if (!event?.id) continue;
    await calendar.events.delete({
      calendarId: config.googleCalendarId,
      eventId: event.id,
    });
  }

  return events.length;
}

async function createPlannerEvents(calendar, todayIso, blocks) {
  if (config.dryRun) {
    for (const block of blocks) {
      log(
        `DRY_RUN planner block ${block.start.toISOString()}-${block.end.toISOString()} ` +
          `| ${block.project} | ${(block.taskTitles || []).join(", ")}`,
      );
    }
    return blocks.length;
  }

  let created = 0;
  for (const block of blocks) {
    await calendar.events.insert({
      calendarId: config.googleCalendarId,
      requestBody: {
        summary: `${config.plannerEventPrefix}: ${truncate(block.project, 32)}`,
        description: [
          `Project: ${block.project}`,
          `Tasks: ${
            block.taskBreakdown
              .map((entry) => `${entry.task.title} (${entry.minutes}m)`)
              .join("; ") || "none"
          }`,
          `Source: ${PLANNER_EVENT_SOURCE}`,
        ].join("\n"),
        start: { dateTime: block.start.toISOString() },
        end: { dateTime: block.end.toISOString() },
        transparency: "opaque",
        extendedProperties: {
          private: {
            source: PLANNER_EVENT_SOURCE,
            project_key: block.projectKey,
            day: todayIso,
          },
        },
      },
    });
    created += 1;
  }

  return created;
}

function buildDigestText({
  mode,
  todayIso,
  ranked,
  top3,
  capacity,
  suggestedDefer,
  aiSummary,
  aiPlan,
  eveningProgress,
}) {
  const lines = [];
  const addLine = makeAddLine(lines, config.maxSlackLines);
  const dateLabel = todayIso;

  addLine(`${mode === MODE_EVENING ? "Evening Sweep" : "Daily Digest"} | ${dateLabel}`);
  if (mode === MODE_EVENING) {
    if (eveningProgress) {
      addLine("Progress");
      addLine(`Done today: ${eveningProgress.completedToday}`);
      addLine(`Pending due today: ${eveningProgress.pendingDueToday}`);
    }
  }

  const overdue = ranked.filter((task) => task.bucket === BUCKETS.OVERDUE);
  const dueToday = ranked.filter((task) => task.bucket === BUCKETS.DUE_TODAY);
  const dueSoon = ranked.filter((task) => task.bucket === BUCKETS.DUE_SOON);
  const futurePressure = pickFutureLoadRisks(ranked);

  addTaskSection({
    addLine,
    title: "Overdue",
    tasks: overdue,
    todayIso,
  });

  addTaskSection({
    addLine,
    title: "Due Today",
    tasks: dueToday,
    todayIso,
  });

  addTaskSection({
    addLine,
    title: "Due Soon",
    tasks: dueSoon,
    todayIso,
  });

  addTaskSection({
    addLine,
    title: "Future Pressure",
    tasks: futurePressure,
    todayIso,
  });

  if (top3.length > 0) {
    addLine("TOP 3");
    for (let i = 0; i < top3.length; i += 1) {
      addLine(`${i + 1}. ${formatTaskCompact(top3[i], todayIso)}`);
    }
  }

  if (capacity.available) {
    addLine("Capacity");
    addLine(`Free: ${formatMinutes(capacity.freeMinutes)}`);
    addLine(`Planned: ${formatMinutes(capacity.requiredMinutes)}`);
    addLine(`Status: ${capacity.status === "balanced_day" ? "BALANCED" : "CONSTRAINED"}`);
  }

  if (suggestedDefer) {
    addLine("Defer Candidate");
    addLine(formatTaskCompact(suggestedDefer, todayIso));
  }

  if (aiSummary && !aiPlan) {
    addLine("AI Note");
    addLine(aiSummary);
  }

  if (aiPlan) {
    addLine("Suggested Order");
    for (let i = 0; i < aiPlan.order.length; i += 1) {
      const entry = aiPlan.order[i];
      addLine(`${i + 1}. ${entry.task}`);
    }

    if (aiPlan.startNow) {
      addLine("Start Now (90m)");
      addLine(aiPlan.startNow);
    }

    if (aiPlan.ifConstrained) {
      addLine("If Constrained");
      addLine(aiPlan.ifConstrained);
    }
  }

  return lines.join("\n");
}

function makeAddLine(lines, maxLines) {
  return function addLine(line) {
    if (lines.length < maxLines) {
      lines.push(line);
    }
  };
}

function addTaskSection({ addLine, title, tasks, todayIso }) {
  if (tasks.length === 0) return;

  addLine(`${title} (${tasks.length})`);
  const visible = tasks.slice(0, config.maxTasksPerSection);
  for (const task of visible) {
    addLine(`- ${formatTaskCompact(task, todayIso)}`);
  }

  const overflow = tasks.length - visible.length;
  if (overflow > 0) {
    addLine(`- +${overflow} more`);
  }
}

function formatTaskCompact(task, todayIso) {
  const priority = normalizePriorityTag(task.priority);
  const title = truncate(task.title, 54);
  const project = truncate(task.project, 18);
  const due = duePhrase(dateDiffDays(todayIso, task.dueIso));
  return `${priority} ${title} | ${project} | ${due}`;
}

function normalizePriorityTag(priority) {
  const text = String(priority || "").trim();
  return text ? `[${text.toUpperCase()}]` : "[P?]";
}

function formatScore(value) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

async function postNotification(text) {
  if (config.dryRun) {
    log(`DRY_RUN enabled. ${config.notifier.toUpperCase()} message:\n${text}`);
    return;
  }

  const endpoint = config.notifier === "discord" ? config.discordWebhookUrl : config.slackWebhookUrl;
  const payload =
    config.notifier === "discord"
      ? { content: truncate(text, 1990) }
      : { text };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${config.notifier} webhook failed (${response.status}): ${body}`);
  }

  log(`Posted digest to ${config.notifier} successfully.`);
}

async function writeDailyLog({ todayIso, ranked, top3, capacity, mode, operations = null }) {
  const logEntry = {
    date: todayIso,
    mode,
    num_tasks: ranked.length,
    num_overdue: ranked.filter((task) => task.bucket === BUCKETS.OVERDUE).length,
    num_due_soon: ranked.filter((task) => task.bucket === BUCKETS.DUE_SOON || task.bucket === BUCKETS.DUE_TODAY).length,
    top_3_ids: top3.map((task) => task.id),
    free_minutes: capacity.freeMinutes,
    required_minutes: capacity.requiredMinutes,
    day_status: capacity.status,
    operations,
  };

  await fs.mkdir(config.logDir, { recursive: true });
  const filePath = path.join(config.logDir, `${todayIso}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(logEntry, null, 2)}\n`, "utf8");
}

async function maybeGenerateGeminiSummary({ tasks, todayIso }) {
  if (!config.enableAiSummary || !config.geminiApiKey) {
    return "";
  }

  const aiEnd = addDaysIso(todayIso, config.aiSummaryWindowDays);
  const scoped = tasks
    .filter((task) => task.dueIso <= aiEnd)
    .slice(0, Math.min(6, config.aiSummaryMaxTasks))
    .map((task) => ({
      t: truncate(task.title, 58),
      p: String(task.priority || "").toUpperCase(),
      d: task.dueIso,
    }));

  if (scoped.length === 0) {
    return "";
  }

  const input = { today: todayIso, tasks: scoped };
  const prompt =
    "Summarize today's most important risk in one concrete sentence. " +
    "Keep it under 120 chars and avoid filler. Return JSON matching schema.\n" +
    `input=${JSON.stringify(input)}`;
  logAiDebug("summary.prompt", prompt);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.geminiModel,
  )}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 120,
        responseMimeType: "application/json",
        responseJsonSchema: GEMINI_SUMMARY_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    log(`Gemini summary skipped (HTTP ${response.status}): ${body}`);
    return "";
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);
  logAiDebug("summary.raw", text);
  const normalized = normalizeModelJsonText(text);
  const parsedObject = tryParseJsonObject(normalized);

  if (parsedObject && typeof parsedObject.s === "string") {
    const summary = sanitizeInlineSummary(parsedObject.s);
    logAiDebug("summary.parsed", summary);
    return summary;
  }
  return "";
}

async function maybeGenerateGeminiPlan({ tasks, top3, capacity, todayIso }) {
  if (!config.enableAiSummary || !config.geminiApiKey) {
    return null;
  }

  const scopedTasks = tasks.slice(0, 3).map((task) => ({
    t: truncate(task.title, 60),
    p: String(task.priority || "").toUpperCase(),
    d: duePhrase(dateDiffDays(todayIso, task.dueIso)),
    sc: Number(formatScore(task.score)),
  }));

  if (scopedTasks.length === 0) {
    return null;
  }

  const payload = {
    today: todayIso,
    top3: top3.map((task) => truncate(task.title, 50)),
    free: capacity.available ? capacity.freeMinutes : null,
    planned: capacity.requiredMinutes,
    tasks: scopedTasks,
  };

  const prompt =
    "Create a practical execution order for today's work. " +
    "Output only a JSON object matching the schema. No prose, no markdown.\n" +
    `input=${JSON.stringify(payload)}`;
  logAiDebug("plan.prompt", prompt);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.geminiModel,
  )}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 420,
        responseMimeType: "application/json",
        responseJsonSchema: GEMINI_PLAN_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    log(`Gemini planner skipped (HTTP ${response.status}): ${body}`);
    return null;
  }

  const payloadJson = await response.json();
  const modelText = extractGeminiText(payloadJson);
  logAiDebug("plan.meta", summarizeGeminiPayload(payloadJson));
  logAiDebug("plan.raw", modelText);
  const normalized = normalizeModelJsonText(modelText);
  let parsed = tryParseJsonObject(normalized);

  // Some schema-constrained responses return empty text. Retry once without schema.
  if (!parsed) {
    const retry = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 420,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (retry.ok) {
      const retryJson = await retry.json();
      const retryText = extractGeminiText(retryJson);
      logAiDebug("plan.retry.meta", summarizeGeminiPayload(retryJson));
      logAiDebug("plan.retry.raw", retryText);
      parsed = tryParseJsonObject(normalizeModelJsonText(retryText));
    } else {
      const retryBody = await retry.text();
      log(`Gemini planner retry skipped (HTTP ${retry.status}): ${retryBody}`);
    }
  }

  if (!parsed) return null;
  const plan = sanitizeAiPlan(parsed);
  logAiDebug("plan.parsed", plan ? JSON.stringify(plan) : "null");
  return plan;
}

function sanitizeAiPlan(value) {
  if (!value || typeof value !== "object") return null;

  const orderRaw = Array.isArray(value.order) ? value.order : [];
  const order = orderRaw
    .map((item) => sanitizeInlineSummary(item))
    .filter(Boolean)
    .slice(0, 5)
    .map((task) => ({ task }));

  if (order.length < 2) {
    return null;
  }

  return {
    order,
    startNow: sanitizeInlineSummary(value.start_now).slice(0, 120),
    ifConstrained: sanitizeInlineSummary(value.if_constrained).slice(0, 120),
  };
}

function normalizeModelJsonText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  // Remove fenced blocks if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const unfenced = fenced ? fenced[1].trim() : raw;
  return unfenced.trim();
}

function tryParseJsonObject(text) {
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    // Some model outputs include prose before/after JSON; parse first object block.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    const candidate = text.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
}

function logAiDebug(label, value) {
  if (!config.dryRun) return;
  log(`AI_DEBUG ${label}: ${truncate(String(value || ""), 1200)}`);
}

function summarizeGeminiPayload(payload) {
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  const finishReason = candidate?.finishReason || "";
  const blockReason = payload?.promptFeedback?.blockReason || "";
  const parts = candidate?.content?.parts;
  const partKeys =
    Array.isArray(parts) && parts.length > 0
      ? Object.keys(parts[0] || {}).join(",")
      : "";
  return JSON.stringify({ finishReason, blockReason, partKeys });
}

function extractGeminiText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function sanitizeInlineSummary(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

function isClosed(task) {
  if (task.doneChecked) return true;
  return config.closedStatuses.has(String(task.status || "").trim().toLowerCase());
}

function getBucket(dueInDays) {
  if (dueInDays < 0) return BUCKETS.OVERDUE;
  if (dueInDays === 0) return BUCKETS.DUE_TODAY;
  if (dueInDays <= config.dueSoonDays) return BUCKETS.DUE_SOON;
  return BUCKETS.LATER;
}

function duePhrase(dueInDays) {
  if (dueInDays < 0) return `${Math.abs(dueInDays)}d late`;
  if (dueInDays === 0) return "due today";
  if (dueInDays === 1) return "due tomorrow";
  return `due in ${dueInDays}d`;
}

function normalizeProject(value) {
  const text = String(value || "").trim();
  if (!text) return "unassigned";
  return text;
}

function clampMinutes(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(5, Math.min(8 * 60, Math.round(value)));
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const asString = String(value);
  return asString.length >= 10 ? asString.slice(0, 10) : null;
}

function normalizeIsoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function dateDiffDays(fromIso, toIso) {
  const from = isoToUtcMillis(fromIso);
  const to = isoToUtcMillis(toIso);
  return Math.round((to - from) / 86400000);
}

function isoToUtcMillis(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function getTodayIso(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const lookup = {};
  for (const part of parts) {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      lookup[part.type] = part.value;
    }
  }

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function addDaysIso(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "n/a";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatLocalTime(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return Math.round((asUtc - date.getTime()) / 60000);
}

function zonedDateTimeToUtc(isoDate, hour, minute, timeZone) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const naiveUtcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);
  const naiveDate = new Date(naiveUtcMillis);
  const offsetMinutes = getTimeZoneOffsetMinutes(naiveDate, timeZone);
  return new Date(naiveUtcMillis - offsetMinutes * 60000);
}

function shouldRunThisHour(mode) {
  const localHour = getLocalHour(config.timezone);
  if (mode === "morning") return localHour === config.morningHour;
  if (mode === "evening") return localHour === config.eveningHour;
  return localHour === config.morningHour || localHour === config.eveningHour;
}

function getLocalHour(timezone) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

function truncate(value, maxLen) {
  const text = String(value || "").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

module.exports = {
  notion,
  mapPageToTask,
  runDigest,
  computeDigest,
  pickFutureLoadRisks,
  buildPlanningCandidates,
  buildProjectPlans,
  buildProjectBlocks,
  computeFreeSlots,
  reserveFocusBuffer,
  shouldRunThisHour,
  getLocalHour,
  truncate,
};
