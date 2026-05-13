export default function PlaceholderView({ title }) {
  return (
    <section className="view-stack">
      <header className="view-header">
        <h2>{title}</h2>
        <p>This view is reserved for the next implementation phase.</p>
      </header>
      <div className="empty-state">This section is not implemented yet.</div>
    </section>
  );
}
