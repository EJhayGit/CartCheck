# Performance and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repeat visits load instantly and make page switches and row removals move smoothly, without changing what the app does.

**Architecture:** Express sets long-lived cache headers on Vite's content-hashed files only. One small client helper wraps React state updates in the browser's View Transitions API (`document.startViewTransition`). Navigation uses it for page crossfades, and the three delete flows use it so the removed card fades and its neighbours slide into place. The password meter chunk is fetched while the sign-in screen is idle.

**Tech Stack:** Express 4 `express.static`, React 18 (`flushSync` from `react-dom`), CSS View Transitions, Vite 6, `node --test` with jsdom.

**Spec:** No written spec. This plan implements the four findings approved in chat on 2026-11-06:
1. Immutable caching for hashed `/assets` files (live site currently sends `Cache-Control: public, max-age=0` for them).
2. Smooth page switches via `startViewTransition` in `navigate()`.
3. Animate removed rows (trip card, list card, shopping item) instead of a hard jump.
4. The 393 kB (gzip) zxcvbn chunk. **Deviation:** the plan keeps zxcvbn and prefetches it. A smaller home-grown checker would lose the pattern checks that `passwordStrength.test.js` pins (for example, `Qwerty123!` and `CartCheck2026!` must not rate Strong).

## Global Constraints

- No new dependencies in either package.
- Motion: "transitions stay short (0.16–0.2s ease)" and "honor `prefers-reduced-motion`" (DESIGN.md). Use `var(--ease-out)` from `client/src/styles.css`.
- Browsers without `document.startViewTransition` (and jsdom) behave exactly as today.
- `/api` keeps `Cache-Control: no-store`. `index.html` and the SPA fallback must never get a long max-age, or deploys will not reach users.
- Run `npm test` in `server/` and `client/` plus `npm run build` in `client/` before each commit. Never run `server/testIntegrationDev.js`.
- Update the doc that describes a changed behaviour in the same commit (AGENTS.md).

## Review Focus

1. **Fast request failure during a transition.** `startViewTransition` runs its callback on a later frame. If an offline `fetch` rejects before that, the rollback could run before the optimistic removal and the row would be lost. The helper therefore returns a promise that resolves after the update ran, and callers `await` it before sending the request (test in Task 2, used in Task 3).
2. **Reduced motion.** With `prefers-reduced-motion: reduce`, the helper skips the transition and updates synchronously (test in Task 2).
3. **Old browsers / jsdom.** Without `startViewTransition` the update runs synchronously, so every existing UI test keeps passing unchanged (test in Task 2; full `npm test` in Tasks 2–3).
4. **Deploy freshness.** A new deploy must still be picked up: `index.html` is served `no-cache`, and only files under `assets/` are `immutable` (test in Task 1).
5. **Duplicate `view-transition-name`.** Two elements with the same name abort the transition. Names are prefixed per kind (`list-`, `trip-`, `item-`) and use the row id, which is unique on each screen (checked manually in Task 3, step 5).

---

### Task 1: Long-lived caching for hashed client assets

**Files:**
- Create: `server/staticCache.js`
- Create: `server/staticCache.test.js`
- Modify: `server/server.js:52` (the `express.static` options)
- Modify: `server/server.js` SPA fallback (`response.sendFile(clientIndex)`, near line 571)
- Modify: `docs/ARCHITECTURE.md` (next to the existing "All `/api` responses carry `Cache-Control: no-store`" sentence)

**Interfaces:**
- Produces: `setStaticCacheHeaders(response, filePath: string): void`, which calls `response.setHeader('Cache-Control', value)`.

