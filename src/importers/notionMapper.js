const { notionImportConfig } = require("./notionConfig");

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

function mapPriority(rawPriority) {
  const value = String(rawPriority || "").trim().toLowerCase();
  if (value === "p0" || value === "high") return "High";
  if (value === "p1" || value === "p2" || value === "medium") return "Medium";
  return "Low";
}

function isClosedNotionPage(page, config = notionImportConfig) {
  const status = String(extractProperty(page, config.statusProp) || "").trim().toLowerCase();
  const doneChecked = extractProperty(page, config.doneCheckboxProp) === true;
  return doneChecked || config.closedStatuses.has(status);
}

function normalizeIsoDate(raw) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return raw.length >= 10 ? raw.slice(0, 10) : date.toISOString().slice(0, 10);
}

function relationProjectIds(page, config = notionImportConfig) {
  const prop = page.properties[config.projectProp];
  return prop?.type === "relation" ? prop.relation.map((item) => item.id) : [];
}

function selectedProjectName(page, config = notionImportConfig) {
  const prop = page.properties[config.projectProp];
  if (prop?.type === "select") return prop.select?.name || null;
  if (prop?.type === "multi_select") return prop.multi_select.map((item) => item.name).join(", ");
  return null;
}

function mapNotionPageToImportTask(page, config = notionImportConfig) {
  const done = isClosedNotionPage(page, config);
  const completedAt = done
    ? extractProperty(page, config.completedTimeProp) || page.last_edited_time || null
    : null;

  return {
    title: extractProperty(page, config.taskProp) || "Untitled",
    priority: mapPriority(extractProperty(page, config.priorityProp)),
    status: done ? "done" : "todo",
    dueDate: normalizeIsoDate(extractProperty(page, config.dueProp)),
    projectName: selectedProjectName(page, config),
    relationProjectIds: relationProjectIds(page, config),
    estimatedMinutes: extractProperty(page, config.estimatedMinutesProp),
    completedAt,
    importedFrom: "notion",
    importedId: page.id,
    importedUrl: page.url || null,
  };
}

module.exports = {
  extractProperty,
  mapPriority,
  isClosedNotionPage,
  mapNotionPageToImportTask,
  normalizeIsoDate,
};
