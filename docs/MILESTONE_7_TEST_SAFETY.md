# Milestone 7 Supabase development test safeguards

This procedure uses the existing server-side `server/.env` connection. It does not reset or seed the database. Run `node --env-file=.env testIntegrationDev.js` from `server/` only after reviewing the target and test source.

Read-only preflight on 2026-09-28 confirmed a TLS connection through the Supabase session pooler, 7 CartCheck tables, 108 unique starter products, and a retained baseline of 1 user, 108 private products, 1 trip, and 0 trip items. The runner also records exact pre-existing row fingerprints immediately before its own test run.

## Scope established before writes

- The runner accepts only the configured Supabase session pooler URL for the `postgres` database whose pooler username contains the independently pinned `CARTCHECK_TEST_PROJECT_REF` for the approved development project. It rejects production mode and a second test URL, verifies TLS, and checks the Milestone 7 nullable historical product column. The pin is stored in ignored `server/.env`, never in tracked files.
- It generates a fresh UUID run ID and exactly eight `m2/m3/m4/m8-[ab]-<run-id>@example.test` addresses. A read-only query must prove that none exists before any account registration.
- It records all pre-existing account IDs and a SHA-256 fingerprint of their account, session, product, trip, and item rows, plus shared starter products. The fingerprint stays in memory and the ignored recovery manifest; private row contents and credentials are not printed.
- An ignored `server/.test-runs/<run-id>.json` manifest records the exact temporary addresses, protected IDs, and baseline fingerprint before the test subprocess starts. A leftover manifest blocks another run.

## Writes and cleanup

- The four API suites create only the eight named temporary accounts. Their API calls use cookies and catalog/trip/item IDs from those accounts. Cross-account attempts target the other temporary account. Direct SQL mutations in test bodies are scoped to a newly registered account ID, including token expiry and cooldown checks.
- Each suite checks that its two addresses were absent, then cleans up by an exact `id AND email` match. Cleanup first refuses any ID from the protected baseline. It runs in a transaction: it deletes trip items for only those verified temporary IDs before deleting their accounts (required by the product foreign key), checks the number of removed accounts, and verifies that sessions, products, trips, and items for those IDs are gone.
- The runner repeats exact cleanup after the test subprocess exits, including on assertion failure or an ordinary interruption. It verifies that the pre-existing row fingerprint and account-ID set match their baseline before removing the recovery manifest. A failed cleanup or comparison leaves the manifest for investigation; no broad delete is attempted.

## Limits

Abrupt host loss cannot run process cleanup. The manifest provides the exact run ID and addresses for a later, reviewed recovery. Do not delete accounts from a manifest until verifying their IDs, emails, creation context, and absence from the protected ID list. An unrelated user changing existing data during the run can make the fingerprint comparison fail; treat that as a stop condition and investigate.

## Authenticated browser walkthrough

Run `node --env-file=.env browserTestGuard.js --prepare` from `server/` before registering a browser account. It checks the same pinned development project identity, records the current protected account IDs and row fingerprint in an ignored recovery manifest, and prints one unique `m7-browser-<run-id>@example.test` address, which must be absent from the database. Use only that address in the local app; keep its password temporary and out of the repository.

After the walkthrough, run `browserTestGuard.js --inspect <run-id>` to confirm the account and its dependent row counts. Then run `browserTestGuard.js --cleanup <run-id>` to remove only that exact account ID/email and its owned item rows, verify all dependent rows are gone, and compare the original protected fingerprint and account-ID set. The manifest is removed only after those checks pass. A leftover manifest blocks another guarded test run.

The first guarded run failed during direct test-client TLS setup and verified no account changes. The next run passed the account and catalog suites but exposed an ordering bug in cleanup: a temporary cart item blocked deletion of its temporary product. The recovery manifest identified two temporary accounts; read-only inspection confirmed the protected fingerprint, and exact-ID recovery removed their 3 items, 3 trips, 216 products, and 2 sessions. The protected fingerprint and account set matched afterward. Cleanup now deletes verified temporary trip items first.

Final guarded run `250f2779-e6fe-4954-b18a-1f1c8b29d520` passed all three API integration suites. The runner removed its temporary records, found the protected fingerprint and account IDs unchanged, and removed its manifest. A subsequent read-only preflight confirmed the original totals: 1 user, 108 private products, 1 trip, and 0 items, alongside 108 unique starter products. No other test data was deleted.

Browser run `2628e966-cf1d-466c-bc30-187bd39fffe5` completed registration, sign-out/sign-in, item entry and purchase toggles, optional prices/budget, finish review, empty new list, history/details, historical price correction, and persistence after refresh. Desktop and 390 px mobile layouts were inspected; invalid-password and loading states were observed. Exact cleanup removed its one account and owned rows, and the protected fingerprint/account IDs matched the original baseline. No manifest remains. The project identity pin and stricter history cursor validation were added in final review; their focused tests passed without rerunning the database suites.

## Milestone 8 extension (2026-09-29)

The runner now reserves two additional `m8-[ab]-<run-id>@example.test` addresses and checks that migration `003_account_enhancements.sql` is present before tests. The account enhancement case exercises verification and password reset token expiry/replay, email cooldown, session revocation, password changes, and legacy-account exemption. It also checks that known and unknown forgot-password requests return the same generic response. The development email sink accepts message types without sending mail or exposing links; real inbox delivery remains unverified.

The reviewed migration was applied to the pinned development database. The final guarded integration run `55725713-d192-40e9-a03a-7a351cfe02d6` passed all four API cases, removed all temporary accounts, and matched the protected-row fingerprint and account set. A final read-only preflight reported 9 CartCheck tables, 108 unique starter products, and the original retained counts of 1 user, 108 private products, 1 trip, and 0 trip items. No recovery manifest remains.
