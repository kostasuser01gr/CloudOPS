PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('customer', 'staff', 'system')),
  sender_auth_session_id TEXT,
  sender_staff_user_id TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  storage_key TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('customer_visible', 'staff_only')),
  upload_status TEXT NOT NULL DEFAULT 'metadata_persisted' CHECK (upload_status IN ('intent_created', 'metadata_persisted')),
  idempotency_key TEXT NOT NULL,
  created_epoch_s INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_auth_session_id) REFERENCES customer_auth_sessions(id),
  FOREIGN KEY (sender_staff_user_id) REFERENCES staff_users(id),
  UNIQUE (room_id, idempotency_key),
  UNIQUE (room_id, storage_key),
  CHECK (
    (sender_kind = 'customer' AND sender_auth_session_id IS NOT NULL AND sender_staff_user_id IS NULL) OR
    (sender_kind = 'staff' AND sender_auth_session_id IS NULL AND sender_staff_user_id IS NOT NULL) OR
    (sender_kind = 'system' AND sender_auth_session_id IS NULL AND sender_staff_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_room_epoch
  ON message_attachments (room_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_message_attachments_reservation_epoch
  ON message_attachments (reservation_id, created_epoch_s);

CREATE INDEX IF NOT EXISTS idx_message_attachments_visibility_epoch
  ON message_attachments (visibility, created_epoch_s);
