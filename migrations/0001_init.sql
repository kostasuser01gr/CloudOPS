PRAGMA foreign_keys = ON;

-- ============================================================
-- Core reference
-- ============================================================

CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Athens',
  address TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  reservation_number TEXT NOT NULL UNIQUE,
  station_id TEXT NOT NULL,
  pickup_date_local TEXT NOT NULL,
  pickup_day_start_epoch_s INTEGER NOT NULL,
  pickup_day_end_epoch_s INTEGER NOT NULL,
  return_date_local TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  vehicle_plate TEXT,
  vehicle_make_model TEXT,
  drive_case_folder_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id),
  CHECK (pickup_day_end_epoch_s > pickup_day_start_epoch_s)
);

-- ============================================================
-- Staff auth / RBAC
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_roles (
  id TEXT PRIMARY KEY,
  role_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
  mfa_secret_encrypted TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_user_roles (
  staff_user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (staff_user_id, role_id),
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES staff_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_auth_sessions (
  id TEXT PRIMARY KEY,
  staff_user_id TEXT NOT NULL,
  session_public_id TEXT NOT NULL UNIQUE,
  session_secret_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  issued_epoch_s INTEGER NOT NULL,
  last_seen_epoch_s INTEGER,
  expires_epoch_s INTEGER NOT NULL,
  revoked_epoch_s INTEGER,
  ip_hash TEXT,
  user_agent_hash TEXT,
  rotation_counter INTEGER NOT NULL DEFAULT 0 CHECK (rotation_counter >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
  CHECK (expires_epoch_s > issued_epoch_s)
);

-- ============================================================
-- Case / room model
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL UNIQUE,
  station_id TEXT NOT NULL,
  opaque_room_token TEXT NOT NULL UNIQUE,
  do_room_name TEXT NOT NULL UNIQUE,
  case_status TEXT NOT NULL DEFAULT 'new' CHECK (
    case_status IN (
      'new',
      'waiting_customer',
      'under_review',
      'escalated',
      'resolved',
      'closed',
      'disputed'
    )
  ),
  last_event_seq INTEGER NOT NULL DEFAULT 0,
  last_message_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (station_id) REFERENCES stations(id)
);

-- ============================================================
-- Customer auth session (identity only)
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_auth_sessions (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  session_public_id TEXT NOT NULL UNIQUE,
  session_secret_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  issued_epoch_s INTEGER NOT NULL,
  last_seen_epoch_s INTEGER,
  expires_epoch_s INTEGER NOT NULL,
  revoked_epoch_s INTEGER,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  CHECK (expires_epoch_s > issued_epoch_s)
);

-- ============================================================
-- Upload capability (separate from auth session)
-- ============================================================

CREATE TABLE IF NOT EXISTS reservation_upload_capabilities (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL UNIQUE,
  room_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'expired', 'revoked')),
  upload_window_start_epoch_s INTEGER NOT NULL,
  upload_window_end_epoch_s INTEGER NOT NULL,
  max_files INTEGER NOT NULL DEFAULT 15 CHECK (max_files > 0 AND max_files <= 15),
  used_files_count INTEGER NOT NULL DEFAULT 0 CHECK (used_files_count >= 0 AND used_files_count <= 15),
  policy_reason TEXT,
  last_evaluated_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  CHECK (upload_window_end_epoch_s > upload_window_start_epoch_s)
);

-- ============================================================
-- Upload batches and files
-- ============================================================

CREATE TABLE IF NOT EXISTS upload_batches (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  auth_session_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  client_batch_uuid TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'uploading', 'completed', 'failed', 'cancelled')),
  planned_files_count INTEGER NOT NULL DEFAULT 0 CHECK (planned_files_count >= 0 AND planned_files_count <= 15),
  created_epoch_s INTEGER NOT NULL,
  completed_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (capability_id) REFERENCES reservation_upload_capabilities(id),
  UNIQUE (capability_id, client_batch_uuid)
);

