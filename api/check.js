function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

function shingles(tokens, k) {
  const set = new Set();
  for (let i = 0; i + k <= tokens.length; i++) {
    set.add(tokens.slice(i, i + k).join(" "));
  }
  return set;
}

function setContainment(setA, setB) {
  if (!setA.size) return 0;
  let inter = 0;
  for (const v of setA) if (setB.has(v)) inter++;
  return inter / setA.size;
}

function multisetOverlap(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const seen = new Map();
  for (const t of tokensA) seen.set(t, (seen.get(t) || 0) + 1);
  let matched = 0;
  for (const t of tokensB) {
    const c = seen.get(t) || 0;
    if (c > 0) {
      matched++;
      seen.set(t, c - 1);
    }
  }
  return matched / Math.min(tokensA.length, tokensB.length);
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 25);
}

function extractSharedPhrases(draftTokens, srcSh, sourceTitle, sink) {
  if (!srcSh.size || draftTokens.length < 5) return;
  const shared = new Set();
  for (let i = 0; i + 5 <= draftTokens.length; i++) {
    const g = draftTokens.slice(i, i + 5).join(" ");
    if (srcSh.has(g)) shared.add(g);
  }
  if (!shared.size) return;
  const marked = new Array(draftTokens.length).fill(false);
  for (let i = 0; i + 5 <= draftTokens.length; i++) {
    if (shared.has(draftTokens.slice(i, i + 5).join(" "))) {
      for (let j = i; j < i + 5; j++) marked[j] = true;
    }
  }
  let run = [];
  const flush = () => {
    if (run.length >= 6) {
      sink.push({ phrase: run.join(" "), sourceTitle, words: run.length });
    }
    run = [];
  };
  for (let i = 0; i < draftTokens.length; i++) {
    if (marked[i]) run.push(draftTokens[i]);
    else flush();
  }
  flush();
}

function clip(text, maxLen) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + "...";
}

function parseSources(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  const parts = text.split(/^SOURCE:\s*(.+)$/m);
  const out = [];
  if (parts.length === 1) {
    out.push({ title: "Reference Text", text });
    return out;
  }
  if (parts[0] && parts[0].trim()) {
    out.push({ title: "Reference Text", text: parts[0].trim() });
  }
  for (let i = 1; i < parts.length; i += 2) {
    const title = String(parts[i] || "").trim().slice(0, 60) || "Reference Text";
    const body = String(parts[i + 1] || "").trim();
    if (body) out.push({ title, text: body });
  }
  return out;
}

function bandFor(percent) {
  if (percent < 15) {
    return {
      key: "low",
      en: "Low overlap. Your draft reads as original against the pasted reference sources."
    };
  }
  if (percent < 35) {
    return {
      key: "moderate",
      en: "Moderate overlap. Add in-text citations and rewrite the flagged sections."
    };
  }
  return {
    key: "high",
    en: "Heavy overlap. Rewrite the flagged sections in your own words and cite the sources before submitting."
  };
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
  const draft = String(body.draft || "").trim();
  const sources = parseSources(body.sources);

  if (draft.length < 40) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Draft must be at least 40 characters long." }));
  }
  if (!sources.length) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Provide at least one reference source. Separate multiple sources with lines starting with SOURCE: followed by the title." }));
  }
  if (sources.length > 6) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Up to 6 reference sources are supported per check." }));
  }

  const draftTokens = tokenize(draft).slice(0, 4000);
  const draftTokenSet = new Set(draftTokens);
  const draftSh = shingles(draftTokens, 5);
  const draftSentences = splitSentences(draft);

  const sourceResults = [];
  const flags = [];
  const matchedAll = [];

  for (const src of sources) {
    const srcTokens = tokenize(src.text).slice(0, 4000);
    const srcTokenSet = new Set(srcTokens);
    const srcSh = shingles(srcTokens, 5);

    const wordRatio = setContainment(draftTokenSet, srcTokenSet);
    const shingleRatio = setContainment(draftSh, srcSh);
    const blend = Math.min(1, 0.5 * wordRatio + 0.5 * shingleRatio);
    const percent = Math.round(blend * 100);

    sourceResults.push({ title: src.title, percent });
    extractSharedPhrases(draftTokens, srcSh, src.title, matchedAll);

    const srcSentences = splitSentences(src.text);
    for (const ds of draftSentences) {
      const dsTokens = tokenize(ds);
      if (dsTokens.length < 6) continue;
      for (const ss of srcSentences) {
        const ssTokens = tokenize(ss);
        if (ssTokens.length < 6) continue;
        const ratio = multisetOverlap(dsTokens, ssTokens);
        const identical = normalize(ds) === normalize(ss);
        if (identical || ratio >= 0.4) {
          flags.push({
            sourceTitle: src.title,
            draftExcerpt: clip(ds, 180),
            sourceExcerpt: clip(ss, 180),
            overlap: Math.round((identical ? 1 : ratio) * 100),
            severity: identical || ratio >= 0.8 ? "verbatim" : ratio >= 0.6 ? "high" : "review"
          });
          break;
        }
      }
    }
  }

  flags.sort((a, b) => b.overlap - a.overlap);
  const cappedFlags = flags.slice(0, 12);

  const seenPhrases = new Map();
  for (const m of matchedAll) {
    const prev = seenPhrases.get(m.phrase);
    if (!prev || m.words > prev.words) seenPhrases.set(m.phrase, m);
  }
  const matchedPhrases = [...seenPhrases.values()]
    .sort((a, b) => b.words - a.words)
    .slice(0, 12);

  const percents = sourceResults.map(s => s.percent);
  const maxP = Math.max(...percents);
  const avgP = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
  const overallPercent = Math.round(0.7 * maxP + 0.3 * avgP);
  const band = bandFor(overallPercent);

  const tips = [];
  if (band.key === "low") {
    tips.push("Overlap is low. Keep your reference list aligned with the sources you actually read.");
  }
  if (band.key !== "low" && cappedFlags.length) {
    tips.push(`Review ${cappedFlags.length} flagged section(s): add an in-text citation or rewrite the sentence in your own words.`);
  }
  if (band.key === "high") {
    tips.push("Rewrite every verbatim match first, then re-run this check to confirm the overlap drops below 15 percent.");
  }
  const verbatimCount = flags.filter(f => f.severity === "verbatim").length;
  if (verbatimCount) {
    tips.push(`${verbatimCount} sentence(s) match a source word for word. Paraphrase and cite, or use a short quote with quotation marks.`);
  }
  tips.push("This tool only compares your draft with the text you paste here. It cannot search the wider web, so also verify quotes against your original sources.");

  res.statusCode = 200;
  return res.end(
    JSON.stringify({
      ok: true,
      priority: { en: band.en },
      overall: { percent: overallPercent, band: band.key },
      sources: sourceResults,
      flags: cappedFlags,
      matchedPhrases,
      stats: {
        draftWords: draftTokens.length,
        sentencesChecked: draftSentences.length,
        sourcesCompared: sources.length
      },
      tips
    })
  );
};
