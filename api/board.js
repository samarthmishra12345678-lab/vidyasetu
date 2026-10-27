function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function cleanText(str, maxLen) {
  return String(str || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLen);
}

// Initialized empty; study exchange entries are created via POST /api/board
const POSTS = [];

module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === "GET") {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, count: POSTS.length, posts: POSTS }));
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    if (body.action === "upvote" && body.id) {
      const target = POSTS.find(p => p.id === body.id);
      if (!target) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error: "Entry not found." }));
      }
      target.upvotes += 1;
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, post: target, posts: POSTS }));
    }

    const author = cleanText(body.author || "Student Member", 50) || "Student Member";
    const tag = cleanText(body.tag || "Feedback Request", 30);
    const title = cleanText(body.title, 110);
    const details = cleanText(body.body, 280);

    if (!title || !details) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: "Both title and details are required." }));
    }

    const newPost = {
      id: "entry_" + Date.now(),
      tag,
      author,
      title,
      body: details,
      upvotes: 0,
      createdAt: new Date().toISOString()
    };
    POSTS.unshift(newPost);
    if (POSTS.length > 50) POSTS.pop();

    res.statusCode = 201;
    return res.end(JSON.stringify({ ok: true, post: newPost, posts: POSTS }));
  }

  res.statusCode = 405;
  return res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
};
