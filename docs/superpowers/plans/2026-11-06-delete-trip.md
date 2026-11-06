# Delete Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shopper delete one finished trip from Trips history, after an inline confirmation.

**Architecture:** New `DELETE /api/trips/:id` route → `tripRepo.deleteTrip` deletes only a `completed` row owned by the account (`trip_items` go with it via the existing `ON DELETE CASCADE` FK, so **no migration**). The Trips history card gets the same inline Keep/Delete confirmation and optimistic remove-with-rollback that `Lists.jsx` `remove()` already uses.

**Tech Stack:** Express + `pg` (server), React + `dataCache` (client), `node --test` + jsdom/testing-library.

**Spec:** this request ("delete a trip from the history"); no separate design doc. Behavior rules come from `PRODUCT.md` §7 and `AGENTS.md` "UI responsiveness".

## Global Constraints

- Every query scoped by `user_id`; another account's trip, an active list ID, or a missing ID → `404 { error: 'Trip not found' }`.
- Invalid ID → `400 { error: 'Invalid trip ID' }` via existing `parseTripId`.
- Mutating route uses `checkRequestOrigin, authenticate`, success is `204` (same as `DELETE /api/lists/:id`).
- Only `status = 'completed'` rows are deletable here; active lists keep their own delete.
- No new dependency, no migration, no change to the catalog or to active lists.

## Review Focus

1. Deleting via an **active list ID** must 404 and leave the list intact — covered by Task 1 SQL assertion (`status = 'completed'`).
2. **Server failure / offline** while deleting: card must come back in its original position with a non-blocking error — Task 2 test.
3. **Double click on Delete**: only one request — guard with a `deletingIds` set like Lists; Task 2 test.
4. **"Shop again from last trip"** in Lists (`tripsQuery.data.items[0]`) must not offer the deleted trip — satisfied by removing it from the shared `'trips'` cache entry; Task 2 asserts the cache.
5. **Stale "Trip saved · View trip" link** to a deleted trip shows the existing "Trip not found" detail error — no code; check manually in Task 3.

---

### Task 1: Server — `deleteTrip` repo + route

**Files:**
- Modify: `server/tripRepo.js` (append)
- Modify: `server/server.js` (after `PUT /api/trips/:id`, ~line 507)
- Test: `server/tripRepo.test.js`

**Interfaces:**
- Produces: `deleteTrip(pool, userId, tripId) -> Promise<boolean>`; HTTP `DELETE /api/trips/:id` → `204` | `400` | `404`.

- [ ] **Step 1: Write the failing test** in `server/tripRepo.test.js`

```js
test('deleteTrip removes only an owned completed trip', async () => {
  const calls = []
  const pool = { async query(sql, params) { calls.push({ sql, params }); return { rowCount: 1 } } }
  assert.equal(await deleteTrip(pool, '2', '50'), true)
  assert.match(calls[0].sql, /DELETE FROM cartcheck\.shopping_trips/)
  assert.match(calls[0].sql, /user_id = \$2/)
  assert.match(calls[0].sql, /status = 'completed'/)
  assert.deepEqual(calls[0].params, ['50', '2'])
})

test('deleteTrip reports a missing or foreign trip', async () => {
  const pool = { async query() { return { rowCount: 0 } } }
  assert.equal(await deleteTrip(pool, '2', '7'), false)
})
```

Add `deleteTrip` to the existing import from `./tripRepo.js`.

- [ ] **Step 2: Run** `node --test tripRepo.test.js` (in `server/`). Expected: FAIL, `deleteTrip` is not exported.

- [ ] **Step 3: Implement** `export async function deleteTrip(pool, userId, tripId)` in `server/tripRepo.js`: one `pool.query` — `DELETE FROM cartcheck.shopping_trips WHERE id = $1 AND user_id = $2 AND status = 'completed'` with `[tripId, userId]`; return `result.rowCount > 0`. Single statement, so no transaction (items cascade).

- [ ] **Step 4: Add the route** in `server/server.js`, mirroring `app.delete('/api/lists/:id', …)`:
  `app.delete('/api/trips/:id', checkRequestOrigin, authenticate, …)` → `parseTripId` (400 `'Invalid trip ID'`) → `tripRepo.deleteTrip(pool, request.user.id, id)` false → 404 `'Trip not found'`, else `204`; errors → `next(error)`.

- [ ] **Step 5: Run** `npm test` in `server/`. Expected: all pass (integration tests skip without a DB URL).

- [ ] **Step 6: Commit**