- [ ] **Step 1: Write the failing test** in `server/staticCache.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { setStaticCacheHeaders } from './staticCache.js'

function headersFor(filePath) {
  const headers = {}
  setStaticCacheHeaders({ setHeader: (name, value) => { headers[name] = value } }, filePath)
  return headers
}

test('hashed build assets are cached for a year and never revalidated', () => {
  assert.equal(headersFor(join('client', 'dist', 'assets', 'index-6x7MCJ8y.js'))['Cache-Control'], 'public, max-age=31536000, immutable')
})

test('index.html and other root files are always revalidated', () => {
  assert.equal(headersFor(join('client', 'dist', 'index.html'))['Cache-Control'], 'no-cache')
  assert.equal(headersFor(join('client', 'dist', 'favicon.svg'))['Cache-Control'], 'no-cache')
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run (in `server/`): `node --test staticCache.test.js`
Expected: FAIL, cannot find module `./staticCache.js`.

- [ ] **Step 3: Implement `setStaticCacheHeaders` in `server/staticCache.js`**

The immutable rule applies when the path's parent directory name is `assets` (use `basename(dirname(filePath))`, which works with Windows and POSIX separators). Every other file gets `no-cache`. Add a one-line comment saying Vite puts a content hash in every file name under `assets/`.

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test staticCache.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the server**

In `server/server.js`, change line 52 to `express.static(clientDist, { index: false, setHeaders: setStaticCacheHeaders })`. In the SPA fallback, call `response.set('Cache-Control', 'no-cache')` before `sendFile(clientIndex)` so that `sendFile`'s default `max-age=0` is replaced. Add one sentence to `docs/ARCHITECTURE.md`: hashed `/assets/*` files are `public, max-age=31536000, immutable`; `index.html` and the SPA fallback are `no-cache`.

- [ ] **Step 6: Verify the full server suite**

Run (in `server/`): `npm test`
Expected: all pass (integration tests report skipped without a database URL).

- [ ] **Step 7: Commit**

```bash
git add server/staticCache.js server/staticCache.test.js server/server.js docs/ARCHITECTURE.md
git commit -m "perf: cache hashed client assets for a year"
```

---

### Task 2: View-transition helper and page-switch crossfade

**Files:**
- Create: `client/src/viewTransition.js`
- Create: `client/src/viewTransition.test.js`
- Modify: `client/src/App.jsx:87-102` (`navigate` and the `popstate` handler)
- Modify: `client/src/styles.css` (new `::view-transition-*` rules, and the existing reduced-motion block at line 516)
- Modify: `DESIGN.md` (motion bullet near line 276)

**Interfaces:**
- Produces: `withViewTransition(update: () => void, doc = globalThis.document): Promise<void>`. When it resolves, `update` has run and React has committed it.
  - No `doc`, no `doc.startViewTransition`, or `doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches` is true → call `update()` synchronously and return `Promise.resolve()`.
  - Otherwise → `doc.startViewTransition(() => flushSync(update))` and return that transition's `updateCallbackDone`.

- [ ] **Step 1: Write the failing tests** in `client/src/viewTransition.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { withViewTransition } from './viewTransition.js'

const view = (reduce) => ({ matchMedia: () => ({ matches: reduce }) })

test('without the View Transitions API the update runs synchronously', async () => {
  let ran = 0
  const done = withViewTransition(() => { ran += 1 }, { defaultView: view(false) })
  assert.equal(ran, 1)
  await done
})

test('with the API the update runs inside startViewTransition and the promise waits for it', async () => {
  let ran = 0
  let pending
  const doc = { defaultView: view(false), startViewTransition(callback) {
    pending = Promise.resolve().then(callback)
    return { updateCallbackDone: pending }
  } }
  const done = withViewTransition(() => { ran += 1 }, doc)
  assert.equal(ran, 0)
  await done
  assert.equal(ran, 1)
})

test('reduced motion skips the transition', () => {
  let started = false
  let ran = 0
  withViewTransition(() => { ran += 1 }, { defaultView: view(true), startViewTransition() { started = true } })
  assert.equal(started, false)
  assert.equal(ran, 1)
})

test('no document at all still runs the update', () => {
  let ran = 0
  withViewTransition(() => { ran += 1 }, undefined)
  assert.equal(ran, 1)
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run (in `client/`): `node --test src/viewTransition.test.js`
Expected: FAIL, cannot find module `./viewTransition.js`.

- [ ] **Step 3: Implement `withViewTransition` in `client/src/viewTransition.js`** as the Interfaces block describes. Import `flushSync` from `react-dom`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `node --test src/viewTransition.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Use it for navigation in `client/src/App.jsx`**

In `navigate`, keep `history.pushState`/`replaceState` outside the helper. Wrap `setFlash(nextFlash)` and `setRoute(...)` together in `withViewTransition(() => { ... })`. In the `popstate` handler, wrap `setCatalogVisited`/`setRoute` the same way. Do not await the helper in these two places: navigation has no rollback.

- [ ] **Step 6: Add the page crossfade CSS** to `client/src/styles.css`

```css
::view-transition-old(root), ::view-transition-new(root) { animation-duration: .18s; animation-timing-function: var(--ease-out); }
::view-transition-group(*) { animation-duration: .2s; animation-timing-function: var(--ease-out); }
```

Inside the existing `@media (prefers-reduced-motion: reduce)` block, add `::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }`. Update the DESIGN.md motion bullet: page switches crossfade in about 0.18s where the browser supports View Transitions, and switch instantly otherwise or under reduced motion.

- [ ] **Step 7: Verify**

Run (in `client/`): `npm test` → all pass (jsdom has no `startViewTransition`, so existing route tests take the synchronous path).
Run: `npm run build` → succeeds.
Manual: start the `client` and `server` dev servers and switch between My Lists, Trips and Settings in Chrome. The screens crossfade, back/forward also crossfades, and with reduced motion emulated in DevTools the switch is instant.

- [ ] **Step 8: Commit**

```bash
git add client/src/viewTransition.js client/src/viewTransition.test.js client/src/App.jsx client/src/styles.css DESIGN.md
git commit -m "feat: crossfade page switches with view transitions"
```

---

### Task 3: Animate row removal on lists, trips and shopping items

**Files:**
- Modify: `client/src/Lists.jsx:166` (optimistic `cache.set('lists', …)` in the delete handler) and `:218` (`<article className="list-card">`)
- Modify: `client/src/Trips.jsx:132` (optimistic `cache.set('trips', …)`) and `:259` (`<article className="trip-card">`)
- Modify: `client/src/ShoppingList.jsx:402-404` (`setItems` filter, `setEditor(null)`, `setConfirmRemove(false)`) and `:635` (`<li className="shopping-item…">`)
- Modify: `DESIGN.md` (same motion bullet as Task 2)

**Interfaces:**
- Consumes: `withViewTransition(update): Promise<void>` from Task 2.

- [ ] **Step 1: Wrap each optimistic removal**

In each of the three delete handlers, replace the optimistic removal statements with `await withViewTransition(() => { /* the same statements */ })`, placed before the existing `try { await delete… }`. Leave everything else in the handlers unchanged: the rollback code, `beginMutation`/`release`, `setDeletingIds`, and focus handling. The `await` is what Review Focus item 1 requires.

- [ ] **Step 2: Name the rows**

Add `style={{ viewTransitionName: \`list-${list.id}\` }}` to the list card, `trip-${trip.id}` to the trip card, and `item-${item.id}` to the shopping item `<li>`. The browser then animates the removed row out and slides its siblings into place.

- [ ] **Step 3: Run the affected UI tests**

Run (in `client/`): `node --test src/tripDelete.test.js src/listsRoutes.test.js src/shoppingUx.test.js src/cacheBehavior.test.js`
Expected: PASS. These tests cover optimistic delete and rollback; in jsdom the helper is synchronous, so behaviour is unchanged.

- [ ] **Step 4: Full suite and build**

Run: `npm test` and `npm run build` in `client/`. Expected: all pass, build succeeds.

- [ ] **Step 5: Manual check in Chrome (dev servers running)**

Delete a trip, a list and a shopping item. Each row fades out and the rows below slide up in about 0.2s, with no console error mentioning a duplicate `view-transition-name`. Set DevTools offline and delete again: the row returns and the error shows (rollback still works). Emulate reduced motion: removal is instant. Add a sentence to the DESIGN.md motion bullet: removed cards and rows fade out while the rest slide up.

- [ ] **Step 6: Commit**

```bash
git add client/src/Lists.jsx client/src/Trips.jsx client/src/ShoppingList.jsx DESIGN.md
git commit -m "feat: animate removed lists, trips and items"
```

---

### Task 4: Prefetch the password meter before sign-up

**Files:**
- Modify: `client/src/AuthUI.jsx:5-8`
- Modify: `client/src/App.jsx` (the signed-out auth screen)

**Interfaces:**
- Produces: `preloadPasswordMeter(): void` exported from `client/src/AuthUI.jsx`. It calls the same `import('./PasswordStrength.jsx')` that the `lazy()` loader uses, and catches its rejection (a failed prefetch is harmless; the `lazy()` render will retry).

- [ ] **Step 1: Share the loader**

In `AuthUI.jsx`, assign `const loadStrength = () => import('./PasswordStrength.jsx')`. Use it for `lazy(loadStrength)`, and export `preloadPasswordMeter` as defined above.

- [ ] **Step 2: Prefetch when idle on the signed-out screen**

In `App.jsx`, add an effect that runs while the sign-in/register screen is showing (`!user` and `status !== 'loading'`). It schedules `preloadPasswordMeter` with `window.requestIdleCallback` when available, otherwise `setTimeout(…, 2000)`, and cancels it in the cleanup. Signed-in users never download the chunk.

- [ ] **Step 3: Verify**

Run (in `client/`): `npm test` → `authBehavior.test.js` and `passwordStrength.test.js` pass unchanged.
Run: `npm run build` → still emits a separate `PasswordStrength-*.js` chunk (it must not merge into `index-*.js`).
Manual: open the sign-in screen with the DevTools Network tab open. `PasswordStrength-*.js` loads after the page is idle, and opening Create account shows the meter immediately.

- [ ] **Step 4: Commit**

```bash
git add client/src/AuthUI.jsx client/src/App.jsx
git commit -m "perf: prefetch the password meter on the sign-in screen"
```

---

## Final check

- [ ] `npm test` in `server/` and `client/`, plus `npm run build` in `client/`, all green.
- [ ] After deploying, run `curl -sI https://cartcheck.merzbuilds.dev/assets/<current index js>` and confirm `Cache-Control: public, max-age=31536000, immutable`. Run `curl -sI https://cartcheck.merzbuilds.dev/` and confirm `Cache-Control: no-cache`.
