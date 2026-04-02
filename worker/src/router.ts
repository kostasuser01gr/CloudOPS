import { customerBootstrapRequestSchema, staffLoginRequestSchema } from "@shared/schemas/auth";
import {
  attachmentMutationResponseSchema,
  attachmentRetrievalResponseSchema,
  attachmentPersistRequestSchema,
  attachmentVisibilitySchema,
  caseStatusSchema,
  customerAttachmentRouteParamsSchema,
  customerRoomResponseSchema,
  customerSendMessageBodySchema,
  liveEventSchema,
  messageListResponseSchema,
  reservationValidationResponseSchema,
  staffCaseDetailResponseSchema,
  staffCaseListResponseSchema,
  staffCannedRepliesResponseSchema,
  staffCreateNoteBodySchema,
  staffNoteMutationResponseSchema,
  staffNotesResponseSchema,
  staffSendMessageBodySchema,
  staffSessionResponseSchema,
  staffStatusMutationResponseSchema,
  staffAttachmentRouteParamsSchema,
  staffTimelineEventSchema,
  staffUpdateCaseStatusBodySchema,
  uploadIntentRequestSchema,
  uploadIntentResponseSchema
} from "@shared/schemas/reservation";
import type {
  AttachmentRetrievalPayload,
  AttachmentMutationPayload,
  ApiError,
  ApiResponse,
  CustomerMessageMutationPayload,
  CustomerMessagesPayload,
  CustomerRoomPayload,
  CustomerSessionPayload,
  DiagnosticsSummaryPayload,
  HealthLivePayload,
  HealthReadyPayload,
  ReservationValidationPayload,
  StaffCaseDetailPayload,
  StaffCaseListPayload,
  StaffCaseNoteListPayload,
  StaffCaseNoteMutationPayload,
  StaffCaseStatusMutationPayload,
  StaffCaseTimelinePayload,
  StaffCannedRepliesPayload,
  StaffSessionPayload,
  UploadIntentPayload
} from "@shared/types/api";
import type {
  AttachmentView,
  AttachmentVisibility,
  AttachmentUploadStatus,
  CaseStatus,
  CannedReplyView,
  ChatMessageView,
  CustomerSessionView,
  LiveEvent,
  ReservationSummary,
  RoomSummaryView,
  StaffCaseDetailView,
  StaffCaseListItem,
  StaffInternalNoteView,
  StaffSessionView,
  StaffTimelineEvent,
  ProtectedAttachmentView,
  UploadCapabilityView
} from "@shared/types/domain";
import type { RuntimeEnv } from "./env";
import { staffExportEvidence, getInventory, updateInventory, deptChatHandler, fileIngestHandler } from "./fleet";
import { staffFleetVehicles, staffFleetVehicleCreate, staffFleetShifts, staffFleetWashes, staffFleetWashCreate } from "./fleet-ops";
import { handleGenerateSchedule, handleGetSchedule, handleUpdateShift, handlePublishSchedule, handleGetEmployees, handleGetStations } from "./scheduling";

const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{16,128}$/u;
const CUSTOMER_MESSAGE_MAX = 2000;
const STAFF_NOTE_MAX = 2000;
const ATTACHMENT_NAME_MAX = 255;
const ATTACHMENT_KEY_MAX = 512;
const ALLOWED_ATTACHMENT_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const STAFF_STATUS_TRANSITIONS: Record<
  "new" | "under_review" | "waiting_customer" | "resolved" | "closed",
  Array<"new" | "under_review" | "waiting_customer" | "resolved" | "closed">
> = {
  new: ["under_review", "waiting_customer", "closed"],
  under_review: ["waiting_customer", "resolved", "closed"],
  waiting_customer: ["under_review", "resolved", "closed"],
  resolved: ["closed", "under_review"],
  closed: []
};

function nowEpochS(): number {
  return Math.floor(Date.now() / 1000);
}

function requestIdFrom(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function commonHeaders(requestId: string): HeadersInit {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": requestId,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "geolocation=()"
  };
}

function json<T>(status: number, requestId: string, payload: ApiResponse<T>, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...commonHeaders(requestId),
      ...(headers ?? {})
    }
  });
}

function ok<T>(requestId: string, data: T, headers?: HeadersInit): Response {
  return json<T>(200, requestId, {
    ok: true,
    data,
    requestId,
    atEpochS: nowEpochS()
  }, headers);
}

function fail(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  const payload: ApiError = {
    ok: false,
    error: {
      code,
      message,
      details
    },
    requestId,
    atEpochS: nowEpochS()
  };

  return json(status, requestId, payload);
}

function bindStatement(db: D1Database, sql: string, params: Array<string | number | null>): D1PreparedStatement {
  if (params.length === 0) {
    return db.prepare(sql);
  }
  return db.prepare(sql).bind(...params);
}

function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .reduce<Record<string, string>>((acc, part) => {
      const [rawName, ...rawValueParts] = part.split("=");
      const name = rawName?.trim();
      if (!name) {
        return acc;
      }
      acc[name] = decodeURIComponent(rawValueParts.join("="));
      return acc;
    }, {});
}

function randomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function newOpaqueId(): string {
  return `${crypto.randomUUID().replace(/-/gu, "")}${randomToken(8)}`;
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseSessionCookie(rawValue: string | undefined): { sessionPublicId: string; secret: string } | null {
  if (!rawValue) {
    return null;
  }

  const [sessionPublicId, secret] = rawValue.split(".");
  if (!sessionPublicId || !secret) {
    return null;
  }

  if (!OPAQUE_ID_RE.test(sessionPublicId) || secret.length < 16 || secret.length > 256) {
    return null;
  }

  return { sessionPublicId, secret };
}

function buildCookie(
  name: string,
  value: string,
  options: {
    maxAgeS: number;
    path?: string;
    httpOnly?: boolean;
    sameSite?: "Lax" | "Strict";
    secure?: boolean;
  }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`, `Max-Age=${options.maxAgeS}`];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure ?? true) {
    parts.push("Secure");
  }

  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);

  return parts.join("; ");
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function parseJsonBody<T>(request: Request, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }): Promise<{ success: true; data: T } | { success: false }> {
  let jsonValue: unknown;
  try {
    jsonValue = await request.json();
  } catch {
    return { success: false };
  }

  const parsed = schema.safeParse(jsonValue);
  if (!parsed.success) {
    return { success: false };
  }

  return { success: true, data: parsed.data };
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

type ReservationRow = {
  id: string;
  reservation_number: string;
  station_id: string;
  station_code: string;
  pickup_date_local: string;
  pickup_day_start_epoch_s: number;
  pickup_day_end_epoch_s: number;
  status: "active" | "cancelled" | "closed";
  has_uploaded_evidence: number;
};

type ChatRoomRow = {
  id: string;
  reservation_id: string;
  station_id: string;
  opaque_room_token: string;
  do_room_name: string;
  case_status: CaseStatus;
  last_event_seq: number;
  last_message_epoch_s: number | null;
};

type UploadCapabilityRow = {
  id: string;
  reservation_id: string;
  room_id: string;
  status: "enabled" | "expired" | "revoked";
  max_files: number;
  used_files_count: number;
  upload_window_start_epoch_s: number;
  upload_window_end_epoch_s: number;
};

type CustomerSessionJoinRow = {
  auth_session_id: string;
  session_public_id: string;
  session_secret_hash: string;
  status: "active" | "revoked" | "expired";
  expires_epoch_s: number;
  reservation_id: string;
  room_id: string;
  reservation_number: string;
  station_code: string;
  pickup_date_local: string;
  pickup_day_start_epoch_s: number;
  pickup_day_end_epoch_s: number;
  reservation_status: "active" | "cancelled" | "closed";
  has_uploaded_evidence: number;
  opaque_room_token: string;
  case_status: CaseStatus;
  last_event_seq: number;
  last_message_epoch_s: number | null;
  capability_id: string | null;
  capability_status: "enabled" | "expired" | "revoked" | null;
  max_files: number | null;
  used_files_count: number | null;
  upload_window_start_epoch_s: number | null;
  upload_window_end_epoch_s: number | null;
};

type StaffSessionJoinRow = {
  staff_auth_session_id: string;
  staff_user_id: string;
  session_public_id: string;
  session_secret_hash: string;
  csrf_token_hash: string;
  status: "active" | "revoked" | "expired";
  expires_epoch_s: number;
  email: string;
  display_name: string;
  is_active: number;
};

type MessageRow = {
  id: string;
  sender_kind: "customer" | "staff" | "system";
  message_kind: "text" | "system" | "consent_receipt" | "attachment" | "canned_reply";
  body: string | null;
  metadata_json: string;
  created_epoch_s: number;
  client_created_epoch_ms: number | null;
  idempotency_key: string;
  attachment_id: string | null;
  attachment_file_name: string | null;
  attachment_content_type: string | null;
  attachment_size_bytes: number | null;
  attachment_storage_key: string | null;
  attachment_visibility: "customer_visible" | "staff_only" | null;
  attachment_upload_status: "intent_created" | "metadata_persisted" | null;
};

type NoteRow = {
  id: string;
  body: string;
  created_epoch_s: number;
  staff_user_id: string;
  display_name: string;
  idempotency_key: string;
};

type AttachmentRow = {
  attachment_id: string;
  message_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  visibility: "customer_visible" | "staff_only";
  upload_status: "intent_created" | "metadata_persisted";
  created_epoch_s: number;
  sender_kind: "customer" | "staff" | "system";
};

type CaseDetailRow = {
  case_id: string;
  reservation_id: string;
  station_code: string;
  reservation_number: string;
  pickup_date_local: string;
  pickup_day_start_epoch_s: number;
  pickup_day_end_epoch_s: number;
  reservation_status: "active" | "cancelled" | "closed";
  has_uploaded_evidence: number;
  room_token: string;
  case_status: CaseStatus;
  last_event_seq: number;
  last_message_epoch_s: number | null;
  capability_id: string | null;
  capability_status: "enabled" | "expired" | "revoked" | null;
  max_files: number | null;
  used_files_count: number | null;
  upload_window_start_epoch_s: number | null;
  upload_window_end_epoch_s: number | null;
  do_room_name: string;
};

function mapReservation(row: ReservationRow | CustomerSessionJoinRow | CaseDetailRow): ReservationSummary {
  const reservationId =
    "id" in row && typeof row.id === "string"
      ? row.id
      : "reservation_id" in row && typeof row.reservation_id === "string"
        ? row.reservation_id
        : "";

  return {
    id: reservationId,
    reservationNumber: row.reservation_number,
    stationCode: row.station_code,
    pickupDateLocal: row.pickup_date_local as ReservationSummary["pickupDateLocal"],
    pickupDayStartEpochS: row.pickup_day_start_epoch_s,
    pickupDayEndEpochS: row.pickup_day_end_epoch_s,
    hasUploadedEvidence: row.has_uploaded_evidence === 1,
    status: (row as ReservationRow).status ?? (row as CustomerSessionJoinRow).reservation_status
  };
}

function mapRoomSummary(row: {
  opaque_room_token?: string;
  room_token?: string;
  case_status: CaseStatus;
  last_event_seq: number;
  last_message_epoch_s: number | null;
}): RoomSummaryView {
  return {
    roomToken: row.opaque_room_token ?? row.room_token ?? "",
    caseStatus: row.case_status,
    lastEventSeq: row.last_event_seq,
    lastMessageEpochS: row.last_message_epoch_s
  };
}

function mapUploadCapability(row: UploadCapabilityRow): UploadCapabilityView {
  return {
    capabilityId: row.id,
    status: row.status,
    maxFiles: row.max_files,
    usedFilesCount: row.used_files_count,
    uploadWindowStartEpochS: row.upload_window_start_epoch_s,
    uploadWindowEndEpochS: row.upload_window_end_epoch_s
  };
}

function mapMessage(row: MessageRow): ChatMessageView {
  const attachment: AttachmentView | null =
    row.attachment_id &&
    row.attachment_file_name &&
    row.attachment_content_type &&
    row.attachment_size_bytes !== null &&
    row.attachment_storage_key &&
    row.attachment_visibility &&
    row.attachment_upload_status
      ? {
          attachmentId: row.attachment_id,
          messageId: row.id,
          fileName: row.attachment_file_name,
          contentType: row.attachment_content_type,
          sizeBytes: row.attachment_size_bytes,
          storageKey: row.attachment_storage_key,
          visibility: row.attachment_visibility,
          createdEpochS: row.created_epoch_s,
          senderKind: row.sender_kind,
          uploadStatus: row.attachment_upload_status
        }
      : null;

  return {
    id: row.id,
    senderKind: row.sender_kind,
    messageKind: row.message_kind,
    body: row.body,
    createdEpochS: row.created_epoch_s,
    clientCreatedEpochMs: row.client_created_epoch_ms,
    idempotencyKey: row.idempotency_key,
    attachment
  };
}

function mapStaffNote(row: NoteRow): StaffInternalNoteView {
  return {
    noteId: row.id,
    body: row.body,
    createdEpochS: row.created_epoch_s,
    createdBy: {
      staffUserId: row.staff_user_id,
      displayName: row.display_name
    },
    idempotencyKey: row.idempotency_key,
    clientCreatedEpochMs: null
  };
}

function getAllowedTransitions(currentStatus: CaseStatus): CaseStatus[] {
  if (currentStatus === "new" || currentStatus === "under_review" || currentStatus === "waiting_customer" || currentStatus === "resolved" || currentStatus === "closed") {
    return STAFF_STATUS_TRANSITIONS[currentStatus];
  }
  return [];
}

async function writeAuditLog(
  runtime: RuntimeEnv,
  input: {
    actorKind: "customer" | "staff" | "system";
    actorId?: string | null;
    action: string;
    targetKind: string;
    targetId?: string | null;
    reservationId?: string | null;
    roomId?: string | null;
    authSessionId?: string | null;
    staffAuthSessionId?: string | null;
    requestId: string;
    outcome: "success" | "failure";
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await runtime.bindings.DB.prepare(
      `INSERT INTO audit_logs (
        id, actor_kind, actor_id, action, target_kind, target_id, reservation_id, room_id,
        auth_session_id, staff_auth_session_id, request_id, outcome, metadata_json, created_epoch_s
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        newOpaqueId(),
        input.actorKind,
        input.actorId ?? null,
        input.action,
        input.targetKind,
        input.targetId ?? null,
        input.reservationId ?? null,
        input.roomId ?? null,
        input.authSessionId ?? null,
        input.staffAuthSessionId ?? null,
        input.requestId,
        input.outcome,
        JSON.stringify(input.metadata ?? {}),
        nowEpochS()
      )
      .run();
  } catch (error) {
    console.warn("audit_log_write_failed", {
      request_id: input.requestId,
      action: input.action,
      reason: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function logReservationValidationAttempt(
  runtime: RuntimeEnv,
  input: {
    reservationNumber: string;
    stationCode?: string;
    success: boolean;
    reasonCode?: string;
    requestId: string;
  }
): Promise<void> {
  try {
    await runtime.bindings.DB.prepare(
      `INSERT INTO reservation_validation_attempts (
        id, reservation_number_hash, station_code, success, reason_code, request_id, created_epoch_s
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        newOpaqueId(),
        await sha256Hex(input.reservationNumber),
        input.stationCode ?? null,
        input.success ? 1 : 0,
        input.reasonCode ?? null,
        input.requestId,
        nowEpochS()
      )
      .run();
  } catch (error) {
    console.warn("reservation_validation_attempt_log_failed", {
      request_id: input.requestId,
      reason: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function publishLiveEvent(
  runtime: RuntimeEnv,
  event: LiveEvent,
  input: { requestId: string; roomId?: string; mutationKind: string; doRoomName: string }
): Promise<void> {
  const parsed = liveEventSchema.safeParse(event);
  if (!parsed.success) {
    console.error("live_publish_invalid_payload", {
      request_id: input.requestId,
      mutation_kind: input.mutationKind
    });
    return;
  }

  try {
    const id = runtime.bindings.CHAT_ROOM_DO.idFromName(input.doRoomName);
    const stub = runtime.bindings.CHAT_ROOM_DO.get(id);
    const response = await stub.fetch("https://chat-room.internal/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(event)
    });

    if (response.status >= 400) {
      console.warn("live_publish_failed", {
        request_id: input.requestId,
        room_id: input.roomId,
        mutation_kind: input.mutationKind,
        status: response.status
      });
      return;
    }

    console.info("live_publish_success", {
      request_id: input.requestId,
      room_id: input.roomId,
      mutation_kind: input.mutationKind,
      type: event.type
    });
  } catch (error) {
    console.warn("live_publish_failed", {
      request_id: input.requestId,
      room_id: input.roomId,
      mutation_kind: input.mutationKind,
      reason: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function findReservationByNumber(runtime: RuntimeEnv, reservationNumber: string): Promise<ReservationRow | null> {
  return runtime.bindings.DB.prepare(
    `SELECT
      r.id,
      r.reservation_number,
      r.station_id,
      s.code AS station_code,
      r.pickup_date_local,
      r.pickup_day_start_epoch_s,
      r.pickup_day_end_epoch_s,
      r.status,
      r.has_uploaded_evidence
    FROM reservations r
    INNER JOIN stations s ON s.id = r.station_id
    WHERE r.reservation_number = ?
    LIMIT 1`
  )
    .bind(reservationNumber)
    .first<ReservationRow>();
}

async function ensureRoom(runtime: RuntimeEnv, reservation: ReservationRow): Promise<ChatRoomRow> {
  const existing = await runtime.bindings.DB.prepare(
    `SELECT id, reservation_id, station_id, opaque_room_token, do_room_name, case_status, last_event_seq, last_message_epoch_s
     FROM chat_rooms WHERE reservation_id = ? LIMIT 1`
  )
    .bind(reservation.id)
    .first<ChatRoomRow>();

  if (existing) {
    return existing;
  }

  const newRoom: ChatRoomRow = {
    id: newOpaqueId(),
    reservation_id: reservation.id,
    station_id: reservation.station_id,
    opaque_room_token: randomToken(24),
    do_room_name: `room_${randomToken(16)}`,
    case_status: "new",
    last_event_seq: 0,
    last_message_epoch_s: null
  };

  await runtime.bindings.DB.prepare(
    `INSERT INTO chat_rooms (
      id, reservation_id, station_id, opaque_room_token, do_room_name, case_status, last_event_seq
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      newRoom.id,
      newRoom.reservation_id,
      newRoom.station_id,
      newRoom.opaque_room_token,
      newRoom.do_room_name,
      newRoom.case_status,
      newRoom.last_event_seq
    )
    .run();

  return newRoom;
}

async function ensureUploadCapability(
  runtime: RuntimeEnv,
  reservation: ReservationRow,
  roomId: string
): Promise<UploadCapabilityRow> {
  const nowS = nowEpochS();
  const existing = await runtime.bindings.DB.prepare(
    `SELECT id, reservation_id, room_id, status, max_files, used_files_count, upload_window_start_epoch_s, upload_window_end_epoch_s
     FROM reservation_upload_capabilities
     WHERE reservation_id = ?
     LIMIT 1`
  )
    .bind(reservation.id)
    .first<UploadCapabilityRow>();

  const timeStatus: UploadCapabilityRow["status"] = nowS > reservation.pickup_day_end_epoch_s ? "expired" : "enabled";

  if (existing) {
    const effectiveStatus = existing.status === "revoked" ? "revoked" : timeStatus;

    await runtime.bindings.DB.prepare(
      `UPDATE reservation_upload_capabilities
       SET room_id = ?,
           status = ?,
           upload_window_start_epoch_s = ?,
           upload_window_end_epoch_s = ?,
           last_evaluated_epoch_s = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        roomId,
        effectiveStatus,
        reservation.pickup_day_start_epoch_s,
        reservation.pickup_day_end_epoch_s,
        nowS,
        existing.id
      )
      .run();

    return {
      ...existing,
      room_id: roomId,
      status: effectiveStatus,
      upload_window_start_epoch_s: reservation.pickup_day_start_epoch_s,
      upload_window_end_epoch_s: reservation.pickup_day_end_epoch_s
    };
  }

  const created: UploadCapabilityRow = {
    id: newOpaqueId(),
    reservation_id: reservation.id,
    room_id: roomId,
    status: timeStatus,
    max_files: parsePositiveInt(runtime.config.MAX_UPLOAD_FILES_PER_RESERVATION.toString(), 15),
    used_files_count: 0,
    upload_window_start_epoch_s: reservation.pickup_day_start_epoch_s,
    upload_window_end_epoch_s: reservation.pickup_day_end_epoch_s
  };

  await runtime.bindings.DB.prepare(
    `INSERT INTO reservation_upload_capabilities (
      id, reservation_id, room_id, status, upload_window_start_epoch_s, upload_window_end_epoch_s,
      max_files, used_files_count, last_evaluated_epoch_s
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      created.id,
      created.reservation_id,
      created.room_id,
      created.status,
      created.upload_window_start_epoch_s,
      created.upload_window_end_epoch_s,
      created.max_files,
      created.used_files_count,
      nowS
    )
    .run();

  return created;
}

function buildCustomerSessionCookieValue(sessionPublicId: string, secret: string): string {
  return `${sessionPublicId}.${secret}`;
}

function buildStaffSessionCookieValue(sessionPublicId: string, secret: string): string {
  return `${sessionPublicId}.${secret}`;
}

async function createCustomerSession(runtime: RuntimeEnv, reservationId: string, roomId: string): Promise<{ session: CustomerSessionView; cookieValue: string; authSessionId: string }> {
  const sessionPublicId = newOpaqueId();
  const secret = randomToken(24);
  const secretHash = await sha256Hex(secret);
  const authSessionId = newOpaqueId();
  const issued = nowEpochS();
  const ttl = parsePositiveInt(runtime.config.CUSTOMER_SESSION_TTL_S.toString(), 2_592_000);

  await runtime.bindings.DB.prepare(
    `INSERT INTO customer_auth_sessions (
      id, reservation_id, room_id, session_public_id, session_secret_hash,
      status, issued_epoch_s, last_seen_epoch_s, expires_epoch_s
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  )
    .bind(authSessionId, reservationId, roomId, sessionPublicId, secretHash, issued, issued, issued + ttl)
    .run();

  return {
    session: {
      sessionPublicId,
      roomToken: "",
      expiresEpochS: issued + ttl
    },
    cookieValue: buildCustomerSessionCookieValue(sessionPublicId, secret),
    authSessionId
  };
}

async function createStaffSession(runtime: RuntimeEnv, staffUserId: string): Promise<{ session: StaffSessionView; cookieValue: string; csrfToken: string; staffAuthSessionId: string }> {
  const sessionPublicId = newOpaqueId();
  const secret = randomToken(24);
  const secretHash = await sha256Hex(secret);
  const csrfToken = randomToken(18);
  const csrfHash = await sha256Hex(csrfToken);
  const staffAuthSessionId = newOpaqueId();
  const issued = nowEpochS();
  const ttl = parsePositiveInt(runtime.config.STAFF_SESSION_TTL_S.toString(), 28_800);

  await runtime.bindings.DB.prepare(
    `INSERT INTO staff_auth_sessions (
      id, staff_user_id, session_public_id, session_secret_hash, csrf_token_hash,
      status, issued_epoch_s, last_seen_epoch_s, expires_epoch_s
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  )
    .bind(staffAuthSessionId, staffUserId, sessionPublicId, secretHash, csrfHash, issued, issued, issued + ttl)
    .run();

  return {
    session: {
      sessionPublicId,
      staffUserId,
      displayName: "",
      email: "",
      expiresEpochS: issued + ttl,
      roleKeys: [],
      permissions: []
    },
    cookieValue: buildStaffSessionCookieValue(sessionPublicId, secret),
    csrfToken,
    staffAuthSessionId
  };
}

async function getCustomerAuthContext(runtime: RuntimeEnv, request: Request): Promise<
  | {
      ok: true;
      authSessionId: string;
      reservation: ReservationSummary;
      room: RoomSummaryView & { roomId: string; doRoomName: string };
      customerSession: CustomerSessionView;
      uploadCapability: UploadCapabilityView;
    }
  | { ok: false; reason: string }
> {
  const cookies = parseCookies(request);
  const parsed = parseSessionCookie(cookies[runtime.config.CUSTOMER_SESSION_COOKIE_NAME]);

  if (!parsed) {
    return { ok: false, reason: "missing_cookie" };
  }

  const row = await runtime.bindings.DB.prepare(
    `SELECT
      cas.id AS auth_session_id,
      cas.session_public_id,
      cas.session_secret_hash,
      cas.status,
      cas.expires_epoch_s,
      cas.reservation_id,
      cas.room_id,
      r.reservation_number,
      s.code AS station_code,
      r.pickup_date_local,
      r.pickup_day_start_epoch_s,
      r.pickup_day_end_epoch_s,
      r.status,
      r.has_uploaded_evidence AS reservation_status,
      cr.opaque_room_token,
      cr.case_status,
      cr.last_event_seq,
      cr.last_message_epoch_s,
      cr.do_room_name,
      cap.id AS capability_id,
      cap.status AS capability_status,
      cap.max_files,
      cap.used_files_count,
      cap.upload_window_start_epoch_s,
      cap.upload_window_end_epoch_s
    FROM customer_auth_sessions cas
    INNER JOIN reservations r ON r.id = cas.reservation_id
    INNER JOIN stations s ON s.id = r.station_id
    INNER JOIN chat_rooms cr ON cr.id = cas.room_id
    LEFT JOIN reservation_upload_capabilities cap ON cap.reservation_id = cas.reservation_id
    WHERE cas.session_public_id = ?
    LIMIT 1`
  )
    .bind(parsed.sessionPublicId)
    .first<CustomerSessionJoinRow & { do_room_name: string }>();

  if (!row) {
    return { ok: false, reason: "session_not_found" };
  }

  const secretHash = await sha256Hex(parsed.secret);
  if (secretHash !== row.session_secret_hash) {
    return { ok: false, reason: "session_hash_mismatch" };
  }

  const nowS = nowEpochS();
  if (row.status !== "active" || row.expires_epoch_s <= nowS) {
    if (row.status === "active" && row.expires_epoch_s <= nowS) {
      await runtime.bindings.DB.prepare(
        "UPDATE customer_auth_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(row.auth_session_id)
        .run();
    }
    return { ok: false, reason: "session_expired_or_revoked" };
  }

  await runtime.bindings.DB.prepare(
    "UPDATE customer_auth_sessions SET last_seen_epoch_s = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(nowS, row.auth_session_id)
    .run();

  const reservationRow: ReservationRow = {
    id: row.reservation_id,
    reservation_number: row.reservation_number,
    station_id: "",
    station_code: row.station_code,
    pickup_date_local: row.pickup_date_local,
    pickup_day_start_epoch_s: row.pickup_day_start_epoch_s,
    pickup_day_end_epoch_s: row.pickup_day_end_epoch_s,
    status: row.reservation_status
  };

  const capabilityRow =
    row.capability_id &&
    row.capability_status &&
    row.max_files !== null &&
    row.used_files_count !== null &&
    row.upload_window_start_epoch_s !== null &&
    row.upload_window_end_epoch_s !== null
      ? {
          id: row.capability_id,
          reservation_id: row.reservation_id,
          room_id: row.room_id,
          status: row.capability_status,
          max_files: row.max_files,
          used_files_count: row.used_files_count,
          upload_window_start_epoch_s: row.upload_window_start_epoch_s,
          upload_window_end_epoch_s: row.upload_window_end_epoch_s
        }
      : await ensureUploadCapability(runtime, reservationRow, row.room_id);

  return {
    ok: true,
    authSessionId: row.auth_session_id,
    reservation: mapReservation(reservationRow),
    room: {
      ...mapRoomSummary(row),
      roomId: row.room_id,
      doRoomName: row.do_room_name
    },
    customerSession: {
      sessionPublicId: row.session_public_id,
      roomToken: row.opaque_room_token,
      expiresEpochS: row.expires_epoch_s
    },
    uploadCapability: mapUploadCapability(capabilityRow)
  };
}

async function loadStaffSession(runtime: RuntimeEnv, request: Request, requireCsrf: boolean): Promise<
  | {
      ok: true;
      staffAuthSessionId: string;
      session: StaffSessionView;
    }
  | { ok: false; reason: string }
> {
  const cookies = parseCookies(request);
  const parsed = parseSessionCookie(cookies[runtime.config.STAFF_SESSION_COOKIE_NAME]);

  if (!parsed) {
    return { ok: false, reason: "missing_cookie" };
  }

  const sessionRow = await runtime.bindings.DB.prepare(
    `SELECT
      sas.id AS staff_auth_session_id,
      sas.staff_user_id,
      sas.session_public_id,
      sas.session_secret_hash,
      sas.csrf_token_hash,
      sas.status,
      sas.expires_epoch_s,
      su.email,
      su.display_name,
      su.is_active
    FROM staff_auth_sessions sas
    INNER JOIN staff_users su ON su.id = sas.staff_user_id
    WHERE sas.session_public_id = ?
    LIMIT 1`
  )
    .bind(parsed.sessionPublicId)
    .first<StaffSessionJoinRow>();

  if (!sessionRow) {
    return { ok: false, reason: "session_not_found" };
  }

  const presentedHash = await sha256Hex(parsed.secret);
  if (presentedHash !== sessionRow.session_secret_hash) {
    return { ok: false, reason: "hash_mismatch" };
  }

  const nowS = nowEpochS();
  if (sessionRow.status !== "active" || sessionRow.expires_epoch_s <= nowS || sessionRow.is_active !== 1) {
    if (sessionRow.status === "active" && sessionRow.expires_epoch_s <= nowS) {
      await runtime.bindings.DB.prepare(
        "UPDATE staff_auth_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(sessionRow.staff_auth_session_id)
        .run();
    }

    return { ok: false, reason: "session_expired_or_inactive" };
  }

  if (requireCsrf) {
    const csrfHeader = request.headers.get("x-csrf-token")?.trim();
    const csrfCookie = cookies[runtime.config.STAFF_CSRF_COOKIE_NAME]?.trim();

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return { ok: false, reason: "csrf_missing_or_mismatch" };
    }

    const csrfHash = await sha256Hex(csrfHeader);
    if (csrfHash !== sessionRow.csrf_token_hash) {
      return { ok: false, reason: "csrf_hash_mismatch" };
    }
  }

  await runtime.bindings.DB.prepare(
    "UPDATE staff_auth_sessions SET last_seen_epoch_s = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(nowS, sessionRow.staff_auth_session_id)
    .run();

  const rolesResult = await runtime.bindings.DB.prepare(
    `SELECT sr.role_key, sr.permissions_json
     FROM staff_user_roles sur
     INNER JOIN staff_roles sr ON sr.id = sur.role_id
     WHERE sur.staff_user_id = ?`
  )
    .bind(sessionRow.staff_user_id)
    .all<{ role_key: string; permissions_json: string }>();

  const roleKeys: string[] = [];
  const permissionsSet = new Set<string>();

  for (const role of rolesResult.results ?? []) {
    roleKeys.push(role.role_key);
    try {
      const parsedPermissions = JSON.parse(role.permissions_json) as unknown;
      if (Array.isArray(parsedPermissions)) {
        for (const permission of parsedPermissions) {
          if (typeof permission === "string" && permission.length > 0) {
            permissionsSet.add(permission);
          }
        }
      }
    } catch {
      // Ignore malformed role permissions.
    }
  }

  return {
    ok: true,
    staffAuthSessionId: sessionRow.staff_auth_session_id,
    session: {
      sessionPublicId: sessionRow.session_public_id,
      staffUserId: sessionRow.staff_user_id,
      displayName: sessionRow.display_name,
      email: sessionRow.email,
      expiresEpochS: sessionRow.expires_epoch_s,
      roleKeys,
      permissions: Array.from(permissionsSet)
    }
  };
}

function normalizeBodyText(text: string): string {
  return text.trim();
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const cleaned = trimmed.replace(/[\\/\0-\x1F\x7F]+/gu, "_");
  return cleaned.slice(0, ATTACHMENT_NAME_MAX);
}

function safeDownloadFileName(fileName: string): string {
  const sanitized = sanitizeFileName(fileName).replace(/["\r\n\\]+/gu, "_").trim();
  if (!sanitized) {
    return "attachment.bin";
  }
  return sanitized.slice(0, ATTACHMENT_NAME_MAX);
}

function buildContentDisposition(fileName: string): string {
  const safeFileName = safeDownloadFileName(fileName);
  const asciiFileName = safeFileName.replace(/[^\x20-\x7E]+/gu, "_").replace(/["\\]+/gu, "_") || "attachment.bin";
  const utf8FileName = encodeURIComponent(safeFileName).replace(/[!'()*]/gu, (ch) => {
    return `%${ch.charCodeAt(0).toString(16).toUpperCase()}`;
  });
  return `attachment; filename="${asciiFileName}"; filename*=UTF-8''${utf8FileName}`;
}

function normalizeContentType(contentType: string): string {
  return contentType.trim().toLowerCase();
}

function maxUploadBytes(runtime: RuntimeEnv): number {
  return parsePositiveInt(runtime.config.MAX_UPLOAD_BYTES_PER_FILE.toString(), 15 * 1024 * 1024);
}

function buildAttachmentObjectKey(input: {
  reservationId: string;
  roomId: string;
  fileName: string;
  createdEpochS: number;
}): string {
  const safeName = sanitizeFileName(input.fileName).replace(/\s+/gu, "_");
  return `attachments/${input.reservationId}/${input.roomId}/${input.createdEpochS}_${randomToken(8)}_${safeName}`.slice(0, ATTACHMENT_KEY_MAX);
}

function mapAttachmentRow(row: AttachmentRow): AttachmentView {
  return {
    attachmentId: row.attachment_id,
    messageId: row.message_id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    storageKey: row.storage_key,
    visibility: row.visibility,
    createdEpochS: row.created_epoch_s,
    senderKind: row.sender_kind,
    uploadStatus: row.upload_status
  };
}

function mapProtectedAttachmentRow(row: AttachmentRow): ProtectedAttachmentView {
  return {
    attachmentId: row.attachment_id,
    messageId: row.message_id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    visibility: row.visibility,
    createdEpochS: row.created_epoch_s,
    senderKind: row.sender_kind,
    uploadStatus: row.upload_status
  };
}

async function findCustomerVisibleAttachmentInRoom(
  runtime: RuntimeEnv,
  roomId: string,
  attachmentId: string
): Promise<AttachmentRow | null> {
  return runtime.bindings.DB.prepare(
    `SELECT
       ma.id AS attachment_id,
       ma.message_id,
       ma.file_name,
       ma.content_type,
       ma.size_bytes,
       ma.storage_key,
       ma.visibility,
       ma.upload_status,
       ma.created_epoch_s,
       ma.sender_kind
     FROM message_attachments ma
     INNER JOIN chat_messages cm ON cm.id = ma.message_id
     WHERE ma.id = ?
       AND ma.room_id = ?
       AND ma.visibility = 'customer_visible'
       AND cm.deleted_epoch_s IS NULL
     LIMIT 1`
  )
    .bind(attachmentId, roomId)
    .first<AttachmentRow>();
}

async function listCustomerVisibleMessages(
  runtime: RuntimeEnv,
  roomId: string,
  limit: number,
  beforeEpochS?: number
): Promise<ChatMessageView[]> {
  let sql =
    `SELECT
       cm.id,
       cm.sender_kind,
       cm.message_kind,
       cm.body,
       cm.metadata_json,
       cm.created_epoch_s,
       cm.client_created_epoch_ms,
       cm.idempotency_key,
       ma.id AS attachment_id,
       ma.file_name AS attachment_file_name,
       ma.content_type AS attachment_content_type,
       ma.size_bytes AS attachment_size_bytes,
       ma.storage_key AS attachment_storage_key,
       ma.visibility AS attachment_visibility,
       ma.upload_status AS attachment_upload_status
     FROM chat_messages cm
     LEFT JOIN message_attachments ma ON ma.message_id = cm.id
     WHERE cm.room_id = ? AND cm.visibility = 'customer_visible' AND cm.deleted_epoch_s IS NULL`;

  const params: Array<string | number | null> = [roomId];
  if (typeof beforeEpochS === "number") {
    sql += " AND cm.created_epoch_s < ?";
    params.push(beforeEpochS);
  }

  sql += " ORDER BY cm.created_epoch_s DESC, cm.id DESC LIMIT ?";
  params.push(limit);

  const result = await bindStatement(runtime.bindings.DB, sql, params).all<MessageRow>();
  return (result.results ?? []).map(mapMessage);
}

async function getAttachmentByIdempotency(
  runtime: RuntimeEnv,
  roomId: string,
  idempotencyKey: string
): Promise<{ attachment: AttachmentView; message: ChatMessageView } | null> {
  const row = await runtime.bindings.DB.prepare(
    `SELECT
       ma.id AS attachment_id,
       ma.message_id,
       ma.file_name,
       ma.content_type,
       ma.size_bytes,
       ma.storage_key,
       ma.visibility,
       ma.upload_status,
       ma.created_epoch_s,
       cm.id,
       cm.sender_kind,
       cm.message_kind,
       cm.body,
       cm.metadata_json,
       cm.created_epoch_s,
       cm.client_created_epoch_ms,
       cm.idempotency_key,
       ma.file_name AS attachment_file_name,
       ma.content_type AS attachment_content_type,
       ma.size_bytes AS attachment_size_bytes,
       ma.storage_key AS attachment_storage_key,
       ma.visibility AS attachment_visibility,
       ma.upload_status AS attachment_upload_status
     FROM message_attachments ma
     INNER JOIN chat_messages cm ON cm.id = ma.message_id
     WHERE ma.room_id = ? AND ma.idempotency_key = ?
     LIMIT 1`
  )
    .bind(roomId, idempotencyKey)
    .first<AttachmentRow & MessageRow>();

  if (!row) {
    return null;
  }

  return {
    attachment: mapAttachmentRow(row),
    message: mapMessage(row)
  };
}

async function getMessageWithAttachmentById(runtime: RuntimeEnv, messageId: string): Promise<ChatMessageView | null> {
  const row = await runtime.bindings.DB.prepare(
    `SELECT
       cm.id,
       cm.sender_kind,
       cm.message_kind,
       cm.body,
       cm.metadata_json,
       cm.created_epoch_s,
       cm.client_created_epoch_ms,
       cm.idempotency_key,
       ma.id AS attachment_id,
       ma.file_name AS attachment_file_name,
       ma.content_type AS attachment_content_type,
       ma.size_bytes AS attachment_size_bytes,
       ma.storage_key AS attachment_storage_key,
       ma.visibility AS attachment_visibility,
       ma.upload_status AS attachment_upload_status
     FROM chat_messages cm
     LEFT JOIN message_attachments ma ON ma.message_id = cm.id
     WHERE cm.id = ?
     LIMIT 1`
  )
    .bind(messageId)
    .first<MessageRow>();

  return row ? mapMessage(row) : null;
}

function validateAttachmentConstraints(
  runtime: RuntimeEnv,
  input: { fileName: string; contentType: string; sizeBytes: number; visibility: AttachmentVisibility },
  actorKind: "customer" | "staff"
): { ok: true; sanitizedFileName: string; normalizedContentType: string; visibility: AttachmentVisibility } | { ok: false; reason: string } {
  const sanitizedFileName = sanitizeFileName(input.fileName);
  if (!sanitizedFileName || sanitizedFileName.length === 0) {
    return { ok: false, reason: "invalid_file_name" };
  }

  const normalizedContentType = normalizeContentType(input.contentType);
  if (!ALLOWED_ATTACHMENT_CONTENT_TYPES.has(normalizedContentType)) {
    return { ok: false, reason: "invalid_content_type" };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > maxUploadBytes(runtime)) {
    return { ok: false, reason: "invalid_file_size" };
  }

  if (actorKind === "customer" && input.visibility !== "customer_visible") {
    return { ok: false, reason: "invalid_visibility_customer" };
  }

  if (actorKind === "staff" && input.visibility !== "customer_visible") {
    return { ok: false, reason: "invalid_visibility_staff" };
  }

  return {
    ok: true,
    sanitizedFileName,
    normalizedContentType,
    visibility: input.visibility
  };
}

async function persistAttachment(
  runtime: RuntimeEnv,
  input: {
    actorKind: "customer" | "staff";
    senderAuthSessionId?: string;
    senderStaffUserId?: string;
    reservationId: string;
    roomId: string;
    roomToken: string;
    doRoomName: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    visibility: AttachmentVisibility;
    objectKey: string;
    idempotencyKey: string;
    clientCreatedEpochMs: number | null;
    requestId: string;
    staffAuthSessionId?: string;
    actorId: string;
  }
): Promise<AttachmentMutationPayload> {
  const existing = await getAttachmentByIdempotency(runtime, input.roomId, input.idempotencyKey);
  if (existing) {
    return {
      attachment: existing.attachment,
      message: existing.message
    };
  }

  const createdEpochS = nowEpochS();
  const messageId = newOpaqueId();
  const attachmentId = newOpaqueId();
  const messageBody = `Συνημμένο: ${input.fileName}`;
  const messageIdempotencyKey = `attmsg:${input.idempotencyKey}`;

  await runtime.bindings.DB.prepare(
    `INSERT INTO chat_messages (
      id, room_id, reservation_id, sender_kind, sender_auth_session_id, sender_staff_user_id,
      message_kind, visibility, body, metadata_json, idempotency_key, client_created_epoch_ms, created_epoch_s
    ) VALUES (?, ?, ?, ?, ?, ?, 'attachment', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      messageId,
      input.roomId,
      input.reservationId,
      input.actorKind,
      input.senderAuthSessionId ?? null,
      input.senderStaffUserId ?? null,
      input.visibility,
      messageBody,
      JSON.stringify({ attachmentId }),
      messageIdempotencyKey,
      input.clientCreatedEpochMs,
      createdEpochS
    )
    .run();

  await runtime.bindings.DB.prepare(
    `INSERT INTO message_attachments (
      id, message_id, room_id, reservation_id, sender_kind, sender_auth_session_id, sender_staff_user_id,
      file_name, content_type, size_bytes, storage_key, visibility, upload_status, idempotency_key, created_epoch_s
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'metadata_persisted', ?, ?)`
  )
    .bind(
      attachmentId,
      messageId,
      input.roomId,
      input.reservationId,
      input.actorKind,
      input.senderAuthSessionId ?? null,
      input.senderStaffUserId ?? null,
      input.fileName,
      input.contentType,
      input.sizeBytes,
      input.objectKey,
      input.visibility,
      input.idempotencyKey,
      createdEpochS
    )
    .run();

  await runtime.bindings.DB.prepare(
    `UPDATE chat_rooms
     SET last_event_seq = last_event_seq + 1,
         last_message_epoch_s = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(createdEpochS, input.roomId)
    .run();

  const message = await getMessageWithAttachmentById(runtime, messageId);
  if (!message || !message.attachment) {
    throw new Error("attachment_persistence_inconsistent");
  }

  await writeAuditLog(runtime, {
    actorKind: input.actorKind,
    actorId: input.actorId,
    action: input.actorKind === "customer" ? "customer_attachment_persist" : "staff_attachment_persist",
    targetKind: "attachment",
    targetId: attachmentId,
    reservationId: input.reservationId,
    roomId: input.roomId,
    authSessionId: input.senderAuthSessionId ?? null,
    staffAuthSessionId: input.staffAuthSessionId ?? null,
    requestId: input.requestId,
    outcome: "success"
  });

  void publishLiveEvent(
    runtime,
    {
      type: "message_persisted",
      roomToken: input.roomToken,
      messageId,
      createdEpochS,
      senderKind: input.actorKind
    },
    {
      requestId: input.requestId,
      roomId: input.roomId,
      mutationKind: input.actorKind === "customer" ? "customer_attachment_persist" : "staff_attachment_persist",
      doRoomName: input.doRoomName
    }
  );

  return {
    attachment: message.attachment,
    message
  };
}

async function resolveCaseById(runtime: RuntimeEnv, caseId: string): Promise<CaseDetailRow | null> {
  return runtime.bindings.DB.prepare(
    `SELECT
      cr.id AS case_id,
      cr.reservation_id,
      s.code AS station_code,
      r.reservation_number,
      r.pickup_date_local,
      r.pickup_day_start_epoch_s,
      r.pickup_day_end_epoch_s,
      r.status,
      r.has_uploaded_evidence AS reservation_status,
      cr.opaque_room_token AS room_token,
      cr.case_status,
      cr.last_event_seq,
      cr.last_message_epoch_s,
      cap.id AS capability_id,
      cap.status AS capability_status,
      cap.max_files,
      cap.used_files_count,
      cap.upload_window_start_epoch_s,
      cap.upload_window_end_epoch_s,
      cr.do_room_name
    FROM chat_rooms cr
    INNER JOIN reservations r ON r.id = cr.reservation_id
    INNER JOIN stations s ON s.id = r.station_id
    LEFT JOIN reservation_upload_capabilities cap ON cap.reservation_id = r.id
    WHERE cr.id = ?
    LIMIT 1`
  )
    .bind(caseId)
    .first<CaseDetailRow>();
}

function mapCaseDetail(row: CaseDetailRow, messages: ChatMessageView[]): StaffCaseDetailView {
  const fallbackCapability: UploadCapabilityView = {
    capabilityId: row.capability_id ?? newOpaqueId(),
    status: row.capability_status ?? (nowEpochS() > row.pickup_day_end_epoch_s ? "expired" : "enabled"),
    maxFiles: row.max_files ?? 15,
    usedFilesCount: row.used_files_count ?? 0,
    uploadWindowStartEpochS: row.upload_window_start_epoch_s ?? row.pickup_day_start_epoch_s,
    uploadWindowEndEpochS: row.upload_window_end_epoch_s ?? row.pickup_day_end_epoch_s
  };

  return {
    caseId: row.case_id,
    roomToken: row.room_token,
    reservation: {
      id: row.reservation_id,
      reservationNumber: row.reservation_number,
      stationCode: row.station_code,
      pickupDateLocal: row.pickup_date_local as ReservationSummary["pickupDateLocal"],
      pickupDayStartEpochS: row.pickup_day_start_epoch_s,
      pickupDayEndEpochS: row.pickup_day_end_epoch_s,
    hasUploadedEvidence: row.has_uploaded_evidence === 1,
      status: row.reservation_status
    },
    room: mapRoomSummary({
      room_token: row.room_token,
      case_status: row.case_status,
      last_event_seq: row.last_event_seq,
      last_message_epoch_s: row.last_message_epoch_s
    }),
    uploadCapability: fallbackCapability,
    messages,
    allowedTransitions: getAllowedTransitions(row.case_status)
  };
}

async function connectToDurableRoom(
  runtime: RuntimeEnv,
  request: Request,
  input: {
    doRoomName: string;
    roomToken: string;
    role: "customer" | "staff";
    requestId: string;
    roomId?: string;
  }
): Promise<Response> {
  try {
    const doId = runtime.bindings.CHAT_ROOM_DO.idFromName(input.doRoomName);
    const stub = runtime.bindings.CHAT_ROOM_DO.get(doId);

    const doRequest = new Request(
      `https://chat-room.internal/connect?role=${encodeURIComponent(input.role)}&roomToken=${encodeURIComponent(input.roomToken)}`,
      {
        method: "GET",
        headers: request.headers
      }
    );

    const response = await stub.fetch(doRequest);

    if (response.status === 101) {
      console.info("websocket_connect_success", {
        request_id: input.requestId,
        room_id: input.roomId,
        role: input.role
      });
      return response;
    }

    console.warn("websocket_connect_failed", {
      request_id: input.requestId,
      room_id: input.roomId,
      role: input.role,
      status: response.status
    });

    return fail(input.requestId, 502, "WEBSOCKET_CONNECT_FAILED", "Unable to continue");
  } catch (error) {
    console.error("websocket_connect_failed", {
      request_id: input.requestId,
      room_id: input.roomId,
      role: input.role,
      reason: error instanceof Error ? error.message : "unknown"
    });

    return fail(input.requestId, 502, "WEBSOCKET_CONNECT_FAILED", "Unable to continue");
  }
}

async function healthReady(runtime: RuntimeEnv, requestId: string): Promise<Response> {
  const reasonCodes: string[] = [];
  let d1Status: HealthReadyPayload["checks"]["d1"] = "ok";
  let r2Status: HealthReadyPayload["checks"]["r2"] = "unknown";
  let queuesStatus: HealthReadyPayload["checks"]["queues"] = "unknown";

  try {
    await runtime.bindings.DB.prepare("SELECT 1 AS ok").first();
  } catch {
    d1Status = "error";
    reasonCodes.push("d1_unreachable");
  }

  try {
    await runtime.bindings.UPLOADS_BUCKET.head("__cloudops_readiness_probe__");
    r2Status = "ok";
  } catch {
    r2Status = "error";
    reasonCodes.push("r2_unreachable");
  }

  try {
    if (runtime.bindings.DRIVE_SYNC_QUEUE && runtime.bindings.INCIDENT_EVENTS_QUEUE) {
      queuesStatus = "ok";
    } else {
      queuesStatus = "error";
      reasonCodes.push("queue_binding_missing");
    }
  } catch {
    queuesStatus = "error";
    reasonCodes.push("queue_binding_unavailable");
  }

  const payload: HealthReadyPayload = {
    status: d1Status === "ok" && r2Status === "ok" && queuesStatus === "ok" ? "ready" : "degraded",
    checks: {
      d1: d1Status,
      r2: r2Status,
      queues: queuesStatus
    },
    reasonCodes,
    checkedAtEpochS: nowEpochS()
  };

  if (payload.status === "ready") {
    return ok(requestId, payload);
  }

  console.warn("health_readiness_degraded", {
    request_id: requestId,
    checks: payload.checks,
    reason_codes: payload.reasonCodes
  });

  return fail(requestId, 503, "HEALTH_NOT_READY", "Readiness check failed", {
    checks: payload.checks,
    reasonCodes: payload.reasonCodes,
    checkedAtEpochS: payload.checkedAtEpochS
  });
}

async function diagnosticsSummary(runtime: RuntimeEnv, requestId: string): Promise<Response> {
  if (!runtime.config.DIAGNOSTICS_ENABLED) {
    return fail(requestId, 404, "DIAGNOSTICS_DISABLED", "Diagnostics endpoint is disabled");
  }

  const openAlertsRow = await runtime.bindings.DB.prepare(
    "SELECT COUNT(1) AS count FROM alerts WHERE is_open = 1"
  ).first<{ count: number | null }>();

  const criticalAlertsRow = await runtime.bindings.DB.prepare(
    "SELECT COUNT(1) AS count FROM alerts WHERE is_open = 1 AND severity = 'critical'"
  ).first<{ count: number | null }>();

  const dlqOpenRow = await runtime.bindings.DB.prepare(
    "SELECT COUNT(1) AS count FROM queue_dlq_events WHERE status = 'open'"
  ).first<{ count: number | null }>();

  const openCasesRow = await runtime.bindings.DB.prepare(
    "SELECT COUNT(1) AS count FROM chat_rooms WHERE case_status NOT IN ('resolved', 'closed')"
  ).first<{ count: number | null }>();

  const activeCustomerSessionsRow = await runtime.bindings.DB.prepare(
    "SELECT COUNT(1) AS count FROM customer_auth_sessions WHERE status = 'active' AND expires_epoch_s > ?"
  )
    .bind(nowEpochS())
    .first<{ count: number | null }>();

  const activeStaffSessionsRow = await runtime.bindings.DB.prepare(
    "SELECT COUNT(1) AS count FROM staff_auth_sessions WHERE status = 'active' AND expires_epoch_s > ?"
  )
    .bind(nowEpochS())
    .first<{ count: number | null }>();

  const pendingAttachmentEventsRow = await runtime.bindings.DB.prepare(
    "SELECT COUNT(1) AS count FROM message_attachments WHERE upload_status <> 'metadata_persisted'"
  ).first<{ count: number | null }>();

  const payload: DiagnosticsSummaryPayload = {
    openAlerts: Number(openAlertsRow?.count ?? 0),
    criticalAlerts: Number(criticalAlertsRow?.count ?? 0),
    dlqOpenItems: Number(dlqOpenRow?.count ?? 0),
    openCases: Number(openCasesRow?.count ?? 0),
    activeCustomerSessions: Number(activeCustomerSessionsRow?.count ?? 0),
    activeStaffSessions: Number(activeStaffSessionsRow?.count ?? 0),
    pendingAttachmentEvents: Number(pendingAttachmentEventsRow?.count ?? 0),
    generatedAtEpochS: nowEpochS()
  };

  console.info("diagnostics_summary_read", {
    request_id: requestId,
    open_alerts: payload.openAlerts,
    critical_alerts: payload.criticalAlerts,
    dlq_open_items: payload.dlqOpenItems,
    open_cases: payload.openCases,
    active_customer_sessions: payload.activeCustomerSessions,
    active_staff_sessions: payload.activeStaffSessions,
    pending_attachment_events: payload.pendingAttachmentEvents
  });

  return ok(requestId, payload);
}

async function serveSpa(runtime: RuntimeEnv, request: Request): Promise<Response> {
  const assets = runtime.bindings.ASSETS;

  if (!assets) {
    return new Response("CloudOPS API is running", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  const directAsset = await assets.fetch(request);
  if (directAsset.status !== 404) {
    return directAsset;
  }

  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
  if (request.method === "GET" && acceptsHtml) {
    const url = new URL(request.url);
    const indexRequest = new Request(new URL("/index.html", url.origin).toString(), {
      method: "GET",
      headers: request.headers
    });
    return assets.fetch(indexRequest);
  }

  return directAsset;
}

async function customerBootstrap(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const body = await parseJsonBody(request, customerBootstrapRequestSchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const reservation = await findReservationByNumber(runtime, body.data.reservationNumber);
  if (!reservation || reservation.status !== "active") {
    await logReservationValidationAttempt(runtime, {
      reservationNumber: body.data.reservationNumber,
      stationCode: body.data.stationCode,
      success: false,
      reasonCode: "invalid_or_inactive",
      requestId
    });

    await writeAuditLog(runtime, {
      actorKind: "customer",
      action: "customer_session_bootstrap",
      targetKind: "reservation",
      requestId,
      outcome: "failure",
      metadata: {
        reason: "invalid_or_inactive"
      }
    });

    return fail(requestId, 401, "INVALID_RESERVATION", "Unable to continue");
  }

  const room = await ensureRoom(runtime, reservation);
  const uploadCapabilityRow = await ensureUploadCapability(runtime, reservation, room.id);
  const createdSession = await createCustomerSession(runtime, reservation.id, room.id);
  createdSession.session.roomToken = room.opaque_room_token;

  await logReservationValidationAttempt(runtime, {
    reservationNumber: body.data.reservationNumber,
    stationCode: body.data.stationCode,
    success: true,
    requestId
  });

  await writeAuditLog(runtime, {
    actorKind: "customer",
    actorId: createdSession.session.sessionPublicId,
    action: "customer_session_bootstrap",
    targetKind: "room",
    targetId: room.id,
    reservationId: reservation.id,
    roomId: room.id,
    authSessionId: createdSession.authSessionId,
    requestId,
    outcome: "success"
  });

  const payload: ReservationValidationPayload = {
    reservation: mapReservation(reservation),
    customerSession: createdSession.session,
    uploadCapability: mapUploadCapability(uploadCapabilityRow),
    roomToken: room.opaque_room_token
  };

  const parsed = reservationValidationResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  const sessionCookie = buildCookie(runtime.config.CUSTOMER_SESSION_COOKIE_NAME, createdSession.cookieValue, {
    maxAgeS: parsePositiveInt(runtime.config.CUSTOMER_SESSION_TTL_S.toString(), 2_592_000),
    httpOnly: true,
    sameSite: "Lax",
    secure: true
  });

  return ok(requestId, payload, {
    "set-cookie": sessionCookie
  });
}

async function customerSessionMe(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);

  if (!auth.ok) {
    await writeAuditLog(runtime, {
      actorKind: "customer",
      action: "customer_session_me",
      targetKind: "session",
      requestId,
      outcome: "failure",
      metadata: { reason: auth.reason }
    });

    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  await writeAuditLog(runtime, {
    actorKind: "customer",
    actorId: auth.customerSession.sessionPublicId,
    action: "customer_session_me",
    targetKind: "session",
    targetId: auth.authSessionId,
    reservationId: auth.reservation.id,
    roomId: auth.room.roomId,
    authSessionId: auth.authSessionId,
    requestId,
    outcome: "success"
  });

  const payload: CustomerSessionPayload = {
    reservation: auth.reservation,
    customerSession: auth.customerSession,
    uploadCapability: auth.uploadCapability,
    roomToken: auth.room.roomToken
  };

  return ok(requestId, payload);
}

async function customerRoomRead(runtime: RuntimeEnv, request: Request, requestId: string, roomToken: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const payload: CustomerRoomPayload = {
    reservation: auth.reservation,
    customerSession: auth.customerSession,
    uploadCapability: auth.uploadCapability,
    room: {
      roomToken: auth.room.roomToken,
      caseStatus: auth.room.caseStatus,
      lastEventSeq: auth.room.lastEventSeq,
      lastMessageEpochS: auth.room.lastMessageEpochS
    }
  };

  const parsed = customerRoomResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  return ok(requestId, payload);
}

async function customerRoomConnect(runtime: RuntimeEnv, request: Request, requestId: string, roomToken: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  return connectToDurableRoom(runtime, request, {
    doRoomName: auth.room.doRoomName,
    roomToken,
    role: "customer",
    requestId,
    roomId: auth.room.roomId
  });
}

async function checkReservationEvidence(runtime: RuntimeEnv, reservationId: string): Promise<boolean> {
  const row = await runtime.bindings.DB.prepare(
    "SELECT has_uploaded_evidence FROM reservations WHERE id = ?"
  ).bind(reservationId).first<{ has_uploaded_evidence: number }>();
  return (row?.has_uploaded_evidence ?? 0) === 1;
}

async function customerUploadIntent(runtime: RuntimeEnv, request: Request, requestId: string, roomToken: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const body = await parseJsonBody(request, uploadIntentRequestSchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const visibilityParsed = attachmentVisibilitySchema.safeParse(body.data.visibility);
  if (!visibilityParsed.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const validated = validateAttachmentConstraints(
    runtime,
    {
      fileName: body.data.fileName,
      contentType: body.data.contentType,
      sizeBytes: body.data.sizeBytes,
      visibility: visibilityParsed.data
    },
    "customer"
  );

  if (!validated.ok) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  if (await checkReservationEvidence(runtime, auth.reservation.id)) {
    return fail(requestId, 403, "UPLOAD_ALREADY_COMPLETED", "Evidence has already been uploaded for this reservation.");
  }

  if (auth.uploadCapability.status !== "enabled") {
    return fail(requestId, 403, "UPLOAD_DISABLED", "Unable to continue");
  }

  const intentPayload: UploadIntentPayload = {
    intent: {
      intentId: newOpaqueId(),
      objectKey: buildAttachmentObjectKey({
        reservationId: auth.reservation.id,
        roomId: auth.room.roomId,
        fileName: validated.sanitizedFileName,
        createdEpochS: nowEpochS()
      }),
      fileName: validated.sanitizedFileName,
      contentType: validated.normalizedContentType,
      sizeBytes: body.data.sizeBytes,
      visibility: validated.visibility,
      uploadMode: "metadata_only",
      expiresEpochS: nowEpochS() + parsePositiveInt(runtime.config.UPLOAD_INTENT_TTL_S.toString(), 300)
    }
  };

  const parsed = uploadIntentResponseSchema.safeParse(intentPayload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("upload_intent_created", {
    request_id: requestId,
    actor_kind: "customer",
    room_id: auth.room.roomId,
    reservation_id: auth.reservation.id,
    visibility: intentPayload.intent.visibility
  });

  return ok(requestId, intentPayload);
}

async function customerCreateAttachment(runtime: RuntimeEnv, request: Request, requestId: string, roomToken: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  if (auth.uploadCapability.status !== "enabled") {
    return fail(requestId, 403, "UPLOAD_DISABLED", "Unable to continue");
  }

  const body = await parseJsonBody(request, attachmentPersistRequestSchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const visibilityParsed = attachmentVisibilitySchema.safeParse(body.data.visibility);
  if (!visibilityParsed.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const validated = validateAttachmentConstraints(
    runtime,
    {
      fileName: body.data.fileName,
      contentType: body.data.contentType,
      sizeBytes: body.data.sizeBytes,
      visibility: visibilityParsed.data
    },
    "customer"
  );

  if (!validated.ok || !OPAQUE_ID_RE.test(body.data.intentId) || body.data.objectKey.length > ATTACHMENT_KEY_MAX) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const persisted = await persistAttachment(runtime, {
    actorKind: "customer",
    senderAuthSessionId: auth.authSessionId,
    reservationId: auth.reservation.id,
    roomId: auth.room.roomId,
    roomToken: auth.room.roomToken,
    doRoomName: auth.room.doRoomName,
    fileName: validated.sanitizedFileName,
    contentType: validated.normalizedContentType,
    sizeBytes: body.data.sizeBytes,
    visibility: validated.visibility,
    objectKey: body.data.objectKey,
    idempotencyKey: body.data.idempotencyKey,
    clientCreatedEpochMs: body.data.clientCreatedEpochMs ?? null,
    requestId,
    actorId: auth.customerSession.sessionPublicId
  });

  const parsed = attachmentMutationResponseSchema.safeParse(persisted);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("attachment_persist_success", {
    request_id: requestId,
    actor_kind: "customer",
    room_id: auth.room.roomId,
    reservation_id: auth.reservation.id,
    attachment_id: persisted.attachment.attachmentId
  });

  return ok(requestId, persisted);
}

function buildAttachmentRetrievalPayload(row: AttachmentRow): AttachmentRetrievalPayload {
  return {
    attachment: mapProtectedAttachmentRow(row),
    retrievalMode: "metadata_only",
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }
  return "unknown_error";
}

async function deliverAttachmentContent(
  runtime: RuntimeEnv,
  requestId: string,
  attachment: AttachmentRow,
  context: {
    actorKind: "customer" | "staff";
    actorId: string;
    roomId: string;
    reservationId: string;
    caseId?: string;
  }
): Promise<Response> {
  const baseHeaders = {
    "cache-control": "no-store",
    "x-request-id": requestId,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "geolocation=()",
    "content-disposition": buildContentDisposition(attachment.file_name)
  };

  try {
    const object = await runtime.bindings.UPLOADS_BUCKET.get(attachment.storage_key);
    if (object?.body) {
      const responseHeaders = new Headers(baseHeaders);
      responseHeaders.set("content-type", attachment.content_type || "application/octet-stream");
      responseHeaders.set("content-length", object.size.toString());

      console.info("attachment_content_delivery_success", {
        request_id: requestId,
        actor_kind: context.actorKind,
        actor_id: context.actorId,
        room_id: context.roomId,
        case_id: context.caseId ?? null,
        reservation_id: context.reservationId,
        attachment_id: attachment.attachment_id,
        mutation_kind: "attachment_content_delivery",
        delivery_mode: "r2_stream"
      });

      return new Response(object.body, {
        status: 200,
        headers: responseHeaders
      });
    }

    const fallbackLines = [
      "CloudOPS protected attachment content",
      `attachmentId: ${attachment.attachment_id}`,
      `fileName: ${attachment.file_name}`,
      `contentType: ${attachment.content_type}`,
      `sizeBytes: ${attachment.size_bytes}`,
      "bodyMode: metadata_fallback"
    ];
    const fallbackBody = fallbackLines.join("\n");
    const responseHeaders = new Headers(baseHeaders);
    responseHeaders.set("content-type", "text/plain; charset=utf-8");
    responseHeaders.set("content-length", String(new TextEncoder().encode(fallbackBody).byteLength));
    responseHeaders.set("content-disposition", buildContentDisposition(`${safeDownloadFileName(attachment.file_name)}.txt`));

    console.info("attachment_content_delivery_success", {
      request_id: requestId,
      actor_kind: context.actorKind,
      actor_id: context.actorId,
      room_id: context.roomId,
      case_id: context.caseId ?? null,
      reservation_id: context.reservationId,
      attachment_id: attachment.attachment_id,
      mutation_kind: "attachment_content_delivery",
      delivery_mode: "metadata_fallback"
    });

    return new Response(fallbackBody, {
      status: 200,
      headers: responseHeaders
    });
  } catch (error) {
    console.error("attachment_content_delivery_failed", {
      request_id: requestId,
      actor_kind: context.actorKind,
      actor_id: context.actorId,
      room_id: context.roomId,
      case_id: context.caseId ?? null,
      reservation_id: context.reservationId,
      attachment_id: attachment.attachment_id,
      mutation_kind: "attachment_content_delivery",
      reason: "storage_read_failed",
      error: safeErrorMessage(error)
    });
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }
}

async function customerGetAttachment(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string,
  roomToken: string,
  attachmentId: string
): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    console.warn("attachment_retrieval_failed", {
      request_id: requestId,
      actor_kind: "customer",
      reason: auth.reason
    });
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    console.warn("attachment_retrieval_failed", {
      request_id: requestId,
      actor_kind: "customer",
      room_id: auth.room.roomId,
      reservation_id: auth.reservation.id,
      reason: "room_token_mismatch"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const attachment = await findCustomerVisibleAttachmentInRoom(runtime, auth.room.roomId, attachmentId);
  if (!attachment) {
    console.warn("attachment_retrieval_failed", {
      request_id: requestId,
      actor_kind: "customer",
      room_id: auth.room.roomId,
      reservation_id: auth.reservation.id,
      attachment_id: attachmentId,
      reason: "attachment_not_found_or_not_visible"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const payload = buildAttachmentRetrievalPayload(attachment);
  const parsed = attachmentRetrievalResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("attachment_retrieval_success", {
    request_id: requestId,
    actor_kind: "customer",
    room_id: auth.room.roomId,
    reservation_id: auth.reservation.id,
    attachment_id: attachment.attachment_id
  });

  return ok(requestId, payload);
}

async function customerGetAttachmentContent(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string,
  roomToken: string,
  attachmentId: string
): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    console.warn("attachment_content_delivery_failed", {
      request_id: requestId,
      actor_kind: "customer",
      reason: auth.reason
    });
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    console.warn("attachment_content_delivery_failed", {
      request_id: requestId,
      actor_kind: "customer",
      actor_id: auth.customerSession.sessionPublicId,
      room_id: auth.room.roomId,
      reservation_id: auth.reservation.id,
      reason: "room_token_mismatch"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const attachment = await findCustomerVisibleAttachmentInRoom(runtime, auth.room.roomId, attachmentId);
  if (!attachment) {
    console.warn("attachment_content_delivery_failed", {
      request_id: requestId,
      actor_kind: "customer",
      actor_id: auth.customerSession.sessionPublicId,
      room_id: auth.room.roomId,
      reservation_id: auth.reservation.id,
      attachment_id: attachmentId,
      reason: "attachment_not_found_or_not_visible"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  return deliverAttachmentContent(runtime, requestId, attachment, {
    actorKind: "customer",
    actorId: auth.customerSession.sessionPublicId,
    roomId: auth.room.roomId,
    reservationId: auth.reservation.id
  });
}

async function customerRoomMessages(runtime: RuntimeEnv, request: Request, requestId: string, roomToken: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const url = new URL(request.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 50;
  const beforeRaw = url.searchParams.get("beforeEpochS");
  const beforeEpochS = beforeRaw ? Number.parseInt(beforeRaw, 10) : undefined;

  const messages = await listCustomerVisibleMessages(
    runtime,
    auth.room.roomId,
    limit,
    typeof beforeEpochS === "number" && Number.isFinite(beforeEpochS) ? beforeEpochS : undefined
  );

  const payload: CustomerMessagesPayload = {
    roomToken,
    messages,
    nextBeforeEpochS: messages.length === limit ? messages[messages.length - 1]?.createdEpochS ?? null : null
  };

  const parsed = messageListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  return ok(requestId, payload);
}

async function customerSendMessage(runtime: RuntimeEnv, request: Request, requestId: string, roomToken: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  if (auth.room.roomToken !== roomToken) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const body = await parseJsonBody(request, customerSendMessageBodySchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const normalizedBody = normalizeBodyText(body.data.body);
  if (normalizedBody.length === 0 || normalizedBody.length > CUSTOMER_MESSAGE_MAX) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const existing = await runtime.bindings.DB.prepare(
    `SELECT
       id, sender_kind, message_kind, body, metadata_json, created_epoch_s, client_created_epoch_ms, idempotency_key,
       NULL AS attachment_id,
       NULL AS attachment_file_name,
       NULL AS attachment_content_type,
       NULL AS attachment_size_bytes,
       NULL AS attachment_storage_key,
       NULL AS attachment_visibility,
       NULL AS attachment_upload_status
     FROM chat_messages
     WHERE room_id = ? AND idempotency_key = ?
     LIMIT 1`
  )
    .bind(auth.room.roomId, body.data.idempotencyKey)
    .first<MessageRow>();

  if (existing) {
    const responsePayload: CustomerMessageMutationPayload = {
      message: mapMessage(existing)
    };
    return ok(requestId, responsePayload);
  }

  const createdEpochS = nowEpochS();
  const messageId = newOpaqueId();

  await runtime.bindings.DB.prepare(
    `INSERT INTO chat_messages (
      id, room_id, reservation_id, sender_kind, sender_auth_session_id, message_kind,
      visibility, body, idempotency_key, client_created_epoch_ms, created_epoch_s
    ) VALUES (?, ?, ?, 'customer', ?, 'text', 'customer_visible', ?, ?, ?, ?)`
  )
    .bind(
      messageId,
      auth.room.roomId,
      auth.reservation.id,
      auth.authSessionId,
      normalizedBody,
      body.data.idempotencyKey,
      body.data.clientCreatedEpochMs,
      createdEpochS
    )
    .run();

  await runtime.bindings.DB.prepare(
    `UPDATE chat_rooms
     SET last_event_seq = last_event_seq + 1,
         last_message_epoch_s = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(createdEpochS, auth.room.roomId)
    .run();

  await writeAuditLog(runtime, {
    actorKind: "customer",
    actorId: auth.customerSession.sessionPublicId,
    action: "customer_message_send",
    targetKind: "chat_message",
    targetId: messageId,
    reservationId: auth.reservation.id,
    roomId: auth.room.roomId,
    authSessionId: auth.authSessionId,
    requestId,
    outcome: "success"
  });

  const message: ChatMessageView = {
    id: messageId,
    senderKind: "customer",
    messageKind: "text",
    body: normalizedBody,
    createdEpochS,
    clientCreatedEpochMs: body.data.clientCreatedEpochMs,
    idempotencyKey: body.data.idempotencyKey,
    attachment: null
  };

  void publishLiveEvent(
    runtime,
    {
      type: "message_persisted",
      roomToken,
      messageId,
      createdEpochS,
      senderKind: "customer"
    },
    {
      requestId,
      roomId: auth.room.roomId,
      mutationKind: "customer_message_send",
      doRoomName: auth.room.doRoomName
    }
  );

  const payload: CustomerMessageMutationPayload = { message };
  return ok(requestId, payload);
}

async function staffLogin(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const body = await parseJsonBody(request, staffLoginRequestSchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const email = body.data.email.trim().toLowerCase();
  const user = await runtime.bindings.DB.prepare(
    `SELECT id, email, password_hash, display_name, is_active
     FROM staff_users WHERE lower(email) = ? LIMIT 1`
  )
    .bind(email)
    .first<{ id: string; email: string; password_hash: string; display_name: string; is_active: number }>();

  const invalidCreds = () => fail(requestId, 401, "INVALID_CREDENTIALS", "Unable to continue");

  if (!user || user.is_active !== 1) {
    await writeAuditLog(runtime, {
      actorKind: "staff",
      action: "staff_login",
      targetKind: "staff_user",
      requestId,
      outcome: "failure",
      metadata: { reason: "user_not_found_or_inactive", email }
    });
    return invalidCreds();
  }

  let passwordMatches = false;
  if (user.password_hash.startsWith("sha256:")) {
    const hashed = await sha256Hex(body.data.password);
    passwordMatches = hashed === user.password_hash.slice("sha256:".length);
  } else {
    passwordMatches = body.data.password === user.password_hash;
  }

  if (!passwordMatches) {
    await writeAuditLog(runtime, {
      actorKind: "staff",
      actorId: user.id,
      action: "staff_login",
      targetKind: "staff_user",
      targetId: user.id,
      requestId,
      outcome: "failure",
      metadata: { reason: "password_mismatch" }
    });
    return invalidCreds();
  }

  const created = await createStaffSession(runtime, user.id);

  await runtime.bindings.DB.prepare(
    "UPDATE staff_users SET last_login_epoch_s = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(nowEpochS(), user.id)
    .run();

  const sessionWithRoles = await loadStaffSession(
    runtime,
    new Request("https://internal", {
      headers: {
        cookie: `${runtime.config.STAFF_SESSION_COOKIE_NAME}=${encodeURIComponent(created.cookieValue)}`
      }
    }),
    false
  );

  if (!sessionWithRoles.ok) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  await writeAuditLog(runtime, {
    actorKind: "staff",
    actorId: user.id,
    action: "staff_login",
    targetKind: "staff_session",
    targetId: created.staffAuthSessionId,
    staffAuthSessionId: created.staffAuthSessionId,
    requestId,
    outcome: "success"
  });

  const payload: StaffSessionPayload = {
    staffSession: sessionWithRoles.session
  };

  const parsed = staffSessionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  const sessionCookie = buildCookie(runtime.config.STAFF_SESSION_COOKIE_NAME, created.cookieValue, {
    maxAgeS: parsePositiveInt(runtime.config.STAFF_SESSION_TTL_S.toString(), 28_800),
    httpOnly: true,
    sameSite: "Lax",
    secure: true
  });

  const csrfCookie = buildCookie(runtime.config.STAFF_CSRF_COOKIE_NAME, created.csrfToken, {
    maxAgeS: parsePositiveInt(runtime.config.STAFF_SESSION_TTL_S.toString(), 28_800),
    httpOnly: false,
    sameSite: "Lax",
    secure: true
  });

  return ok(requestId, payload, {
    "set-cookie": `${sessionCookie}, ${csrfCookie}`
  });
}

async function staffSessionMe(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    await writeAuditLog(runtime, {
      actorKind: "staff",
      action: "staff_session_me",
      targetKind: "staff_session",
      requestId,
      outcome: "failure",
      metadata: { reason: staff.reason }
    });
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  await writeAuditLog(runtime, {
    actorKind: "staff",
    actorId: staff.session.staffUserId,
    action: "staff_session_me",
    targetKind: "staff_session",
    targetId: staff.staffAuthSessionId,
    staffAuthSessionId: staff.staffAuthSessionId,
    requestId,
    outcome: "success"
  });

  const payload: StaffSessionPayload = {
    staffSession: staff.session
  };

  return ok(requestId, payload);
}

async function staffLogout(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  await runtime.bindings.DB.prepare(
    `UPDATE staff_auth_sessions
     SET status = 'revoked', revoked_epoch_s = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(nowEpochS(), staff.staffAuthSessionId)
    .run();

  await writeAuditLog(runtime, {
    actorKind: "staff",
    actorId: staff.session.staffUserId,
    action: "staff_logout",
    targetKind: "staff_session",
    targetId: staff.staffAuthSessionId,
    staffAuthSessionId: staff.staffAuthSessionId,
    requestId,
    outcome: "success"
  });

  return ok(requestId, { success: true }, {
    "set-cookie": `${clearCookie(runtime.config.STAFF_SESSION_COOKIE_NAME)}, ${runtime.config.STAFF_CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Lax`
  });
}

async function staffCaseList(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const stationCode = url.searchParams.get("stationCode");
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "30", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 30;
  const updatedBeforeRaw = url.searchParams.get("updatedBeforeEpochS");
  const updatedBeforeEpochS = updatedBeforeRaw ? Number.parseInt(updatedBeforeRaw, 10) : undefined;

  let sql = `SELECT
      cr.id AS case_id,
      cr.opaque_room_token AS room_token,
      cr.case_status,
      cr.last_event_seq,
      cr.last_message_epoch_s,
      r.id AS reservation_id,
      r.reservation_number,
      s.code AS station_code,
      r.pickup_date_local,
      r.pickup_day_start_epoch_s,
      r.pickup_day_end_epoch_s,
      r.status,
      r.has_uploaded_evidence AS reservation_status,
      COALESCE(cr.last_message_epoch_s, r.pickup_day_start_epoch_s) AS updated_epoch_s
    FROM chat_rooms cr
    INNER JOIN reservations r ON r.id = cr.reservation_id
    INNER JOIN stations s ON s.id = r.station_id
    WHERE 1 = 1`;
  const params: Array<string | number | null> = [];

  const statusParsed = status ? caseStatusSchema.safeParse(status) : null;
  if (statusParsed?.success) {
    sql += " AND cr.case_status = ?";
    params.push(statusParsed.data);
  }

  if (stationCode && stationCode.trim().length > 0) {
    sql += " AND s.code = ?";
    params.push(stationCode.trim());
  }

  if (typeof updatedBeforeEpochS === "number" && Number.isFinite(updatedBeforeEpochS)) {
    sql += " AND COALESCE(cr.last_message_epoch_s, r.pickup_day_start_epoch_s) < ?";
    params.push(updatedBeforeEpochS);
  }

  sql += " ORDER BY updated_epoch_s DESC, cr.id DESC LIMIT ?";
  params.push(limit);

  const rows = await bindStatement(runtime.bindings.DB, sql, params).all<
    {
      case_id: string;
      room_token: string;
      case_status: CaseStatus;
      last_event_seq: number;
      last_message_epoch_s: number | null;
      reservation_id: string;
      reservation_number: string;
      station_code: string;
      pickup_date_local: string;
      pickup_day_start_epoch_s: number;
      pickup_day_end_epoch_s: number;
      reservation_status: "active" | "cancelled" | "closed";
  has_uploaded_evidence: number;
      updated_epoch_s: number;
    }
  >();

  const items: StaffCaseListItem[] = (rows.results ?? []).map((row) => ({
    caseId: row.case_id,
    roomToken: row.room_token,
    reservation: {
      id: row.reservation_id,
      reservationNumber: row.reservation_number,
      stationCode: row.station_code,
      pickupDateLocal: row.pickup_date_local as ReservationSummary["pickupDateLocal"],
      pickupDayStartEpochS: row.pickup_day_start_epoch_s,
      pickupDayEndEpochS: row.pickup_day_end_epoch_s,
    hasUploadedEvidence: row.has_uploaded_evidence === 1,
      status: row.reservation_status
    },
    stationCode: row.station_code,
    caseStatus: row.case_status,
    lastEventSeq: row.last_event_seq,
    lastMessageEpochS: row.last_message_epoch_s,
    updatedEpochS: row.updated_epoch_s
  }));

  const payload: StaffCaseListPayload = {
    cases: items,
    nextUpdatedBeforeEpochS: items.length === limit ? (items[items.length - 1]?.updatedEpochS ?? null) : null
  };

  const parsed = staffCaseListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("staff_case_list_read", {
    request_id: requestId,
    staff_user_id: staff.session.staffUserId,
    count: items.length
  });

  return ok(requestId, payload);
}

async function staffCaseDetail(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const messages = await listCustomerVisibleMessages(runtime, detail.case_id, 100);
  const payload: StaffCaseDetailPayload = {
    caseDetail: mapCaseDetail(detail, messages)
  };

  const parsed = staffCaseDetailResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("staff_case_detail_read", {
    request_id: requestId,
    staff_user_id: staff.session.staffUserId,
    case_id: caseId,
    room_id: detail.case_id
  });

  return ok(requestId, payload);
}

async function staffCaseConnect(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  return connectToDurableRoom(runtime, request, {
    doRoomName: detail.do_room_name,
    roomToken: detail.room_token,
    role: "staff",
    requestId,
    roomId: detail.case_id
  });
}

async function staffSendMessage(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const body = await parseJsonBody(request, staffSendMessageBodySchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const normalizedBody = normalizeBodyText(body.data.body);
  if (normalizedBody.length === 0 || normalizedBody.length > CUSTOMER_MESSAGE_MAX) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const existing = await runtime.bindings.DB.prepare(
    `SELECT
       id, sender_kind, message_kind, body, metadata_json, created_epoch_s, client_created_epoch_ms, idempotency_key,
       NULL AS attachment_id,
       NULL AS attachment_file_name,
       NULL AS attachment_content_type,
       NULL AS attachment_size_bytes,
       NULL AS attachment_storage_key,
       NULL AS attachment_visibility,
       NULL AS attachment_upload_status
     FROM chat_messages
     WHERE room_id = ? AND idempotency_key = ?
     LIMIT 1`
  )
    .bind(detail.case_id, body.data.idempotencyKey)
    .first<MessageRow>();

  if (existing) {
    return ok(requestId, { message: mapMessage(existing) });
  }

  const messageId = newOpaqueId();
  const createdEpochS = nowEpochS();

  await runtime.bindings.DB.prepare(
    `INSERT INTO chat_messages (
      id, room_id, reservation_id, sender_kind, sender_staff_user_id,
      message_kind, visibility, body, idempotency_key, client_created_epoch_ms, created_epoch_s
    ) VALUES (?, ?, ?, 'staff', ?, 'text', 'customer_visible', ?, ?, ?, ?)`
  )
    .bind(
      messageId,
      detail.case_id,
      detail.reservation_id,
      staff.session.staffUserId,
      normalizedBody,
      body.data.idempotencyKey,
      body.data.clientCreatedEpochMs,
      createdEpochS
    )
    .run();

  await runtime.bindings.DB.prepare(
    `UPDATE chat_rooms
     SET last_event_seq = last_event_seq + 1,
         last_message_epoch_s = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(createdEpochS, detail.case_id)
    .run();

  await writeAuditLog(runtime, {
    actorKind: "staff",
    actorId: staff.session.staffUserId,
    action: "staff_case_message_send",
    targetKind: "chat_message",
    targetId: messageId,
    reservationId: detail.reservation_id,
    roomId: detail.case_id,
    staffAuthSessionId: staff.staffAuthSessionId,
    requestId,
    outcome: "success"
  });

  void publishLiveEvent(
    runtime,
    {
      type: "message_persisted",
      roomToken: detail.room_token,
      messageId,
      createdEpochS,
      senderKind: "staff"
    },
    {
      requestId,
      roomId: detail.case_id,
      mutationKind: "staff_message_send",
      doRoomName: detail.do_room_name
    }
  );

  return ok(requestId, {
    message: {
      id: messageId,
      senderKind: "staff",
      messageKind: "text",
      body: normalizedBody,
      createdEpochS,
      clientCreatedEpochMs: body.data.clientCreatedEpochMs,
      idempotencyKey: body.data.idempotencyKey,
      attachment: null
    }
  });
}

async function staffUploadIntent(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const body = await parseJsonBody(request, uploadIntentRequestSchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const visibilityParsed = attachmentVisibilitySchema.safeParse(body.data.visibility);
  if (!visibilityParsed.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const validated = validateAttachmentConstraints(
    runtime,
    {
      fileName: body.data.fileName,
      contentType: body.data.contentType,
      sizeBytes: body.data.sizeBytes,
      visibility: visibilityParsed.data
    },
    "staff"
  );

  if (!validated.ok) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const intentPayload: UploadIntentPayload = {
    intent: {
      intentId: newOpaqueId(),
      objectKey: buildAttachmentObjectKey({
        reservationId: detail.reservation_id,
        roomId: detail.case_id,
        fileName: validated.sanitizedFileName,
        createdEpochS: nowEpochS()
      }),
      fileName: validated.sanitizedFileName,
      contentType: validated.normalizedContentType,
      sizeBytes: body.data.sizeBytes,
      visibility: validated.visibility,
      uploadMode: "metadata_only",
      expiresEpochS: nowEpochS() + parsePositiveInt(runtime.config.UPLOAD_INTENT_TTL_S.toString(), 300)
    }
  };

  const parsed = uploadIntentResponseSchema.safeParse(intentPayload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("upload_intent_created", {
    request_id: requestId,
    actor_kind: "staff",
    room_id: detail.case_id,
    reservation_id: detail.reservation_id,
    staff_user_id: staff.session.staffUserId
  });

  return ok(requestId, intentPayload);
}

async function staffCreateAttachment(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const body = await parseJsonBody(request, attachmentPersistRequestSchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const visibilityParsed = attachmentVisibilitySchema.safeParse(body.data.visibility);
  if (!visibilityParsed.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const validated = validateAttachmentConstraints(
    runtime,
    {
      fileName: body.data.fileName,
      contentType: body.data.contentType,
      sizeBytes: body.data.sizeBytes,
      visibility: visibilityParsed.data
    },
    "staff"
  );

  if (!validated.ok || !OPAQUE_ID_RE.test(body.data.intentId) || body.data.objectKey.length > ATTACHMENT_KEY_MAX) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const persisted = await persistAttachment(runtime, {
    actorKind: "staff",
    senderStaffUserId: staff.session.staffUserId,
    reservationId: detail.reservation_id,
    roomId: detail.case_id,
    roomToken: detail.room_token,
    doRoomName: detail.do_room_name,
    fileName: validated.sanitizedFileName,
    contentType: validated.normalizedContentType,
    sizeBytes: body.data.sizeBytes,
    visibility: validated.visibility,
    objectKey: body.data.objectKey,
    idempotencyKey: body.data.idempotencyKey,
    clientCreatedEpochMs: body.data.clientCreatedEpochMs ?? null,
    requestId,
    staffAuthSessionId: staff.staffAuthSessionId,
    actorId: staff.session.staffUserId
  });

  const parsed = attachmentMutationResponseSchema.safeParse(persisted);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("attachment_persist_success", {
    request_id: requestId,
    actor_kind: "staff",
    room_id: detail.case_id,
    reservation_id: detail.reservation_id,
    staff_user_id: staff.session.staffUserId,
    attachment_id: persisted.attachment.attachmentId
  });

  return ok(requestId, persisted);
}

async function staffGetAttachment(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string,
  caseId: string,
  attachmentId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    console.warn("attachment_retrieval_failed", {
      request_id: requestId,
      actor_kind: "staff",
      reason: staff.reason
    });
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    console.warn("attachment_retrieval_failed", {
      request_id: requestId,
      actor_kind: "staff",
      staff_user_id: staff.session.staffUserId,
      case_id: caseId,
      reason: "case_not_found"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const attachment = await findCustomerVisibleAttachmentInRoom(runtime, detail.case_id, attachmentId);
  if (!attachment) {
    console.warn("attachment_retrieval_failed", {
      request_id: requestId,
      actor_kind: "staff",
      staff_user_id: staff.session.staffUserId,
      case_id: detail.case_id,
      room_id: detail.case_id,
      attachment_id: attachmentId,
      reason: "attachment_not_found_or_not_visible"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const payload = buildAttachmentRetrievalPayload(attachment);
  const parsed = attachmentRetrievalResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("attachment_retrieval_success", {
    request_id: requestId,
    actor_kind: "staff",
    staff_user_id: staff.session.staffUserId,
    case_id: detail.case_id,
    room_id: detail.case_id,
    reservation_id: detail.reservation_id,
    attachment_id: attachment.attachment_id
  });

  return ok(requestId, payload);
}

async function staffGetAttachmentContent(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string,
  caseId: string,
  attachmentId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    console.warn("attachment_content_delivery_failed", {
      request_id: requestId,
      actor_kind: "staff",
      reason: staff.reason
    });
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    console.warn("attachment_content_delivery_failed", {
      request_id: requestId,
      actor_kind: "staff",
      actor_id: staff.session.staffUserId,
      case_id: caseId,
      reason: "case_not_found"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const attachment = await findCustomerVisibleAttachmentInRoom(runtime, detail.case_id, attachmentId);
  if (!attachment) {
    console.warn("attachment_content_delivery_failed", {
      request_id: requestId,
      actor_kind: "staff",
      actor_id: staff.session.staffUserId,
      case_id: detail.case_id,
      room_id: detail.case_id,
      reservation_id: detail.reservation_id,
      attachment_id: attachmentId,
      reason: "attachment_not_found_or_not_visible"
    });
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  return deliverAttachmentContent(runtime, requestId, attachment, {
    actorKind: "staff",
    actorId: staff.session.staffUserId,
    roomId: detail.case_id,
    reservationId: detail.reservation_id,
    caseId: detail.case_id
  });
}

async function staffCaseStatusUpdate(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const body = await parseJsonBody(request, staffUpdateCaseStatusBodySchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const toStatus = body.data.toStatus;
  const allowedTransitions = getAllowedTransitions(detail.case_status);

  if (!allowedTransitions.includes(toStatus)) {
    await writeAuditLog(runtime, {
      actorKind: "staff",
      actorId: staff.session.staffUserId,
      action: "staff_case_status_update",
      targetKind: "chat_room",
      targetId: detail.case_id,
      reservationId: detail.reservation_id,
      roomId: detail.case_id,
      staffAuthSessionId: staff.staffAuthSessionId,
      requestId,
      outcome: "failure",
      metadata: {
        reason: "invalid_transition",
        from: detail.case_status,
        to: toStatus
      }
    });

    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const existingHistory = await runtime.bindings.DB.prepare(
    "SELECT id FROM case_status_history WHERE idempotency_key = ? LIMIT 1"
  )
    .bind(body.data.idempotencyKey)
    .first<{ id: string }>();

  const changedEpochS = nowEpochS();

  if (!existingHistory) {
    await runtime.bindings.DB.prepare(
      `UPDATE chat_rooms
       SET case_status = ?,
           last_event_seq = last_event_seq + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(toStatus, detail.case_id)
      .run();

    await runtime.bindings.DB.prepare(
      `INSERT INTO case_status_history (
        id, reservation_id, room_id, from_status, to_status,
        changed_by_staff_user_id, reason, idempotency_key, changed_epoch_s
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        newOpaqueId(),
        detail.reservation_id,
        detail.case_id,
        detail.case_status,
        toStatus,
        staff.session.staffUserId,
        body.data.reason ?? null,
        body.data.idempotencyKey,
        changedEpochS
      )
      .run();
  }

  const refreshed = await resolveCaseById(runtime, caseId);
  if (!refreshed) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  await writeAuditLog(runtime, {
    actorKind: "staff",
    actorId: staff.session.staffUserId,
    action: "staff_case_status_update",
    targetKind: "chat_room",
    targetId: refreshed.case_id,
    reservationId: refreshed.reservation_id,
    roomId: refreshed.case_id,
    staffAuthSessionId: staff.staffAuthSessionId,
    requestId,
    outcome: "success"
  });

  void publishLiveEvent(
    runtime,
    {
      type: "case_status_changed",
      roomToken: refreshed.room_token,
      caseStatus: refreshed.case_status,
      changedEpochS
    },
    {
      requestId,
      roomId: refreshed.case_id,
      mutationKind: "staff_case_status_update",
      doRoomName: refreshed.do_room_name
    }
  );

  const payload: StaffCaseStatusMutationPayload = {
    caseId: refreshed.case_id,
    room: mapRoomSummary({
      room_token: refreshed.room_token,
      case_status: refreshed.case_status,
      last_event_seq: refreshed.last_event_seq,
      last_message_epoch_s: refreshed.last_message_epoch_s
    })
  };

  const parsed = staffStatusMutationResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("staff_status_update", {
    request_id: requestId,
    staff_user_id: staff.session.staffUserId,
    case_id: refreshed.case_id,
    room_id: refreshed.case_id,
    to_status: refreshed.case_status
  });

  return ok(requestId, payload);
}

async function staffCaseNotes(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const rows = await runtime.bindings.DB.prepare(
    `SELECT n.id, n.body, n.created_epoch_s, n.staff_user_id, su.display_name, n.idempotency_key
     FROM internal_notes n
     INNER JOIN staff_users su ON su.id = n.staff_user_id
     WHERE n.room_id = ? AND n.deleted_epoch_s IS NULL
     ORDER BY n.created_epoch_s DESC, n.id DESC`
  )
    .bind(detail.case_id)
    .all<NoteRow>();

  const payload: StaffCaseNoteListPayload = {
    notes: (rows.results ?? []).map(mapStaffNote)
  };

  const parsed = staffNotesResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("staff_notes_read", {
    request_id: requestId,
    staff_user_id: staff.session.staffUserId,
    case_id: detail.case_id,
    room_id: detail.case_id,
    count: payload.notes.length
  });

  return ok(requestId, payload);
}

async function staffCreateNote(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const body = await parseJsonBody(request, staffCreateNoteBodySchema);
  if (!body.success) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const normalizedBody = normalizeBodyText(body.data.body);
  if (normalizedBody.length === 0 || normalizedBody.length > STAFF_NOTE_MAX) {
    return fail(requestId, 400, "INVALID_REQUEST", "Unable to continue");
  }

  const existing = await runtime.bindings.DB.prepare(
    `SELECT n.id, n.body, n.created_epoch_s, n.staff_user_id, su.display_name, n.idempotency_key
     FROM internal_notes n
     INNER JOIN staff_users su ON su.id = n.staff_user_id
     WHERE n.room_id = ? AND n.idempotency_key = ?
     LIMIT 1`
  )
    .bind(detail.case_id, body.data.idempotencyKey)
    .first<NoteRow>();

  if (existing) {
    return ok(requestId, { note: mapStaffNote(existing) });
  }

  const noteId = newOpaqueId();
  const createdEpochS = nowEpochS();

  await runtime.bindings.DB.prepare(
    `INSERT INTO internal_notes (
      id, reservation_id, room_id, staff_user_id, body, idempotency_key,
      created_epoch_s, updated_epoch_s
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      noteId,
      detail.reservation_id,
      detail.case_id,
      staff.session.staffUserId,
      normalizedBody,
      body.data.idempotencyKey,
      createdEpochS,
      createdEpochS
    )
    .run();

  await runtime.bindings.DB.prepare(
    "UPDATE chat_rooms SET last_event_seq = last_event_seq + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(detail.case_id)
    .run();

  await writeAuditLog(runtime, {
    actorKind: "staff",
    actorId: staff.session.staffUserId,
    action: "staff_note_create",
    targetKind: "internal_note",
    targetId: noteId,
    reservationId: detail.reservation_id,
    roomId: detail.case_id,
    staffAuthSessionId: staff.staffAuthSessionId,
    requestId,
    outcome: "success"
  });

  void publishLiveEvent(
    runtime,
    {
      type: "note_created",
      roomToken: detail.room_token,
      noteId,
      createdEpochS
    },
    {
      requestId,
      roomId: detail.case_id,
      mutationKind: "staff_note_create",
      doRoomName: detail.do_room_name
    }
  );

  const payload: StaffCaseNoteMutationPayload = {
    note: {
      noteId,
      body: normalizedBody,
      createdEpochS,
      createdBy: {
        staffUserId: staff.session.staffUserId,
        displayName: staff.session.displayName
      },
      idempotencyKey: body.data.idempotencyKey,
      clientCreatedEpochMs: body.data.clientCreatedEpochMs
    }
  };

  const parsed = staffNoteMutationResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("staff_note_create", {
    request_id: requestId,
    staff_user_id: staff.session.staffUserId,
    case_id: detail.case_id,
    room_id: detail.case_id
  });

  return ok(requestId, payload);
}

async function staffCannedReplies(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const url = new URL(request.url);
  const activeOnly = (url.searchParams.get("active") ?? "true") !== "false";
  const category = url.searchParams.get("category")?.trim();

  let sql = "SELECT id, title, body, tags_json, is_active FROM canned_replies WHERE 1 = 1";
  const params: Array<string | number | null> = [];

  if (activeOnly) {
    sql += " AND is_active = 1";
  }

  sql += " ORDER BY updated_epoch_s DESC, id DESC LIMIT 200";

  const result = await bindStatement(runtime.bindings.DB, sql, params).all<{
    id: string;
    title: string;
    body: string;
    tags_json: string;
    is_active: number;
  }>();

  let replies: CannedReplyView[] = (result.results ?? []).map((row) => {
    let derivedCategory: string | null = null;
    try {
      const tags = JSON.parse(row.tags_json) as unknown;
      if (Array.isArray(tags) && tags.length > 0 && typeof tags[0] === "string") {
        derivedCategory = tags[0];
      }
    } catch {
      // Ignore malformed tags.
    }

    return {
      cannedReplyId: row.id,
      title: row.title,
      body: row.body,
      category: derivedCategory
    };
  });

  if (category) {
    replies = replies.filter((reply) => reply.category === category);
  }

  const payload: StaffCannedRepliesPayload = {
    replies
  };

  const parsed = staffCannedRepliesResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("staff_canned_replies_read", {
    request_id: requestId,
    staff_user_id: staff.session.staffUserId,
    count: payload.replies.length
  });

  return ok(requestId, payload);
}

async function staffTimeline(runtime: RuntimeEnv, request: Request, requestId: string, caseId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) {
    return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  }

  const detail = await resolveCaseById(runtime, caseId);
  if (!detail) {
    return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
  }

  const messageRows = await runtime.bindings.DB.prepare(
    `SELECT cm.id, cm.body, cm.created_epoch_s, cm.sender_kind, cm.sender_staff_user_id, su.display_name
     FROM chat_messages cm
     LEFT JOIN staff_users su ON su.id = cm.sender_staff_user_id
     WHERE cm.room_id = ?
       AND cm.visibility = 'customer_visible'
       AND cm.deleted_epoch_s IS NULL
     ORDER BY cm.created_epoch_s DESC, cm.id DESC
     LIMIT 100`
  )
    .bind(detail.case_id)
    .all<{
      id: string;
      body: string | null;
      created_epoch_s: number;
      sender_kind: "customer" | "staff" | "system";
      sender_staff_user_id: string | null;
      display_name: string | null;
    }>();

  const noteRows = await runtime.bindings.DB.prepare(
    `SELECT n.id, n.body, n.created_epoch_s, n.staff_user_id, su.display_name
     FROM internal_notes n
     INNER JOIN staff_users su ON su.id = n.staff_user_id
     WHERE n.room_id = ?
       AND n.deleted_epoch_s IS NULL
     ORDER BY n.created_epoch_s DESC, n.id DESC
     LIMIT 100`
  )
    .bind(detail.case_id)
    .all<{
      id: string;
      body: string;
      created_epoch_s: number;
      staff_user_id: string;
      display_name: string;
    }>();

  const statusRows = await runtime.bindings.DB.prepare(
    `SELECT h.id, h.from_status, h.to_status, h.changed_epoch_s, h.changed_by_staff_user_id, su.display_name
     FROM case_status_history h
     INNER JOIN staff_users su ON su.id = h.changed_by_staff_user_id
     WHERE h.room_id = ?
     ORDER BY h.changed_epoch_s DESC, h.id DESC
     LIMIT 100`
  )
    .bind(detail.case_id)
    .all<{
      id: string;
      from_status: CaseStatus | null;
      to_status: CaseStatus;
      changed_epoch_s: number;
      changed_by_staff_user_id: string;
      display_name: string;
    }>();

  const events: StaffTimelineEvent[] = [];

  for (const row of messageRows.results ?? []) {
    events.push({
      eventId: row.id,
      eventType: "message",
      createdEpochS: row.created_epoch_s,
      actor: {
        actorKind: row.sender_kind,
        actorId: row.sender_kind === "staff" ? (row.sender_staff_user_id ?? undefined) : undefined,
        displayName:
          row.sender_kind === "customer"
            ? "Πελάτης"
            : row.sender_kind === "staff"
              ? (row.display_name ?? "Μέλος προσωπικού")
              : "Σύστημα"
      },
      body: row.body,
      summary: row.body ? row.body.slice(0, 140) : "Μήνυμα",
      fromStatus: null,
      toStatus: null
    });
  }

  for (const row of noteRows.results ?? []) {
    events.push({
      eventId: row.id,
      eventType: "note",
      createdEpochS: row.created_epoch_s,
      actor: {
        actorKind: "staff",
        actorId: row.staff_user_id,
        displayName: row.display_name
      },
      body: row.body,
      summary: row.body.slice(0, 140),
      fromStatus: null,
      toStatus: null
    });
  }

  for (const row of statusRows.results ?? []) {
    events.push({
      eventId: row.id,
      eventType: "status_change",
      createdEpochS: row.changed_epoch_s,
      actor: {
        actorKind: "staff",
        actorId: row.changed_by_staff_user_id,
        displayName: row.display_name
      },
      body: null,
      summary: `Κατάσταση: ${row.from_status ?? "-"} → ${row.to_status}`,
      fromStatus: row.from_status,
      toStatus: row.to_status
    });
  }

  events.sort((a, b) => {
    if (a.createdEpochS !== b.createdEpochS) {
      return b.createdEpochS - a.createdEpochS;
    }
    return b.eventId.localeCompare(a.eventId);
  });

  const payload: StaffCaseTimelinePayload = {
    timeline: events.slice(0, 200)
  };

  const parsedEvents = payload.timeline.map((event) => staffTimelineEventSchema.safeParse(event));
  if (parsedEvents.some((event) => !event.success)) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Unable to continue");
  }

  console.info("staff_case_timeline_read", {
    request_id: requestId,
    staff_user_id: staff.session.staffUserId,
    case_id: detail.case_id,
    room_id: detail.case_id,
    count: payload.timeline.length
  });

  return ok(requestId, payload);
}

export async function routeRequest(
  runtime: RuntimeEnv,
  request: Request,
  _ctx: ExecutionContext
): Promise<Response> {
  const requestId = requestIdFrom(request);
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (pathname === "/api/version" && method === "GET") {
    return ok(requestId, {
      service: runtime.config.APP_NAME,
      environment: runtime.config.APP_ENV,
      atEpochS: nowEpochS()
    });
  }

  if (pathname === `${runtime.config.HEALTH_ENDPOINT_PREFIX}/live` && method === "GET") {
    const data: HealthLivePayload = {
      status: "live",
      service: runtime.config.APP_NAME
    };
    return ok(requestId, data);
  }

  if (pathname === `${runtime.config.HEALTH_ENDPOINT_PREFIX}/ready` && method === "GET") {
    return healthReady(runtime, requestId);
  }

  if (pathname === `${runtime.config.DIAGNOSTICS_ENDPOINT_PREFIX}/summary` && method === "GET") {
    return diagnosticsSummary(runtime, requestId);
  }

  if (pathname === "/api/customer-session/bootstrap" && method === "POST") {
    return customerBootstrap(runtime, request, requestId);
  }

  if (pathname === "/api/customer-session/me" && method === "GET") {
    return customerSessionMe(runtime, request, requestId);
  }

  const customerRoomReadMatch = pathname.match(/^\/api\/customer-room\/([^/]+)$/u);
  if (customerRoomReadMatch && method === "GET") {
    const roomToken = decodeURIComponent(customerRoomReadMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(roomToken)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerRoomRead(runtime, request, requestId, roomToken);
  }

  const customerRoomConnectMatch = pathname.match(/^\/api\/customer-room\/([^/]+)\/connect$/u);
  if (customerRoomConnectMatch && method === "GET") {
    const roomToken = decodeURIComponent(customerRoomConnectMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(roomToken)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerRoomConnect(runtime, request, requestId, roomToken);
  }

  const customerUploadIntentMatch = pathname.match(/^\/api\/customer-room\/([^/]+)\/upload-intents$/u);
  if (customerUploadIntentMatch && method === "POST") {
    const roomToken = decodeURIComponent(customerUploadIntentMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(roomToken)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerUploadIntent(runtime, request, requestId, roomToken);
  }

  const customerRoomMessagesMatch = pathname.match(/^\/api\/customer-room\/([^/]+)\/messages$/u);
  if (customerRoomMessagesMatch && method === "GET") {
    const roomToken = decodeURIComponent(customerRoomMessagesMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(roomToken)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerRoomMessages(runtime, request, requestId, roomToken);
  }

  if (customerRoomMessagesMatch && method === "POST") {
    const roomToken = decodeURIComponent(customerRoomMessagesMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(roomToken)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerSendMessage(runtime, request, requestId, roomToken);
  }

  const customerSyncMatch = pathname.match(/^\/api\/customer-room\/([^/]+)\/sync$/u);
  if (customerSyncMatch && method === "POST") {
    const roomToken = decodeURIComponent(customerSyncMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(roomToken)) return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    return customerRoomSync(runtime, request, requestId, roomToken);
  }

  const staffSyncMatch = pathname.match(/^\/api\/staff-room\/([^/]+)\/sync$/u);
  if (staffSyncMatch && method === "POST") {
    const roomToken = decodeURIComponent(staffSyncMatch[1] ?? "");
    return customerRoomSync(runtime, request, requestId, roomToken);
  }

  const customerAttachmentsMatch = pathname.match(/^\/api\/customer-room\/([^/]+)\/attachments$/u);
  if (customerAttachmentsMatch && method === "POST") {
    const roomToken = decodeURIComponent(customerAttachmentsMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(roomToken)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerCreateAttachment(runtime, request, requestId, roomToken);
  }

  const customerAttachmentByIdMatch = pathname.match(/^\/api\/customer-room\/([^/]+)\/attachments\/([^/]+)$/u);
  if (customerAttachmentByIdMatch && method === "GET") {
    const roomToken = decodeURIComponent(customerAttachmentByIdMatch[1] ?? "");
    const attachmentId = decodeURIComponent(customerAttachmentByIdMatch[2] ?? "");
    const parsed = customerAttachmentRouteParamsSchema.safeParse({ roomToken, attachmentId });
    if (!parsed.success) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerGetAttachment(runtime, request, requestId, parsed.data.roomToken, parsed.data.attachmentId);
  }

  const customerAttachmentContentMatch = pathname.match(/^\/api\/customer-room\/([^/]+)\/attachments\/([^/]+)\/content$/u);
  if (customerAttachmentContentMatch && method === "GET") {
    const roomToken = decodeURIComponent(customerAttachmentContentMatch[1] ?? "");
    const attachmentId = decodeURIComponent(customerAttachmentContentMatch[2] ?? "");
    const parsed = customerAttachmentRouteParamsSchema.safeParse({ roomToken, attachmentId });
    if (!parsed.success) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return customerGetAttachmentContent(runtime, request, requestId, parsed.data.roomToken, parsed.data.attachmentId);
  }

  if (pathname === "/api/staff-session/login" && method === "POST") {
    return staffLogin(runtime, request, requestId);
  }

  if (pathname === "/api/staff-session/me" && method === "GET") {
    return staffSessionMe(runtime, request, requestId);
  }

  if (pathname === "/api/staff-session/logout" && method === "POST") {
    return staffLogout(runtime, request, requestId);
  }

  if (pathname === "/api/staff/cases" && method === "GET") {
    return staffCaseList(runtime, request, requestId);
  }

  const staffCaseDetailMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)$/u);
  if (staffCaseDetailMatch && method === "GET") {
    const caseId = decodeURIComponent(staffCaseDetailMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffCaseDetail(runtime, request, requestId, caseId);
  }

  const staffCaseConnectMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/connect$/u);
  if (staffCaseConnectMatch && method === "GET") {
    const caseId = decodeURIComponent(staffCaseConnectMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffCaseConnect(runtime, request, requestId, caseId);
  }

  const staffCaseMessagesMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/messages$/u);
  if (staffCaseMessagesMatch && method === "POST") {
    const caseId = decodeURIComponent(staffCaseMessagesMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffSendMessage(runtime, request, requestId, caseId);
  }

  const staffUploadIntentMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/upload-intents$/u);
  if (staffUploadIntentMatch && method === "POST") {
    const caseId = decodeURIComponent(staffUploadIntentMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffUploadIntent(runtime, request, requestId, caseId);
  }

  const staffAttachmentsMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/attachments$/u);
  if (staffAttachmentsMatch && method === "POST") {
    const caseId = decodeURIComponent(staffAttachmentsMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffCreateAttachment(runtime, request, requestId, caseId);
  }

  const staffAttachmentByIdMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/attachments\/([^/]+)$/u);
  if (staffAttachmentByIdMatch && method === "GET") {
    const caseId = decodeURIComponent(staffAttachmentByIdMatch[1] ?? "");
    const attachmentId = decodeURIComponent(staffAttachmentByIdMatch[2] ?? "");
    const parsed = staffAttachmentRouteParamsSchema.safeParse({ caseId, attachmentId });
    if (!parsed.success) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffGetAttachment(runtime, request, requestId, parsed.data.caseId, parsed.data.attachmentId);
  }

  const staffAttachmentContentMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/attachments\/([^/]+)\/content$/u);
  if (staffAttachmentContentMatch && method === "GET") {
    const caseId = decodeURIComponent(staffAttachmentContentMatch[1] ?? "");
    const attachmentId = decodeURIComponent(staffAttachmentContentMatch[2] ?? "");
    const parsed = staffAttachmentRouteParamsSchema.safeParse({ caseId, attachmentId });
    if (!parsed.success) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffGetAttachmentContent(runtime, request, requestId, parsed.data.caseId, parsed.data.attachmentId);
  }

  const staffCaseStatusMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/status$/u);
  if (staffCaseStatusMatch && method === "POST") {
    const caseId = decodeURIComponent(staffCaseStatusMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffCaseStatusUpdate(runtime, request, requestId, caseId);
  }

  const staffCaseNotesMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/notes$/u);
  if (staffCaseNotesMatch && method === "GET") {
    const caseId = decodeURIComponent(staffCaseNotesMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffCaseNotes(runtime, request, requestId, caseId);
  }

  if (staffCaseNotesMatch && method === "POST") {
    const caseId = decodeURIComponent(staffCaseNotesMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
    return staffCreateNote(runtime, request, requestId, caseId);
  }

  const staffCaseTimelineMatch = pathname.match(/^\/api\/staff\/cases\/([^/]+)\/timeline$/u);
  if (staffCaseTimelineMatch && method === "GET") {
    const caseId = decodeURIComponent(staffCaseTimelineMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(caseId)) {
      return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    }
  const staffExportMatch = pathname.match(/^\/api\/staff\/reservations\/([^/]+)\/export$/u);
  if (staffExportMatch && method === "GET") {
    const reservationId = decodeURIComponent(staffExportMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(reservationId)) return fail(requestId, 404, "NOT_FOUND", "Unable to continue");
    return staffExportEvidence(runtime, request, requestId, reservationId);
  }

  if (pathname === "/api/staff/inventory" && method === "GET") {
    return getInventory(runtime, request, requestId);
  }
  if (pathname === "/api/staff/inventory/update" && method === "POST") {
    return updateInventory(runtime, request, requestId);
  }
  if (pathname === "/api/staff/chat" && method === "POST") {
    return deptChatHandler(runtime, request, requestId);
  }
  if (pathname === "/api/staff/ingest" && method === "POST") {
    return fileIngestHandler(runtime, request, requestId);
  }


    return staffTimeline(runtime, request, requestId, caseId);
  }

  if (pathname === "/api/staff/shifts/clock-in" && method === "POST") {
    return staffClockIn(runtime, request, requestId);
  }
  if (pathname === "/api/staff/washes/register" && method === "POST") {
    return staffRegisterWash(runtime, request, requestId);
  }

  if (pathname === "/api/staff/canned-replies" && method === "GET") {
    return staffCannedReplies(runtime, request, requestId);
  }

  // ── Scheduling Engine Routes ──
  if (pathname === "/api/staff/schedules/generate" && method === "POST") {
    return handleGenerateSchedule(runtime, request, requestId);
  }
  if (pathname === "/api/staff/schedules" && method === "GET") {
    return handleGetSchedule(runtime, request, requestId);
  }
  if (pathname === "/api/staff/schedules/publish" && method === "POST") {
    return handlePublishSchedule(runtime, request, requestId);
  }
  const shiftUpdateMatch = pathname.match(/^\/api\/staff\/schedules\/shifts\/([^/]+)$/u);
  if (shiftUpdateMatch && method === "PATCH") {
    const shiftId = decodeURIComponent(shiftUpdateMatch[1] ?? "");
    if (!OPAQUE_ID_RE.test(shiftId)) return fail(requestId, 404, "NOT_FOUND", "Invalid shift ID");
    return handleUpdateShift(runtime, request, requestId, shiftId);
  }
  if (pathname === "/api/staff/employees" && method === "GET") {
    return handleGetEmployees(runtime, request, requestId);
  }
  if (pathname === "/api/staff/stations" && method === "GET") {
    return handleGetStations(runtime, request, requestId);
  }

  // ── Fleet Management Routes ──
  if (pathname === "/api/staff/fleet/vehicles" && method === "GET") {
    return staffFleetVehicles(runtime, request, requestId);
  }
  if (pathname === "/api/staff/fleet/vehicles" && method === "POST") {
    return staffFleetVehicleCreate(runtime, request, requestId);
  }
  if (pathname === "/api/staff/fleet/shifts" && method === "GET") {
    return staffFleetShifts(runtime, request, requestId);
  }
  if (pathname === "/api/staff/fleet/washes" && method === "GET") {
    return staffFleetWashes(runtime, request, requestId);
  }
  if (pathname === "/api/staff/fleet/washes" && method === "POST") {
    return staffFleetWashCreate(runtime, request, requestId);
  }

  if (pathname.startsWith("/api/")) {
    return fail(requestId, 501, "NOT_IMPLEMENTED", "Endpoint not implemented", {
      method,
      pathname
    });
  }

  return serveSpa(runtime, request);
}


export async function staffClockIn(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, 'UNAUTHORIZED', 'Unable to continue');
  return ok(requestId, { status: 'active', staffId: staff.session.staffUserId });
}

export async function staffRegisterWash(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, 'UNAUTHORIZED', 'Unable to continue');
  return ok(requestId, { washId: newOpaqueId(), status: 'completed' });
}


async function customerRoomSync(runtime: RuntimeEnv, request: Request, requestId: string, roomToken: string): Promise<Response> {
  const auth = await getCustomerAuthContext(runtime, request);
  if (!auth.ok || auth.room.roomToken !== roomToken) return fail(requestId, 401, 'UNAUTHORIZED', 'Unable to continue');
  const body = await parseJsonBody(request, z.object({ payload: z.record(z.any()), senderId: z.string() }));
  if (!body.success) return fail(requestId, 400, 'INVALID_REQUEST', 'Invalid sync payload');
  await publishLiveEvent(runtime, {
    type: 'tab_sync',
    roomToken,
    senderId: body.data.senderId,
    payload: body.data.payload,
    sentEpochS: nowEpochS()
  }, { requestId, mutationKind: 'tab_sync', doRoomName: auth.room.doRoomName });
  return ok(requestId, { synced: true });
}
