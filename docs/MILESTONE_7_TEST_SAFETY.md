# Guarded database integration testing

This procedure uses the existing server-side `server/.env` connection. It does not reset or seed the database. Run `node --env-file=.env testIntegrationDev.js` from `server/` only after reviewing the target and test source.

Ordinary `npm test` runs do not authorize tests against a retained database. Review the configured target and obtain approval before any test writes.

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
