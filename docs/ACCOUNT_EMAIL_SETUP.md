# Account email setup

CartCheck still owns authentication in Express. Supabase hosts the PostgreSQL tables; Supabase Auth and its mailer are not used. `server/emailService.js` is the delivery boundary, so a different provider can replace its implementation without changing token or session handling.

## Provider choice

Resend is the selected transactional provider. Its [free plan](https://resend.com/pricing) currently includes 3,000 emails per month, a 100-email daily cap, and three domains. Its [Express support](https://resend.com/express) and HTTP API make integration small enough to use Node's built-in `fetch`; no email package is needed. Brevo's [free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) allows 300 emails per day, but Resend's simple API and test addresses are a better fit for this small project. Recheck quotas before production setup.

Resend needs an account, an API key, and a sender domain you control. Add the domain in its dashboard and publish the SPF/DKIM DNS records it gives you. Its `resend.dev` testing domain cannot be used to deliver to arbitrary shoppers. Resend offers [test recipient addresses](https://resend.com/changelog/sending-test-emails) that simulate delivery, bounce, and complaint events, but those simulations are not proof that a real mailbox received a message. A real verified sender, inbox test, and delivery monitoring are needed before enforcing confirmation.

## Planned personal-domain layout

If the owner purchases a domain, `merzbuilds.com` could host a portfolio, `cartcheck.merzbuilds.com` could serve the CartCheck website, and `mail.merzbuilds.com` could be a **separate verified sending subdomain** for `no-reply@mail.merzbuilds.com`. These are examples only. The sending subdomain is a DNS/email identity, not a second web host. Resend [recommends a sending subdomain](https://resend.com/docs/dashboard/domains/introduction) to separate its reputation from the root domain.

Wherever the domain's authoritative DNS is managed (for example Spaceship, if its nameservers remain in use), publish the exact records Resend displays for the **actual sending subdomain**. These include SPF and DKIM authorization/verification records; add an appropriate DMARC record for the chosen domain or subdomain policy and verify alignment and status. Do not invent record names or values. A website `A`/`CNAME` record routes web traffic and does not authenticate email. Conversely, Resend's mail-authentication records do not connect a site to Render or Vercel. Preserve any existing portfolio or mailbox DNS records when changing nameservers. [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction), [Render custom-domain DNS](https://render.com/docs/custom-domains), [Vercel domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## Configuration

1. Create a Resend account and verify a domain that you control. Choose a sender on that domain, such as `CartCheck <noreply@your-domain.example>`.
2. Create a sending API key in Resend. Put it only in the Express server environment as `RESEND_API_KEY`; set `EMAIL_FROM` to the verified sender. Do not put either in a `VITE_` variable or Git.
3. Set `CLIENT_ORIGIN` to the **canonical** public HTTPS origin serving CartCheck, with no trailing slash. Set `CORS_ORIGINS` to the approved browser origin(s). The verification and reset links use this client origin. If CartCheck moves from a Render URL to a custom subdomain, update both settings and retest links and cookies; users will need to sign in again on the new hostname.
4. Keep `REQUIRE_VERIFIED_EMAIL=false` until real verification emails have been sent to, received by, and opened from a real mailbox in the deployed environment. Test resend, expiry, and password reset as well. Then set `REQUIRE_VERIFIED_EMAIL=true` deliberately. Existing accounts remain exempt; new unverified accounts are restricted when the flag is true.

If `RESEND_API_KEY` or `EMAIL_FROM` is missing outside production, the development sink discards message contents and prints only the message type. It does **not** send mail or expose token links. In production, missing delivery configuration causes an email-send failure. The API retains generic responses to prevent email lookup; check private server logs and provider dashboard when diagnosing delivery. No real email delivery has been verified as part of this milestone.

The new `003_account_enhancements.sql` migration preserves users and sessions. Existing users remain `email_verified=false` unless they actually follow a verification link, but have `legacy_verification_exempt=true`. New users are not exempt. Action token hashes, expiry, and email cooldowns live in separate account tables. Never reset the database to apply this migration. Use the existing migration runner only after reviewing the target and the [database setup guide](MILESTONE_1_SETUP.md).

## Delivery checks before enforcement

- Confirm the actual sending subdomain shows verified in Resend and SPF/DKIM checks pass; add and verify a suitable DMARC policy. Keep website and email DNS records separate.
- Send verification and password reset messages to a controlled real mailbox. Confirm the links open the intended HTTPS site, each expires after 30 minutes, and each works only once.
- Confirm failed delivery, bounce, and quota-limit handling in the provider dashboard. The free plan has a daily cap; monitor it so new users do not become locked out.
- Only after those checks, enable required verification for new accounts. Existing accounts continue using their current passwords and sessions.
