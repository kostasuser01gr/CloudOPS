-- ============================================================
-- Scheduling Engine: Weekly schedule grouping + constraints
-- ============================================================

PRAGMA foreign_keys = ON;

-- Weekly schedule container (groups shifts into publishable weeks)
CREATE TABLE IF NOT EXISTS weekly_schedules (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  week_start_date TEXT NOT NULL, -- ISO date of Monday
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_blurred INTEGER NOT NULL DEFAULT 0 CHECK (is_blurred IN (0, 1)),
  generated_at_epoch_s INTEGER,
  published_at_epoch_s INTEGER,
  published_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (published_by) REFERENCES staff_users(id),
  UNIQUE (station_id, week_start_date)
);

-- Add schedule reference to fleet_shifts
ALTER TABLE fleet_shifts ADD COLUMN schedule_id TEXT REFERENCES weekly_schedules(id);

-- Leave requests for employees
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  staff_user_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id),
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (approved_by) REFERENCES staff_users(id)
);

-- Schedule generation conflicts log
CREATE TABLE IF NOT EXISTS schedule_conflicts (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  shift_date TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  suggestions_json TEXT NOT NULL DEFAULT '[]',
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES weekly_schedules(id) ON DELETE CASCADE
);

-- Schedule audit log
CREATE TABLE IF NOT EXISTS schedule_audit_log (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at_epoch_s INTEGER NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES weekly_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES staff_users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_schedules_station_week
  ON weekly_schedules (station_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_fleet_shifts_schedule
  ON fleet_shifts (schedule_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_staff_dates
  ON leave_requests (staff_user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_schedule
  ON schedule_conflicts (schedule_id);

-- Seed default station if not exists
INSERT OR IGNORE INTO stations (id, code, name, timezone, address, is_active, soap_level, wax_level, water_level)
VALUES
  ('STATION_LHR', 'LHR', 'London Heathrow', 'Europe/London', 'Heathrow Airport, TW6', 1, 100, 100, 100),
  ('STATION_LCY', 'LCY', 'London City', 'Europe/London', 'Royal Docks, E16', 1, 100, 100, 100),
  ('STATION_ATH', 'ATH', 'Athens Airport', 'Europe/Athens', 'El. Venizelos, Spata', 1, 100, 100, 100);

-- Seed default roles if not exist
INSERT OR IGNORE INTO staff_roles (id, role_key, name, description, permissions_json, is_system)
VALUES
  ('ROLE_SUPER_ADMIN', 'super_admin', 'Super Admin', 'Full system access', '["*"]', 1),
  ('ROLE_SUPERVISOR', 'supervisor', 'Supervisor', 'Branch supervisor', '["manage_schedule","manage_fleet","manage_staff","view_cases","manage_cases"]', 1),
  ('ROLE_FLEET_SUPERVISOR', 'fleet_supervisor', 'Fleet Supervisor', 'Vehicle fleet management', '["manage_fleet","view_schedule"]', 1),
  ('ROLE_WASHER', 'washer', 'Washer', 'Field operator', '["register_wash","view_schedule"]', 1),
  ('ROLE_STAFF', 'staff', 'Staff', 'Office staff', '["view_schedule","view_fleet","view_cases","manage_cases"]', 1);
