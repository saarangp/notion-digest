export default function PlaceholderView({ title }) {
  return (
    <section className="view-stack">
      <header className="view-header">
        <h2>{title}</h2>
        <p>This view is reserved for the next implementation phase.</p>
      </header>
      <div className="empty-state">Phase 1 focuses on the shell, projects, and task CRUD.</div>
    </section>
  );
}
