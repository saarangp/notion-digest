const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("@notionhq/client");
const {
  config,
  MODE_EVENING,
  BUCKETS,
  PRIORITY_TO_NUMERIC,
  parseInteger,
} = require("./config");
const { log } = require("./logger");

const notion = new Client({ auth: config.notionApiKey });

async function runDigest(mode) {
  const digest = await computeDigest(mode);
  await postNotification(digest.text);
  await writeDailyLog({
    todayIso: digest.todayIso,
    ranked: digest.ranked,
    top3: digest.top3,
    capacity: digest.capacity,
    mode,
  });
}

async function computeDigest(mode) {
  const todayIso = getTodayIso(config.timezone);
  const endIso = addDaysIso(todayIso, config.dueWindowDays);
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

  const text = buildDigestText({
    mode,
    todayIso,
    ranked,
    top3,
    capacity,
    suggestedDefer,
    aiSummary,
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
    .filter((task) => !isClosed(task))
    .filter((task) => isHighPriority(task.priority));

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

async function fetchTodayCalendarEvents(todayIso) {
  let google;
  try {
    ({ google } = require("googleapis"));
  } catch {
    throw new Error(
      "Calendar capacity is enabled but 'googleapis' is not installed. Run npm install.",
    );
  }

  const auth = new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  const calendar = google.calendar({ version: "v3", auth });

  const dayStart = zonedDateTimeToUtc(todayIso, 0, 0, config.timezone);
  const dayEnd = zonedDateTimeToUtc(addDaysIso(todayIso, 1), 0, 0, config.timezone);

  const response = await calendar.events.list({
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

function buildDigestText({
  mode,
  todayIso,
  ranked,
  top3,
  capacity,
  suggestedDefer,
  aiSummary,
  eveningProgress,
}) {
  const lines = [];
  const addLine = makeAddLine(lines, config.maxSlackLines);
  const dateLabel = formatDateDisplay(todayIso);

  addLine(`DAILY DIGEST | ${dateLabel}`);
  if (mode === MODE_EVENING) {
    addLine("MODE | EVENING SWEEP");
    if (eveningProgress) {
      addLine(
        `PROGRESS | done ${eveningProgress.completedToday} | pending today ${eveningProgress.pendingDueToday}`,
      );
    }
  }

  const overdue = ranked.filter((task) => task.bucket === BUCKETS.OVERDUE);
  const dueToday = ranked.filter((task) => task.bucket === BUCKETS.DUE_TODAY);
  const dueSoon = ranked.filter((task) => task.bucket === BUCKETS.DUE_SOON);

  addTaskSection({
    addLine,
    title: "OVERDUE",
    tasks: overdue,
    todayIso,
  });

  addTaskSection({
    addLine,
    title: "DUE TODAY",
    tasks: dueToday,
    todayIso,
  });

  addTaskSection({
    addLine,
    title: "DUE SOON",
    tasks: dueSoon,
    todayIso,
  });

  if (top3.length > 0) {
    addLine("TOP 3");
    for (let i = 0; i < top3.length; i += 1) {
      addLine(`${i + 1}. ${formatTaskCompact(top3[i], todayIso)}`);
    }
  }

  if (capacity.available) {
    addLine("CAPACITY");
    addLine(`Free ${formatMinutes(capacity.freeMinutes)} | Planned ${formatMinutes(capacity.requiredMinutes)}`);
    addLine(`Status ${capacity.status === "balanced_day" ? "BALANCED" : "CONSTRAINED"}`);
  }

  if (suggestedDefer) {
    addLine(`DEFER CANDIDATE | ${formatTaskCompact(suggestedDefer, todayIso)}`);
  }

  if (aiSummary) {
    addLine(`AI NOTE | ${aiSummary}`);
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

function formatTaskDisplay(task, todayIso) {
  return `${task.title} (${task.project}) [${formatScore(task.score)}] — ${duePhrase(
    dateDiffDays(todayIso, task.dueIso),
  )}`;
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
  const estimate = formatMinutes(task.estimatedMinutes);
  return `${priority} ${title} | ${project} | ${due} | ${estimate}`;
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

async function writeDailyLog({ todayIso, ranked, top3, capacity, mode }) {
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
    .slice(0, config.aiSummaryMaxTasks)
    .map((task) => ({ t: truncate(task.title, 70), d: task.dueIso, p: task.priority }));

  if (scoped.length === 0) {
    return "no immediate blockers";
  }

  const prompt =
    "Return minified JSON only with key s. s must be <=120 chars and concrete.\n" +
    `tasks=${JSON.stringify(scoped)}`;

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
        maxOutputTokens: 80,
        responseMimeType: "application/json",
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

  try {
    const parsed = JSON.parse(text);
    return sanitizeInlineSummary(parsed.s);
  } catch {
    return sanitizeInlineSummary(text);
  }
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

function isHighPriority(priority) {
  return config.highPriorityValues.has(String(priority || "").trim().toLowerCase());
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

function formatDateDisplay(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "n/a";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
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
  shouldRunThisHour,
  getLocalHour,
  truncate,
};
