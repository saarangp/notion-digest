require("dotenv").config();

const http = require("node:http");
const { openDatabase } = require("./db");
const { handleApi } = require("./routes");
const { migrate } = require("./schema");

function createServer(db) {
  return http.createServer((req, res) => {
    if (!req.url.startsWith("/api/")) {
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
