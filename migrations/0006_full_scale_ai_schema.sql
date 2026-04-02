-- ============================================================
-- AI & Data Intelligence (Self-Upgrading)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id TEXT PRIMARY KEY,
  department TEXT NOT NULL, -- 'washers', 'shifts', 'fleet', 'admin', 'customer'
  room_id TEXT,
  user_id TEXT,
  role TEXT NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spreadsheet_state (
  id TEXT PRIMARY KEY,
  sheet_name TEXT NOT NULL UNIQUE, -- 'fleet_vehicles', 'shifts_grid', 'registrations_history'
  config_json TEXT NOT NULL, -- columns, filters, formatting
  last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_ingestion_logs (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  analysis_json TEXT, -- Gemini-extracted data
  status TEXT NOT NULL DEFAULT 'processed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Enhanced Fleet (The 'Google Sheets' Scale)
-- ============================================================

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id TEXT PRIMARY KEY,
  plate TEXT NOT NULL UNIQUE,
  make_model TEXT,
  vin TEXT,
  mileage INTEGER,
  last_wash_id TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  location_lat REAL,
  location_lng REAL,
  metadata_json TEXT, -- All other spreadsheet columns
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Approval Flow (Washers Edit History)
-- ============================================================

CREATE TABLE IF NOT EXISTS edit_requests (
  id TEXT PRIMARY KEY,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  new_data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE reservations ADD COLUMN location_lat REAL;
ALTER TABLE reservations ADD COLUMN location_lng REAL;
