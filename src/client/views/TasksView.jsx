import TaskRow from "../components/TaskRow.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function TasksView({ projects, tasks, onCreateTask, onTaskChange, onTaskComplete, onTaskDelete }) {
  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.elements.title.value.trim();
    if (!title) return;

    await onCreateTask({
      title,
      projectId: form.elements.projectId.value || null,
      dueDate: form.elements.dueDate.value || null,
      priority: form.elements.priority.value || null,
      needsReview: false,
    });
    form.reset();
  }

  const openTasks = tasks.filter((task) => task.status === "todo");

  return (
    <section className="view-stack">
      <header className="view-header">
        <h2>Tasks</h2>
        <p>Add and edit project tasks.</p>
      </header>
      <form className="task-form" onSubmit={handleSubmit}>
        <input name="title" className="field-control title-field" placeholder="Task title" />
        <select name="projectId" className="field-control">
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <input name="dueDate" className="field-control" type="date" />
        <select name="priority" className="field-control">
          <option value="">Priority</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <button className="primary-btn" type="submit">Add Task</button>
      </form>
      <section className="list-section">
        <div className="section-label">Open Tasks</div>
        {openTasks.length === 0 ? (
          <EmptyState>No open tasks.</EmptyState>
        ) : (
          openTasks.map((task) => (
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
    </section>
  );
}
