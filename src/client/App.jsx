import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import {
  completeTask,
  createProject,
  createTask,
  deleteTask,
  listProjectSummaries,
  listProjects,
  listTasks,
  updateTask,
} from "./api.js";
import BulkAddView from "./views/BulkAddView.jsx";
import PlaceholderView from "./views/PlaceholderView.jsx";
import ProjectsView from "./views/ProjectsView.jsx";
import TasksView from "./views/TasksView.jsx";
import TodayView from "./views/TodayView.jsx";

export default function App() {
  const [activeView, setActiveView] = useState("Today");
  const [projects, setProjects] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    refreshData().catch((err) => setError(err.message));
  }, []);

  async function refreshData() {
    const [nextProjects, nextSummaries, nextTasks] = await Promise.all([
      listProjects(),
      listProjectSummaries(),
      listTasks(),
    ]);
    setProjects(nextProjects);
    setSummaries(nextSummaries);
    setTasks(nextTasks);
    setError("");
  }

  async function handleCreateProject(input) {
    await createProject(input);
    await refreshData();
  }

  async function handleCreateTask(input) {
    await createTask(input);
    await refreshData();
  }

  async function handleTaskChange(task, patch) {
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, ...patch } : item)));
    await updateTask(task.id, patch);
    await refreshData();
  }

  async function handleTaskComplete(task) {
    await completeTask(task.id);
    await refreshData();
  }

  async function handleTaskDelete(task) {
    await deleteTask(task.id);
    await refreshData();
  }

  const view = useMemo(() => {
    if (activeView === "Today") {
      return (
        <TodayView
          projects={projects}
          tasks={tasks}
          onTaskChange={handleTaskChange}
          onTaskComplete={handleTaskComplete}
          onTaskDelete={handleTaskDelete}
        />
      );
    }
    if (activeView === "Bulk Add") {
      return <BulkAddView projects={projects} onCreateTask={handleCreateTask} />;
    }
    if (activeView === "Projects") {
      return (
        <>
          <ProjectsView
            projects={projects}
            summaries={summaries}
            onCreateProject={handleCreateProject}
          />
          <TasksView
            projects={projects}
            tasks={tasks}
            onCreateTask={handleCreateTask}
            onTaskChange={handleTaskChange}
            onTaskComplete={handleTaskComplete}
            onTaskDelete={handleTaskDelete}
          />
        </>
      );
    }
    return <PlaceholderView title={activeView} />;
  }, [activeView, projects, summaries, tasks]);

  return (
    <div className="shell">
      <Sidebar activeView={activeView} onSelect={setActiveView} />
      <main className="main">
        {error ? <div className="error-banner">{error}</div> : null}
        {view}
      </main>
    </div>
  );
}
