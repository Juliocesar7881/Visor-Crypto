ALTER TABLE devices ADD COLUMN device_secret_hash TEXT;
ALTER TABLE devices ADD COLUMN device_secret_created_at INTEGER;
ALTER TABLE devices ADD COLUMN device_secret_last_seen_at INTEGER;

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
