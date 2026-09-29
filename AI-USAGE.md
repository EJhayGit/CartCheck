# AI usage in CartCheck

CartCheck was developed with Codex assistance across planning, UI design, implementation, testing, review, and documentation. This record summarizes work evidenced by the local development log and the linked public commits. It describes requests and outcomes rather than claiming to reproduce exact prompts. The log is local and is not published because it also records development environment and test details.

## Dated work

### 2026-09-23 — Product and interface design

- **Request and contribution:** Codex helped turn the grocery-list idea into requirements, user flows, scope boundaries, a design system, sitemap, wireframes, and mockup exports.
- **Decisions and checks:** The design kept the checklist primary and prices optional. The wireframe SVGs were checked for valid XML and rendered to PNG for visual inspection. These were design artifacts, not screenshots of a running app.
- **Evidence:** [Design specification](https://github.com/EJhayGit/CartCheck/commit/21531b8), [product requirements and architecture](https://github.com/EJhayGit/CartCheck/commit/bfc9914), [final mockups](https://github.com/EJhayGit/CartCheck/commit/06d0b11).

### 2026-09-24 — System design and roadmap

- **Request and contribution:** Codex drafted the React/Vite, Express, PostgreSQL, Render, and Supabase architecture and an implementation roadmap. A planning review examined account privacy, trip snapshots, optional amounts, and transaction-safe finishing.
- **Decisions and checks:** The approved first-release scope uses separate nullable estimated and actual item totals. Per-unit price comparison and a separate product price-history screen were removed from the first release. This was a design milestone; it did not verify a deployed application.
- **Evidence:** [Requirements and system design](https://github.com/EJhayGit/CartCheck/commit/bfc9914).

### 2026-09-27 — Database and private accounts

- **Request and contribution:** Codex assisted with numbered PostgreSQL migrations, a starter grocery catalog, private account registration and sessions, and the first CartCheck React screens.
- **Decisions and checks:** Development database checks verified the starter catalog. Account tests checked session behavior and initial isolation between two temporary accounts; temporary data was removed. The client build passed. This work did not include public deployment.
- **Evidence:** [Database foundation](https://github.com/EJhayGit/CartCheck/commit/e634849), [account implementation](https://github.com/EJhayGit/CartCheck/commit/b45c890).

### 2026-09-27 — Catalog and active list

- **Request and contribution:** Codex assisted with authenticated catalog search and custom-item actions, then the active shopping-list API and UI.
- **Decisions and checks:** Queries and mutations were scoped to the signed-in account. Tests covered catalog search, duplicate list adds, edits, removal, invalid input, and cross-account access. The log records browser checks of the local list flow and cleanup of temporary accounts.
- **Evidence:** [Catalog](https://github.com/EJhayGit/CartCheck/commit/815f565), [active list](https://github.com/EJhayGit/CartCheck/commit/881b4a1).

### 2026-09-28 — Shopping progress and responsive actions

- **Request and contribution:** Codex added bought/unbought controls, progress and purchased-item views, and immediate UI updates for safe list actions with rollback on failure.
- **Decisions and checks:** Review found a missing progress card and separate item sections in the first pass; they were added. Further review found races involving sign-out and pending requests, so session-generation and pending-mutation guards were added. Server tests, client tests, a production build, and local UI checks passed as recorded in the log.
- **Evidence:** [Shopping progress and responsiveness](https://github.com/EJhayGit/CartCheck/commit/faa40f5).

### 2026-09-28 — Optional money and currency

- **Request and contribution:** Codex added nullable estimated and actual item totals, optional budget, currency preference, and corresponding API, UI, and tests.
- **Decisions and checks:** Missing amounts remained distinct from `0.00`; actual spending counted bought items only. A mistaken integration-test expectation for an unbought priced item was corrected before the full development suite passed. Browser checks covered editing, rollback, and phone/desktop layouts.
- **Evidence:** [Optional prices and budget](https://github.com/EJhayGit/CartCheck/commit/418bbbd).

### 2026-09-28 — Finish Trip, history, and guarded verification

- **Request and contribution:** Codex assisted with transactional trip finishing, a fresh active list, dated history, reviewed corrections, migration 002, and owner-scoped API tests. It also helped create a guarded runner for tests against the existing development database.
- **Decisions and checks:** An initial guarded run exposed TLS configuration and cleanup ordering errors. After fixing those, all three guarded integration suites passed, exact temporary-account cleanup completed, and the protected database baseline was unchanged. An authenticated local browser walkthrough covered finish, history, correction, and refresh persistence. A later audit tightened project identity and history-cursor validation. These checks did not establish a public deployment.
- **Evidence:** [Trip lifecycle and verification](https://github.com/EJhayGit/CartCheck/commit/7d438a8), [test safety procedure](docs/MILESTONE_7_TEST_SAFETY.md).

### 2026-09-29 — Public repository cleanup

- **Request and contribution:** Codex removed the unused GitHub Pages workflow and starter demo files, updated the README for the Render plan, removed Pages-specific build settings, and added the requested Made with Codex badge.
- **Decisions and checks:** Server tests passed 22 with three guarded database suites skipped in the ordinary command; client tests passed 10; the production build passed. The owner explicitly approved publishing both the trip-lifecycle and cleanup commits. The GitHub About section was left for the owner to edit.
- **Evidence:** [Repository cleanup](https://github.com/EJhayGit/CartCheck/commit/9253881).

## Corrections worth recording

1. **Incomplete progress UI.** The first shopping-progress pass lacked the approved progress card and separate remaining/purchased sections. Review identified the gap, and the UI was corrected before the [progress commit](https://github.com/EJhayGit/CartCheck/commit/faa40f5).
2. **Wrong test expectation.** The optional-money integration test initially expected an unbought item's actual price in spending. The assertion was corrected so actual spending follows bought status before the [budget commit](https://github.com/EJhayGit/CartCheck/commit/418bbbd).
3. **Unsafe test cleanup order.** A guarded development run exposed a foreign-key failure when cleaning up temporary accounts. The run stopped; only the verified temporary rows were recovered. Cleanup was changed to delete verified dependent trip items first, and the guarded suites then passed before the [trip commit](https://github.com/EJhayGit/CartCheck/commit/7d438a8).

## Attribution and remaining evidence

The commits above identify AI-assisted work and verification. They do not establish which individual lines a student wrote unaided. This record does not claim a student-written percentage or invent a personal code explanation. The project owner should add independently verifiable student-authored code examples and their own explanation if the course requires them. A public Render deployment, running-app screenshot, and final course evidence are still pending.
