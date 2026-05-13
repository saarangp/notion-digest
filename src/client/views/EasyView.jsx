import EasyTaskRow from "../components/EasyTaskRow.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function EasyView({
  projects,
  easyTasks,
  onCreateEasyTask,
  onEasyTaskChange,
  onEasyTaskComplete,
  onEasyTaskDelete,
}) {
  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.elements.title.value.trim();
    if (!title) return;

    await onCreateEasyTask({
      title,
      projectId: form.elements.projectId.value || null,
    });
    form.reset();
  }

  const openTasks = easyTasks.filter((task) => !task.done);
  const doneTasks = easyTasks.filter((task) => task.done);

  return (
    <section className="view-stack narrow-view">
      <header className="view-header">
        <h2>Easy</h2>
        <p>Small tasks without dates or priority.</p>
      </header>
      <form className="easy-form" onSubmit={handleSubmit}>
        <input name="title" className="field-control title-field" placeholder="Easy task" />
        <select name="projectId" className="field-control">
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <button className="primary-btn" type="submit">Add</button>
      </form>
      <EasySection
        title="Open"
        emptyText="No easy tasks."
        projects={projects}
        tasks={openTasks}
        onChange={onEasyTaskChange}
        onComplete={onEasyTaskComplete}
        onDelete={onEasyTaskDelete}
      />
      <EasySection
        title="Completed"
        emptyText="No completed easy tasks."
        projects={projects}
        tasks={doneTasks}
        onChange={onEasyTaskChange}
        onComplete={onEasyTaskComplete}
        onDelete={onEasyTaskDelete}
      />
    </section>
  );
}

function EasySection({ title, emptyText, projects, tasks, onChange, onComplete, onDelete }) {
  return (
    <section className="list-section">
      <div className="section-label">{title}</div>
      {tasks.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        tasks.map((task) => (
          <EasyTaskRow
            key={task.id}
            task={task}
            projects={projects}
            onChange={onChange}
            onComplete={onComplete}
            onDelete={onDelete}
          />
        ))
      )}
    </section>
  );
}
