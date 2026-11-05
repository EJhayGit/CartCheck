-- Demo assistant message counts. Counts only, never message text.
CREATE TABLE cartcheck.assistant_usage (
  user_id BIGINT NOT NULL REFERENCES cartcheck.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  message_count INTEGER NOT NULL CHECK (message_count >= 0),
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE cartcheck.assistant_app_usage (
  usage_date DATE PRIMARY KEY,
  message_count INTEGER NOT NULL CHECK (message_count >= 0)
);
