function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DIFFICULTY = {
  standard: { mult: 1.0, label: "Standard" },
  research: { mult: 1.3, label: "Research heavy" },
  creative: { mult: 1.15, label: "Creative build" }
};

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
  const task = String(body.task || "").trim().slice(0, 80);
  const wordCount = Number(body.wordCount);
  const hoursPerDay = Number(body.hoursPerDay);
  const difficulty = String(body.difficulty || "standard").toLowerCase();
  const dueRaw = String(body.dueDate || "").trim();

  if (!task) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Task name is required." }));
  }
  if (!Number.isFinite(wordCount) || wordCount < 100 || wordCount > 20000) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "wordCount must be between 100 and 20000." }));
  }
  if (!Number.isFinite(hoursPerDay) || hoursPerDay < 1 || hoursPerDay > 8) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "hoursPerDay must be between 1 and 8." }));
  }
  if (!DIFFICULTY[difficulty]) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "difficulty must be standard, research, or creative." }));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "dueDate must be in YYYY-MM-DD format." }));
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueRaw + "T23:59:59");
  if (Number.isNaN(due.getTime())) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "dueDate is not a valid date." }));
  }
  if (due.getTime() < todayStart.getTime()) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "dueDate must be today or later." }));
  }

  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (daysLeft > 60) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Plan window must be 60 days or less." }));
  }

  const hoursPer1000 = difficulty === "research" ? 9.6 : difficulty === "creative" ? 8.4 : 7.5;
  const total = Math.max(1, round1((wordCount / 1000) * hoursPer1000 * DIFFICULTY[difficulty].mult));
  const days = Math.max(1, Math.min(daysLeft, 45));

  const schedule = [];
  let remaining = total;
  for (let i = 0; i < days && remaining > 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const isLast = i === days - 1;
    const dayCap = isLast ? Math.min(hoursPerDay, Math.max(1, round1(total * 0.15))) : hoursPerDay;
    const alloc = round1(Math.min(dayCap, remaining));
    if (alloc <= 0) break;
    let focus;
    if (i === 0) focus = "Research, source notes, and outline";
    else if (isLast) focus = "Proofread, format citations, and submit";
    else focus = `Draft and revise part ${i} of ${Math.max(1, days - 2)}`;
    schedule.push({ date: dateStr(d), focus, hours: alloc });
    remaining = round1(remaining - alloc);
  }

  const capacity = round1(days * hoursPerDay);
  let pace;
  if (remaining > 0) {
    pace = {
      status: "behind",
      en: `The plan needs ${total} hours but ${days} day(s) at ${hoursPerDay} h/day only cover ${capacity} hours. Start today or raise daily hours.`
    };
  } else if (capacity > total * 1.6) {
    pace = {
      status: "comfortable",
      en: `Comfortable pace: ${total} hours of work across ${days} day(s) leaves room for review.`
    };
  } else {
    pace = {
      status: "on_track",
      en: `On track: ${total} hours of work across ${days} day(s) fits inside your ${hoursPerDay} h/day budget.`
    };
  }

  res.statusCode = 200;
  return res.end(
    JSON.stringify({
      ok: true,
      task,
      estimate: {
        hours: total,
        days,
        hoursPerDay,
        wordCount,
        difficulty: DIFFICULTY[difficulty].label
      },
      pace,
      schedule,
      checkpoints: [
        "Outline approved before drafting begins",
        "Half of the draft completed by the midpoint day",
        "Citations formatted and checked on the final day"
      ]
    })
  );
};
