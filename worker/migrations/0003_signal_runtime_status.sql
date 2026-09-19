CREATE TABLE IF NOT EXISTS runtime_status (
  status_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_status_updated ON runtime_status(updated_at DESC);
