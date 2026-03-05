CREATE TABLE IF NOT EXISTS daily_quota (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  conversations INTEGER DEFAULT 0,
  turns INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS jti_replay (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Cleanup index for expired JTIs
CREATE INDEX idx_jti_expires ON jti_replay(expires_at);

CREATE TABLE IF NOT EXISTS conversation_turns (
  token_jti TEXT PRIMARY KEY,
  turn_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