CREATE TABLE IF NOT EXISTS upload_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  auth_session_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  client_file_uuid TEXT NOT NULL,
  upload_intent_idempotency_key TEXT NOT NULL UNIQUE,
  upload_commit_idempotency_key TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL UNIQUE,
  deterministic_file_name TEXT NOT NULL,
  guidance_slot TEXT NOT NULL CHECK (
    guidance_slot IN (
      'front',
      'rear',
      'left_side',
      'right_side',
      'damage_closeup',
      'plate_optional',
      'other'
    )
  ),
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  width_px INTEGER,
  height_px INTEGER,
  capture_source TEXT NOT NULL CHECK (capture_source IN ('camera', 'gallery', 'staff')),
  client_state TEXT NOT NULL DEFAULT 'queued' CHECK (client_state IN ('queued', 'uploading', 'uploaded', 'failed', 'blocked_capability_expired')),
  r2_state TEXT NOT NULL DEFAULT 'pending' CHECK (r2_state IN ('pending', 'uploading', 'uploaded', 'failed')),
  drive_state TEXT NOT NULL DEFAULT 'not_queued' CHECK (drive_state IN ('not_queued', 'queued', 'processing', 'synced', 'failed', 'dead_letter')),
  r2_etag TEXT,
  r2_version_id TEXT,
  r2_confirmed_epoch_s INTEGER,
  drive_folder_id TEXT,
  drive_file_id TEXT,
  retries INTEGER NOT NULL DEFAULT 0 CHECK (retries >= 0),
  last_error_code TEXT,
  last_error_message TEXT,
  uploaded_epoch_s INTEGER,
  synced_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES upload_batches(id),
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (capability_id) REFERENCES reservation_upload_capabilities(id),
  UNIQUE (capability_id, client_file_uuid),
  UNIQUE (capability_id, deterministic_file_name)
);

CREATE TABLE IF NOT EXISTS drive_sync_jobs (
  id TEXT PRIMARY KEY,
  upload_file_id TEXT NOT NULL UNIQUE,
  reservation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  target_drive_folder_id TEXT NOT NULL,
  target_drive_file_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'retry_wait', 'synced', 'failed', 'dead_letter')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 15 CHECK (max_attempts > 0),
  next_retry_epoch_s INTEGER,
  queue_message_id TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_epoch_s INTEGER NOT NULL,
  completed_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_file_id) REFERENCES upload_files(id),
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (capability_id) REFERENCES reservation_upload_capabilities(id),
  UNIQUE (reservation_id, target_drive_file_name)
);

-- ============================================================
-- Chat and receipts
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('customer', 'staff', 'system')),
  sender_auth_session_id TEXT,
  sender_staff_user_id TEXT,
  message_kind TEXT NOT NULL CHECK (
    message_kind IN ('text', 'system', 'consent_receipt', 'attachment', 'canned_reply')
  ),
  visibility TEXT NOT NULL DEFAULT 'customer_visible' CHECK (visibility IN ('customer_visible', 'staff_only')),
  body TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  reply_to_message_id TEXT,
  attachment_upload_file_id TEXT,
  idempotency_key TEXT NOT NULL,
  client_created_epoch_ms INTEGER,
  created_epoch_s INTEGER NOT NULL,
  edited_epoch_s INTEGER,
  deleted_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (sender_auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (sender_staff_user_id) REFERENCES staff_users(id),
  FOREIGN KEY (reply_to_message_id) REFERENCES chat_messages(id),
  FOREIGN KEY (attachment_upload_file_id) REFERENCES upload_files(id),
  UNIQUE (room_id, idempotency_key),
  CHECK (
    (sender_kind = 'customer' AND sender_auth_session_id IS NOT NULL AND sender_staff_user_id IS NULL) OR
    (sender_kind = 'staff' AND sender_auth_session_id IS NULL AND sender_staff_user_id IS NOT NULL) OR
    (sender_kind = 'system' AND sender_auth_session_id IS NULL AND sender_staff_user_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS chat_receipts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  receipt_kind TEXT NOT NULL CHECK (receipt_kind IN ('delivered', 'read')),
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('customer', 'staff')),
  recipient_key TEXT NOT NULL,
  recipient_auth_session_id TEXT,
  recipient_staff_user_id TEXT,
  created_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (recipient_staff_user_id) REFERENCES staff_users(id),
  UNIQUE (message_id, receipt_kind, recipient_key),
  CHECK (
    (recipient_kind = 'customer' AND recipient_auth_session_id IS NOT NULL AND recipient_staff_user_id IS NULL) OR
    (recipient_kind = 'staff' AND recipient_auth_session_id IS NULL AND recipient_staff_user_id IS NOT NULL)
  )
);

-- ============================================================
-- Consent / location
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_receipts (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  auth_session_id TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('location')),
  decision TEXT NOT NULL CHECK (decision IN ('granted', 'revoked', 'denied')),
  purpose_text TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  retention_until_epoch_s INTEGER,
  source_ip_hash TEXT,
  source_user_agent_hash TEXT,
  receipt_message_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  decision_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (receipt_message_id) REFERENCES chat_messages(id)
);

