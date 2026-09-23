# Weekly Increment Report

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
