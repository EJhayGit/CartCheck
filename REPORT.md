# Weekly Increment Report

## Week of: September 24–27, 2026 (Finals Week 2)

### What changed this week

- The separate CartCheck repository moved from a sightings template to a grocery app. Planning and visual design were recorded in commits `21531b8`, `bfc9914`, and `06d0b11`.
- Commit `e634849` added the CartCheck PostgreSQL schema, numbered migration, safe starter seed, and database verification scripts. `docs/MILESTONE_1_SETUP.md` records development Supabase checks, including 108 distinct starter items and healthy `/healthz` and `/readyz` responses.
- Commit `b45c890` added account registration, sign-in, session restoration, sign-out, and a React account screen. Commit `815f565` added catalog search/filter and private custom groceries. Commit `881b4a1` added an active list that can add, edit, and remove items. Unit and integration test files accompany these features; I have not rerun them for this report.
- The Week 2 documentation update now describes the implemented API and UI, and `project/SECURITY-CHECKLIST.md` records the security checks and gaps.

### Why

These changes turn the approved plan into an account-scoped grocery workflow with persistent data. Updating the README and checklist makes the submission match the code instead of the earlier template or the more complete design mockups.

### What broke or what I got stuck on

- The list does not yet check off purchases. Finish Trip, optional prices/budget, and trip history are planned but not implemented.
- The latest Pages workflow built and uploaded the client artifact, but `actions/deploy-pages@v4` failed to create a deployment with HTTP 404 and advised enabling Pages. There is no verified live app or running-app screenshot.
- The existing workflow still targets Pages while the current product plan expects one Render origin. The security checklist also records unverified database privileges and Data API access, unpinned Actions tags, and missing asset provenance.

### What is left

1. Implement bought/unbought controls, finish confirmation, optional money fields, and dated history with owner-scoped tests.
2. Verify the current app end to end with a disposable database, correct deployment configuration, and capture a real running-app screenshot.
3. Close the security checklist gaps and keep the AI usage record and course documents current.

---

## Week of: September 22, 2026

## What changed this week

- The professor-selected idea, CartCheck, was written up in [the proposal](PROPOSAL.md) with its audience, planned screens, item fields, and image-loading risk.
- [Wireframes](02-wireframes.pdf) and a [design system](03-design-system.pdf) were added for the planned shopping list, add-item, and purchased-item views. Workspace commit `8d96b31` records these planning deliverables.
- A course-wide reflection was committed as `0494720` and is preserved as [the midterm reflection](../journal/midterm-reflection.md). A separate [finals Week 1 entry](../journal/week-1.md) now records this week's CartCheck work.
- The project repository was created from the course template. Its only current commit, `29d9936`, is the initial template upload. No CartCheck grocery code has been added yet.

## Why

The proposal and visual documents define the grocery workflow before the React, API, and database conversion. They give a basis for checking whether the later implementation matches the approved idea.

## What broke or what I got stuck on

- The application still displays HAUnted Sightings and stores sighting records. Its README and API also describe sightings, so it cannot yet be presented as a working CartCheck app.
- The client and server dependencies are not installed in this checkout. No runtime, database connection, or deployment check has been completed, and there is no screenshot of a running CartCheck screen.
- Several behavior decisions remain open, including quantity units, category choices, duplicate items, and how purchased items can be returned to the list. Automatic pictures also need a suitable provider and a server-side key plan.

## What is left

1. Confirm the grocery data rules and convert the React screen, both API adapters, Express routes, and PostgreSQL schema together.
2. Add meaningful checks and verify demo mode and real API/database mode with isolated data.
3. Add automatic pictures after the core list works, with a safe fallback and attribution.
4. Capture a real app screenshot, complete deployment, and update the setup and usage documentation from verified results.

The planning and reflection commits above are in the private course workspace. The separate CartCheck repository currently contains only its initial template commit.
