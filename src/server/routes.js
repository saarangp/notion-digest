const {
  completeProject,
  createProject,
  deleteProject,
  listProjectSummaries,
  listProjects,
  reopenProject,
  updateProject,
} = require("./repositories/projectsRepository");
const { listCompletedArchive, listCompletionHeatmap } = require("./repositories/analyticsRepository");
const { listCalendarData } = require("./repositories/calendarRepository");
const { completeTask, createTask, deleteTask, listTasks, reopenTask, updateTask } = require("./repositories/tasksRepository");
const {
  completeEasyTask,
  createEasyTask,
  deleteEasyTask,
  listEasyTasks,
  reopenEasyTask,
  updateEasyTask,
} = require("./repositories/easyTasksRepository");

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function routePattern(pathname) {
  const match = pathname.match(/^\/api\/(projects|tasks|easy-tasks)\/([^/]+)(?:\/(complete|reopen))?$/);
  if (!match) return null;
  return { resource: match[1], id: match[2], action: match[3] || null };
}

async function handleApi(req, res, db) {
  const url = new URL(req.url, "http://localhost");

  try {
    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/projects") {
      await handleProjects(req, res, db);
      return;
    }

    if (url.pathname === "/api/project-summaries") {
      sendJson(res, 200, { projects: listProjectSummaries(db) });
      return;
    }

    if (url.pathname === "/api/calendar") {
      sendJson(res, 200, {
        calendar: listCalendarData(db, { month: url.searchParams.get("month") || undefined }),
      });
      return;
    }

    if (url.pathname === "/api/analytics") {
      sendJson(res, 200, {
        analytics: {
          heatmap: listCompletionHeatmap(db, {
            startDate: url.searchParams.get("startDate") || undefined,
            endDate: url.searchParams.get("endDate") || undefined,
          }),
          archive: listCompletedArchive(db, {
            search: url.searchParams.get("search") || "",
          }),
        },
      });
      return;
    }

    if (url.pathname === "/api/tasks") {
      await handleTasks(req, res, db, url);
      return;
    }

    if (url.pathname === "/api/easy-tasks") {
      await handleEasyTasks(req, res, db, url);
      return;
    }

    const routed = routePattern(url.pathname);
    if (routed?.resource === "projects") {
      await handleProject(req, res, db, routed.id, routed.action);
      return;
    }

    if (routed?.resource === "tasks") {
      await handleTask(req, res, db, routed.id, routed.action);
      return;
    }

    if (routed?.resource === "easy-tasks") {
      await handleEasyTask(req, res, db, routed.id, routed.action);
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleProjects(req, res, db) {
  if (req.method === "GET") {
    sendJson(res, 200, { projects: listProjects(db) });
    return;
  }

  if (req.method === "POST") {
    const input = await readJson(req);
    sendJson(res, 201, { project: createProject(db, input) });
    return;
  }

  methodNotAllowed(res);
}

async function handleProject(req, res, db, id, action) {
  if (req.method === "PATCH" && action === "complete") {
    const project = completeProject(db, id);
    project ? sendJson(res, 200, { project }) : notFound(res);
    return;
  }

  if (req.method === "PATCH" && action === "reopen") {
    const project = reopenProject(db, id);
    project ? sendJson(res, 200, { project }) : notFound(res);
    return;
  }

  if (req.method === "PATCH" && !action) {
    const project = updateProject(db, id, await readJson(req));
    project ? sendJson(res, 200, { project }) : notFound(res);
    return;
  }

  if (req.method === "DELETE" && !action) {
    deleteProject(db, id) ? sendNoContent(res) : notFound(res);
    return;
  }

  methodNotAllowed(res);
}

async function handleTasks(req, res, db, url) {
  if (req.method === "GET") {
    const filters = {};
    if (url.searchParams.get("status")) filters.status = url.searchParams.get("status");
    if (url.searchParams.get("projectId")) filters.projectId = url.searchParams.get("projectId");
    sendJson(res, 200, { tasks: listTasks(db, filters) });
    return;
  }

  if (req.method === "POST") {
    const input = await readJson(req);
    sendJson(res, 201, { task: createTask(db, input) });
    return;
  }

  methodNotAllowed(res);
}

async function handleTask(req, res, db, id, action) {
  if (req.method === "PATCH" && action === "complete") {
    const task = completeTask(db, id);
    task ? sendJson(res, 200, { task }) : notFound(res);
    return;
  }

  if (req.method === "PATCH" && action === "reopen") {
    const task = reopenTask(db, id);
    task ? sendJson(res, 200, { task }) : notFound(res);
    return;
  }

  if (req.method === "PATCH" && !action) {
    const task = updateTask(db, id, await readJson(req));
    task ? sendJson(res, 200, { task }) : notFound(res);
    return;
  }

  if (req.method === "DELETE" && !action) {
    deleteTask(db, id) ? sendNoContent(res) : notFound(res);
    return;
  }

  methodNotAllowed(res);
}

async function handleEasyTasks(req, res, db, url) {
  if (req.method === "GET") {
    const filters = {};
    if (url.searchParams.get("done") !== null) filters.done = url.searchParams.get("done") === "true";
    if (url.searchParams.get("projectId")) filters.projectId = url.searchParams.get("projectId");
    sendJson(res, 200, { easyTasks: listEasyTasks(db, filters) });
    return;
  }

  if (req.method === "POST") {
    const input = await readJson(req);
    sendJson(res, 201, { easyTask: createEasyTask(db, input) });
    return;
  }

  methodNotAllowed(res);
}

async function handleEasyTask(req, res, db, id, action) {
  if (req.method === "PATCH" && action === "complete") {
    const easyTask = completeEasyTask(db, id);
    easyTask ? sendJson(res, 200, { easyTask }) : notFound(res);
    return;
  }

  if (req.method === "PATCH" && action === "reopen") {
    const easyTask = reopenEasyTask(db, id);
    easyTask ? sendJson(res, 200, { easyTask }) : notFound(res);
    return;
  }

  if (req.method === "PATCH" && !action) {
    const easyTask = updateEasyTask(db, id, await readJson(req));
    easyTask ? sendJson(res, 200, { easyTask }) : notFound(res);
    return;
  }

  if (req.method === "DELETE" && !action) {
    deleteEasyTask(db, id) ? sendNoContent(res) : notFound(res);
    return;
  }

  methodNotAllowed(res);
}

module.exports = {
  handleApi,
};
