require("dotenv").config();

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { openDatabase } = require("./db");
const { handleApi } = require("./routes");
const { migrate } = require("./schema");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res, staticDir) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requestedPath = path.normalize(path.join(staticDir, pathname));
  const relativePath = path.relative(staticDir, requestedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
    ? requestedPath
    : path.join(staticDir, "index.html");

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(contents);
  });
}

function createServer(db, options = {}) {
  const staticDir = options.staticDir ? path.resolve(options.staticDir) : null;

  return http.createServer((req, res) => {
    if (!req.url.startsWith("/api/")) {
      if (staticDir) {
        serveStatic(req, res, staticDir);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
      return;
    }

    handleApi(req, res, db);
  });
}

function main() {
  const port = Number.parseInt(process.env.PORT || "4321", 10);
  const db = openDatabase();
  migrate(db);

  createServer(db).listen(port, "127.0.0.1", () => {
    console.log(`Planner API listening at http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createServer,
};

if (require.main === module) {
  main();
}
