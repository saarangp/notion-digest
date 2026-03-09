const path = require("node:path");

const MODE_MORNING = "morning";
const MODE_EVENING = "evening";
const MODE_MIDDAY = "midday";
const MODE_BOTH = "both";

const BUCKETS = {
  OVERDUE: "overdue",
  DUE_TODAY: "due_today",
  DUE_SOON: "due_soon",
  LATER: "later",
};

const PRIORITY_TO_NUMERIC = {
  p0: 5,
  p1: 4,
  p2: 3,
  p3: 2,
};

const config = {
  notionApiKey: process.env.NOTION_API_KEY,
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  notifier: String(process.env.NOTIFIER || "discord").trim().toLowerCase(),
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,

  timezone: process.env.TIMEZONE || "America/Los_Angeles",
  dueWindowDays: parseInteger(process.env.DUE_WINDOW_DAYS, 7),
  dueSoonDays: parseInteger(process.env.DUE_SOON_DAYS, 3),
  planningHorizonDays: parseInteger(process.env.PLANNING_HORIZON_DAYS, 14),
  maxSlackLines: parseInteger(process.env.MAX_SLACK_LINES, 15),
  maxTasksPerSection: parseInteger(process.env.MAX_TASKS_PER_SECTION, 2),

  wPriority: parseFloatOrDefault(process.env.W_PRIORITY, 0.5),
  wDue: parseFloatOrDefault(process.env.W_DUE, 0.35),
  wStale: parseFloatOrDefault(process.env.W_STALE, 0.15),
  overdueBoost: parseFloatOrDefault(process.env.OVERDUE_BOOST, 0),
  stalenessCapDays: parseInteger(process.env.STALENESS_CAP_DAYS, 30),

  projectDiversityMaxPerProject: parseInteger(process.env.TOP3_MAX_PER_PROJECT, 2),
  defaultEstimatedMinutes: parseInteger(process.env.DEFAULT_ESTIMATED_MINUTES, 30),
  closedStatuses: csvToSet(process.env.CLOSED_STATUS_VALUES || "done"),
  futureRiskDailyMinutesThreshold: parseInteger(
    process.env.FUTURE_RISK_DAILY_MINUTES_THRESHOLD,
    60,
  ),
  urgentLoadDays: parseInteger(process.env.URGENT_LOAD_DAYS, 3),
  urgentLoadMinDailyMinutes: parseInteger(process.env.URGENT_LOAD_MIN_DAILY_MINUTES, 120),
  urgentLoadBoost: parseFloatOrDefault(process.env.URGENT_LOAD_BOOST, 0.25),
  urgentLoadHeavyMinutes: parseInteger(process.env.URGENT_LOAD_HEAVY_MINUTES, 180),
  urgentLoadHeavyBoost: parseFloatOrDefault(process.env.URGENT_LOAD_HEAVY_BOOST, 0.45),
  planMinBlockMinutes: parseInteger(process.env.PLAN_MIN_BLOCK_MINUTES, 30),
  planMaxBlocks: parseInteger(process.env.PLAN_MAX_BLOCKS, 5),
  planMaxProjects: parseInteger(process.env.PLAN_MAX_PROJECTS, 3),
  planCandidateLimit: parseInteger(process.env.PLAN_CANDIDATE_LIMIT, 12),
  plannerEventPrefix: process.env.PLANNER_EVENT_PREFIX || "Focus Block",
  plannerEventColorId: String(process.env.PLANNER_EVENT_COLOR_ID || "11").trim(),

  notionTaskProp: process.env.NOTION_TASK_PROP || "Task",
  notionPriorityProp: process.env.NOTION_PRIORITY_PROP || "Priority",
  notionStatusProp: process.env.NOTION_STATUS_PROP || "Status",
  notionDueProp: process.env.NOTION_DUE_PROP || "Due",
  notionDoneCheckboxProp: process.env.NOTION_DONE_CHECKBOX_PROP || "done",
  notionProjectProp: process.env.NOTION_PROJECT_PROP || "Project",
  notionEstimatedMinutesProp: process.env.NOTION_ESTIMATED_MINUTES_PROP || "estimated_minutes",
  notionCreatedTimeProp: process.env.NOTION_CREATED_TIME_PROP || "Created time",
  notionLastEditedProp: process.env.NOTION_LAST_EDITED_PROP || "Last edited time",

  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL || "",
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY || "",
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "",
  googleSourceCalendarId: process.env.GOOGLE_SOURCE_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || "",
  googlePlannerCalendarId:
    process.env.GOOGLE_PLANNER_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || "",
  workdayStartHour: parseInteger(process.env.WORKDAY_START_HOUR, 9),
  workdayEndHour: parseInteger(process.env.WORKDAY_END_HOUR, 18),
  lunchStartHour: parseInteger(process.env.LUNCH_START_HOUR, 12),
  lunchStartMinute: parseInteger(process.env.LUNCH_START_MINUTE, 0),
  lunchEndHour: parseInteger(process.env.LUNCH_END_HOUR, 13),
  lunchEndMinute: parseInteger(process.env.LUNCH_END_MINUTE, 0),
  focusBufferMinutes: parseInteger(process.env.FOCUS_BUFFER_MINUTES, 60),

  enableAiSummary: process.env.ENABLE_AI_SUMMARY === "1",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  aiSummaryWindowDays: parseInteger(process.env.AI_SUMMARY_WINDOW_DAYS, 3),
  aiSummaryMaxTasks: parseInteger(process.env.AI_SUMMARY_MAX_TASKS, 12),

  morningHour: parseInteger(process.env.MORNING_HOUR_LOCAL, 9),
  eveningHour: parseInteger(process.env.EVENING_HOUR_LOCAL, 18),
  dryRun: process.env.DRY_RUN === "1",
  enforceLocalHour: process.env.ENFORCE_LOCAL_HOUR === "1",

  logDir: process.env.LOG_DIR || path.join(process.cwd(), "logs"),
};

function normalizeMode(rawMode) {
  const value = String(rawMode || "").trim().toLowerCase();
  if ([MODE_MORNING, MODE_EVENING, MODE_MIDDAY, MODE_BOTH].includes(value)) {
    return value;
  }
  throw new Error(`Invalid MODE \"${rawMode}\". Use morning, midday, evening, or both.`);
}

function validateConfig() {
  const missing = [];
  if (!config.notionApiKey) missing.push("NOTION_API_KEY");
  if (!config.notionDatabaseId) missing.push("NOTION_DATABASE_ID");

  if (!["discord", "slack"].includes(config.notifier)) {
    throw new Error(`Invalid NOTIFIER "${config.notifier}". Use "discord" or "slack".`);
  }

  if (!config.dryRun) {
    if (config.notifier === "discord" && !config.discordWebhookUrl) missing.push("DISCORD_WEBHOOK_URL");
    if (config.notifier === "slack" && !config.slackWebhookUrl) missing.push("SLACK_WEBHOOK_URL");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function csvToSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseInteger(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatOrDefault(raw, fallback) {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  MODE_MORNING,
  MODE_EVENING,
  MODE_MIDDAY,
  MODE_BOTH,
  BUCKETS,
  PRIORITY_TO_NUMERIC,
  config,
  normalizeMode,
  validateConfig,
  parseInteger,
};
