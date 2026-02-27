const path = require("node:path");

const MODE_MORNING = "morning";
const MODE_EVENING = "evening";
const MODE_BOTH = "both";

const APP_MODE_DIGEST = "digest";
const APP_MODE_BOT = "bot";
const APP_MODE_BOTH = "both";

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
  appMode: String(process.env.APP_MODE || APP_MODE_DIGEST).trim().toLowerCase(),
  notionApiKey: process.env.NOTION_API_KEY,
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  notifier: String(process.env.NOTIFIER || "discord").trim().toLowerCase(),
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  discordBotToken: process.env.DISCORD_BOT_TOKEN || "",
  discordAppId: process.env.DISCORD_APP_ID || "",
  discordGuildId: process.env.DISCORD_GUILD_ID || "",
  discordBotStatePath:
    process.env.DISCORD_BOT_STATE_PATH || path.join(process.cwd(), "logs", "discord-bot-state.json"),
  discordInteractionTtlMinutes: parseInteger(process.env.DISCORD_INTERACTION_TTL_MINUTES, 30),
  discordMaxActionTasks: parseInteger(process.env.DISCORD_MAX_ACTION_TASKS, 10),

  timezone: process.env.TIMEZONE || "America/Los_Angeles",
  dueWindowDays: parseInteger(process.env.DUE_WINDOW_DAYS, 7),
  dueSoonDays: parseInteger(process.env.DUE_SOON_DAYS, 3),
  maxSlackLines: parseInteger(process.env.MAX_SLACK_LINES, 15),
  maxTasksPerSection: parseInteger(process.env.MAX_TASKS_PER_SECTION, 2),

  wPriority: parseFloatOrDefault(process.env.W_PRIORITY, 0.5),
  wDue: parseFloatOrDefault(process.env.W_DUE, 0.35),
  wStale: parseFloatOrDefault(process.env.W_STALE, 0.15),
  overdueBoost: parseFloatOrDefault(process.env.OVERDUE_BOOST, 0),
  stalenessCapDays: parseInteger(process.env.STALENESS_CAP_DAYS, 30),

  projectDiversityMaxPerProject: parseInteger(process.env.TOP3_MAX_PER_PROJECT, 2),
  defaultEstimatedMinutes: parseInteger(process.env.DEFAULT_ESTIMATED_MINUTES, 30),

  highPriorityValues: csvToSet(process.env.HIGH_PRIORITY_VALUES || "p0"),
  closedStatuses: csvToSet(process.env.CLOSED_STATUS_VALUES || "done"),

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
  workdayStartHour: parseInteger(process.env.WORKDAY_START_HOUR, 9),
  workdayEndHour: parseInteger(process.env.WORKDAY_END_HOUR, 18),
  focusBufferMinutes: parseInteger(process.env.FOCUS_BUFFER_MINUTES, 60),

  enableAiSummary: process.env.ENABLE_AI_SUMMARY === "1",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  aiSummaryWindowDays: parseInteger(process.env.AI_SUMMARY_WINDOW_DAYS, 3),
  aiSummaryMaxTasks: parseInteger(process.env.AI_SUMMARY_MAX_TASKS, 12),

  morningHour: parseInteger(process.env.MORNING_HOUR_LOCAL, 9),
  eveningHour: parseInteger(process.env.EVENING_HOUR_LOCAL, 19),
  dryRun: process.env.DRY_RUN === "1",
  enforceLocalHour: process.env.ENFORCE_LOCAL_HOUR === "1",

  logDir: process.env.LOG_DIR || path.join(process.cwd(), "logs"),
};

function normalizeMode(rawMode) {
  const value = String(rawMode || "").trim().toLowerCase();
  if ([MODE_MORNING, MODE_EVENING, MODE_BOTH].includes(value)) {
    return value;
  }
  throw new Error(`Invalid MODE \"${rawMode}\". Use morning, evening, or both.`);
}

function normalizeAppMode(rawMode) {
  const value = String(rawMode || "").trim().toLowerCase();
  if ([APP_MODE_DIGEST, APP_MODE_BOT, APP_MODE_BOTH].includes(value)) {
    return value;
  }
  throw new Error(`Invalid APP_MODE "${rawMode}". Use digest, bot, or both.`);
}

function validateConfig(appMode) {
  const missing = [];
  if (!config.notionApiKey) missing.push("NOTION_API_KEY");
  if (!config.notionDatabaseId) missing.push("NOTION_DATABASE_ID");
  if (![APP_MODE_DIGEST, APP_MODE_BOT, APP_MODE_BOTH].includes(appMode)) {
    throw new Error(`Invalid APP_MODE "${config.appMode}". Use digest, bot, or both.`);
  }

  if (!["discord", "slack"].includes(config.notifier)) {
    throw new Error(`Invalid NOTIFIER "${config.notifier}". Use "discord" or "slack".`);
  }

  if ((appMode === APP_MODE_DIGEST || appMode === APP_MODE_BOTH) && !config.dryRun) {
    if (config.notifier === "discord" && !config.discordWebhookUrl) {
      missing.push("DISCORD_WEBHOOK_URL");
    }
    if (config.notifier === "slack" && !config.slackWebhookUrl) {
      missing.push("SLACK_WEBHOOK_URL");
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (appMode === APP_MODE_BOT || appMode === APP_MODE_BOTH) {
    const botMissing = [];
    if (!config.discordBotToken) botMissing.push("DISCORD_BOT_TOKEN");
    if (!config.discordAppId) botMissing.push("DISCORD_APP_ID");
    if (!config.discordGuildId) botMissing.push("DISCORD_GUILD_ID");
    if (botMissing.length > 0) {
      throw new Error(`Missing required bot environment variables: ${botMissing.join(", ")}`);
    }
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
  MODE_BOTH,
  APP_MODE_DIGEST,
  APP_MODE_BOT,
  APP_MODE_BOTH,
  BUCKETS,
  PRIORITY_TO_NUMERIC,
  config,
  normalizeMode,
  normalizeAppMode,
  validateConfig,
  parseInteger,
};
