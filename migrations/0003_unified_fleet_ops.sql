PRAGMA foreign_keys = ON;

-- Extended Employee Profile for Staff Users
CREATE TABLE IF NOT EXISTS staff_employee_profiles (
  staff_user_id TEXT PRIMARY KEY,
  employee_code TEXT UNIQUE,
  contract_type TEXT CHECK (contract_type IN ('Full-Time', 'Part-Time')),
  max_weekly_hours INTEGER DEFAULT 40,
  skills_json TEXT NOT NULL DEFAULT '[]',
  availability_json TEXT NOT NULL DEFAULT '{}',
  quality_score REAL DEFAULT 5.0,
  wash_count INTEGER DEFAULT 0,
  preferred_station_id TEXT,
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
  FOREIGN KEY (preferred_station_id) REFERENCES stations(id)
);

-- Fleet Vehicles
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id TEXT PRIMARY KEY,
  plate TEXT NOT NULL UNIQUE,
  make_model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Ready' CHECK (status IN ('Ready', 'Cleaning', 'Maintenance', 'Rented')),
  location_detail TEXT,
  key_location_detail TEXT,
  mileage INTEGER DEFAULT 0,
  last_service_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance Records for Fleet
CREATE TABLE IF NOT EXISTS fleet_maintenance_records (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Oil Change', 'Tires', 'Brakes', 'Damage Repair')),
  date_epoch_s INTEGER NOT NULL,
  cost REAL NOT NULL,
  technician_id TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (technician_id) REFERENCES staff_users(id)
);

-- Staff Shifts
CREATE TABLE IF NOT EXISTS fleet_shifts (
  id TEXT PRIMARY KEY,
  staff_user_id TEXT,
  station_id TEXT NOT NULL,
  date_local TEXT NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('Morning', 'Evening', 'Night')),
  start_time_local TEXT NOT NULL,
  end_time_local TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Published', 'Completed')),
  required_skills_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id),
  FOREIGN KEY (station_id) REFERENCES stations(id)
);

-- Wash Operations
CREATE TABLE IF NOT EXISTS fleet_washes (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  normalized_identifier TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual', 'ai_vision')),
  confidence REAL DEFAULT 1.0,
  station_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  reservation_id TEXT,
  fleet_vehicle_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  issue_flag INTEGER NOT NULL DEFAULT 0 CHECK (issue_flag IN (0, 1)),
  duplicate_flag INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_flag IN (0, 1)),
  checkout_photo_storage_key TEXT,
  checkin_photo_storage_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  completed_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (operator_id) REFERENCES staff_users(id),
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (fleet_vehicle_id) REFERENCES fleet_vehicles(id)
);

-- Key Handovers
CREATE TABLE IF NOT EXISTS fleet_key_handovers (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  from_staff_user_id TEXT NOT NULL,
  to_staff_user_id TEXT NOT NULL,
  timestamp_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicles(id),
  FOREIGN KEY (from_staff_user_id) REFERENCES staff_users(id),
  FOREIGN KEY (to_staff_user_id) REFERENCES staff_users(id)
);

-- Week Visibility
CREATE TABLE IF NOT EXISTS fleet_week_visibility (
  id TEXT PRIMARY KEY,
  week_start_local TEXT NOT NULL,
  station_id TEXT NOT NULL,
  is_blurred INTEGER NOT NULL DEFAULT 0 CHECK (is_blurred IN (0, 1)),
  UNIQUE (week_start_local, station_id),
  FOREIGN KEY (station_id) REFERENCES stations(id)
);

CREATE INDEX IF NOT EXISTS idx_fleet_washes_operator_epoch ON fleet_washes (operator_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fleet_shifts_date ON fleet_shifts (date_local);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_status ON fleet_vehicles (status);
