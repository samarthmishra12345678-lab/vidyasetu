module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  res.statusCode = 200;
  return res.end(
    JSON.stringify({
      ok: true,
      service: "VidyaSetu Backend API",
      version: "1.0.0",
      node: process.version,
      timestamp: new Date().toISOString(),
      endpoints: [
        "GET /api/health",
        "POST /api/check",
        "POST /api/cite",
        "POST /api/plan",
        "GET /api/board",
        "POST /api/board"
      ]
    })
  );
};
