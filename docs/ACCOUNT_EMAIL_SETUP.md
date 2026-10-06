# Account email setup

CartCheck still owns authentication in Express. Supabase hosts the PostgreSQL tables; Supabase Auth and its mailer are not used. `server/emailService.js` is the delivery boundary, so a different provider can replace its implementation without changing token or session handling.

## Provider and sending domain

The Express adapter uses Resend's HTTPS API through Node's built-in `fetch`. Configure a sending API key and a verified sender domain for your installation. Use the provider's [domain setup guide](https://resend.com/docs/dashboard/domains/introduction) for the exact DNS records and check your account's current sending limits.

The CartCheck web origin is `https://cartcheck.merzbuilds.dev`; `mail.merzbuilds.dev` is the selected sending subdomain. Web routing and email authentication are separate. Publish the exact records supplied for the sending domain, verify SPF/DKIM and the applicable DMARC policy, and preserve existing website and mailbox records.

## Configuration

1. Create a Resend account and verify `mail.merzbuilds.dev`. Choose a sender on that subdomain, such as `CartCheck <no-reply@mail.merzbuilds.dev>`, after verification.
2. Create a sending API key in Resend. Put it only in the Express server environment as `RESEND_API_KEY`; set `EMAIL_FROM` to the verified sender. Do not put either in a `VITE_` variable or Git.
3. Keep `CLIENT_ORIGIN` set to the canonical CartCheck origin, `https://cartcheck.merzbuilds.dev`, with no trailing slash, and `CORS_ORIGINS` restricted to the approved browser origin. The verification and reset links use this client origin. The Render default hostname is disabled.
4. Keep `REQUIRE_VERIFIED_EMAIL=false` until real verification emails have been sent to, received by, and opened from a real mailbox in the deployed environment. Test resend, expiry, and password reset as well. Then set `REQUIRE_VERIFIED_EMAIL=true` deliberately. Existing accounts remain exempt; new unverified accounts are restricted when the flag is true.

If `RESEND_API_KEY` or `EMAIL_FROM` is missing outside production, the development sink discards message contents and prints only the message type. It does **not** send mail or expose token links. In production, missing delivery configuration causes an email-send failure. The API retains generic responses to prevent email lookup; check private server logs and provider dashboard when diagnosing delivery.

The `003_account_enhancements.sql` migration preserves users and sessions. Existing users remain `email_verified=false` unless they actually follow a verification link, but have `legacy_verification_exempt=true`. New users are not exempt. Action token hashes, expiry, and email cooldowns live in separate account tables. Never reset the database to apply this migration. Use the existing migration runner only after reviewing the target and the [database setup guide](MILESTONE_1_SETUP.md).

## Delivery checks before enforcement

- Confirm the actual sending subdomain shows verified in Resend and SPF/DKIM checks pass; add and verify a suitable DMARC policy. Keep website and email DNS records separate.
- Send verification and password reset messages to a controlled real mailbox. Confirm the links open the intended HTTPS site, each expires after 30 minutes, and each works only once.
- Confirm failed delivery, bounce, and quota-limit handling in the provider dashboard. The free plan has a daily cap; monitor it so new users do not become locked out.
- Only after those checks, enable required verification for new accounts. Existing accounts continue using their current passwords and sessions.
