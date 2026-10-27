function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function clean(str, maxLen) {
  return String(str || "").replace(/[<>]/g, "").trim().slice(0, maxLen);
}

const STYLES = ["apa", "mla", "ieee"];
const TYPES = ["website", "article", "book", "video"];

const REQUIRED = {
  website: ["author", "year", "title", "site", "url"],
  article: ["author", "year", "title", "journal", "volume", "pages"],
  book: ["author", "year", "title", "publisher", "city"],
  video: ["author", "year", "title", "site", "url"]
};

function formatApa(type, f) {
  if (type === "website") {
    return `${f.author} (${f.year}). ${f.title}. ${f.site}. ${f.url}`;
  }
  if (type === "article") {
    const tail = f.doi ? `${f.doi}` : f.url ? `${f.url}` : "";
    return `${f.author} (${f.year}). ${f.title}. ${f.journal}, ${f.volume}(${f.issue || "1"}), ${f.pages}.${tail ? " " + tail : ""}`;
  }
  if (type === "book") {
    return `${f.author} (${f.year}). ${f.title}. ${f.publisher}.`;
  }
  return `${f.author} (${f.year}). ${f.title} [Video]. ${f.site}. ${f.url}`;
}

function formatMla(type, f) {
  if (type === "website") {
    return `${f.author}. "${f.title}." ${f.site}, ${f.year}, ${f.url}.`;
  }
  if (type === "article") {
    return `${f.author}. "${f.title}." ${f.journal}, vol. ${f.volume}, no. ${f.issue || "1"}, ${f.year}, pp. ${f.pages}.`;
  }
  if (type === "book") {
    return `${f.author}. ${f.title}. ${f.publisher}, ${f.year}.`;
  }
  return `${f.author}. "${f.title}." ${f.site}, ${f.year}, ${f.url}.`;
}

function formatIeee(type, f) {
  if (type === "website") {
    return `[1] ${f.author}, "${f.title}," ${f.site}, ${f.year}. [Online]. Available: ${f.url}`;
  }
  if (type === "article") {
    const tail = f.doi ? `, doi: ${f.doi.replace(/^https?:\/\/doi\.org\//, "")}` : "";
    return `[1] ${f.author}, "${f.title}," ${f.journal}, vol. ${f.volume}, no. ${f.issue || "1"}, pp. ${f.pages}, ${f.year}${tail}.`;
  }
  if (type === "book") {
    return `[1] ${f.author}, ${f.title}. ${f.city}: ${f.publisher}, ${f.year}.`;
  }
  return `[1] ${f.author}, "${f.title}," ${f.site}, ${f.year}. [Online]. Available: ${f.url}`;
}

function hintsFor(style, type) {
  if (style === "apa") {
    return [
      "In-text citation: (Author, Year)",
      "Reference list entries use hanging indentation and a DOI or URL when available."
    ];
  }
  if (style === "mla") {
    return [
      "In-text citation: (Author Last Name)",
      "Works Cited entries alphabetize by the first meaningful word of the title or author."
    ];
  }
  return [
    "In-text citation: [1] numbered by order of first appearance",
    "IEEE entries keep quotation marks around article and web page titles."
  ];
}

module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
  }

  const body = parseBody(req);
  const style = clean(body.style, 10).toLowerCase();
  const type = clean(body.type, 12).toLowerCase();

  if (!STYLES.includes(style)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Style must be one of: apa, mla, ieee." }));
  }
  if (!TYPES.includes(type)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Type must be one of: website, article, book, video." }));
  }

  const rawFields = body.fields && typeof body.fields === "object" ? body.fields : {};
  const f = {};
  for (const key of REQUIRED[type]) f[key] = clean(rawFields[key], 200);
  for (const key of ["issue", "doi"]) f[key] = clean(rawFields[key], 200);

  const missing = REQUIRED[type].filter(k => !f[k]);
  if (missing.length) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Missing required fields.", missing }));
  }

  let citation;
  if (style === "apa") citation = formatApa(type, f);
  else if (style === "mla") citation = formatMla(type, f);
  else citation = formatIeee(type, f);

  res.statusCode = 200;
  return res.end(
    JSON.stringify({
      ok: true,
      style: style.toUpperCase(),
      type,
      citation,
      hints: hintsFor(style, type)
    })
  );
};
