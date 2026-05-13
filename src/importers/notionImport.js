require("dotenv").config();

const { Client } = require("@notionhq/client");
const { openDatabase } = require("../server/db");
const { migrate } = require("../server/schema");
const { finishImport, startImport } = require("../server/repositories/importsRepository");
const { findOrCreateProjectByName } = require("../server/repositories/projectsRepository");
const { createTask, getTaskByImport } = require("../server/repositories/tasksRepository");
const { extractPageTitle, mapNotionPageToImportTask } = require("./notionMapper");
const { notionImportConfig } = require("./notionConfig");

function cutoffDate(now, days) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date;
}

function shouldImportTask(task, options = {}) {
  if (task.status !== "done") return true;
  if (!task.completedAt) return false;

  const completedAt = new Date(task.completedAt);
  if (Number.isNaN(completedAt.getTime())) return false;

  const days = options.completedImportDays ?? notionImportConfig.completedImportDays;
  return completedAt >= cutoffDate(options.now || new Date(), days);
}

async function importMappedTasks(db, mappedTasks, options = {}) {
  const relationProjectName = options.relationProjectName || (() => null);
  const stats = {
    scanned: mappedTasks.length,
    imported: 0,
    skippedDuplicate: 0,
    skippedOldCompleted: 0,
    projectsCreated: 0,
  };

  for (const mappedTask of mappedTasks) {
    if (getTaskByImport(db, mappedTask.importedFrom, mappedTask.importedId)) {
      stats.skippedDuplicate += 1;
      continue;
    }

    if (!shouldImportTask(mappedTask, options)) {
      stats.skippedOldCompleted += 1;
      continue;
    }

    const projectName = await resolveProjectName(mappedTask, relationProjectName);
    const project = projectName ? findOrCreateProjectByName(db, projectName) : null;
    if (project?.created) stats.projectsCreated += 1;

    createTask(db, {
      ...mappedTask,
      projectId: project?.project.id || null,
      projectName: undefined,
      relationProjectIds: undefined,
    });
    stats.imported += 1;
  }

  return stats;
}

async function resolveProjectName(mappedTask, relationProjectName) {
  if (mappedTask.projectName?.trim()) return mappedTask.projectName.trim();

  for (const relationId of mappedTask.relationProjectIds || []) {
    const name = await relationProjectName(relationId);
    if (name?.trim()) return name.trim();
  }

  return null;
}

function validateConfig(config) {
  const missing = [];
  if (!config.notionApiKey) missing.push("NOTION_API_KEY");
  if (!config.notionDatabaseId) missing.push("NOTION_DATABASE_ID");
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

async function queryAllNotionPages(notion, databaseId) {
  const pages = [];
  let cursor;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function createRelationProjectNameResolver(notion) {
  const cache = new Map();

  return async function relationProjectName(pageId) {
    if (cache.has(pageId)) return cache.get(pageId);

    const title = await retrieveRelationPageTitle(notion, pageId);
    cache.set(pageId, title);
    return title;
  };
}

async function retrieveRelationPageTitle(notion, pageId) {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return extractPageTitle(page);
  } catch {
    return null;
  }
}

async function runNotionImport(config = notionImportConfig) {
  validateConfig(config);

  const notion = new Client({ auth: config.notionApiKey });
  const db = openDatabase();
  migrate(db);

  const importRun = startImport(db, "notion", {
    databaseId: config.notionDatabaseId,
    completedImportDays: config.completedImportDays,
  });

  const pages = await queryAllNotionPages(notion, config.notionDatabaseId);
  const mappedTasks = pages.map((page) => mapNotionPageToImportTask(page, config));
  const stats = await importMappedTasks(db, mappedTasks, {
    completedImportDays: config.completedImportDays,
    relationProjectName: createRelationProjectNameResolver(notion),
  });

  finishImport(db, importRun.id, stats.imported, stats);
  return stats;
}

async function main() {
  try {
    const stats = await runNotionImport();
    console.log(`Notion import complete: ${stats.imported} imported, ${stats.skippedDuplicate} duplicates, ${stats.skippedOldCompleted} old completed skipped, ${stats.projectsCreated} projects created.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  createRelationProjectNameResolver,
  importMappedTasks,
  queryAllNotionPages,
  resolveProjectName,
  retrieveRelationPageTitle,
  runNotionImport,
  shouldImportTask,
};

if (require.main === module) {
  main();
}
