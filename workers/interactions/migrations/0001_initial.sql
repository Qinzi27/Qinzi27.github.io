CREATE TABLE IF NOT EXISTS stickers (
  id TEXT PRIMARY KEY,
  board_key TEXT NOT NULL,
  board_label TEXT,
  storage_key TEXT,
  asset_name TEXT NOT NULL,
  asset_src TEXT NOT NULL,
  category TEXT,
  category_label TEXT,
  pack TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  size REAL NOT NULL,
  rotation REAL NOT NULL,
  visitor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stickers_board_status_created
  ON stickers (board_key, status, created_at);

CREATE INDEX IF NOT EXISTS idx_stickers_visitor
  ON stickers (visitor_id, created_at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (date, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_comments_date_status_created
  ON comments (date, status, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_visitor
  ON comments (visitor_id, created_at);
