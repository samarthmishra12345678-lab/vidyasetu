# VidyaSetu

Full-stack student writing companion built by **Samarth Mishra** using a static frontend (`HTML5`, `CSS3`, `ES6+ JavaScript`) paired with `Node.js` / `Vercel Serverless` REST APIs.

## Purpose

VidyaSetu checks a draft against reference sources the student pastes, formats citations in APA, MLA, and IEEE styles, converts a word count and deadline into a day-by-day assignment plan, and hosts a lightweight study exchange board for peer feedback requests.

## Core Modules

| Module | Frontend Component | Backend Route |
| :--- | :--- | :--- |
| **Originality Check** | Similarity report, matched-phrase evidence chips, per-source progress bars, draft statistics, audio read-aloud, one-click report download | `POST /api/check` |
| **Citation Builder** | APA 7 / MLA 9 / IEEE formatter with in-text hints, saved reference list with copy-all export | `POST /api/cite` |
| **Assignment Planner** | Effort estimate, paced schedule, local checklist | `POST /api/plan` |
| **Integrity Guide** | Citation, paraphrasing, and disclosure rules | Client reference |
| **Study Exchange Board** | Sanitized feedback requests + helpful confirmations | `GET /api/board`, `POST /api/board` |
| **Legal & Privacy Pages** | Dedicated `/privacy.html`, `/terms.html`, and SVG favicon | Static routes |

## Directory Structure

```text
vidyasetu/
├── api/
│   ├── health.js          # GET /api/health
│   ├── check.js           # POST /api/check (similarity engine)
│   ├── cite.js            # POST /api/cite (citation formatter)
│   ├── plan.js            # POST /api/plan (deadline scheduler)
│   └── board.js           # GET & POST /api/board
├── public/
│   ├── favicon.svg        # Vector SVG favicon
│   ├── index.html         # Main application page
│   ├── privacy.html       # Privacy policy & local storage clear control
│   ├── terms.html         # Terms, conditions & academic honesty disclaimer
│   ├── styles.css         # Flat architectural zinc & emerald stylesheet
│   └── app.js             # Frontend API client & audio readout
├── docs/
│   └── VidyaSetu_Project_Summary.pdf
├── server.js              # Local HTTP full-stack server
├── test_suite.mjs         # Automated API & static standards audit suite
├── vercel.json            # Vercel routing configuration
└── package.json           # Node scripts & metadata
```

## Run & Verify Locally

```bash
npm start
npm test
```

## How the Originality Engine Works

1. Draft and sources are lowercased, punctuation is stripped, and text is split into sentences.
2. Each source is compared with word-level containment and 5-word shingle containment, blended into a per-source match percentage.
3. The overall score blends the strongest source match (70%) with the average across sources (30%).
4. Sentence pairs above threshold are flagged as verbatim, high, or review severity with both excerpts shown.
5. Shared 5-word shingles are merged into maximal matched phrases (minimum 6 words) so the report shows exact copied runs as evidence chips, ready to rewrite or cite.

## Additional Frontend Features

- **Live draft statistics:** word count, sentence count, reading time, and average sentence length update as you type.
- **Progress bars:** per-source match percentages render as flat inline bars with severity colors.
- **Report download:** the full similarity report exports as a plain-text file from the browser.
- **Reference list:** generated citations can be saved to `localStorage` (`vidyasetu_refs`), reviewed, and copied all at once for pasting into an assignment.
- **Keyboard shortcut:** press `Ctrl+Enter` (or `Cmd+Enter`) inside the app to rerun the originality check.

No external API keys, databases, or third-party services are required; every endpoint runs as self-contained serverless logic.

## Engineering & Accessibility Details

- **Color & Layout:** Neutral zinc surfaces (`#09090b`, `#18181b`) paired with high-contrast emerald accents (`#0f766e`), clean flat typography, `6px` rectangular control geometry, and inline geometric vector icons.
- **Privacy Architecture:** Zero user accounts, zero tracking cookies, zero third-party analytics scripts, and a single-click local storage clear control on `/privacy.html`.
- **Legal Coverage:** Full academic honesty disclaimer and self-check limitations linked globally from every page via `/terms.html`.
- **Disclosure:** This project was developed with AI coding assistance, and all AI tool usage is declared in the hackathon submission write-up as required by the event rules.

## License

MIT
