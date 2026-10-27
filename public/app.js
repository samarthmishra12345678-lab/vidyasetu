let currentCheck = null;
let currentCitation = "";
let planTasks = JSON.parse(localStorage.getItem("vidyasetu_plan_tasks") || "null") || [];
let refList = JSON.parse(localStorage.getItem("vidyasetu_refs") || "null") || [];
let activeGuideIdx = 0;

async function callBackend(endpoint, options = {}) {
  const t0 = performance.now();
  const res = await fetch(endpoint, options);
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  document.getElementById("api-telemetry").textContent =
    `${options.method || "GET"} ${endpoint} (${res.status} in ${ms}ms)`;
  document.getElementById("api-json-preview").textContent =
    JSON.stringify(data, null, 2);

  return data;
}

function toggleApiDrawer() {
  document.getElementById("api-drawer").classList.toggle("open");
}

function switchTab(id, btn) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("panel-" + id).classList.add("active");
  btn.classList.add("active");
}

const CHECK_SAMPLES = {
  overlap: {
    draft: "Spaced repetition is a learning technique where review sessions are spaced over increasing intervals of time, which helps move facts into long-term memory. Many students underestimate sleep, yet deep sleep consolidates the procedural memories formed during practice. A practical weekly routine blocks fifty minutes of focused study followed by ten minutes away from screens, and reviewing difficult cards the next morning sharply reduces forgetting. Building these habits early makes exam week far less stressful.",
    sources: "SOURCE: Memory Science Overview\nSpaced repetition is a learning technique where review sessions are spaced over increasing intervals of time. Researchers show that distributing practice across days produces stronger retention than massing the same minutes into one night. Deep sleep also consolidates the procedural memories formed during practice, so late night cramming trades one gain for another loss.\nSOURCE: Study Skills Handbook\nA practical weekly routine blocks fifty minutes of focused study followed by ten minutes away from screens. Students who review difficult material the next morning sharply reduce forgetting before the weekend. Hydration, daylight walks, and consistent wake times support attention as much as any app."
  },
  clean: {
    draft: "I keep a small notebook next to my textbooks and write one summary line after every chapter. The next morning I read only those lines instead of the full chapter, which makes revision feel short. When a topic still feels unclear, I explain it out loud to my younger brother, because teaching forces me to notice the gaps in my own understanding.",
    sources: "SOURCE: Memory Science Overview\nSpaced repetition is a learning technique where review sessions are spaced over increasing intervals of time. Researchers show that distributing practice across days produces stronger retention than massing the same minutes into one night."
  }
};

function loadCheckSample(key) {
  const sample = CHECK_SAMPLES[key] || CHECK_SAMPLES.overlap;
  document.getElementById("check-draft").value = sample.draft;
  document.getElementById("check-sources").value = sample.sources;
  runCheckApi();
}

async function runCheckApi() {
  const draft = document.getElementById("check-draft").value.trim();
  const sources = document.getElementById("check-sources").value.trim();
  if (!draft || !sources) return;
  try {
    currentCheck = await callBackend("/api/check", {
      method: "POST",
      body: JSON.stringify({ draft, sources })
    });
    renderCheck();
  } catch (err) {
    document.getElementById("check-output").innerHTML =
      `<div class="result-card danger"><p>Request failed: ${err.message}</p></div>`;
  }
}

