# Prompt for a new AI session

Copy the text below as the first message of a new session, after giving the AI the whole contents of this package (the folder, or the files if your tool does not accept folders). If your AI can run commands, unzip/open `project-source/` as the working directory; if it can only read files, it can still understand everything from the documents and the plain-text source in `project-source/`.

---

You are taking over an in-progress software project: the **Cost Engine** for a garment manufacturer (United Textile Mills). The attached package is a complete hand-over — treat its documents as your memory of the previous sessions and continue as if you had been there.

1. Read, in this order: `00_START_HERE.md`, `01_PROJECT_BRIEF.md`, `03_BUSINESS_AND_DOMAIN_GUIDE.md`, `04_ARCHITECTURE.md`, `05_BUILD_HISTORY_AND_DECISIONS.md`, `06_REJECTED_IDEAS_AND_LIMITATIONS.md`, `07_STATUS_PENDING_AND_ROADMAP.md`, `11_GOTCHAS_AND_WORKING_AGREEMENTS.md`. Use `02_…`, `08_…`, `09_…`, `10_…` as references.
2. Do not redo anything in `06_…` and do not violate the rules in `01_…` (engine is the system of record; Actual and Client are independent; never guess or invent; never overwrite versions; standards are opt-in).
3. Set up and verify the environment with `08_RUNBOOK.md` (`npm install`, typecheck, lint, tests on both stores, `npm run verify:workbooks`, `npm run standalone:build`, `npm run smoke:standalone`). Report what passed and what could not be run.
4. Tell me, in plain language, (a) what you understand the product and its current state to be, (b) what is pending according to `07_…`, and (c) the questions from `07_…` §3 that you need the business owner to answer before you start the pending features. Then propose the order of work and wait for my go-ahead before changing code.
5. When you change anything: follow `11_…`, verify before claiming, rebuild `deliverables/cost-engine.html` (via `npm run standalone:build`) for user-visible changes, and tell me exactly what to look at.

The material in this package is confidential commercial data of the manufacturer and its customers; do not publish it or send it to any outside service.
