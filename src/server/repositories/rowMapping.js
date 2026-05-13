function mapProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    deadlineDate: row.deadline_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    projectName: row.project_name,
    projectColor: row.project_color,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    needsReview: Boolean(row.needs_review),
    estimatedMinutes: row.estimated_minutes,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    importedFrom: row.imported_from,
    importedId: row.imported_id,
    importedUrl: row.imported_url,
  };
}

module.exports = {
  mapProject,
  mapTask,
};