function renderCheck() {
  if (!currentCheck || !currentCheck.overall) {
    document.getElementById("check-output").innerHTML =
      `<div class="result-card"><p>No report yet. Paste a draft and at least one source, then run the check.</p></div>`;
    return;
  }

  const o = currentCheck.overall;
  const bandClass = o.band === "high" ? "danger" : o.band === "moderate" ? "warn" : "";
  const barStyle = o.band === "high"
    ? "background:#fef2f2; color:#b91c1c; border-color:#fecaca;"
    : o.band === "moderate"
      ? "background:#fffbeb; color:#b45309; border-color:#fde68a;"
      : "";

  document.getElementById("check-priority").innerHTML = `
    <div class="priority-bar" style="${barStyle}">
      <span>${currentCheck.priority.en}</span>
      <span>${o.percent}% overlap</span>
    </div>
  `;

  const sourceCards = currentCheck.sources
    .map(s => {
      const cls = s.percent >= 35 ? "danger" : s.percent >= 15 ? "warn" : "";
      const fill = s.percent >= 35 ? "#b91c1c" : s.percent >= 15 ? "#b45309" : "#0f766e";
      return `
        <div class="result-card ${cls}">
          <div class="card-head">
            <h4>${s.title}</h4>
            <span class="tag-label">${s.percent}% MATCH</span>
          </div>
          <div class="bar"><div class="bar-fill" style="width:${s.percent}%; background:${fill};"></div></div>
          <p>${s.percent}% of this source's fingerprints appear in your draft. ${s.percent >= 35 ? "Cite or rewrite the flagged sections." : s.percent >= 15 ? "Add citations where sentences overlap." : "Low reliance on this source."}</p>
        </div>
      `;
    })
    .join("");

  const phraseChips = (currentCheck.matchedPhrases && currentCheck.matchedPhrases.length)
    ? `
      <div class="result-card warn">
        <div class="card-head">
          <h4>Matched Phrases Found in Both</h4>
          <span class="tag-label">EVIDENCE</span>
        </div>
        <div class="chip-row">
          ${currentCheck.matchedPhrases.map(p => `<span class="chip" title="Matches: ${p.sourceTitle}">${p.phrase}</span>`).join("")}
        </div>
        <p>These exact word runs appear in your draft and a reference source. Rewrite or cite each one.</p>
      </div>
    `
    : "";

  const flagCards = currentCheck.flags.length
    ? currentCheck.flags.map(f => {
        const cls = f.severity === "verbatim" ? "danger" : f.severity === "high" ? "warn" : "";
        const label = f.severity === "verbatim" ? "VERBATIM MATCH" : f.severity === "high" ? "HIGH OVERLAP" : "REVIEW";
        return `
          <div class="result-card ${cls}">
            <div class="card-head">
              <h4>Flagged against: ${f.sourceTitle}</h4>
              <span class="tag-label">${label} (${f.overlap}%)</span>
            </div>
            <p><strong>Your draft:</strong> "${f.draftExcerpt}"</p>
            <p><strong>Source text:</strong> "${f.sourceExcerpt}"</p>
          </div>
        `;
      }).join("")
    : `<div class="result-card"><p>No sentence-level matches found against the provided sources.</p></div>`;

  const tipCards = currentCheck.tips.map((t, i) => `
    <div class="result-card info">
      <div class="card-head"><h4>Tip ${i + 1}</h4></div>
      <p>${t}</p>
    </div>
  `).join("");

  document.getElementById("check-output").innerHTML = `
    <div class="result-card ${bandClass}">
      <div class="card-head">
        <h4>Overall Similarity: ${o.percent}%</h4>
        <span class="tag-label">${currentCheck.stats.sentencesChecked} SENTENCES / ${currentCheck.stats.sourcesCompared} SOURCES</span>
      </div>
      <p>${currentCheck.priority.en}</p>
    </div>
    ${sourceCards}
    ${phraseChips}
    ${flagCards}
    ${tipCards}
  `;
}

function speakResults() {
  if (!("speechSynthesis" in window)) {
    alert("Audio synthesis is not supported in this browser.");
    return;
  }
  if (!currentCheck || !currentCheck.overall) return;
  window.speechSynthesis.cancel();
  const flagText = currentCheck.flags
    .map(f => `Flagged section against ${f.sourceTitle}, ${f.overlap} percent overlap.`)
    .join(" ");
  const fullText = `Overall similarity ${currentCheck.overall.percent} percent. ${currentCheck.priority.en} ${flagText}`;
  const utter = new SpeechSynthesisUtterance(fullText);
  utter.lang = "en-IN";
  utter.rate = 0.96;
  window.speechSynthesis.speak(utter);
}

function updateDraftStats() {
  const text = document.getElementById("check-draft").value.trim();
  const words = text ? text.split(/\s+/).filter(w => /[a-zA-Z0-9]/.test(w)).length : 0;
  const sentences = text ? (text.match(/[.!?]+(\s|$)/g) || []).length || (words ? 1 : 0) : 0;
  const readTime = words ? Math.max(1, Math.round(words / 200)) : 0;
  const avg = sentences ? Math.round(words / sentences) : 0;
  document.getElementById("stat-words").textContent = words;
  document.getElementById("stat-sentences").textContent = sentences;
  document.getElementById("stat-readtime").textContent = readTime;
  document.getElementById("stat-avg").textContent = avg;
}

