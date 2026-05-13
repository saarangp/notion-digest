import EmptyState from "../components/EmptyState.jsx";

export default function ProjectsView({ projects, summaries, onCreateProject }) {
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
            <div className="project-row" key={project.id}>
              <span className="project-dot" style={{ background: project.color }} />
              <div className="project-main">
                <div className="project-name">{project.name}</div>
                <div className="project-sub">
                  Deadline {project.deadlineDate || "unset"} · {project.openTaskCount || 0} open
                </div>
              </div>
              <div className="project-next">{project.nextDueDate || "No dated tasks"}</div>
            </div>
          ))
        )}
      </section>
    </section>
  );
}
