# Finish keeps the list

> Purpose: approved design for changing what Finish shopping does. · Read when: implementing or reviewing this change.

Design approved 2026-11-03.

## Goal

Today, finishing turns the list into a trip and the list disappears. A shopper who didn't find everything has to rebuild the list. After this change, finishing still saves the same trip snapshot, but the list stays active with what is left to buy.

## Behavior

1. Finish review offers one choice, shown only when N (the number of not-bought items) is above 0:
   - **Keep the N not-bought items on this list** (default)
   - **Clear the list**
2. Confirming saves the trip snapshot exactly as today: name, currency, budget, all items, bought state and prices.
3. The list stays active under the same ID and URL:
   - Keep: only not-bought items remain, unchecked, with the same quantities and units.
   - Clear: no items remain.
   - Everything bought: no choice is shown and the list remains, empty.
4. Estimated and actual prices are cleared on kept items. The list keeps its name, currency and budget.
5. The shopper stays on the list and sees **Trip saved · View trip**. View trip opens the new trip.
6. An empty list still cannot be finished. Shop again on past trips does not change.

## Data model

The active row stays and the trip becomes a new row. The alternative, turning the row into the trip and creating a new active row, was rejected because it changes the list ID, breaks open tabs and the remembered catalog destination, and still needs a link for retries.

Trips finished before this change keep their IDs and data.

### Migration `005_finish_keeps_list.sql`

The schema needs this because the list row no longer records that it was finished. Without a link, a retry after a lost response gets a 409, although the review screen promises that retrying creates no duplicate.

```sql
ALTER TABLE cartcheck.shopping_trips
  ADD COLUMN finished_from_list_id BIGINT REFERENCES cartcheck.shopping_trips(id) ON DELETE SET NULL,
  ADD COLUMN finished_from_revision INTEGER;

CREATE UNIQUE INDEX shopping_trips_finished_from_idx
  ON cartcheck.shopping_trips (finished_from_list_id, finished_from_revision)
  WHERE finished_from_list_id IS NOT NULL;
```

`ON DELETE SET NULL` means deleting a list never deletes its trips. Update `db/schema.sql` to match; it stays reference-only.

## Server

`POST /api/trips/:id/finish` accepts `{ revision, remaining? }`, where `remaining` is `'keep'` or `'clear'` and defaults to `'keep'`. `validateFinish` in `tripValidation.js` rejects any other value or extra key with 400.

`tripRepo.finishTrip` runs in one transaction, with every statement scoped to the signed-in account:

1. Lock the row (`FOR UPDATE`). If it is missing, return `not_found`.
2. If the row is already `completed` (finished before this change), return that trip with `list: null`.
3. If the revision differs, look for a trip with this `finished_from_list_id` and `finished_from_revision` for this account. If found, return it with the current list. If not, return `stale`.
4. If the list has no items, return `empty`.
5. Insert the completed row: same name, currency, budget and `created_at`; `completed_at` and `updated_at` set to now; `revision` 1; the two `finished_from_*` columns set.
6. Copy all items to it with `product_id` NULL, keeping bought state, prices and `created_at` so order is preserved.
7. On the list, delete bought items (all items for `clear`), then set the rest to `bought = false`, `estimated_total = NULL`, `actual_total = NULL`. Kept items keep their IDs and `product_id`.
8. Bump the list's `revision` and `updated_at`.
9. Return `{ completedTrip, list }`, reading `list` through a new `listRepo.getActiveListDetail(queryable, userId, listId)` that exposes the existing detail query for an open transaction.

Error responses stay as they are: 404, 409 and 400.

A retry returns the original outcome, including the original keep or clear choice, even if the retry's `remaining` differs.

## Client

- `httpApi.finishTrip(id, revision, remaining)` sends the choice.
- The review in `ShoppingList.jsx` shows the choice as a labeled radio group inside the summary panel, above the actions. It keeps its existing review copy apart from text that no longer holds.
- On success, the client:
  - stores `result.list` in the list cache and updates its summary;
  - caches the completed trip under its new ID;
  - clears the undo state and editor, and closes the review;
  - shows **Trip saved · View trip** in the list's status area, with focus moved to the list heading.
- View trip calls a new `onOpenTrip` prop, passed from `App.jsx` through `ListRoute.jsx`.
- If `result.list` is null, the client returns to My Lists with the existing flash.
- The My Lists flash code stays for that case.
- `ListRoute` keeps handling `completedTrip` responses for trips finished before this change.

## Failure and concurrency

- Lost response: confirming again returns the saved trip and current list, with no duplicate. The unique index is the database-level backstop.
- Lost response, then leaving the review: the client remembers the unconfirmed revision, reloads the list and, if the revision moved, asks for that revision again. That request can only return the saved trip, so the list shows **Trip saved · View trip**. If the revision did not move, nothing was saved and nothing changes. If the shopper is offline, the check runs again when they next open the review.
- Known limit: a full page reload forgets the unconfirmed revision. The list then shows its reduced items with no notice, and finishing it saves those leftovers as a separate trip. Both trips are accurate, and the first is in Trips.
- Edit during finish: both requests lock the list row, so they run one after the other. An edit that lands first makes the finish return 409. An edit that lands after succeeds on a kept item and returns 404 on a removed one.
- Delete during finish: the requests also serialize. The delete may now succeed after the finish, and the saved trip survives.
- Other open tabs: they hold an old revision, so finishing from one gets the saved trip if it reviewed that same revision, otherwise 409. Editing a removed item returns 404.

## Docs

- `PRODUCT.md` item 7: new behavior, marked approved 2026-11-03.
- `DESIGN.md`: Finish review, and the Feedback line about returning to My Lists.
- `docs/ARCHITECTURE.md`: finish rule (including "no rollover") and API table row.
- `docs/MIGRATIONS.md`: migration 005.

## Testing

- `server/tripRepo.test.js`: keep, clear, retry returning the saved trip, stale, empty, older completed row.
- `server/tripValidation.test.js`: `validateFinish`.
- `client/src/finishCache.test.js`: choice sent, list stays with its reduced items, new trip cached, notice and View trip, all-bought case with no choice shown.
- `server/cart.integration.test.js`: update to the new behavior, including the edit and delete races. It is not run in this work because the runner needs explicit approval.
- Done means `npm test` passes in `server/` and `client/`, and `npm run build` succeeds in `client/`.

## Out of scope

Changes to Shop again, a setting for the default choice, and carrying prices forward.

## Known overlap

Open PR EJhayGit/CartCheck#12 touches `client/src/ShoppingList.jsx`, `DESIGN.md` and `PRODUCT.md` item 3. Expect small merge conflicts.
