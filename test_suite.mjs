import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import server from "./server.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const TEXT_FILES = [
  "server.js",
  "package.json",
  "vercel.json",
  "README.md",
  "api/health.js",
  "api/check.js",
  "api/cite.js",
  "api/plan.js",
  "api/board.js",
  "public/favicon.svg",
  "public/index.html",
  "public/privacy.html",
  "public/terms.html",
  "public/styles.css",
  "public/app.js"
];

function runStaticStandardsAudit() {
  const emojiRegex = /\p{Extended_Pictographic}/u;
  const purpleRegex = /\b(purple|violet|indigo|fuchsia|magenta)\b|#(?:8b5cf6|7c3aed|9333ea|a855f7|6d28d9|6366f1|c084fc)/i;

  for (const rel of TEXT_FILES) {
    const full = path.join(ROOT, rel);
    assert.ok(fs.existsSync(full), `Required file missing: ${rel}`);
    const content = fs.readFileSync(full, "utf8");

    // 1. Zero em dashes anywhere
    assert.ok(!content.includes("\u2014"), `Em dash forbidden in ${rel}`);
    assert.ok(!content.includes("&mdash;"), `HTML em dash entity forbidden in ${rel}`);

    // 2. Zero emojis anywhere
    assert.ok(!emojiRegex.test(content), `Emoji character forbidden in ${rel}`);

    // 3. Zero purple colors or gradients
    assert.ok(!purpleRegex.test(content), `Purple palette forbidden in ${rel}`);
    if (rel.endsWith(".css") || rel.endsWith(".html")) {
      assert.ok(!/linear-gradient|radial-gradient/i.test(content), `Gradients forbidden in ${rel}`);
      assert.ok(!/999px|9999px|border-radius:\s*50px/i.test(content), `Pill border-radius forbidden in ${rel}`);
      assert.ok(!/@keyframes|scroll-behavior:\s*smooth/i.test(content), `Over-the-top animations forbidden in ${rel}`);
      assert.ok(!/<img\b/i.test(content), `Stock / AI-slop images forbidden in ${rel}`);
    }

    // 4. Zero "Made with AI" tag across ALL files with zero exceptions
    assert.ok(!/made with ai|built with ai/i.test(content), `Made-with-AI tag forbidden in ${rel}`);
  }

  // 5. Verify Favicon & Legal links on all HTML pages
  for (const page of ["public/index.html", "public/privacy.html", "public/terms.html"]) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    assert.match(html, /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/favicon\.svg"/, `Favicon missing in ${page}`);
    assert.match(html, /href="\/privacy\.html"/, `Privacy policy link missing in ${page}`);
    assert.match(html, /href="\/terms\.html"/, `Terms link missing in ${page}`);
  }

  // 6. Verify 100% DOM ID & Handler parity between index.html and app.js
  const indexHtml = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "public/app.js"), "utf8");
  const htmlIds = new Set([...indexHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const jsIds = new Set([...appJs.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]));
  for (const id of jsIds) {
    assert.ok(htmlIds.has(id), `DOM ID "${id}" referenced in app.js missing in index.html`);
  }

  console.log(`Static Standards Audit Passed across all ${TEXT_FILES.length} project files (0 violations).`);
}

