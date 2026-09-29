-- Track actual verification separately from legacy exemption. Existing
-- accounts keep their access; new registrations start unverified.
ALTER TABLE cartcheck.users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_verification_exempt BOOLEAN NOT NULL DEFAULT true;
-- The TRUE add-column default backfills accounts already present at migration
-- time. New registrations use FALSE after the migration completes.
ALTER TABLE cartcheck.users ALTER COLUMN legacy_verification_exempt SET DEFAULT false;

CREATE TABLE IF NOT EXISTS cartcheck.auth_action_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES cartcheck.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_action_tokens_user_purpose_idx
  ON cartcheck.auth_action_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS auth_action_tokens_expires_at_idx
  ON cartcheck.auth_action_tokens (expires_at);

CREATE TABLE IF NOT EXISTS cartcheck.auth_email_limits (
  user_id BIGINT NOT NULL REFERENCES cartcheck.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  last_sent_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, purpose)
);
