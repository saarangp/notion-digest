function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      deadline_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      due_date TEXT,
      priority TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      needs_review INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      imported_from TEXT,
      imported_id TEXT,
      imported_url TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_import_source_id
      ON tasks(imported_from, imported_id)
      WHERE imported_from IS NOT NULL AND imported_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS easy_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      done INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      imported_count INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT
    );
  `);

  addColumnIfMissing(db, "projects", "status", "TEXT NOT NULL DEFAULT 'active'");
  addColumnIfMissing(db, "projects", "completed_at", "TEXT");
}

function addColumnIfMissing(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = {
  migrate,
};
