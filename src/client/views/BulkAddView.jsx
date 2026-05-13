export default function BulkAddView({ projects, onCreateTask }) {
  async function createFromForm(form) {
    const title = form.elements.title.value.trim();
    if (!title) return;

    await onCreateTask({
      title,
      projectId: form.elements.projectId.value || null,
      needsReview: true,
    });
    form.reset();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await createFromForm(event.currentTarget);
  }

  async function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      await createFromForm(event.currentTarget.form);
    }
  }

  return (
    <section className="view-stack narrow-view">
      <header className="view-header">
        <h2>Bulk Add</h2>
        <p>Capture tasks quickly. Enter saves each item into review.</p>
      </header>
      <form className="bulk-form" onSubmit={handleSubmit}>
        <select name="projectId" className="field-control">
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <input
          name="title"
          className="bulk-input"
          placeholder="Task title"
          autoComplete="off"
          onKeyDown={handleKeyDown}
        />
      </form>
    </section>
  );
}
