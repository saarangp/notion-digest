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

export async function createProject(input) {
  const body = await request("/projects", {
    method: "POST",
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
