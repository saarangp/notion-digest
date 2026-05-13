import EmptyState from "../components/EmptyState.jsx";
import TaskRow from "../components/TaskRow.jsx";
import { isOverdue, todayIso } from "../dateUtils.js";

export default function TodayView({ projects, tasks, onTaskChange, onTaskComplete, onTaskDelete }) {
  const today = todayIso();
  const openTasks = tasks.filter((task) => task.status === "todo");
  const overdue = openTasks.filter((task) => isOverdue(task.dueDate));
  const dueToday = openTasks.filter((task) => task.dueDate === today);
  const inbox = openTasks.filter((task) => task.needsReview);

  return (
    <section className="view-stack">
      <ViewHeader title="Today" subtitle="Overdue, due today, and review queue" />
      <TaskSection
        title="Overdue"
        tasks={overdue}
        projects={projects}
        onTaskChange={onTaskChange}
        onTaskComplete={onTaskComplete}
        onTaskDelete={onTaskDelete}
      />
      <TaskSection
        title="Due Today"
        tasks={dueToday}
        projects={projects}
        onTaskChange={onTaskChange}
        onTaskComplete={onTaskComplete}
        onTaskDelete={onTaskDelete}
      />
      <TaskSection
        title="Inbox Review"
        tasks={inbox}
        projects={projects}
        onTaskChange={onTaskChange}
        onTaskComplete={onTaskComplete}
        onTaskDelete={onTaskDelete}
      />
    </section>
  );
}

function ViewHeader({ title, subtitle }) {
  return (
    <header className="view-header">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </header>
  );
}

function TaskSection({ title, tasks, projects, onTaskChange, onTaskComplete, onTaskDelete }) {
  return (
    <section className="list-section">
      <div className="section-label">{title}</div>
      {tasks.length === 0 ? (
        <EmptyState>No tasks here.</EmptyState>
      ) : (
        tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projects={projects}
            onChange={onTaskChange}
            onComplete={onTaskComplete}
            onDelete={onTaskDelete}
          />
        ))
      )}
    </section>
  );
}
