# Client cache and navigation review

Local implementation reviewed October 4, 2026. No commit, push, or deployment.

## 1. Previous fetching behavior

- Shopping List owned its cart data locally, fetched on mount/retry, and fetched again before Finish review. Existing list mutations already used optimistic updates.
- Catalog remained mounted after its first visit, but search/category changes triggered a new GET after a 250ms search debounce. Loading/errors suppressed the results even when previous data existed.
- Trips unmounted on navigation, losing summaries and details. Returning fetched the first history page again; reopening a detail fetched it again. These reads lacked cancellation/version guards.
- Settings and account preferences already lived in App. Session restoration preceded private content. Only Catalog supported abort signals. Concurrent identical reads were not coordinated across screens.

## 2. New ownership and architecture

`dataCache.js` owns an in-memory resource store; `dataCache.jsx` exposes it through a private-session provider and `useSyncExternalStore`. Each resource has data, freshness, error, subscribers, an in-flight promise, an AbortController, mutation locks, and a request version. Identical reads join one promise. Writes cancel older reads; version guards also reject late results from transports that ignore cancellation.

App creates a new store for each account/session generation and private-view lifetime. Leaving that lifetime aborts reads and clears entries/subscriptions. Same-account logout/login starts cold. Nothing is written to browser storage. Settings retain their existing App ownership. Existing mounted Shopping/Catalog screens preserve forms and filters; Trips can unmount freely because its data belongs to the store.

## 3. Dependency decision

TanStack Query was evaluated but not installed. Three initial collections and bounded lazy details fit a small store while preserving the existing API facade and mutation/revision contracts. TanStack Query becomes worth reconsidering if resource families, retry policies, or dependent queries grow. No Redux or new dependency was introduced.

## 4. Prefetch

After verified authentication/session restoration, active cart, complete accessible catalog, and the first history-summary page start concurrently. Cart rendering does not await the other collections. Historical item details and later history pages are fetched only when requested. The initial session request is shared across React StrictMode effect replay; explicit retries and recovery checks still use fresh requests.

## 5. Navigation

Warm Shopping List, Catalog, Trips summaries, and Settings render immediately. Trips details render immediately after their first successful load. A stale resource can revalidate without replacing the current view. Catalog filters and shopping UI state continue to survive navigation as before; unsaved historical corrections retain the existing screen-local lifetime.

## 6. Catalog search

The client fetches the complete collection once and normalizes name/category strings when the collection changes. Keystrokes filter that collection immediately, case-insensitively, with literal substring matching and the existing exact category filter. The 250ms debounce and per-search GETs are removed. The server search endpoint remains available. Search has no network loading state.

## 7. Lifetime and invalidation

| Resource | Policy |
| --- | --- |
| Active cart, including trip metadata/items/budget | 30-second freshness; reconcile local mutations; explicit refresh; always fetch before Finish review |
| Full catalog | Session lifetime; reconcile create/edit/delete; explicit Refresh |
| History summaries | 30-second freshness; first page prefetched; append later pages on demand |
| Trip details | Lazy session cache, capped at 30 inactive/active entries when eviction is possible; explicit retry/reload and correction reconciliation |
| Account preferences | Existing authenticated App state and confirmed settings response |

Failed optimistic mutations restore the previous value and mark the resource stale for a future read. No whole-list refetch follows a successful small mutation. Disposal clears every resource. No polling timer is used.

## 8. Background revalidation

Stale cart/history reads run on screen entry or window focus/connection restoration. Fresh reads are skipped and concurrent reads are deduplicated. Catalog stays cached until an explicit refresh or mutation. Errors retain usable data with retry feedback. Loaded history pages remain visible when the oldest row of a refreshed head bridges into them; otherwise pagination restarts to avoid skipping intervening trips from another session, including an isolated locally completed trip. Late pagination results cannot append to a changed cursor chain.

## 9. Mutation correctness

Purchase status, submitted item quantity/name/prices, budget, catalog edits, and confirmed deletes update the shared cache optimistically, then reconcile or roll back. Quantity keeps the established explicit Save form; this pass does not change its persistence interaction. New catalog/cart identities and Finish/correction outcomes wait for server confirmation.

Finish review still requires a fresh GET because small mutation responses do not include the cart revision. The exact reviewed cart is locked against background replacement until review closes. Finish replaces the active cart and inserts the confirmed completed detail/summary. Corrections submit the revision captured when editing began, update detail/summary from the server response, and preserve edits when saving or subsequent reload fails. Existing server conflict, currency, totals, duplicate-add, and duplicate-finish behavior remain authoritative.

## 10. Request reductions observed

- StrictMode startup tests observe one GET per private collection instead of competing identical reads.
- Typing `m`, `mi`, `mil`, `milk` and changing category produce **zero additional catalog requests** after the initial collection load.
- Automated repeated warm screen navigation produces **zero additional collection GETs within the freshness period**, including when subsequent transport reads would fail offline.
- Opening, closing, and reopening a saved trip produces one detail GET.
- Browser fixture started with four requests (session plus three collections). Offline category/name filtering and a rapid navigation loop retained content without search requests. Later stale cart/history visits added background reads as intended; explicit catalog refresh added one GET and retained Milk after a delayed 503.

These are request-count observations, not production latency or throughput benchmarks.

Performance review: subscriptions are per resource, so catalog writes do not notify cart/history subscribers. Search normalization is memoized per collection rather than per keystroke; no artificial timer remains. Details are bounded, while summary pagination grows only when the user requests pages. Cleanup removes focus/online listeners and subscriptions, aborts requests, and prevents late writes. Query callers handle rejected promises. No profiler benchmark was taken; the small collection does not justify additional render optimization.

## 11. Verification

Automated cache/unit and rendered App/component tests cover parallel startup, StrictMode deduplication, local search, warm offline navigation, lazy detail reuse, pagination retry, optimistic catalog/cart rollback, stale failed refresh, mutation locks and out-of-order GETs, account lifetime clearing, logout aborts, bounded details, completed summary updates, correction reload failure, history head overlap/disjoint pagination, and fresh Finish revision behavior.

The isolated `tools/cache-preview.html` runs the real App with local mocked responses. Browser checks exercised normal transport, offline after warm load, a three-second response delay, repeated navigation, name/category filtering, and delayed refresh failure. The delay/deferred-response checks simulate slow transport; a real browser Slow 3G bandwidth profile and production backend were not exercised. No production data was touched.

Proof of cached results after refresh failure: [screenshot](design/cache-preview/cached-refresh-error.jpg).

## 12. Results

Final `npm test`: **60/60 passed** (21 cache/performance/Finish tests plus the existing 39). Focused cache suites: 20/20 passed; focused Finish cache test: 1/1 passed. `npm run build`: passed. `git diff --check`: passed. The existing password-strength bundle remains 820.65 kB and triggers Vite's size warning. Concurrent Vite test/preview servers also report a non-fatal WebSocket port 24678 conflict; all test assertions and builds pass.

Read-only specialist review found two issues during implementation: failed reload discarding correction drafts and history pagination gaps after a new head. Both were fixed and regression-tested; follow-up review found no additional actionable issues.

## 13. Necessary remaining waits

Session restoration, the first uncached collection/detail, requested later history pages, and server-confirmed create/Finish/correction actions still need network responses. Finish preparation intentionally refreshes the server revision. Offline cached browsing/search works; offline mutations cannot be confirmed as persisted. Reloading the browser starts a new cache and fetches authoritative server data.
