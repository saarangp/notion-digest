import { useEffect, useRef, useState } from "react";
import { displayDate, isOverdue } from "../dateUtils.js";

function priorityClass(priority) {
  return priority ? `priority-${priority.toLowerCase()}` : "priority-missing";
}

function priorityFieldClass(priority, missingPriority) {
  if (missingPriority) return "review-priority-select review-needed priority-missing-field";
  return `review-priority-select ${priorityClass(priority)}-field`;
}

function resizeTitleInput(element) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export default function TaskRow({ task, projects, reviewMode = false, onChange, onComplete, onDelete }) {
  const [title, setTitle] = useState(task.title);
  const dateInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const project = projects.find((item) => item.id === task.projectId);
  const missingDueDate = reviewMode && !task.dueDate;
  const missingPriority = reviewMode && !task.priority;

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

  useEffect(() => {
    resizeTitleInput(titleInputRef.current);
  }, [title]);

  function commitTitle() {
    const nextTitle = title.trim();
    if (nextTitle && nextTitle !== task.title) {
      onChange(task, { title: nextTitle });
    } else {
      setTitle(task.title);
    }
  }

  function openDatePicker() {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
      return;
    }
    dateInputRef.current?.focus();
  }

  return (
    <div className={rowClassName(task, reviewMode)}>
      <button className="check-btn" onClick={() => onComplete(task)} type="button" aria-label="Mark done" />
      <textarea
        ref={titleInputRef}
        className="task-title-input"
        rows="1"
        value={title}
        onBlur={commitTitle}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setTitle(task.title);
            event.currentTarget.blur();
          }
        }}
        aria-label="Task title"
      />
      <label className="project-control">
        <span className="task-project-dot" style={{ background: project?.color || "transparent" }} />
        <select
          className="task-select project-select"
          value={task.projectId || ""}
          onChange={(event) => onChange(task, { projectId: event.target.value || null })}
          aria-label="Project"
        >
          <option value="">No project</option>
          {projects.map((projectOption) => (
            <option key={projectOption.id} value={projectOption.id}>
              {projectOption.name}
            </option>
          ))}
        </select>
      </label>
      <label className={missingDueDate ? "date-control review-needed" : "date-control"}>
        <button className="date-button" onClick={openDatePicker} type="button">
          {task.dueDate ? displayDate(task.dueDate) : "Set date"}
        </button>
        <input
          ref={dateInputRef}
          className="task-date-native"
          type="date"
          value={task.dueDate || ""}
          onChange={(event) => onChange(task, { dueDate: event.currentTarget.value || null })}
          aria-label="Due date"
        />
      </label>
      {reviewMode ? (
        <select
          className={priorityFieldClass(task.priority, missingPriority)}
          value={task.priority || ""}
          onChange={(event) => onChange(task, { priority: event.target.value || null })}
          aria-label="Priority"
        >
          <option value="">Priority</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      ) : (
        <label
          className="priority-control"
          title={task.priority ? `${task.priority} priority` : "Set priority"}
        >
          <span className={`priority-swatch ${priorityClass(task.priority)}`} />
          <select
            className="priority-select"
            value={task.priority || ""}
            onChange={(event) => onChange(task, { priority: event.target.value || null })}
            aria-label="Priority"
          >
            <option value="">Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </label>
      )}
      <button className="icon-btn danger" onClick={() => onDelete(task)} type="button" aria-label="Delete task" title="Delete">
        x
      </button>
    </div>
  );
}

function rowClassName(task, reviewMode) {
  const classes = ["task-row"];
  if (reviewMode) classes.push("review-row");
  if (isOverdue(task.dueDate)) classes.push("overdue");
  return classes.join(" ");
}
