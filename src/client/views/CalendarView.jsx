import { useState } from "react";
import EmptyState from "../components/EmptyState.jsx";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarView({ calendar, tasks }) {
  const [openDate, setOpenDate] = useState(null);

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
  const datedTasks = tasks.filter((task) => task.status === "todo" && task.dueDate);

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
            tasks={datedTasks.filter((task) => task.dueDate === date)}
            deadlines={deadlines.get(date) || []}
            isOpen={openDate === date}
            onToggle={() => setOpenDate((current) => (current === date ? null : date))}
          />
        ))}
      </section>
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

function CalendarDay({ date, isToday, taskCount, tasks, deadlines, isOpen, onToggle }) {
  const dayNumber = Number(date.slice(-2));
  return (
    <div className={isToday ? "calendar-day today" : "calendar-day"}>
      <div className="calendar-day-head">
        <span>{dayNumber}</span>
        {taskCount ? <TaskPopover count={taskCount} date={date} tasks={tasks} isOpen={isOpen} onToggle={onToggle} /> : null}
      </div>
      {deadlines.map(({ project }) => (
        <div className="calendar-deadline" key={project.id}>
          <span style={{ background: project.color }} />
          {project.name}
        </div>
      ))}
    </div>
  );
}

function TaskPopover({ count, date, tasks, isOpen, onToggle }) {
  return (
    <details className="calendar-task-popover" open={isOpen}>
      <summary
        className="calendar-count"
        onClick={(event) => {
          event.preventDefault();
          onToggle();
        }}
      >
        {count}
      </summary>
      <div className="calendar-task-panel">
        <div className="calendar-task-date">{shortDate(date)}</div>
        {tasks.map((task) => (
          <div className="calendar-task-item" key={task.id}>
            <span className="task-project-dot" style={{ background: task.projectColor || "transparent" }} />
            <span>{task.title}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function keyedByDate(rows) {
  return new Map((rows || []).map((row) => [row.date, row.count]));
}

function groupedByDate(rows) {
  const groups = new Map();
  (rows || []).forEach((row) => {
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
