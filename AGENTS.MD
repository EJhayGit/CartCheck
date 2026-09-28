# Project Development

Follow the approved application requirements documented in `docs/PRODUCT_REQUIREMENTS.md`.

Use `docs/design/DESIGN_SYSTEM.md` when implementing or modifying user interface components.

Follow the established system architecture.

Do not introduce major architectural changes without documenting their justification.

Avoid unrelated functionality and unnecessary dependencies.

Run the relevant tests after implementation.

## UI Responsiveness

For safe, reversible actions, update the UI immediately and reconcile it with the server response. If a request fails, restore the previous state and show a non-blocking error. Avoid full-list refetches after small mutations when the API response can update local state. Keep server confirmation for actions whose result or identity the server determines.

Log all work in `log.md` after each task. Append new dated entries; never replace or delete earlier entries.

Keep `log.md` local and ignored by Git. Never add, commit, or push `log.md` to the repository, and do not remove its `.gitignore` rule.