-- ============================================================
-- Case workflow / notes / canned replies
-- ============================================================

CREATE TABLE IF NOT EXISTS case_status_history (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  from_status TEXT CHECK (from_status IN ('new', 'waiting_customer', 'under_review', 'escalated', 'resolved', 'closed', 'disputed')),
  to_status TEXT NOT NULL CHECK (to_status IN ('new', 'waiting_customer', 'under_review', 'escalated', 'resolved', 'closed', 'disputed')),
  changed_by_staff_user_id TEXT NOT NULL,
  reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  changed_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (changed_by_staff_user_id) REFERENCES staff_users(id),
  CHECK (from_status IS NULL OR from_status <> to_status)
);

CREATE TABLE IF NOT EXISTS internal_notes (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_epoch_s INTEGER NOT NULL,
  updated_epoch_s INTEGER NOT NULL,
  deleted_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id)
);

CREATE TABLE IF NOT EXISTS canned_replies (
  id TEXT PRIMARY KEY,
  station_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_staff_user_id TEXT NOT NULL,
  updated_by_staff_user_id TEXT,
  created_epoch_s INTEGER NOT NULL,
  updated_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (created_by_staff_user_id) REFERENCES staff_users(id),
  FOREIGN KEY (updated_by_staff_user_id) REFERENCES staff_users(id),
  UNIQUE (station_id, title)
);

-- ============================================================
-- Audit / alerts / diagnostics / DLQ
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('customer', 'staff', 'system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT,
  reservation_id TEXT,
  room_id TEXT,
  auth_session_id TEXT,
  staff_auth_session_id TEXT,
  request_id TEXT,
  trace_id TEXT,
  correlation_id TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (staff_auth_session_id) REFERENCES staff_auth_sessions(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
  trigger_key TEXT NOT NULL,
  reservation_id TEXT,
  room_id TEXT,
  auth_session_id TEXT,
  description TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  first_seen_epoch_s INTEGER NOT NULL,
  last_seen_epoch_s INTEGER NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  acknowledged_by_staff_user_id TEXT,
  acknowledged_epoch_s INTEGER,
  resolved_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (acknowledged_by_staff_user_id) REFERENCES staff_users(id),
  CHECK (
    (status = 'resolved' AND is_open = 0) OR
    (status IN ('open', 'acknowledged') AND is_open = 1)
  ),
  UNIQUE (alert_type, trigger_key, is_open)
);

CREATE TABLE IF NOT EXISTS ops_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_component TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical')),
  reservation_id TEXT,
  room_id TEXT,
  auth_session_id TEXT,
  staff_auth_session_id TEXT,
  request_id TEXT,
  trace_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (staff_auth_session_id) REFERENCES staff_auth_sessions(id)
);

CREATE TABLE IF NOT EXISTS reservation_validation_attempts (
  id TEXT PRIMARY KEY,
  reservation_number_hash TEXT NOT NULL,
  station_code TEXT,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  reason_code TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  request_id TEXT,
  created_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS queue_dlq_events (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_job_id TEXT,
  source_queue_message_id TEXT,
  reason_code TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'requeued', 'resolved', 'ignored')),
  replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  replay_idempotency_key TEXT,
  first_seen_epoch_s INTEGER NOT NULL,
  last_seen_epoch_s INTEGER NOT NULL,
  last_replay_epoch_s INTEGER,
  resolved_epoch_s INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (queue_name, payload_sha256)
);

-- ============================================================
-- Generic idempotency registry
-- ============================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('customer', 'staff', 'system')),
  actor_id TEXT,
  reservation_id TEXT,
  room_id TEXT,
  auth_session_id TEXT,
  staff_auth_session_id TEXT,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body_json TEXT NOT NULL,
  created_epoch_s INTEGER NOT NULL,
  expires_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (staff_auth_session_id) REFERENCES staff_auth_sessions(id),
  CHECK (expires_epoch_s > created_epoch_s),
  UNIQUE (scope, actor_kind, actor_id, request_hash)
);

-- ============================================================
-- Triggers for upload capability enforcement (epoch-based)
-- ============================================================

