async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function listProjects() {
  const body = await request("/projects");
  return body.projects;
}

export async function listProjectSummaries() {
  const body = await request("/project-summaries");
  return body.projects;
}

export async function listCalendar(month) {
  const suffix = month ? `?${new URLSearchParams({ month })}` : "";
  const body = await request(`/calendar${suffix}`);
  return body.calendar;
}

export async function listAnalytics(filters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  const suffix = params.toString() ? `?${params}` : "";
  const body = await request(`/analytics${suffix}`);
  return body.analytics;
}

export async function createProject(input) {
  const body = await request("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.project;
}

export async function updateProject(id, input) {
  const body = await request(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return body.project;
}

export async function listTasks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.projectId) params.set("projectId", filters.projectId);
  const suffix = params.toString() ? `?${params}` : "";
  const body = await request(`/tasks${suffix}`);
  return body.tasks;
}

export async function createTask(input) {
  const body = await request("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.task;
}

export async function updateTask(id, input) {
  const body = await request(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return body.task;
}

export async function completeTask(id) {
  const body = await request(`/tasks/${id}/complete`, { method: "PATCH" });
  return body.task;
}

export async function deleteTask(id) {
  await request(`/tasks/${id}`, { method: "DELETE" });
}

export async function listEasyTasks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.done !== undefined) params.set("done", filters.done ? "true" : "false");
  if (filters.projectId) params.set("projectId", filters.projectId);
  const suffix = params.toString() ? `?${params}` : "";
  const body = await request(`/easy-tasks${suffix}`);
  return body.easyTasks;
}

export async function createEasyTask(input) {
  const body = await request("/easy-tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.easyTask;
}

export async function updateEasyTask(id, input) {
  const body = await request(`/easy-tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return body.easyTask;
}

export async function completeEasyTask(id) {
  const body = await request(`/easy-tasks/${id}/complete`, { method: "PATCH" });
  return body.easyTask;
}

export async function deleteEasyTask(id) {
  await request(`/easy-tasks/${id}`, { method: "DELETE" });
}
