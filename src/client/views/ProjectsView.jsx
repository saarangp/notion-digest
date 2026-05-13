import EmptyState from "../components/EmptyState.jsx";

export default function ProjectsView({ projects, summaries, tasks, onCreateProject, onProjectChange }) {
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
  const progressRows = projectProgress(rows, tasks);

  return (
    <section className="view-stack">
      <header className="view-header">
        <h2>Projects</h2>
        <p>Manual project deadlines and open task pressure.</p>
      </header>
      <ProjectProgress rows={progressRows} />
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

function ProjectProgress({ rows }) {
  if (!rows.length) return null;

  return (
    <section className="project-progress-list">
      {rows.map((row) => (
        <div className="project-progress-row" key={row.project.id}>
          <div className="project-progress-name">
            <span className="project-dot" style={{ background: row.project.color }} />
            <span>{row.project.name}</span>
          </div>
          <div className="project-progress-track" aria-label={`${row.project.name} ${row.completionPercent}% complete`}>
            <span style={{ width: `${row.completionPercent}%`, background: row.project.color }} />
          </div>
          <div className="project-progress-meta">
            {row.totalTaskCount ? `${row.doneTaskCount}/${row.totalTaskCount} done` : "No tasks"}
          </div>
        </div>
      ))}
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

function projectProgress(projects, tasks) {
  return projects
    .filter((project) => project.deadlineDate)
    .map((project) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id);
      const doneTaskCount = projectTasks.filter((task) => task.status === "done").length;
      const totalTaskCount = projectTasks.length;
      return {
        project,
        doneTaskCount,
        totalTaskCount,
        completionPercent: totalTaskCount ? Math.round((doneTaskCount / totalTaskCount) * 100) : 0,
      };
    });
}
