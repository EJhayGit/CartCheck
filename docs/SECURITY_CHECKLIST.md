# Security and privacy checklist

**Reviewed:** October 9, 2026 (local release candidate). **Scope:** Repository review, isolated PostgreSQL tests, fresh dependency audits, and read-only production checks. No production settings or data were changed. Local changes await release approval.

Checked items have the evidence stated below. Unchecked items are open maintenance work or controls whose current deployment status has not been established. Project completion does not close ongoing security maintenance.

## Repository and secrets

- [x] `.env`, local certificates, database dumps, generated test evidence, `log.md`, and `archive/` are excluded by [.gitignore](../.gitignore).
- [x] Tracked-path checks found no `.env` files, PEM/CRT certificates, `id_rsa` files, or `student.json`.
- [x] Committed environment examples contain development placeholders, not deployed credentials. Secrets belong in the server environment; `VITE_` variables are public.
- [x] Historical screenshots/reports and private release evidence are excluded from the current public tree; runtime brand assets remain public.
- [ ] Complete an automated secret scan of the full Git history and review previously published images. Path checks and archiving do not prove historical content is free of secrets. Rotate any exposed credential; deleting its file is insufficient.

## Accounts and sessions

- [x] Passwords use bcrypt with cost 12. New-password validation enforces the minimum length and bcrypt's 72-byte UTF-8 limit. See [routes](../server/server.js) and [validation](../server/authValidation.js).
- [x] Login sessions use cryptographically random tokens; only SHA-256 token hashes are stored in PostgreSQL. Session lookup checks expiry. See [session helpers](../server/authSecurity.js) and [account repository](../server/authRepo.js).
- [x] Session cookies are `HttpOnly` and `SameSite=Lax`; the code adds `Secure` in production and expires the cookie on logout. Focused tests cover production-cookie attributes.
- [x] Password reset/change revokes account sessions. Verification/reset action tokens are hashed, expiring, purpose-specific, and single-use; email cooldowns are persisted.
- [x] Recovery endpoints use generic account messages and email failures omit recipients, token links, and provider details from logs.
- [x] Account mutation routes use an IP-based limiter and origin checks. The limiter returns 429 and a Retry-After header.
- [ ] Verify the production proxy topology and `NODE_ENV=production` after every deployment. `trust proxy` is configured for one hop; forwarded headers must match the actual hosting path.
- [ ] Strengthen abuse controls for larger usage: the auth limiter is process-local, and general grocery API quotas/rate limits are not implemented.

## API and private shopper data

- [x] Private catalog, list, item, and history routes authenticate the request. Repository reads/writes constrain resources by account ownership; list-item operations also constrain the selected parent list.
- [x] Recorded October 6 production checks returned 404 for cross-account list/item read and mutation attempts, including finish/delete. This is dated evidence, not a new live test.
- [x] Repositories bind user-supplied SQL values as parameters. Dynamic SQL fragments are assembled from controlled fields rather than raw input. See [list repository](../server/listRepo.js) and [trip repository](../server/tripRepo.js).
- [x] Server validators check IDs, fields, lengths, currency, quantities, prices, revisions, and pagination input. JSON request bodies are limited to 100 KB.
- [x] CORS uses an explicit allowed-origin list with credentials. Mutation origin checks reject missing, null, or unapproved origins.
- [x] Helmet supplies security headers; API errors return generic JSON instead of SQL details or stack traces.
- [x] Finish/correction transactions lock the owned trip and validate its revision. Independent lists and historical snapshots retain ownership and integrity constraints.
- [x] The client uses React text rendering rather than `dangerouslySetInnerHTML` for shopper content. Private cache data is cleared when the account session changes; local storage contains the appearance preference, not session tokens.

## Database and deployment

- [x] The browser accesses Express APIs; database credentials stay server-side. App tables use the `cartcheck` schema.
- [x] Hosted PostgreSQL connections verify TLS certificates. Configuration rejects URL options that could override TLS settings; local disposable PostgreSQL may use no TLS. See [database configuration](../server/db/config.js).
- [x] The recorded October 6 production walkthrough confirmed HTTPS, process health, database readiness, and the intended multiple-list schema. Those checks were not rerun for this document.
- [ ] Verify current Supabase exposed schemas and role grants. Keep internal tables outside the Data API surface; if objects are deliberately exposed, apply least-privilege grants and matching row-level policies. See [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api).
- [ ] Verify current production cookie/header behavior, allowed origins, database role privileges, and that intermediaries do not cache personalized API responses.
- [ ] Test a recoverable backup/restore procedure on an isolated database. A private export exists in the development record, but a successful full restore is not established.
- [ ] Verify real inbox delivery, sender authentication, recovery links, and delivery failures before enabling required email verification. See [email setup](ACCOUNT_EMAIL_SETUP.md).

