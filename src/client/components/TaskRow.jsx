import { useEffect, useState } from "react";
import { displayDate, isOverdue } from "../dateUtils.js";

export default function TaskRow({ task, projects, onChange, onComplete, onDelete }) {
  const [title, setTitle] = useState(task.title);

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

  function commitTitle() {
    const nextTitle = title.trim();
    if (nextTitle && nextTitle !== task.title) {
      onChange(task, { title: nextTitle });
    } else {
      setTitle(task.title);
    }
  }

  return (
    <div className={isOverdue(task.dueDate) ? "task-row overdue" : "task-row"}>
      <button className="check-btn" onClick={() => onComplete(task)} type="button" aria-label="Mark done" />
      <input
        className="task-title-input"
        value={title}
        onBlur={commitTitle}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setTitle(task.title);
        }}
        aria-label="Task title"
      />
      <select
        className="task-select project-select"
        value={task.projectId || ""}
        onChange={(event) => onChange(task, { projectId: event.target.value || null })}
        aria-label="Project"
      >
        <option value="">No project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <input
        className="task-date"
        type="date"
        value={task.dueDate || ""}
        onInput={(event) => onChange(task, { dueDate: event.currentTarget.value || null })}
        aria-label="Due date"
      />
      <select
        className="task-select priority-select"
        value={task.priority || ""}
        onChange={(event) => onChange(task, { priority: event.target.value || null })}
        aria-label="Priority"
      >
        <option value="">Priority</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <span className="task-meta">{displayDate(task.dueDate)}</span>
      <button className="text-btn danger" onClick={() => onDelete(task)} type="button">
        Delete
      </button>
    </div>
  );
}
