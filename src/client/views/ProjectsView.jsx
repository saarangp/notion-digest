import EmptyState from "../components/EmptyState.jsx";

export default function ProjectsView({ projects, summaries, onCreateProject, onProjectChange }) {
  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    if (!name) return;

    await onCreateProject({
      name,
      deadlineDate: form.elements.deadlineDate.value || null,
    });
    form.reset();
  }

  const rows = summaries.length ? summaries : projects;

  return (
    <section className="view-stack">
      <header className="view-header">
        <h2>Projects</h2>
        <p>Manual project deadlines and open task pressure.</p>
      </header>
      <form className="project-form" onSubmit={handleSubmit}>
        <input name="name" className="field-control" placeholder="Project name" />
        <input name="deadlineDate" className="field-control" type="date" />
        <button className="primary-btn" type="submit">Add Project</button>
      </form>
      <section className="project-list">
        {rows.length === 0 ? (
          <EmptyState>No projects yet.</EmptyState>
        ) : (
          rows.map((project) => (
            <ProjectRow key={project.id} project={project} onProjectChange={onProjectChange} />
          ))
        )}
      </section>
    </section>
  );
}

function ProjectRow({ project, onProjectChange }) {
  return (
    <div className="project-row">
      <label className="project-color-control" title="Project color">
        <span className="project-dot" style={{ background: project.color }} />
        <input
          aria-label={`${project.name} color`}
          type="color"
          value={project.color}
          onChange={(event) => onProjectChange(project, { color: event.currentTarget.value })}
        />
      </label>
      <div className="project-main">
        <div className="project-name">{project.name}</div>
        <div className="project-sub">{project.openTaskCount || 0} open</div>
      </div>
      <label className="project-deadline-control">
        <span>Deadline</span>
        <input
          aria-label={`${project.name} deadline`}
          type="date"
          value={project.deadlineDate || ""}
          onChange={(event) => onProjectChange(project, { deadlineDate: event.currentTarget.value || null })}
        />
      </label>
      <div className="project-next">{project.nextDueDate || "No dated tasks"}</div>
    </div>
  );
}