function downloadReport() {
  if (!currentCheck || !currentCheck.overall) {
    alert("Run the originality check first, then download the report.");
    return;
  }
  const lines = [
    "VidyaSetu Originality Report",
    "Generated: " + new Date().toLocaleString(),
    "",
    "Overall similarity: " + currentCheck.overall.percent + "% (" + currentCheck.overall.band + ")",
    currentCheck.priority.en,
    "",
    "Per-source match:",
    ...currentCheck.sources.map(s => "- " + s.title + ": " + s.percent + "%"),
    "",
    "Matched phrases:",
    ...(currentCheck.matchedPhrases || []).map(p => '- "' + p.phrase + '" (matches ' + p.sourceTitle + ")"),
    "",
    "Flagged sentences:",
    ...currentCheck.flags.map(f => "- [" + f.overlap + "% " + f.severity + "] vs " + f.sourceTitle + "\n  Draft: " + f.draftExcerpt + "\n  Source: " + f.sourceExcerpt),
    "",
    "Tips:",
    ...currentCheck.tips.map(t => "- " + t),
    "",
    "Note: this tool only compares your draft against the sources you pasted."
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vidyasetu-originality-report.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function runCiteApi() {
  const style = document.getElementById("cite-style").value;
  const type = document.getElementById("cite-type").value;
  const fields = {
    author: document.getElementById("cite-author").value,
    year: document.getElementById("cite-year").value,
    title: document.getElementById("cite-title").value,
    site: document.getElementById("cite-site").value,
    journal: document.getElementById("cite-journal").value,
    volume: document.getElementById("cite-volume").value,
    issue: document.getElementById("cite-issue").value,
    pages: document.getElementById("cite-pages").value,
    publisher: document.getElementById("cite-publisher").value,
    city: document.getElementById("cite-city").value,
    doi: document.getElementById("cite-doi").value,
    url: document.getElementById("cite-url").value
  };
  try {
    const data = await callBackend("/api/cite", {
      method: "POST",
      body: JSON.stringify({ style, type, fields })
    });
    renderCite(data);
  } catch (err) {
    document.getElementById("cite-output").innerHTML =
      `<div class="result-card danger"><p>Request failed: ${err.message}</p></div>`;
  }
}

function renderCite(data) {
  const box = document.getElementById("cite-output");
  if (!data.ok) {
    currentCitation = "";
    const missing = data.missing ? data.missing.join(", ") : "";
    box.innerHTML = `
      <div class="result-card warn">
        <div class="card-head"><h4>Citation incomplete</h4><span class="tag-label">${data.error || "CHECK FIELDS"}</span></div>
        <p>${missing ? "Missing required fields: " + missing + "." : "Fill the required fields and generate again."}</p>
      </div>
    `;
    return;
  }
  currentCitation = data.citation;
  const hints = data.hints.map((h, i) => `
    <div class="result-card info">
      <div class="card-head"><h4>In-text Hint ${i + 1}</h4></div>
      <p>${h}</p>
    </div>
  `).join("");
  box.innerHTML = `
    <div class="priority-bar">
      <span>${data.style} format for a ${data.type}</span>
      <span>Ready to paste</span>
    </div>
    <div class="citation-box" id="citation-text">${data.citation}</div>
    <button class="btn btn-outline" onclick="copyCitation()">Copy Citation</button>
    ${hints}
  `;
}

function copyCitation() {
  if (!currentCitation) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentCitation);
  }
}

function addToRefs() {
  if (!currentCitation) {
    alert("Generate a citation first, then add it to your reference list.");
    return;
  }
  if (refList.some(r => r.citation === currentCitation)) {
    alert("This citation is already in your reference list.");
    return;
  }
  const styleSel = document.getElementById("cite-style");
  const typeSel = document.getElementById("cite-type");
  refList.push({
    citation: currentCitation,
    style: styleSel.options[styleSel.selectedIndex].text,
    type: typeSel.options[typeSel.selectedIndex].text
  });
  saveRefs();
}

function saveRefs() {
  localStorage.setItem("vidyasetu_refs", JSON.stringify(refList));
  renderRefs();
}

function renderRefs() {
  const done = refList.length;
  document.getElementById("ref-counter").textContent = `${done} saved`;
  const box = document.getElementById("ref-list");
  if (!refList.length) {
    box.innerHTML = `<div class="result-card"><p>No references saved yet. Generate a citation above, then click Add to Reference List. Everything stays in your own browser.</p></div>`;
    return;
  }
  box.innerHTML = refList
    .map((r, idx) => `
      <div class="ref-item">
        <div>
          <span class="tag-label">${r.style}</span>
          <div class="ref-text">${r.citation}</div>
        </div>
        <button class="btn btn-outline" style="padding:3px 8px; font-size:12px;" onclick="removeRef(${idx})">Remove</button>
      </div>
    `)
    .join("");
}

