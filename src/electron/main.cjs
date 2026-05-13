const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { openDatabase } = require("../server/db");
const { createServer } = require("../server");
const { migrate } = require("../server/schema");

let apiServer;

function getSeedDatabasePath() {
  const candidates = [
    path.join(process.resourcesPath, "electron-seed", "planner.sqlite"),
    path.join(app.getAppPath(), "electron-seed", "planner.sqlite"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function seedDatabaseFromRepo(databasePath) {
  const sourcePath = getSeedDatabasePath();

  if (fs.existsSync(databasePath) || !sourcePath) {
    return;
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  for (const suffix of ["", "-wal", "-shm"]) {
    const sourceFile = `${sourcePath}${suffix}`;
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, `${databasePath}${suffix}`);
    }
  }
}

async function startPlannerServer() {
  if (!process.env.PLANNER_DB_PATH) {
    const databasePath = path.join(app.getPath("userData"), "planner.sqlite");
    seedDatabaseFromRepo(databasePath);
    process.env.PLANNER_DB_PATH = databasePath;
  }

  const db = openDatabase();
  migrate(db);

  const staticDir = path.join(app.getAppPath(), "dist");
  const server = createServer(db, { staticDir });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  apiServer = server;
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function createWindow() {
  const appUrl = await startPlannerServer();

  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    title: "Local Planner",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await window.loadURL(appUrl);
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (apiServer) {
    apiServer.close();
  }
});
