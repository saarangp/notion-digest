const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function getDatabasePath() {
  return process.env.PLANNER_DB_PATH || path.join(process.cwd(), ".data", "planner.sqlite");
}

function openDatabase(databasePath = getDatabasePath()) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

module.exports = {
  getDatabasePath,
  openDatabase,
};
