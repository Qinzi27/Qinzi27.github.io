CREATE TABLE IF NOT EXISTS couple_plans (
  id TEXT PRIMARY KEY,
  board_key TEXT NOT NULL,
  title TEXT NOT NULL,
  scheduled_date TEXT NOT NULL DEFAULT '',
  person TEXT NOT NULL DEFAULT '',
  plan_status TEXT NOT NULL DEFAULT 'planned'
    CHECK (plan_status IN ('planned', 'in-progress', 'done')),
  notes TEXT NOT NULL DEFAULT '',
  asset_name TEXT NOT NULL DEFAULT '',
  asset_src TEXT NOT NULL DEFAULT '',
  asset_category TEXT NOT NULL DEFAULT '',
  asset_category_label TEXT NOT NULL DEFAULT '',
  asset_pack TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_couple_plans_board_status_date
  ON couple_plans (board_key, plan_status, scheduled_date, created_at);
