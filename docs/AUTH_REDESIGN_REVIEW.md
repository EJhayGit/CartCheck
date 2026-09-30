# Authentication redesign review — 30 September 2026

Status: implemented and reviewed locally. The user authorized pushing to main on 30 September 2026. Deployment remains disabled. Production settings, credentials, accounts, emails, and shopping data were not changed.

## Reference research

- [Dropbox login](https://www.dropbox.com/login): browser inspection showed a compact white authentication card, a clear title, email label, prominent Continue button, and generous field spacing. The initial screen is email-first and includes social providers. No credentials were entered, so subsequent password, registration, validation, hover, or recovery behavior is unverified. CartCheck keeps its direct email/password flow and does not add social sign-in. Screenshot: `design/auth-preview/reference-dropbox-desktop.jpg`.
- [Etsy](https://www.etsy.com/): the web reader returned the homepage and its Sign in entry. The interactive browser was blocked by a DataDome device check. Its authentication form, validation, focus, visibility controls, and responsive behavior could not be inspected. No authentication design claims are based on Etsy, and the challenge was not bypassed.

## Logo and design

The reused production asset is `client/public/cartcheck-logo-on-dark.svg`. Related existing originals are in `docs/design/prototype/brand/`; no replacement was generated. The production asset is rendered on the dark brand panel on desktop and a compact dark logo surface on mobile.

The approved canvas `#F4F7F4`, white surfaces, text `#172B26`, and primary `#176B45` remain. Authentication uses a two-column desktop layout, a welcoming product introduction, and an aria-hidden static grocery checklist with no interactive controls. Below 760 px, decorative content is hidden and the form takes priority. Account cards use 20–24 px corners; shared controls use 12 px and application cards 18 px, with restrained shadows, hover transitions, and existing visible focus/reduced-motion rules. Shopping structure and business behavior are preserved.

Sign-in, registration, verification, recovery, reset, and settings password-change forms reuse the visibility field component. Registration preserves email on errors and mode switches. Confirmation errors are inline, associated with their fields, and focus the invalid field on submission. Passwords are hidden by default; toggle buttons do not submit and return focus to the original input. Password-manager autocomplete is preserved.

## Password policy

The backend already enforced a minimum of 8 for new passwords and a 72 UTF-8-byte maximum. This change makes creation policy explicit across registration/reset/change, and counts the minimum as eight Unicode code points instead of UTF-16 units. Four emoji no longer incorrectly count as eight characters. Frontend and backend agree; eight and ten ASCII characters are accepted.

The existing bcrypt implementation remains. New passwords over 72 UTF-8 bytes are rejected with an explanatory error instead of being silently truncated. This allows 72 ASCII characters, 36 two-byte characters, or 18 four-byte emoji. No maximum HTML length silently clips input. Sign-in and current-password checks retain their previous nonempty/72-byte validation; the new minimum is not applied retroactively to login. Confirm Password is kept only in component state, cleared when appropriate, and omitted from API requests.

## Strength meter and dependency impact

The established [Dropbox zxcvbn estimator](https://github.com/dropbox/zxcvbn) runs locally. It recognizes common words/passwords, repetitions, sequences, keyboard patterns, and predictable substitutions; email and CartCheck are supplied as local guessable context. No external strength API, telemetry, or password logging was added. Only a label, level, and guidance leave the estimator wrapper; its result containing the password is not retained.

Scores 0–1 map to Weak, 2 to Fair, 3 to Good, and 4 to Strong. Under eight characters stays Weak; Strong additionally requires at least twelve code points. This is informative and never a registration requirement. The rating/bar updates immediately; only screen-reader announcements are delayed 600 ms and change with the rating. Reserved space avoids movement of the confirmation field, including at 320 px.

Production build: main JS 209.48 KB / 63.25 KB gzip; the lazy registration-only estimator chunk is 820.65 KB / 393.09 KB gzip. This is a material download cost and triggers Vite's >500 KB chunk warning. It was chosen for established pattern-aware scoring and isolated from ordinary sign-in/shopping. Development-only jsdom and Testing Library dependencies support meaningful DOM tests and are excluded from the production bundle.

## Mandatory verification findings

Inspection confirms server-side enforcement when `REQUIRE_VERIFIED_EMAIL=true`. The setting was not changed. New accounts explicitly start `email_verified=false` and `legacy_verification_exempt=false`. They receive a session that can expose account status; every protected catalog/cart/trip/settings request reloads the session's account and rejects unverified, nonexempt users with 403 and `EMAIL_VERIFICATION_REQUIRED`. Only the two authenticated session-status routes are exempt. Refreshing, restoring an old session, or opening the application directly therefore does not authorize protected shopping data. The frontend also explicitly gates private screens and navigation.

Verification tokens are hashed, purpose-bound, expire after 30 minutes, and are consumed with a transactional DELETE before the account is marked verified. Expired, invalid, and reused tokens receive the same generic failure. Verification in an existing matching session updates access; without an existing matching session, the user signs in after success. Verification does not authenticate the browser into a different account.

Persistent per-account resend cooldown remains 60 seconds. Generic eligibility responses, the auth request limiter, provider-failure handling, old-link preservation until replacement delivery is accepted, session cookies, and password-reset revocation are preserved. The UI says an email was requested, rather than claiming delivery. It includes the user's address, spam-folder guidance, initial registration cooldown, resend loading/countdown, and generic failure recovery. Server Retry-After is honored and exposed through CORS for supported separate-API development mode. Provider failures remain undisclosed by the existing API; the browser cannot reliably distinguish actual delivery failure from a generic accepted request.

Legacy exemption is based on accounts present when migration 003 ran, not a timestamp for the later verification-flag activation. Accounts registered after that migration but before flag activation can therefore be unverified and nonexempt. They may now require verification as intentionally configured. Existing explicitly exempt accounts retain access. No exemptions or accounts were changed. If a specific legitimate pre-activation account cannot verify, resolve it through recovery/support; any selective grandfathering would require a reviewed cutoff and explicit authorization, rather than blanket exemption for new users.

## Verification and limits

- Frontend `npm test`: **36 passed**. Includes registration confirmation/payload privacy, 7/8/10 and Unicode/byte edges, busy handling, visibility/value/focus, all strength states/predictable patterns/privacy, pending/resend/success/invalid states, unverified session gates, reset-session edge cases, password reset/change, and existing shopping/money/correction tests.
- Backend `npm test`: **33 passed, 4 skipped**. New tests cover creation/login policy and verified/legacy gates. Existing cookie/token/email-template/safety tests pass. Guarded database API tests were extended to check protected denial/verified access and remain skipped without an isolated database.
- `npm run build`: passed; deferred estimator chunk-size warning remains. Preview fixture entries are not part of the default production build.
- `git diff --check`: passed. `log.md` remains ignored and untracked.
- Browser fixtures: Enter-key sign-in submission with a previously accepted short password; show/hide focus; visible keyboard focus; catalog, trips, settings, and sign-out navigation; registration widths 320/390/768/1024/1440 with no horizontal overflow; stable confirmation position across strength states at 320 px; visibility targets 44 × 44 px.
- Computed contrast on white: helper text 7.67:1, primary green 6.51:1, Weak 6.96:1, Fair 6.11:1, Good 5.46:1, Strong 8.82:1. Strength also has textual labels. Decorative checklist is excluded from accessibility traversal.

No live emails, accounts, credential changes, production database tests, or deployment were performed. Actual PostgreSQL token concurrency/expiry/replay and production access behavior were inspected in code but not newly exercised. An isolated approved test database is needed for those four suites. Full assistive-technology and mobile-device testing was not performed. Production email success is the user's prior test evidence, not a new claim from this task.

## Files changed

| Area | Files |
| --- | --- |
| Auth UI | `client/src/App.jsx`, `AccountFlows.jsx`, `ChangePassword.jsx`, new `AuthUI.jsx`, `PasswordStrength.jsx` |
| Policy and estimator | new `client/src/passwordPolicy.js`, `passwordStrength.js` |
| Styles and API feedback | `client/src/styles.css`, `client/src/api/httpApi.js` |
| Dependencies | `client/package.json`, `client/package-lock.json` |
| Server | `server/authValidation.js`, `server/server.js` |
| Tests | new `client/src/authBehavior.test.js`, `passwordPolicy.test.js`, `passwordStrength.test.js`, `server/authValidation.test.js`; updated `server/accountEnhancements.integration.test.js` |
| Local preview tooling | new `client/tools/auth-preview.config.mjs`, `auth-states.html`, `auth-states.jsx`, `shopping-preview.html`, `shopping-preview.jsx`, `strength-preview.html`, `strength-preview.jsx` |
| Review artifacts | this report; `docs/design/auth-preview/index.html` and screenshots |
| Local work log | appended `log.md`, ignored by Git |

## Preview

Open `docs/design/auth-preview/index.html` for current/proposed desktop and mobile comparisons, registration, all strength states, check-email, success, invalid links, recovery, reset, password change, and shopping polish. All new state screenshots use isolated local fixtures.

To run the isolated preview from `client`: `npx --no-install vite --config tools/auth-preview.config.mjs`. It listens on loopback port 4174, intercepts API requests locally, and uses no real backend. The account and shopping fixture pages additionally stub fetch; they do not create accounts, send email, or persist changes. Do not use the fixtures for production verification. The user authorized pushing to main on 30 September 2026. Deployment requires separate authorization.
