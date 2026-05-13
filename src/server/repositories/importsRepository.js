const { randomUUID } = require("node:crypto");

function nowIso() {
  return new Date().toISOString();
}

function startImport(db, source, metadata = {}) {
  const run = {
    id: randomUUID(),
    source,
    startedAt: nowIso(),
    metadataJson: JSON.stringify(metadata),
  };

  db.prepare(`
    INSERT INTO imports (id, source, started_at, metadata_json)
    VALUES (?, ?, ?, ?)
  `).run(run.id, run.source, run.startedAt, run.metadataJson);

  return run;
}

function finishImport(db, id, importedCount, metadata = {}) {
  db.prepare(`
    UPDATE imports
    SET finished_at = ?, imported_count = ?, metadata_json = ?
    WHERE id = ?
  `).run(nowIso(), importedCount, JSON.stringify(metadata), id);
}

module.exports = {
  finishImport,
  startImport,
};
