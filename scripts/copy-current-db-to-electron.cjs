const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, ".data", "planner.sqlite");
const targetPath = path.join(os.homedir(), "Library", "Application Support", "Local Planner", "planner.sqlite");

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Planner database not found at ${sourcePath}`);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });

for (const suffix of ["", "-wal", "-shm"]) {
  const sourceFile = `${sourcePath}${suffix}`;
  const targetFile = `${targetPath}${suffix}`;

  if (fs.existsSync(sourceFile)) {
    fs.copyFileSync(sourceFile, targetFile);
  } else {
    fs.rmSync(targetFile, { force: true });
  }
}

console.log(`Copied current planner database to ${targetPath}`);
