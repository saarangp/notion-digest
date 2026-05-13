const NAV_ITEMS = [
  "Today",
  "Bulk Add",
  "Projects",
  "Calendar",
  "Analytics",
  "Easy",
];

export default function Sidebar({ activeView, onSelect }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <aside className="sidebar">
      <div>
        <h1 className="app-name">Planner</h1>
        <div className="app-date">{today}</div>
      </div>
      <nav className="nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <button
            className={item === activeView ? "nav-btn active" : "nav-btn"}
            key={item}
            onClick={() => onSelect(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="sb-spacer" />
      <div className="sidebar-note">Local SQLite</div>
    </aside>
  );
}
