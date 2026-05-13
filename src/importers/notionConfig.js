function csvToSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

const notionImportConfig = {
  notionApiKey: process.env.NOTION_API_KEY,
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  taskProp: process.env.NOTION_TASK_PROP || "Task",
  priorityProp: process.env.NOTION_PRIORITY_PROP || "Priority",
  statusProp: process.env.NOTION_STATUS_PROP || "Status",
  dueProp: process.env.NOTION_DUE_PROP || "Due",
  doneCheckboxProp: process.env.NOTION_DONE_CHECKBOX_PROP || "done",
  projectProp: process.env.NOTION_PROJECT_PROP || "Project",
  estimatedMinutesProp: process.env.NOTION_ESTIMATED_MINUTES_PROP || "estimated_minutes",
  createdTimeProp: process.env.NOTION_CREATED_TIME_PROP || "Created time",
  lastEditedProp: process.env.NOTION_LAST_EDITED_PROP || "Last edited time",
  completedTimeProp: process.env.NOTION_COMPLETED_TIME_PROP || "Completed time",
  closedStatuses: csvToSet(process.env.CLOSED_STATUS_VALUES || "done"),
  completedImportDays: Number.parseInt(process.env.NOTION_COMPLETED_IMPORT_DAYS || "90", 10),
};

module.exports = {
  notionImportConfig,
};