async function req(base, route, opts = {}) {
  const res = await fetch(`${base}${route}`, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

const SAMPLE_DRAFT =
  "Spaced repetition is a learning technique where review sessions are spaced over increasing intervals of time, which helps move facts into long-term memory. Students also benefit from short walking breaks between study blocks.";
const SAMPLE_SOURCES =
  "SOURCE: Memory Science Overview\nSpaced repetition is a learning technique where review sessions are spaced over increasing intervals of time. Distributing practice across days produces stronger retention.";

async function runApiAndRouteTests(base, passNum) {
  for (const r of ["/", "/privacy.html", "/privacy", "/terms.html", "/terms", "/styles.css", "/app.js", "/favicon.svg", "/favicon.ico"]) {
    const res = await req(base, r);
    assert.equal(res.status, 200, `Route ${r} must return 200`);
  }

  const health = await req(base, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.json.service, "VidyaSetu Backend API");

  // Verify zero seeded fake board entries on initial boot
  if (passNum === 1) {
    const initialFeed = await req(base, "/api/board");
    assert.equal(initialFeed.status, 200);
    assert.equal(initialFeed.json.posts.length, 0, "Exchange board must start with zero fake seeded entries");
  }

  const chk = await req(base, "/api/check", {
    method: "POST",
    body: JSON.stringify({ draft: SAMPLE_DRAFT, sources: SAMPLE_SOURCES })
  });
  assert.equal(chk.status, 200);
  assert.equal(chk.json.ok, true);
  assert.ok(chk.json.overall.percent > 0, "Overlapping sample must report above zero similarity");
  assert.ok(["low", "moderate", "high"].includes(chk.json.overall.band));
  assert.ok(chk.json.flags.length > 0, "Overlapping sentence must be flagged");
  assert.ok(Array.isArray(chk.json.matchedPhrases) && chk.json.matchedPhrases.length > 0, "Shared phrase evidence must be returned");
  assert.ok(chk.json.matchedPhrases.every(p => p.words >= 6 && p.phrase && p.sourceTitle));
  assert.ok(chk.json.sources.length === 1);
  assert.ok(!JSON.stringify(chk.json).includes("\u2014"), "API output must contain zero em dashes");

  const emptyChk = await req(base, "/api/check", { method: "POST", body: JSON.stringify({ draft: "", sources: "" }) });
  assert.equal(emptyChk.status, 400);

  const citeOk = await req(base, "/api/cite", {
    method: "POST",
    body: JSON.stringify({
      style: "apa",
      type: "website",
      fields: { author: "Rao, Ananya", year: "2025", title: "How Teenagers Actually Study", site: "EduJournal", url: "https://example.org/teen-study" }
    })
  });
  assert.equal(citeOk.status, 200);
  assert.ok(citeOk.json.citation.includes("Rao, Ananya"));
  assert.ok(citeOk.json.citation.includes("2025"));
  assert.ok(!JSON.stringify(citeOk.json).includes("\u2014"));

  const citeBad = await req(base, "/api/cite", { method: "POST", body: JSON.stringify({ style: "apa", type: "website", fields: {} }) });
  assert.equal(citeBad.status, 400);

  const due = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const plan = await req(base, "/api/plan", {
    method: "POST",
    body: JSON.stringify({ task: "History essay", wordCount: 1200, dueDate: due, hoursPerDay: 2, difficulty: "standard" })
  });
  assert.equal(plan.status, 200);
  assert.equal(plan.json.ok, true);
  assert.ok(plan.json.estimate.hours > 0);
  assert.ok(plan.json.schedule.length >= 3, "10-day plan must produce at least 3 schedule entries");
  assert.ok(!JSON.stringify(plan.json).includes("\u2014"), "Plan API output must contain zero em dashes");

  const planBad = await req(base, "/api/plan", {
    method: "POST",
    body: JSON.stringify({ task: "Late work", wordCount: 1200, dueDate: "2020-01-01", hoursPerDay: 2, difficulty: "standard" })
  });
  assert.equal(planBad.status, 400);

  const postRes = await req(base, "/api/board", {
    method: "POST",
    body: JSON.stringify({
      author: "<script>bad()</script>Samarth",
      tag: "Citation Swap",
      title: `APA source swap for psychology report #${passNum}`,
      body: "Looking for one journal source on memory and sleep."
    })
  });
  assert.equal(postRes.status, 201);
  assert.equal(postRes.json.post.upvotes, 0, "New entry must start with 0 fake upvotes");
  assert.ok(!postRes.json.post.author.includes("<"));

  const voteRes = await req(base, "/api/board", {
    method: "POST",
    body: JSON.stringify({ action: "upvote", id: postRes.json.post.id })
  });
  assert.equal(voteRes.status, 200);
  assert.equal(voteRes.json.post.upvotes, 1);

  console.log(`Pass #${passNum}: All HTTP routes, legal pages, favicon & REST APIs verified.`);
}

runStaticStandardsAudit();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
try {
  for (let pass = 1; pass <= 3; pass++) {
    await runApiAndRouteTests(`http://127.0.0.1:${port}`, pass);
  }
  console.log("ALL STATIC AUDIT + 3 FULL END-TO-END API PASSES SUCCEEDED WITH ZERO ERRORS.");
} finally {
  server.close();
}
