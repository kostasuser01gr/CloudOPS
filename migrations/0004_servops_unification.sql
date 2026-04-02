-- ServOps Unified Migration
-- Merges Washers and Shifts functionality into the CloudOps core.

PRAGMA foreign_keys = ON;

-- 1. Stations/Branches expansion (Resources)
ALTER TABLE stations ADD COLUMN soap_level INTEGER DEFAULT 100;
ALTER TABLE stations ADD COLUMN wax_level INTEGER DEFAULT 100;
ALTER TABLE stations ADD COLUMN water_level INTEGER DEFAULT 100;

-- 2. Extended Employee Profile (Washers/Shifts)
-- (Already exists in 0003, we add performance tracking)
ALTER TABLE staff_employee_profiles ADD COLUMN total_washes_lifetime INTEGER DEFAULT 0;
ALTER TABLE staff_employee_profiles ADD COLUMN avg_quality_score REAL DEFAULT 5.0;

-- 3. Demand Forecasting Table
CREATE TABLE IF NOT EXISTS demand_forecast (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  expected_vehicles INTEGER DEFAULT 0,
  last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id),
  UNIQUE (station_id, day_of_week, hour_of_day)
);

-- 4. Resource Consumption Log
CREATE TABLE IF NOT EXISTS resource_logs (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('soap', 'wax', 'water')),
  amount_changed INTEGER NOT NULL,
  reason TEXT,
  staff_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id)
);

-- 5. Shift Heuristics Log (for Fairness tracking)
CREATE TABLE IF NOT EXISTS shift_fairness_counters (
  staff_user_id TEXT NOT NULL,
  night_shift_count INTEGER DEFAULT 0,
  weekend_shift_count INTEGER DEFAULT 0,
  last_assigned_epoch_s INTEGER,
  PRIMARY KEY (staff_user_id),
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id)
);

-- 6. Google Drive Sync Status
ALTER TABLE reservations ADD COLUMN drive_sync_folder_status TEXT DEFAULT 'pending' CHECK (drive_sync_folder_status IN ('pending', 'created', 'failed'));
ALTER TABLE reservations ADD COLUMN drive_error_log TEXT;