```bash
git add server/tripRepo.js server/tripRepo.test.js server/server.js
git commit -m "feat: delete a finished trip on the server"
```

---

### Task 2: Client — Delete on the history card

**Files:**
- Modify: `client/src/api/httpApi.js` (next to `correctTrip`, line ~88)
- Modify: `client/src/Trips.jsx` (history card, line ~227; new `remove(trip)` near `openTrip`)
- Create: `client/src/tripDelete.test.js` (copy the jsdom + vite `ssrLoadModule` harness header from `finishCache.test.js`, rendering `Trips` inside `DataCacheProvider`)

**Interfaces:**
- Consumes: `DELETE /api/trips/:id` from Task 1.
- Produces: `export const deleteTrip = (id) => request(\`/api/trips/${encodeURIComponent(id)}\`, { method: 'DELETE' })`.

- [ ] **Step 1: Write the failing tests** in `client/src/tripDelete.test.js`. Seed `cache.set('trips', { items: [tripA, tripB], nextCursor: null })` with two summaries (`id`, `name`, `completedAt`, `currency`, counts, `summary`) and stub `fetch` for `/api/trips` and `DELETE /api/trips/a`.
  - `'Delete asks first, then removes the trip'`: click button named `Delete Weekly Groceries` → a group labelled `Delete Weekly Groceries?` with text `Delete “Weekly Groceries” from history? This can’t be undone.` appears; no DELETE call yet. Click `Delete` → card gone at once, exactly one `DELETE /api/trips/a` call, `cache.get('trips').data.items` ids `['b']`, status text `Weekly Groceries deleted.`.
  - `'Keep closes the confirmation'`: click `Delete Weekly Groceries`, then `Keep` → no DELETE call, card still shown.
  - `'A failed delete restores the card in place'`: DELETE returns `500 { error: 'Server error' }` → card back as the first card, alert with the server message, cache ids `['a','b']`.
  - `'Delete is sent once'`: two quick clicks on the confirm `Delete` → one DELETE call.

- [ ] **Step 2: Run** `node --test src/tripDelete.test.js` (in `client/`). Expected: FAIL, no `Delete Weekly Groceries` button.

- [ ] **Step 3: Add `deleteTrip`** to `client/src/api/httpApi.js` (signature above) and import it in `Trips.jsx`.

- [ ] **Step 4: Implement `remove(trip)` in `Trips.jsx`** by copying the shape of `Lists.jsx` `remove()` (lines 156–182): `confirmingId` and `deletingIds` state; `cache.beginMutation('trips')`; optimistically filter the trip out of `'trips'`; on success `cache.invalidate(\`trip:${trip.id}\`)` and `setNotice(\`${trip.name || 'Trip'} deleted.\`)`; on failure splice the saved entry back at its old index and show `caught.message || 'We could not delete this trip.'` in a `role="alert"`; `finally` release and clear `deletingIds`.

- [ ] **Step 5: Render the control** in each `trip-card`, after Shop again, reusing Lists' markup and classes: a `text-button danger` with `aria-label={\`Delete ${trip.name || 'this trip'}\`}` (label `Deleting…` while busy), toggling to `<p className="remove-confirm" role="group" aria-label={\`Delete ${name}?\`}>` with the copy from Step 1 and `catalog-small-button` **Keep** / `catalog-small-button danger` **Delete** (`autoFocus`). Move focus to the `Trips` heading after confirming, since the card disappears.

- [ ] **Step 6: Run** `npm test` and `npm run build` in `client/`. Expected: all pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/src/api/httpApi.js client/src/Trips.jsx client/src/tripDelete.test.js
git commit -m "feat: delete a trip from history"
```

---

### Task 3: Docs + manual check

**Files:**
- Modify: `docs/ARCHITECTURE.md` (API table, after line 112)
- Modify: `PRODUCT.md` §7 (Finish Trip and history)

- [ ] **Step 1:** Add row `| \`DELETE\` | \`/api/trips/:id\` | Delete one completed trip and its item snapshots. 404 for an active list or another account's trip. |`.
- [ ] **Step 2:** In `PRODUCT.md` §7 add: "A finished trip can be deleted from history after an inline confirmation (approved 2026-11-06); this cannot be undone and does not change lists or the catalog."
- [ ] **Step 3:** With both dev servers running, finish a small list, delete that trip in Trips, confirm it is gone after reload, and that the list's "View trip" link now shows "Trip not found".
- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md PRODUCT.md
git commit -m "docs: describe deleting a trip"
```
