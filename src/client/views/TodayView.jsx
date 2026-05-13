import EmptyState from "../components/EmptyState.jsx";
import TaskRow from "../components/TaskRow.jsx";
import { isOverdue, todayIso } from "../dateUtils.js";

export default function TodayView({ projects, tasks, onTaskChange, onTaskComplete, onTaskDelete }) {
  const today = todayIso();
  const openTasks = tasks.filter((task) => task.status === "todo");
  const inbox = openTasks.filter((task) => task.needsReview);
  const reviewedTasks = openTasks.filter((task) => !task.needsReview);
  const overdue = reviewedTasks.filter((task) => isOverdue(task.dueDate));
  const dueToday = reviewedTasks.filter((task) => task.dueDate === today);

  return (
    <section className="view-stack">
      <ViewHeader title="Today" subtitle="Overdue, due today, and review queue" />
      <div className="today-layout">
        <div className="today-main">
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
        </div>
        <aside className="today-review">
          <TaskSection
            title="Inbox Review"
            emptyText="No tasks need review."
            tasks={inbox}
            projects={projects}
            reviewMode
            onTaskChange={onTaskChange}
            onTaskComplete={onTaskComplete}
            onTaskDelete={onTaskDelete}
          />
        </aside>
      </div>
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

function TaskSection({
  title,
  tasks,
  projects,
  reviewMode = false,
  emptyText = "No tasks here.",
  onTaskChange,
  onTaskComplete,
  onTaskDelete,
}) {
  return (
    <section className="list-section">
      <div className="section-label">{title}</div>
      {tasks.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projects={projects}
            reviewMode={reviewMode}
            onChange={onTaskChange}
            onComplete={onTaskComplete}
            onDelete={onTaskDelete}
          />
        ))
      )}
    </section>
  );
}
