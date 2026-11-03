# Finish Keeps the List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finishing saves the trip snapshot as a new row and keeps the same list active with its not-bought items, or empty if the shopper clears it.

**Architecture:** `tripRepo.finishTrip` inserts a completed row, copies the items, then reduces and resets the list, all in one transaction. Migration 005 links each trip to its source list and revision so a retry returns the saved trip. The client stays on the list and shows **Trip saved · View trip**.

**Tech Stack:** Express, PostgreSQL (`pg`), React, Vite, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-03-finish-keeps-list-design.md`

## Global Constraints

- Every server query stays scoped to the signed-in account; cross-account access returns 404.
- Never edit an applied migration. Never run `server/testIntegrationDev.js` or touch a real database.
- Match the surrounding code style. Add no dependencies.
- Exact copy: "Keep the N not-bought items on this list", "Clear the list", "Trip saved", "View trip".
- `PRODUCT.md` item 7 is marked approved with the date 2026-11-03.

## Review Focus

1. Connection lost after the server saved: confirming again returns the saved trip, creates no second trip, and leaves the shopper on the reduced list.
2. A retry with a different keep or clear choice: the original outcome stands and nothing changes.
3. Exactly one not-bought item: the choice reads "Keep the 1 not-bought item on this list", not "1 not-bought items".
4. Everything bought: no choice is shown, and the empty list still shows **Trip saved · View trip**.
5. Reopening the review after choosing "Clear the list" and backing out: the choice is back on keep, so nothing is cleared by surprise.

---

### Task 1: Server finish

**Files:**
- Create: `server/db/migrations/005_finish_keeps_list.sql`
- Modify: `server/db/schema.sql` (`shopping_trips` table, new index)
- Modify: `server/tripValidation.js`, `server/tripRepo.js`, `server/listRepo.js`, `server/server.js:446-462`
- Test: `server/tripRepo.test.js`, `server/tripValidation.test.js`
- Update, do not run: `server/cart.integration.test.js:183-275`

**Interfaces:**
- Produces: `validateFinish(body) -> { revision: number, remaining: 'keep' | 'clear' } | { error: string }`
- Produces: `listRepo.getActiveListDetail(queryable, userId, listId) -> list detail | null`
- Produces: `tripRepo.finishTrip(pool, userId, tripId, revision, remaining = 'keep') -> { completedTrip, list } | { error: 'not_found' | 'stale' | 'empty' }`
- Produces: the finish route accepts `{ revision, remaining? }` and returns `{ completedTrip, list }`. `list` is `null` only for a row completed before this change.

- [ ] **Step 1: Write the failing tests**

In `tripValidation.test.js`:

```js
test('validateFinish defaults to keep and rejects anything else', () => {
  assert.deepEqual(validateFinish({ revision: 3 }), { revision: 3, remaining: 'keep' })
  assert.deepEqual(validateFinish({ revision: 3, remaining: 'clear' }), { revision: 3, remaining: 'clear' })
  assert.ok(validateFinish({ revision: 3, remaining: 'all' }).error)
  assert.ok(validateFinish({ revision: 3, extra: true }).error)
  assert.ok(validateFinish({ remaining: 'keep' }).error)
  assert.ok(validateFinish([]).error)
})
```

In `tripRepo.test.js`, replace the two existing tests. Extend `makeClient` to record `(sql, params)` and answer the new statements: an insert returning a completed row with `id: '50'`, and a `finished_from_list_id` lookup whose result the test sets. Add:

- `finish saves a new trip and keeps the list row active`: `result.completedTrip.id === '50'`, `result.list.tripId === '7'`, no SQL contains `SET status = 'completed'`, the insert passes list ID `'7'` and revision `3`, the copied items use `product_id` NULL, and the last command is `COMMIT`.
- `keep removes bought items and resets the rest`: one `DELETE FROM cartcheck.trip_items` containing `bought`, and one update setting `bought = false`, `estimated_total = NULL`, `actual_total = NULL`.
- `clear removes every item`: the `DELETE` has no `bought` condition.
- `retry returns the saved trip without changing anything, whatever it asks for`: posted revision 3, list revision 4, lookup finds a trip; called with `'clear'`, it returns that trip and current list, with no `INSERT` or `DELETE`.
- `stale revision with no saved trip returns stale`: `{ error: 'stale' }`, last command `ROLLBACK`.
- `empty list returns empty`: `{ error: 'empty' }`, last command `ROLLBACK`.
- `a row completed before this change returns its trip with no list`: `result.list === null`, no writes.

- [ ] **Step 2: Run the tests and confirm they fail**

Run in `server/`: `node --test tripRepo.test.js tripValidation.test.js`
Expected: FAIL (`validateFinish` is not exported; `completedTrip.id` is `'7'`).

- [ ] **Step 3: Add the migration and update `schema.sql`**

Use the SQL from the spec. Add the two columns and the index to `schema.sql` so the reference matches.

- [ ] **Step 4: Implement the server change**

- `validateFinish` reuses `validateRevision` and allows only the keys `revision` and `remaining`.
- `getActiveListDetail` wraps `selectDetail(queryable, userId, listId)` and does not lock, because `finishTrip` already holds the lock.
- `finishTrip` follows the spec's steps 1 to 9 in that order, inside its existing transaction. The insert copies items with `created_at` preserved.
- The route replaces its inline body check with `validateFinish` and passes `remaining` on. Keep its error mapping.

- [ ] **Step 5: Run the server tests**

Run in `server/`: `npm test`
Expected: PASS, with integration tests skipped.

- [ ] **Step 6: Update `cart.integration.test.js` without running it**

- Rename the completion test and expect a new trip ID. `/api/lists` keeps `first.tripId`, and `/api/lists/:id` stays active with the reduced items.
- Both concurrent finishes return 200 with the same `completedTrip.id`, and a later retry returns it too.
- Remove the assertions that a finished list returns `completedTrip` and that its edits return 404; assert that a removed bought item's edit returns 404.
- Edit race: `(finished 200 and edited 200 or 404)` or `(finished 409 and edited 200)`.
- Delete race: `(finish 200 and delete 204 or 404)` or `(finish 404 and delete 204)`, and any saved trip still loads after the delete.
- Remove assertions that depend on a finished list being gone from `/api/lists`, such as the final `deepEqual(..., [])`.

Check syntax only: `node --check cart.integration.test.js`.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "Keep the list active when finishing a trip"
```