function removeRef(i) {
  refList.splice(i, 1);
  saveRefs();
}

function copyAllRefs() {
  if (!refList.length) {
    alert("Your reference list is empty. Add citations first.");
    return;
  }
  const text = refList.map((r, i) => `${i + 1}. ${r.citation}`).join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  }
}

function previewPlanHours() {
  document.getElementById("lbl-plan-hours").textContent =
    `${document.getElementById("plan-hours").value} hrs`;
}

async function runPlanApi() {
  previewPlanHours();
  const payload = {
    task: document.getElementById("plan-task").value,
    wordCount: Number(document.getElementById("plan-words").value),
    dueDate: document.getElementById("plan-due").value,
    hoursPerDay: Number(document.getElementById("plan-hours").value),
    difficulty: document.getElementById("plan-difficulty").value
  };
  try {
    const data = await callBackend("/api/plan", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderPlan(data);
  } catch (err) {
    document.getElementById("plan-pace").textContent = "Request failed: " + err.message;
  }
}

function renderPlan(data) {
  const est = document.getElementById("plan-estimate");
  const paceEl = document.getElementById("plan-pace");
  if (!data.ok) {
    est.textContent = "-- hrs";
    paceEl.textContent = data.error || "Invalid plan request.";
    paceEl.style.color = "#b91c1c";
    document.getElementById("plan-schedule").innerHTML = "";
    return;
  }

  est.textContent = `${data.estimate.hours} hrs`;
  paceEl.textContent = data.pace.en;
  paceEl.style.color = data.pace.status === "behind" ? "#b91c1c" : data.pace.status === "comfortable" ? "#0f766e" : "#18181b";

  const scheduleCards = data.schedule.map((s, i) => `
    <div class="result-card">
      <div class="card-head">
        <h4>Day ${i + 1}: ${s.date}</h4>
        <span class="tag-label">${s.hours} HRS</span>
      </div>
      <p>${s.focus}</p>
    </div>
  `).join("");

  const checkpointCards = data.checkpoints.map((c, i) => `
    <div class="result-card info">
      <div class="card-head"><h4>Checkpoint ${i + 1}</h4></div>
      <p>${c}</p>
    </div>
  `).join("");

  document.getElementById("plan-schedule").innerHTML = scheduleCards + checkpointCards;

  planTasks = data.schedule.map(s => ({ label: `${s.focus} (${s.hours} hrs)`, date: s.date, done: false }));
  savePlanChecklist();
}

function savePlanChecklist() {
  localStorage.setItem("vidyasetu_plan_tasks", JSON.stringify(planTasks));
  renderPlanList();
}

function renderPlanList() {
  const done = planTasks.filter(t => t.done).length;
  document.getElementById("plan-counter").textContent = `${done}/${planTasks.length}`;
  const box = document.getElementById("plan-list");
  if (!planTasks.length) {
    box.innerHTML = `<div class="result-card"><p>No checklist items yet. Build a plan on the left to create your day-by-day checklist.</p></div>`;
    return;
  }
  box.innerHTML = planTasks
    .map((t, idx) => `
      <div class="med-item ${t.done ? "done" : ""}" onclick="togglePlanItem(${idx})">
        <div>
          <span class="med-check"></span><strong>${t.date}</strong>
          <div style="font-size:12px; color:#52525b; padding-left:22px;">${t.label}</div>
        </div>
        <button class="btn btn-outline" style="padding:3px 8px; font-size:12px;" onclick="event.stopPropagation(); removePlanItem(${idx})">Remove</button>
      </div>
    `)
    .join("");
}

function togglePlanItem(i) {
  planTasks[i].done = !planTasks[i].done;
  savePlanChecklist();
}

function removePlanItem(i) {
  planTasks.splice(i, 1);
  savePlanChecklist();
}

const GUIDE = [
  {
    label: "When To Cite",
    en: [
      "Quote, paraphrase, or closely reword any source you read, even a website or a video.",
      "Statistics, survey numbers, and experiment results always need a citation.",
      "Your own screenshots of someone else's chart still require credit to the original chart.",
      "When unsure, add the citation. Extra credit entries never cause a penalty; missing ones do."
    ]
  },
  {
    label: "Common Knowledge",
    en: [
      "Facts widely known and found in many general sources usually need no citation (for example, water boils at 100 degrees Celsius at sea level).",
      "Dates of major historical events are commonly treated as common knowledge.",
      "A fact specific to one book, one study, or one expert's argument is not common knowledge.",
      "If only specialists or one website states it, cite that source."
    ]
  },
  {
    label: "Paraphrase Rules",
    en: [
      "Read the passage, close it, then write the idea in your own sentence structure.",
      "Keep the original meaning intact; do not flip a positive finding into a negative one.",
      "Change both wording and sentence order, not only synonyms.",
      "Still cite the source after paraphrasing: new words, same idea, same credit."
    ]
  },
  {
    label: "AI Tool Disclosure",
    en: [
      "Most student contests and classes require you to declare AI assistants used while drafting or coding.",
      "Never paste private personal data or unpublished exam content into AI tools.",
      "You are responsible for every sentence you submit, whether typed by you or suggested by a tool.",
      "Check your competition's rules page for the exact disclosure field before submitting."
    ]
  },
  {
    label: "Pre-Submit Checklist",
    en: [
      "Run your draft through the Originality Check with your real reference sources.",
      "Confirm every flagged section is either rewritten or cited.",
      "Match every in-text citation to an entry in your reference list, and the reverse.",
      "Read the work aloud once to catch repeated phrasing and broken transitions."
    ]
  }
];

function renderGuide(i) {
  activeGuideIdx = i;
  document.getElementById("guide-buttons").innerHTML = GUIDE.map(
    (item, idx) => `<button class="aid-btn ${idx === i ? "active" : ""}" onclick="renderGuide(${idx})">${item.label}</button>`
  ).join("");

  document.getElementById("guide-steps").innerHTML = GUIDE[i].en
    .map((line, idx) => `
      <div class="result-card">
        <div class="card-head"><h4>Rule ${idx + 1}</h4></div>
        <p>${line}</p>
      </div>
    `)
    .join("");
}

async function loadBoardFeed() {
  const data = await callBackend("/api/board", { method: "GET" });
  renderBoardPosts(data.posts || []);
}

function renderBoardPosts(posts) {
  const box = document.getElementById("board-feed");
  if (!posts.length) {
    box.innerHTML = `<div class="result-card"><p>No entries posted in this session yet. Use the form on the left to post the first study exchange entry.</p></div>`;
    return;
  }
  box.innerHTML = posts
    .map(p => `
      <div class="post-card">
        <div class="post-meta">
          <strong>[${p.tag}] ${p.author}</strong>
          <span>${new Date(p.createdAt).toLocaleTimeString()}</span>
        </div>
        <h4 style="font-size:14px; margin-bottom:4px;">${p.title}</h4>
        <p style="font-size:13px; color:#27272a; margin-bottom:8px;">${p.body}</p>
        <button class="btn btn-outline" style="padding:4px 9px; font-size:12px;" onclick="helpfulPost('${p.id}')">
          Helpful (${p.upvotes})
        </button>
      </div>
    `)
    .join("");
}

async function submitBoardPost() {
  const author = document.getElementById("post-author").value.trim();
  const tag = document.getElementById("post-tag").value;
  const title = document.getElementById("post-title").value.trim();
  const body = document.getElementById("post-body").value.trim();
  if (!title || !body) {
    alert("Enter both a title and details before posting.");
    return;
  }
  const data = await callBackend("/api/board", {
    method: "POST",
    body: JSON.stringify({ author, tag, title, body })
  });
  if (data.ok) {
    document.getElementById("post-title").value = "";
    document.getElementById("post-body").value = "";
    renderBoardPosts(data.posts);
  }
}

async function helpfulPost(id) {
  const data = await callBackend("/api/board", {
    method: "POST",
    body: JSON.stringify({ action: "upvote", id })
  });
  if (data.ok) renderBoardPosts(data.posts);
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

(async function init() {
  await callBackend("/api/health", { method: "GET" });
  loadCheckSample("overlap");
  runCiteApi();
  document.getElementById("plan-due").value = defaultDueDate();
  previewPlanHours();
  runPlanApi();
  renderGuide(0);
  loadBoardFeed();
  updateDraftStats();
  renderRefs();
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runCheckApi();
  });
})();
