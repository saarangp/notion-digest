import { useEffect, useState } from "react";

export default function EasyTaskRow({ task, projects, compact = false, onChange, onComplete, onDelete }) {
  const [title, setTitle] = useState(task.title);
  const project = projects.find((item) => item.id === task.projectId);

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

  function commitTitle() {
    const nextTitle = title.trim();
    if (nextTitle && nextTitle !== task.title) {
      onChange(task, { title: nextTitle });
      return;
    }
    setTitle(task.title);
  }

  function toggleDone() {
    if (task.done) {
      onChange(task, { done: false });
      return;
    }
    onComplete(task);
  }

  if (compact) {
    return (
      <div className="easy-row compact">
        <button
          className="check-btn"
          onClick={() => onComplete(task)}
          type="button"
          aria-label="Mark easy task done"
        />
        <span className="easy-title-text">{task.title}</span>
        <span className="easy-project-chip">
          <span className="task-project-dot" style={{ background: project?.color || "transparent" }} />
          {project?.name || "No project"}
        </span>
      </div>
    );
  }

  return (
    <div className={task.done ? "easy-row done" : "easy-row"}>
      <button
        className={task.done ? "check-btn checked" : "check-btn"}
        onClick={toggleDone}
        type="button"
        aria-label={task.done ? "Reopen easy task" : "Mark easy task done"}
      />
      <input
        className="easy-title-input"
        value={title}
        onBlur={commitTitle}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setTitle(task.title);
            event.currentTarget.blur();
          }
        }}
        aria-label="Easy task title"
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
      <button className="icon-btn danger" onClick={() => onDelete(task)} type="button" aria-label="Delete easy task" title="Delete">
        x
      </button>
    </div>
  );
}
