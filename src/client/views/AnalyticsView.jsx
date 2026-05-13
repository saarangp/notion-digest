import { useEffect, useMemo, useRef, useState } from "react";
import { displayDate, todayIso } from "../dateUtils.js";
import EmptyState from "../components/EmptyState.jsx";
import { listAnalytics } from "../api.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HEATMAP_DAYS = 365;
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

export default function AnalyticsView({ refreshKey }) {
  const [analytics, setAnalytics] = useState({ heatmap: [], archive: [] });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const range = useMemo(() => heatmapRange(), []);

  useEffect(() => {
    listAnalytics({ search, startDate: range.startDate, endDate: range.endDate })
      .then((nextAnalytics) => {
        setAnalytics(nextAnalytics);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [search, range.startDate, range.endDate, refreshKey]);

  return (
    <section className="view-stack analytics-view">
      <header className="view-header">
        <h2>Analytics</h2>
        <p>Completion history and archive.</p>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      <CompletionHeatmap rows={analytics.heatmap} range={range} />
      <CompletedArchive rows={analytics.archive} search={search} onSearch={setSearch} />
    </section>
  );
}

function CompletionHeatmap({ rows, range }) {
  const shellRef = useRef(null);
  const counts = new Map(rows.map((row) => [row.date, row.count]));
  const days = heatmapDays(range.startDate, range.endDate);
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  useEffect(() => {
    if (shellRef.current) {
      shellRef.current.scrollLeft = shellRef.current.scrollWidth;
    }
  }, [days.length]);

  return (
    <section className="list-section">
      <div className="section-label">Completion Heatmap ({total})</div>
      <div className="heatmap-shell" ref={shellRef}>
        <div className="heatmap-weekdays">
          {WEEKDAYS.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        </div>
        <div className="heatmap-grid">
          {days.map((date) => (
            <span
              className={`heatmap-cell level-${heatmapLevel(counts.get(date) || 0, maxCount)}`}
              key={date}
              title={`${displayDate(date)}: ${counts.get(date) || 0} completed`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CompletedArchive({ rows, search, onSearch }) {
  return (
    <section className="list-section">
      <div className="section-label">Completed Archive</div>
      <input
        className="field-control archive-search"
        placeholder="Search completed tasks"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      {rows.length === 0 ? <EmptyState>No completed tasks found.</EmptyState> : <ArchiveTable rows={rows} />}
    </section>
  );
}

function ArchiveTable({ rows }) {
  return (
    <div className="archive-table">
      <div className="archive-row archive-head">
        <span>Title</span>
        <span>Project</span>
        <span>Completed</span>
        <span>Type</span>
      </div>
      {rows.map((row) => (
        <div className="archive-row" key={`${row.type}-${row.id}`}>
          <span className="archive-title">{row.title}</span>
          <span className="archive-project">
            {row.projectName ? <span className="task-project-dot" style={{ background: row.projectColor }} /> : null}
            {row.projectName || "No project"}
          </span>
          <span>{displayDate(row.completedDate)}</span>
          <span>{row.type === "easy" ? "Easy" : "Task"}</span>
        </div>
      ))}
    </div>
  );
}

function heatmapRange() {
  const endDate = todayIso();
  return { startDate: addDays(endDate, -HEATMAP_DAYS), endDate };
}

function heatmapDays(startDate, endDate) {
  const days = [];
  const start = startOfWeek(parseIsoDate(startDate));
  const end = parseIsoDate(endDate);

  while (start <= end) {
    days.push(toIsoDate(start));
    start.setDate(start.getDate() + 1);
  }

  return days;
}

function heatmapLevel(count, maxCount) {
  if (!count) return 0;
  return Math.max(1, Math.ceil((count / maxCount) * 4));
}

function addDays(dateIso, days) {
  const date = parseIsoDate(dateIso);
  date.setTime(date.getTime() + days * DAY_MS);
  return toIsoDate(date);
}

function startOfWeek(date) {
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function parseIsoDate(dateIso) {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
