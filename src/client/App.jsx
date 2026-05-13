import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import {
  completeEasyTask,
  completeProject,
  completeTask,
  createEasyTask,
  createProject,
  createTask,
  deleteEasyTask,
  deleteTask,
  listCalendar,
  listEasyTasks,
  listProjectSummaries,
  listProjects,
  listTasks,
  reopenProject,
  updateEasyTask,
  updateProject,
  updateTask,
} from "./api.js";
import BulkAddView from "./views/BulkAddView.jsx";
import AnalyticsView from "./views/AnalyticsView.jsx";
import CalendarView from "./views/CalendarView.jsx";
import EasyView from "./views/EasyView.jsx";
import PlaceholderView from "./views/PlaceholderView.jsx";
import ProjectsView from "./views/ProjectsView.jsx";
import TasksView from "./views/TasksView.jsx";
import TodayView from "./views/TodayView.jsx";

export default function App() {
  const [activeView, setActiveView] = useState("Today");
  const [projects, setProjects] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [easyTasks, setEasyTasks] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    refreshData().catch((err) => setError(err.message));
  }, []);

  async function refreshData() {
    const [nextProjects, nextSummaries, nextTasks, nextEasyTasks, nextCalendar] = await Promise.all([
      listProjects(),
      listProjectSummaries(),
      listTasks(),
      listEasyTasks(),
      listCalendar(),
    ]);
    setProjects(nextProjects);
    setSummaries(nextSummaries);
    setTasks(nextTasks);
    setEasyTasks(nextEasyTasks);
    setCalendar(nextCalendar);
    setDataRevision((current) => current + 1);
    setError("");
  }

  async function handleCreateProject(input) {
    await createProject(input);
    await refreshData();
  }

  async function handleProjectChange(project, patch) {
    setProjects((current) => current.map((item) => (item.id === project.id ? { ...item, ...patch } : item)));
    await updateProject(project.id, patch);
    await refreshData();
  }

  async function handleProjectComplete(project) {
    try {
      await completeProject(project.id);
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleProjectReopen(project) {
    await reopenProject(project.id);
    await refreshData();
  }

  async function handleCreateTask(input) {
    const task = await createTask(input);
    await refreshData();
    return task;
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

  async function handleCreateEasyTask(input) {
    const easyTask = await createEasyTask(input);
    await refreshData();
    return easyTask;
  }

  async function handleEasyTaskChange(easyTask, patch) {
    setEasyTasks((current) => current.map((item) => (item.id === easyTask.id ? { ...item, ...patch } : item)));
    await updateEasyTask(easyTask.id, patch);
    await refreshData();
  }

  async function handleEasyTaskComplete(easyTask) {
    await completeEasyTask(easyTask.id);
    await refreshData();
  }

  async function handleEasyTaskDelete(easyTask) {
    await deleteEasyTask(easyTask.id);
    await refreshData();
  }

  const view = useMemo(() => {
    const activeProjects = projects.filter((project) => project.status !== "done");

    if (activeView === "Today") {
      return (
        <TodayView
          projects={activeProjects}
          tasks={tasks}
          easyTasks={easyTasks}
          onTaskChange={handleTaskChange}
          onTaskComplete={handleTaskComplete}
          onTaskDelete={handleTaskDelete}
          onEasyTaskComplete={handleEasyTaskComplete}
        />
      );
    }
    if (activeView === "Bulk Add") {
      return <BulkAddView projects={activeProjects} onCreateTask={handleCreateTask} />;
    }
    if (activeView === "Projects") {
      return (
        <>
          <ProjectsView
            projects={projects}
            summaries={summaries}
            tasks={tasks}
            onCreateProject={handleCreateProject}
            onProjectChange={handleProjectChange}
            onProjectComplete={handleProjectComplete}
            onProjectReopen={handleProjectReopen}
          />
          <TasksView
            projects={activeProjects}
            tasks={tasks}
            onCreateTask={handleCreateTask}
            onTaskChange={handleTaskChange}
            onTaskComplete={handleTaskComplete}
            onTaskDelete={handleTaskDelete}
          />
        </>
      );
    }
    if (activeView === "Calendar") {
      return <CalendarView calendar={calendar} tasks={tasks} />;
    }
    if (activeView === "Analytics") {
      return <AnalyticsView refreshKey={dataRevision} />;
    }
    if (activeView === "Easy") {
      return (
        <EasyView
          projects={activeProjects}
          easyTasks={easyTasks}
          onCreateEasyTask={handleCreateEasyTask}
          onEasyTaskChange={handleEasyTaskChange}
          onEasyTaskComplete={handleEasyTaskComplete}
          onEasyTaskDelete={handleEasyTaskDelete}
        />
      );
    }
    return <PlaceholderView title={activeView} />;
  }, [activeView, projects, summaries, tasks, easyTasks, calendar, dataRevision]);

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
