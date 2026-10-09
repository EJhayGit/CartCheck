# AI usage in CartCheck

**Completed record:** October 7, 2026. The project owner confirmed the application complete on October 6, 2026.

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

### 2026-09-30 — Public deployment and repository links

- **Request and contribution:** Codex helped configure the single Render web service, connect the existing Supabase database with verified TLS, check the public shopping flow, and document the canonical website in this repository and GitHub deployment metadata.
- **Decisions and checks:** HTTPS, `/healthz`, `/readyz`, session and shopping actions, history, logout, and foreign-Origin rejection passed public smoke checks. The owner chose to keep the temporary smoke account. Resend DNS was corrected, but sender verification remained partial at the last check and the owner deferred real inbox delivery testing. At that checkpoint, required email verification was off; this entry does not establish current provider configuration.
- **Evidence:** [Live CartCheck site](https://cartcheck.merzbuilds.dev), [deployment architecture](docs/architecture/SYSTEM_DESIGN.md).

### 2026-09-29–30 — Account recovery and authentication interface

- **Request and contribution:** Codex assisted with email verification and resend, forgot/reset password, authenticated password changes, hashed single-use action tokens, email cooldowns, and migration 003. It also helped redesign account emails and authentication screens, including password visibility, confirmation, strength guidance, and verification feedback.
- **Decisions and checks:** Express remained responsible for authentication. Existing accounts retained their verification exemption. Recorded checks included server/client tests, the production build, and browser inspection of account states. Provider simulations and screen checks were not treated as proof of real inbox delivery.
- **Evidence:** [Account enhancements](https://github.com/EJhayGit/CartCheck/commit/32218b0), [account emails](https://github.com/EJhayGit/CartCheck/commit/7932641), [authentication interface](https://github.com/EJhayGit/CartCheck/commit/74be3e6), [email configuration](docs/ACCOUNT_EMAIL_SETUP.md).

### 2026-09-30 — Official branding and appearance

- **Request and contribution:** Codex integrated the supplied official logo, favicon, navigation icons, semantic theme tokens, persistent Light/Dark/System appearance, early theme initialization, and shared interface refinements.
- **Decisions and checks:** The owner supplied the brand direction and approved publication. The log records 39 frontend tests and a production build passing, responsive fixture checks, and live browser confirmation after the approved deployment. The existing password-strength bundle-size warning remained.
- **Evidence:** [Branding and appearance](https://github.com/EJhayGit/CartCheck/commit/7ae0417).

### 2026-10-04 — Responsive layout, caching, and shopping refinements

- **Request and contribution:** Codex helped refine wide-screen layouts, add an account-session cache with request deduplication and stale-response protection, improve instant navigation/search, expand the seed catalog from 108 to 160 groceries, and improve sorting, budget meters, purchase toggles, and neutral dark surfaces.
- **Decisions and checks:** The existing React/API architecture was retained. Safe mutations update immediately and reconcile with the server or roll back on failure. Recorded checks included client/server tests, production builds, responsive screenshots, delayed/offline/error scenarios, and targeted security review. The additive catalog backfill was prepared separately; the application deployment did not itself run a production seed or backfill. Security review was not a comprehensive penetration test.
- **Evidence:** [Responsive layout and cache](https://github.com/EJhayGit/CartCheck/commit/d2715a2), [shopping refinements and catalog definitions](https://github.com/EJhayGit/CartCheck/commit/9fc705c), [header refinement](https://github.com/EJhayGit/CartCheck/commit/4107f8b).

### 2026-10-05 — Multiple named lists and coordinated release

- **Request and contribution:** Codex audited the single-list assumptions, planned migration 004, and assisted with explicitly created named lists, list-scoped APIs and caches, destination selection, list routes, and finishing one list without replacing it or changing another list.
- **Decisions and checks:** The owner approved the feature and release stages. Existing trip and item snapshots, ownership, budgets, currencies, and completion dates were preserved. Final local checks recorded 40 server unit tests, 13 isolated PostgreSQL/API integration tests, 84 client tests, and a production build passing. Migration dry runs, rollback/upgrade checks, responsive browser checks, and review identified and resolved pagination/session issues. The deployment was coordinated with manual service suspension and schema verification to avoid old writers using the new schema.
- **Evidence:** [Multiple named lists](https://github.com/EJhayGit/CartCheck/commit/8f127a3), [requirements](docs/PRODUCT_REQUIREMENTS.md), [migration compatibility](docs/MIGRATIONS.md).

### 2026-10-06 — Production verification and completed-app documentation

- **Request and contribution:** Codex assisted with approved production checks of concurrent lists, scoped items, quantities, prices, budgets, rename, catalog destinations, navigation, appearance, history, and account isolation. It then cleaned and updated the public documentation for the completed application.
- **Decisions and checks:** The logged production walkthrough confirmed that finishing the selected list preserved the other list and created no replacement. Cross-account resource requests returned 404; protected existing trip/item fingerprints remained unchanged. Process and database-readiness endpoints returned 200. These were scoped checks using approved test accounts, not exhaustive testing. The owner confirmed completion and requested publication of current documentation; old reports, prototypes, and screenshots were preserved in an ignored local archive.
- **Evidence:** [Completed-app documentation and cleanup](https://github.com/EJhayGit/CartCheck/commit/023e532), [system design](docs/architecture/SYSTEM_DESIGN.md). Detailed production evidence stays local to avoid publishing account and environment details.

## Corrections worth recording

### October 9, 2026 — Local security and release preparation

Codex audited the current repository and read-only production state, applied compatible transitive dependency patches, prepared a credential-free CI workflow, and tested additive starter seeding/backfill in disposable PostgreSQL. AI review identified a cross-tab shared-cookie session mismatch; the local fix adds session revalidation, private-cache invalidation and server-side expected-account checks. Existing optimistic shopping behavior remains in scope; no feature redesign was requested.

The local catalog runner was corrected after review found that its first version seeded all 160 shared rows before constructing the supposed 108-row baseline. The corrected runner begins with 108 shared rows and tests the actual 52-row addition. An isolated restoration comparison initially failed because timestamp formatting used a different timezone; UTC normalization made the older private export's rows compare exactly. These corrections are part of the verification evidence, not successful checks in their initial form.

**Approved release evidence:** The owner subsequently authorized push/deployment and the separate catalog operation. [Commit 0db7eb7](https://github.com/EJhayGit/CartCheck/commit/0db7eb7964132316d626537fa4c56ed7a367dc27) passed [GitHub Actions](https://github.com/EJhayGit/CartCheck/actions/runs/37930369657) and was verified live on Render with health/readiness checks. A fresh approved private application export restored successfully in isolation before the guarded additive production seed/backfill. Final validation confirmed 160 shared starters, missing account copies supplied, no duplicates, and existing customizations/list/history rows preserved. No migrations, grants, verification policy or auto-deploy setting were changed. Detailed private evidence remains local; real email delivery and complete provider-level recovery are not implied.

Fresh audits returned zero known advisories locally. Isolated ownership/API tests, client tests, builds, and browser checks are recorded separately in the local release review. Production data, infrastructure, commits, pushes, and deployment require the owner's final approval; no release is implied by this entry. Backup scope, unverified real inbox delivery, provider configuration, and academic evidence limits remain explicit.

1. **Incomplete progress UI.** The first shopping-progress pass lacked the approved progress card and separate remaining/purchased sections. Review identified the gap, and the UI was corrected before the [progress commit](https://github.com/EJhayGit/CartCheck/commit/faa40f5).
2. **Wrong test expectation.** The optional-money integration test initially expected an unbought item's actual price in spending. The assertion was corrected so actual spending follows bought status before the [budget commit](https://github.com/EJhayGit/CartCheck/commit/418bbbd).
3. **Unsafe test cleanup order.** A guarded development run exposed a foreign-key failure when cleaning up temporary accounts. The run stopped; only the verified temporary rows were recovered. Cleanup was changed to delete verified dependent trip items first, and the guarded suites then passed before the [trip commit](https://github.com/EJhayGit/CartCheck/commit/7d438a8).

4. **Cache and asynchronous state.** Review found draft preservation, stale response, pagination, and session disposal issues. The cache/list implementations and regression tests were corrected before their releases.
5. **List destinations beyond the first page.** Final multiple-list review identified missing access to later catalog destinations. A Load more lists control and regression tests for a later destination and stale cursor responses resolved the finding before the [multiple-list commit](https://github.com/EJhayGit/CartCheck/commit/8f127a3).
6. **Obsolete single-list documentation.** Earlier entries describe automatic active-list creation and replacement after finish. That was the behavior at the time; the October release superseded it with explicit named-list creation and independent completion.

## Human decisions and responsibility

The project owner provided the application goals, approved scope and design choices, supplied the official brand assets, authorized publication and production operations, and confirmed completion. Codex contributed substantially to planning, code, tests, reviews, documentation, and approved tooling operations. This is a disclosure of AI-assisted development; it does not imply the application was written entirely without AI.

The record does not assign a student-written percentage or identify unaided authorship of individual lines. Those claims cannot be established from commit history or the development log alone. Exact prompts are not reproduced here; the dated entries summarize requests and outcomes supported by available records.

## Verification boundaries

Test counts and deployment checks above are historical results from the recorded work, not tests rerun when this document was finalized. Passing tests and reviews do not guarantee the absence of defects or vulnerabilities. Real inbox delivery is not established by this record, and the earlier production build reported a password-strength bundle-size warning.

Credentials, account identifiers, private database evidence, and the local work log are excluded from this public document. Historical reports remain in the Git-ignored archive; public commit links preserve the development trail. The final application behavior is documented in the [requirements](docs/PRODUCT_REQUIREMENTS.md), and contributors can use the [README](README.md) and [documentation index](docs/README.md) to run and maintain it.