## Dependency audit — October 7, 2026

- [x] Ran `npm audit --omit=dev --json` in `server/` and `npm audit --json` in `client/` against the installed dependency trees. Both commands returned advisory findings.
- [ ] Update affected dependencies, rerun tests/build/audits, and release the reviewed fixes. No dependency update or deployment was performed while writing this checklist.

| Dependency | Audit severity | Finding and scope |
| --- | --- | --- |
| `proxy-addr` | Critical | Server transitive dependency. [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) describes IP spoofing with specific misconfigured trust subnets; patched in 2.0.8. CartCheck uses numeric one-hop trust, so the described subnet condition was not demonstrated here. The audit still reports an affected version. |
| `source-map-js` | High | Client transitive dependency. [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) describes denial of service while consuming crafted indexed source maps. Check toolchain exposure and update the affected dependency; no exploit or deployed impact was demonstrated here. |

The October 4 audit recorded zero known advisories at that time. The fresh findings supersede that result for this review. Advisory severity is not proof that the deployed application is exploitable.

## Privacy and retention

- [x] Shared seed records describe groceries and categories without real shopper identities. Account emails, password hashes, sessions, private catalog entries, lists, and trip history are stored behind the API.
- [x] Public verification records omit credentials, account identifiers, and private database row contents; detailed test evidence stays ignored locally.
- [x] Temporary test data uses generated test addresses and guarded cleanup. Retained smoke-test records require owner authorization; this checklist does not authorize deletion of any account or shopper data.
- [ ] Confirm that the application presents a user-facing explanation of collected data, purpose, retention, and a contact/deletion process. Public engineering documentation is not a substitute for that notice.
- [ ] Establish retention and account-data deletion procedures, including backups and email-provider records. Do not erase real users or retained test accounts merely to complete a checklist.

## Evidence and limits

### October 9 release-candidate checks

- Patched only the compatible transitive lockfile entries: Express → `proxy-addr` 2.0.7 → 2.0.8, and Vite → PostCSS → `source-map-js` 1.2.1 → 1.2.2. Fresh server production and complete client audits returned zero known advisories. These are local results; the running production commit still predates these fixes. The dated October 7 findings below remain historical evidence.
- A security review found a cross-tab session mismatch: a tab displaying account A could use a shared cookie changed to B. The release candidate revalidates session identity before background refresh, clears private caches on session-change signals or private authentication failures, and sends the rendered account identity for server validation before private operations. `/api` responses now explicitly use `Cache-Control: no-store`. Release and focused regression verification are required before calling these deployed controls.
- Read-only Supabase inspection confirmed that `anon` and `authenticated` lack schema USAGE and SELECT/INSERT/UPDATE/DELETE access to all internal `cartcheck` tables. RLS is disabled in that private schema; lack of browser grants is the verified boundary. No RLS or grant change was made. The actual exposed-schema dashboard setting and the production application's connection role remain unverified.
- Supabase's advisor reports public execute privileges on `public.rls_auto_enable()`. Inspection shows this is the provider's `ensure_rls` event-trigger function, returning `event_trigger` with `search_path=pg_catalog`, rather than an ordinary application RPC. Its body enables RLS for newly created public tables. This warning does not establish access to private shopper tables. Do not invoke it through an RPC or modify provider grants merely to silence the warning. Any proposed privilege change needs separate compatibility review and approval. See the [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- Current read-only HTTPS checks returned 200 for `/healthz` and `/readyz`, and 401 for unauthenticated `/api/auth/me`. Render is live at `8f127a3` with auto-deploy off. Production cookie attributes, proxy/header topology, actual verification environment value, and real inbox delivery were not reverified.
- The older private application export restored successfully into an isolated database with all rows equal, migration checksums verified, constraints validated, and sequences restored. See [backup scope and limits](BACKUP_RECOVERY.md). This does not verify a fresh production backup or full provider-level disaster recovery.

The checklist's earlier checked controls retain their stated evidence. Open controls above remain open unless this section explicitly supplies current evidence; local fixes do not establish production deployment.

On October 7, 15 focused tests passed using:

```powershell
cd server
node --test authSecurity.test.js authValidation.test.js accountLinks.test.js listValidation.test.js db/config.test.js
```

Tracked-path and Git-ignore checks passed, and the two dependency audits reported the findings above. [AI usage](../AI-USAGE.md) records the broader historical implementation and verification trail; [test safety](MILESTONE_7_TEST_SAFETY.md) describes guarded database testing.

This checklist is a maintained control record, not a penetration-test certificate, legal compliance opinion, or guarantee of security. Open items are stated explicitly so later verification can close them with evidence.