CREATE TRIGGER IF NOT EXISTS trg_upload_batches_scope_match
BEFORE INSERT ON upload_batches
FOR EACH ROW
WHEN (
  (SELECT reservation_id FROM reservation_upload_capabilities WHERE id = NEW.capability_id) IS NULL
  OR
  (SELECT reservation_id FROM reservation_upload_capabilities WHERE id = NEW.capability_id) <> NEW.reservation_id
  OR
  (SELECT room_id FROM reservation_upload_capabilities WHERE id = NEW.capability_id) <> NEW.room_id
)
BEGIN
  SELECT RAISE(ABORT, 'upload batch capability scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_upload_batches_capability_window
BEFORE INSERT ON upload_batches
FOR EACH ROW
WHEN (
  (SELECT status FROM reservation_upload_capabilities WHERE id = NEW.capability_id) <> 'enabled'
  OR
  unixepoch('now') < (SELECT upload_window_start_epoch_s FROM reservation_upload_capabilities WHERE id = NEW.capability_id)
  OR
  unixepoch('now') > (SELECT upload_window_end_epoch_s FROM reservation_upload_capabilities WHERE id = NEW.capability_id)
)
BEGIN
  SELECT RAISE(ABORT, 'upload capability not active for current epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_upload_files_scope_match
BEFORE INSERT ON upload_files
FOR EACH ROW
WHEN (
  (SELECT reservation_id FROM upload_batches WHERE id = NEW.batch_id) <> NEW.reservation_id
  OR
  (SELECT room_id FROM upload_batches WHERE id = NEW.batch_id) <> NEW.room_id
  OR
  (SELECT capability_id FROM upload_batches WHERE id = NEW.batch_id) <> NEW.capability_id
)
BEGIN
  SELECT RAISE(ABORT, 'upload file batch scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_upload_files_batch_state_open
BEFORE INSERT ON upload_files
FOR EACH ROW
WHEN (
  (SELECT status FROM upload_batches WHERE id = NEW.batch_id) NOT IN ('open', 'uploading')
)
BEGIN
  SELECT RAISE(ABORT, 'upload batch is not writable');
END;

CREATE TRIGGER IF NOT EXISTS trg_upload_files_capability_window
BEFORE INSERT ON upload_files
FOR EACH ROW
WHEN (
  (SELECT status FROM reservation_upload_capabilities WHERE id = NEW.capability_id) <> 'enabled'
  OR
  unixepoch('now') < (SELECT upload_window_start_epoch_s FROM reservation_upload_capabilities WHERE id = NEW.capability_id)
  OR
  unixepoch('now') > (SELECT upload_window_end_epoch_s FROM reservation_upload_capabilities WHERE id = NEW.capability_id)
)
BEGIN
  SELECT RAISE(ABORT, 'upload window expired or inactive');
END;

CREATE TRIGGER IF NOT EXISTS trg_upload_files_max_count
BEFORE INSERT ON upload_files
FOR EACH ROW
WHEN (
  (SELECT COUNT(1) FROM upload_files WHERE capability_id = NEW.capability_id)
  >=
  (SELECT max_files FROM reservation_upload_capabilities WHERE id = NEW.capability_id)
)
BEGIN
  SELECT RAISE(ABORT, 'max upload files reached');
END;

CREATE TRIGGER IF NOT EXISTS trg_upload_files_recount_after_insert
AFTER INSERT ON upload_files
FOR EACH ROW
BEGIN
  UPDATE reservation_upload_capabilities
  SET
    used_files_count = (SELECT COUNT(1) FROM upload_files WHERE capability_id = NEW.capability_id),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.capability_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_upload_files_recount_after_delete
AFTER DELETE ON upload_files
FOR EACH ROW
BEGIN
  UPDATE reservation_upload_capabilities
  SET
    used_files_count = (SELECT COUNT(1) FROM upload_files WHERE capability_id = OLD.capability_id),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.capability_id;
END;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_stations_code_active
  ON stations (code, is_active);

CREATE INDEX IF NOT EXISTS idx_reservations_station_pickup_epoch
  ON reservations (station_id, pickup_day_start_epoch_s, pickup_day_end_epoch_s);

CREATE INDEX IF NOT EXISTS idx_reservations_status_updated
  ON reservations (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_reservations_drive_folder
  ON reservations (drive_case_folder_id);

CREATE INDEX IF NOT EXISTS idx_staff_users_active_last_login
  ON staff_users (is_active, last_login_epoch_s);

CREATE INDEX IF NOT EXISTS idx_staff_user_roles_role
  ON staff_user_roles (role_id, staff_user_id);

CREATE INDEX IF NOT EXISTS idx_staff_auth_sessions_user_status
  ON staff_auth_sessions (staff_user_id, status);

CREATE INDEX IF NOT EXISTS idx_staff_auth_sessions_expires
  ON staff_auth_sessions (expires_epoch_s);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_station_status
  ON chat_rooms (station_id, case_status, last_message_epoch_s);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_event_seq
  ON chat_rooms (last_event_seq);

CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_reservation_status
  ON customer_auth_sessions (reservation_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_room_status
  ON customer_auth_sessions (room_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_expires
  ON customer_auth_sessions (expires_epoch_s);

CREATE INDEX IF NOT EXISTS idx_upload_caps_status_window
  ON reservation_upload_capabilities (status, upload_window_start_epoch_s, upload_window_end_epoch_s);

CREATE INDEX IF NOT EXISTS idx_upload_caps_room_status
  ON reservation_upload_capabilities (room_id, status);

CREATE INDEX IF NOT EXISTS idx_upload_batches_capability_status
  ON upload_batches (capability_id, status, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_upload_batches_session_created
  ON upload_batches (auth_session_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_upload_files_batch_created
  ON upload_files (batch_id, created_at);

CREATE INDEX IF NOT EXISTS idx_upload_files_capability_state
  ON upload_files (capability_id, r2_state, drive_state);

CREATE INDEX IF NOT EXISTS idx_upload_files_reservation_created
  ON upload_files (reservation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_upload_files_sha256
  ON upload_files (sha256);

CREATE INDEX IF NOT EXISTS idx_drive_jobs_status_retry
  ON drive_sync_jobs (status, next_retry_epoch_s);

CREATE INDEX IF NOT EXISTS idx_drive_jobs_reservation_status
  ON drive_sync_jobs (reservation_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_drive_jobs_queue_msg
  ON drive_sync_jobs (queue_message_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_epoch
  ON chat_messages (room_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_chat_messages_reservation_epoch
  ON chat_messages (reservation_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_chat_messages_visibility_epoch
  ON chat_messages (visibility, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_chat_receipts_room_kind_epoch
  ON chat_receipts (room_id, receipt_kind, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_chat_receipts_recipient_epoch
  ON chat_receipts (recipient_key, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_consent_reservation_epoch
  ON consent_receipts (reservation_id, decision_epoch_s);

CREATE INDEX IF NOT EXISTS idx_consent_retention_epoch
  ON consent_receipts (retention_until_epoch_s);

CREATE INDEX IF NOT EXISTS idx_case_history_room_epoch
  ON case_status_history (room_id, changed_epoch_s);

CREATE INDEX IF NOT EXISTS idx_case_history_staff_epoch
  ON case_status_history (changed_by_staff_user_id, changed_epoch_s);

CREATE INDEX IF NOT EXISTS idx_internal_notes_room_updated
  ON internal_notes (room_id, updated_epoch_s);

CREATE INDEX IF NOT EXISTS idx_internal_notes_staff_created
  ON internal_notes (staff_user_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_canned_replies_station_active
  ON canned_replies (station_id, is_active, updated_epoch_s);

CREATE INDEX IF NOT EXISTS idx_audit_action_epoch
  ON audit_logs (action, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_audit_request_trace
  ON audit_logs (request_id, trace_id);

CREATE INDEX IF NOT EXISTS idx_audit_reservation_epoch
  ON audit_logs (reservation_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_alerts_status_severity_epoch
  ON alerts (status, severity, last_seen_epoch_s);

CREATE INDEX IF NOT EXISTS idx_alerts_type_trigger_open
  ON alerts (alert_type, trigger_key, is_open);

CREATE INDEX IF NOT EXISTS idx_ops_events_type_epoch
  ON ops_events (event_type, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_ops_events_severity_epoch
  ON ops_events (severity, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_ops_events_room_epoch
  ON ops_events (room_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_validation_attempts_success_epoch
  ON reservation_validation_attempts (success, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_validation_attempts_ip_epoch
  ON reservation_validation_attempts (ip_hash, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_validation_attempts_station_epoch
  ON reservation_validation_attempts (station_code, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_queue_dlq_status_epoch
  ON queue_dlq_events (queue_name, status, last_seen_epoch_s);

CREATE INDEX IF NOT EXISTS idx_queue_dlq_replay_count
  ON queue_dlq_events (replay_count, updated_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_scope_expiry
  ON idempotency_keys (scope, expires_epoch_s);

CREATE INDEX IF NOT EXISTS idx_idempotency_reservation_scope
  ON idempotency_keys (reservation_id, scope, created_epoch_s);
