CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY,
  call_key TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  confidence INTEGER NOT NULL,
  gates TEXT,
  price_text TEXT,
  entry_price REAL,
  name TEXT,
  short TEXT,
  img TEXT,
  reason TEXT,
  source TEXT,
  strategy_version TEXT,
  time INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  entry_time INTEGER,
  price_time INTEGER,
  market TEXT,
  entry_source TEXT,
  device_id TEXT,
  user_id TEXT,
  features_json TEXT,
  prices_json TEXT,
  pnl_json TEXT,
  checked_json TEXT,
  settlement_version TEXT,
  settlement_source TEXT,
  settlement_candles_json TEXT,
  settled_at INTEGER,
  legacy_hidden_from_stats INTEGER DEFAULT 0,
  raw_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_time ON calls(time DESC);
CREATE INDEX IF NOT EXISTS idx_calls_symbol_time ON calls(symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_calls_direction_time ON calls(direction, time DESC);
CREATE INDEX IF NOT EXISTS idx_calls_settlement ON calls(settlement_version, settled_at);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  user_id TEXT,
  token TEXT,
  platform TEXT,
  app_version TEXT,
  prefs_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_devices_enabled ON devices(enabled, expires_at);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

CREATE TABLE IF NOT EXISTS notification_events (
  event_key TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  dedup_bucket INTEGER NOT NULL,
  event_ts INTEGER NOT NULL,
  sent_ok INTEGER NOT NULL DEFAULT 0,
  status INTEGER,
  error TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notification_events_device ON notification_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_expiry ON notification_events(expires_at);

CREATE TABLE IF NOT EXISTS signal_stats (
  stat_key TEXT PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  flats INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  pnl REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
