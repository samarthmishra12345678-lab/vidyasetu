const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const healthHandler = require("./api/health");
const checkHandler = require("./api/check");
const citeHandler = require("./api/cite");
const planHandler = require("./api/plan");
const boardHandler = require("./api/board");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");

const API_ROUTES = {
  "/api/health": healthHandler,
  "/api/check": checkHandler,
  "/api/cite": citeHandler,
  "/api/plan": planHandler,
  "/api/board": boardHandler
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".ico": "image/svg+xml"
};

const CLEAN_PAGE_MAP = {
  "/": "/index.html",
  "/privacy": "/privacy.html",
  "/terms": "/terms.html",
  "/favicon.ico": "/favicon.svg"
};

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsed.pathname;

  const apiFn = API_ROUTES[pathname];
  if (apiFn) {
    let raw = "";
    req.on("data", chunk => {
      if (raw.length < 200000) raw += chunk.toString("utf-8");
    });
    req.on("end", () => {
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = raw;
      }
      try {
        apiFn(req, res);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: err.message || "Internal Server Error" }));
      }
    });
    return;
  }

  const mappedPath = CLEAN_PAGE_MAP[pathname] || pathname;
  const safePath = path.normalize(path.join(PUBLIC_DIR, mappedPath));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("404 Not Found");
    }
    fs.readFile(safePath, (readErr, content) => {
      if (readErr) {
        res.statusCode = 500;
        return res.end("Server Error");
      }
      const ext = path.extname(safePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
      res.end(content);
    });
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`VidyaSetu Server running on http://${HOST}:${PORT}`);
  });
}

module.exports = server;
