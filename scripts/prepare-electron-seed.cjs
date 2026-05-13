const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, ".data", "planner.sqlite");
const seedDir = path.join(repoRoot, "electron-seed");
const seedPath = path.join(seedDir, "planner.sqlite");

fs.rmSync(seedDir, { recursive: true, force: true });

if (!fs.existsSync(sourcePath)) {
  process.exit(0);
}

fs.mkdirSync(seedDir, { recursive: true });

for (const suffix of ["", "-wal", "-shm"]) {
  const sourceFile = `${sourcePath}${suffix}`;
  if (fs.existsSync(sourceFile)) {
    fs.copyFileSync(sourceFile, `${seedPath}${suffix}`);
  }
}
