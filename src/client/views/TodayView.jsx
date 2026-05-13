import EmptyState from "../components/EmptyState.jsx";
import EasyTaskRow from "../components/EasyTaskRow.jsx";
import TaskRow from "../components/TaskRow.jsx";
import { isOverdue, isUpcomingThisWeek, todayIso } from "../dateUtils.js";

const EASY_PREVIEW_LIMIT = 3;

export default function TodayView({
  projects,
  tasks,
  easyTasks,
  onTaskChange,
  onTaskComplete,
  onTaskDelete,
  onEasyTaskComplete,
}) {
  const today = todayIso();
  const openTasks = tasks.filter((task) => task.status === "todo");
  const openEasyTasks = easyTasks.filter((task) => !task.done);
  const easyPreview = openEasyTasks.slice(0, EASY_PREVIEW_LIMIT);
  const inbox = openTasks.filter((task) => task.needsReview);
  const reviewedTasks = openTasks.filter((task) => !task.needsReview);
  const overdue = reviewedTasks.filter((task) => isOverdue(task.dueDate));
  const dueToday = reviewedTasks.filter((task) => task.dueDate === today);
  const upcoming = reviewedTasks.filter((task) => isUpcomingThisWeek(task.dueDate, today));

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
          <TaskSection
            title="Upcoming"
            emptyText="No tasks due later this week."
            tasks={upcoming}
            projects={projects}
            onTaskChange={onTaskChange}
            onTaskComplete={onTaskComplete}
            onTaskDelete={onTaskDelete}
          />
          <EasyPreviewSection
            projects={projects}
            tasks={easyPreview}
            totalCount={openEasyTasks.length}
            onEasyTaskComplete={onEasyTaskComplete}
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

function EasyPreviewSection({ projects, tasks, totalCount, onEasyTaskComplete }) {
  const title = totalCount > tasks.length ? `Easy (${tasks.length} of ${totalCount})` : "Easy";

  return (
    <section className="list-section">
      <div className="section-label">{title}</div>
      {tasks.length === 0 ? (
        <EmptyState>No easy tasks.</EmptyState>
      ) : (
        tasks.map((task) => (
          <EasyTaskRow
            key={task.id}
            task={task}
            projects={projects}
            compact
            onComplete={onEasyTaskComplete}
          />
        ))
      )}
    </section>
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
