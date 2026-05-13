import EmptyState from "../components/EmptyState.jsx";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarView({ calendar }) {
  if (!calendar) {
    return (
      <section className="view-stack">
        <ViewHeader />
        <EmptyState>Loading calendar.</EmptyState>
      </section>
    );
  }

  const days = monthDays(calendar.startDate, calendar.endDate);
  const taskCounts = keyedByDate(calendar.taskCounts);
  const deadlines = groupedByDate(calendar.deadlines);
  const firstDay = new Date(`${calendar.startDate}T00:00:00`).getDay();

  return (
    <section className="view-stack calendar-view">
      <ViewHeader month={calendar.month} />
      <section className="calendar-grid" style={{ "--calendar-offset": firstDay }}>
        {WEEKDAYS.map((day) => (
          <div className="calendar-weekday" key={day}>{day}</div>
        ))}
        {days.map((date) => (
          <CalendarDay
            key={date}
            date={date}
            isToday={date === calendar.today}
            taskCount={taskCounts.get(date)}
            deadlines={deadlines.get(date) || []}
            inboxCount={calendar.todayInboxCount?.date === date ? calendar.todayInboxCount.count : 0}
          />
        ))}
      </section>
      <ProjectTimeline bars={calendar.projectBars} startDate={calendar.startDate} endDate={calendar.endDate} />
    </section>
  );
}

function ViewHeader({ month }) {
  return (
    <header className="view-header">
      <h2>{monthLabel(month)}</h2>
      <p>Project pressure, deadlines, and daily task volume.</p>
    </header>
  );
}

function CalendarDay({ date, isToday, taskCount, deadlines, inboxCount }) {
  const dayNumber = Number(date.slice(-2));
  return (
    <div className={isToday ? "calendar-day today" : "calendar-day"}>
      <div className="calendar-day-head">
        <span>{dayNumber}</span>
        {taskCount ? <span className="calendar-count">{taskCount}</span> : null}
      </div>
      {inboxCount ? <div className="calendar-inbox">Inbox {inboxCount}</div> : null}
      {deadlines.map(({ project }) => (
        <div className="calendar-deadline" key={project.id}>
          <span style={{ background: project.color }} />
          {project.name}
        </div>
      ))}
    </div>
  );
}

function ProjectTimeline({ bars, startDate, endDate }) {
  if (!bars.length) {
    return (
      <section className="calendar-timeline">
        <div className="section-label">Project Timeline</div>
        <EmptyState>No dated project deadlines this month.</EmptyState>
      </section>
    );
  }

  return (
    <section className="calendar-timeline">
      <div className="section-label">Project Timeline</div>
      <div className="timeline-rows">
        {bars.map((bar) => (
          <ProjectBar key={bar.project.id} bar={bar} startDate={startDate} endDate={endDate} />
        ))}
      </div>
    </section>
  );
}

function ProjectBar({ bar, startDate, endDate }) {
  const gridColumn = `${dayIndex(bar.startDate, startDate) + 1} / ${dayIndex(bar.endDate, startDate) + 2}`;

  return (
    <div className="timeline-row">
      <div className="timeline-project">
        <span className="project-dot" style={{ background: bar.project.color }} />
        <span>{bar.project.name}</span>
      </div>
      <div className="timeline-track" style={{ "--days": dayIndex(endDate, startDate) + 1 }}>
        <div className="timeline-bar" style={{ gridColumn, background: bar.project.color }} />
      </div>
      <div className="timeline-dates">
        {shortDate(bar.earliestDueDate)} to {shortDate(bar.deadlineDate)}
      </div>
    </div>
  );
}

function keyedByDate(rows) {
  return new Map(rows.map((row) => [row.date, row.count]));
}

function groupedByDate(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    groups.set(row.date, [...(groups.get(row.date) || []), row]);
  });
  return groups;
}

function monthDays(startDate, endDate) {
  const days = [];
  const current = parseDate(startDate);
  const end = parseDate(endDate);

  while (current <= end) {
    days.push(toIsoDate(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function dayIndex(date, startDate) {
  return Math.round((parseDate(date) - parseDate(startDate)) / 86_400_000);
}

function monthLabel(month) {
  if (!month) return "Calendar";
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function shortDate(date) {
  const parsed = parseDate(date);
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
