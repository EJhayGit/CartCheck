# AGENTS.md

Rules for any coding agent working on CartCheck. Tool-specific notes (commands, architecture summary) are in [CLAUDE.md](CLAUDE.md).

## Read first

Open [docs/README.md](docs/README.md), then the doc that matches the task:

| Task | Read |
| --- | --- |
| User-facing behavior, flows, screens | [PRODUCT.md](PRODUCT.md) |
| Any UI change | [DESIGN.md](DESIGN.md) (tokens in `client/src/styles.css`, sidecar `.impeccable/design.json`) |
| Server, database, API, auth, client data layer | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Schema change | [docs/MIGRATIONS.md](docs/MIGRATIONS.md) |
| Email delivery or verification | [docs/ACCOUNT_EMAIL_SETUP.md](docs/ACCOUNT_EMAIL_SETUP.md) |
| Export, restore, data updates | [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) |

If code and a doc disagree, say so instead of silently picking one. Update the doc in the same change when you change what it describes.

## Working rules

These lean toward caution over speed; use judgment on trivial tasks.

1. **Think before coding.** State assumptions. If a request has more than one reading, name them and ask rather than picking silently. If something is unclear, stop and ask. Suggest a simpler approach when one exists.
2. **Simplicity first.** Write the minimum code that solves the problem. No features, abstractions, configurability or error handling for impossible cases beyond what was asked.
3. **Surgical changes.** Touch only what the task needs and match the existing style. Don't refactor, reformat or "improve" adjacent code. Remove only what your own change made unused; mention unrelated dead code, don't delete it.
4. **Goal-driven execution.** Turn the task into a check you can verify (a failing test that then passes, or tests green before and after a refactor). For multi-step work, state a short plan with a verify step for each item.

## Project rules

- Follow the established architecture. Don't introduce major architectural changes without documenting their justification in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Avoid unrelated functionality and unnecessary dependencies.
- Run the relevant tests after implementation (`npm test` in `server/` and/or `client/`, plus `npm run build` for client changes).

### UI responsiveness

For safe, reversible actions, update the UI immediately and reconcile it with the server response. If a request fails, restore the previous state and show a non-blocking error. Avoid full-list refetches after small mutations when the API response can update local state. Keep server confirmation for actions whose result or identity the server determines.

## Safety

- Never edit an applied migration or reset a database. Add a new migration instead.
- Never run the database integration runner (`server/testIntegrationDev.js`), touch production data, or create a data export without explicit approval.
- Never put secrets in `VITE_` variables or commit `.env` files, database dumps or backups.
- Every server query stays scoped to the signed-in account; cross-account access returns 404.