### Task 2: Client finish and docs

**Files:**
- Modify: `client/src/api/httpApi.js:76`, `client/src/ShoppingList.jsx`, `client/src/ListRoute.jsx`, `client/src/App.jsx:522`
- Test: `client/src/finishCache.test.js`
- Modify: `PRODUCT.md` item 7, `DESIGN.md` (Finish review, Feedback), `docs/ARCHITECTURE.md:60,107`, `docs/MIGRATIONS.md`

**Interfaces:**
- Consumes: the finish route from Task 1.
- Produces: `finishTrip(id, revision, remaining)` in `httpApi.js`, and an `onOpenTrip(tripId)` prop on `ListRoute` and `ShoppingList`, wired in `App.jsx` as `navigate('trips', id)`.

- [ ] **Step 1: Write the failing tests**

Rewrite the existing test in `finishCache.test.js` around a list with one bought and two not-bought items, and a finish response of `{ completedTrip: { id: 'trip-9', ... }, list: reducedList }`. Add a small render helper shared by the tests.

- `Finish keeps the list and links to the new trip`: `onBackToLists` is not called, the request body is `{ revision: 42, remaining: 'keep' }`, `cache.get('list:active').data` is `reducedList`, `cache.get('trip:trip-9')` exists, `cache.get('lists')` still has `active`, "Trip saved" is shown, and clicking **View trip** calls `onOpenTrip('trip-9')`.
- `Clear the list sends clear`: choose the "Clear the list" radio; the body has `remaining: 'clear'`.
- `The choice uses a singular label for one item`: the radio named `Keep the 1 not-bought item on this list` exists.
- `Everything bought shows no choice and still confirms`: no radio exists; after finishing with an empty `list`, "Trip saved" and **View trip** are shown.
- `Backing out of the review resets the choice`: choose clear, click **Keep shopping**, reopen; the keep radio is checked.
- `Confirming again after a lost connection finishes normally`: the first finish `fetch` rejects and an alert shows; the second returns the trip; "Trip saved" is shown.
- `A trip completed before this change returns to My Lists`: a response with `list: null` calls `onBackToLists` with `{ notice, tripId }`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run in `client/`: `node --test src/finishCache.test.js`
Expected: FAIL (no radio, `onBackToLists` is called).

- [ ] **Step 3: Implement the client change**

- `finishTrip(id, revision, remaining)` adds `remaining` to the JSON body.
- `ShoppingList` gets `remainingChoice` state, set to `'keep'` whenever the review opens.
- Render a `fieldset` radio group in the review summary above the actions when `remainingCount > 0`, with the spec's labels and a singular form for one item. Check `styles.css` for an existing radio or fieldset pattern first (Create list's "Start with" is the likely match).
- Review copy: change "Other active lists stay as they are." only if it stops being accurate, and keep "will be saved as not bought".
- On success with `result.list`: `cache.set(cacheKey, result.list)`, `replaceListSummary`, `cacheCompletedTrip`, clear `lastChange` and the editor, close the review, set a new `savedTripId` state, and focus the list heading.
- On success with `list: null`: keep today's path through `onBackToLists`.
- Render **Trip saved** and a **View trip** text button in a `catalog-notice flash-notice` paragraph with `role="status"`, matching `Lists.jsx:200`. Render it where it is visible on an empty list too.
- Pass `onOpenTrip` through `ListRoute` and `App.jsx`.

- [ ] **Step 4: Run the client tests and build**

Run in `client/`: `npm test`, then `npm run build`
Expected: PASS, build succeeds. Fix any `shoppingUx` tests that assert the old flow.

- [ ] **Step 5: Update the docs**

- `PRODUCT.md` item 7: describe the new finish, the keep or clear choice, and the return to the list, marked "approved 2026-11-03". Remove "Return to My Lists" and "without creating a replacement list". Keep the Shop again text.
- `PRODUCT.md` acceptance example: keep it accurate if its wording about finishing no longer holds.
- `DESIGN.md`: add the choice to Finish review; change the Feedback sentence to "After finishing, the list shows Trip saved with View trip."
- `docs/ARCHITECTURE.md:60`: new row, copied items, retry lookup, keep or clear; remove "no rollover". Line 107: add `remaining`.
- `docs/MIGRATIONS.md`: add a short note on migration 005.

- [ ] **Step 6: Commit**

```bash
git add client PRODUCT.md DESIGN.md docs
git commit -m "Return to the kept list after finishing a trip"
```

### Final verification

- [ ] Run `npm test` in `server/` and `client/`, and `npm run build` in `client/`. All must pass.
