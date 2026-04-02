export type ISODate = string;

export type CaseStatus =
  | "new"
  | "waiting_customer"
  | "under_review"
  | "escalated"
  | "resolved"
  | "closed"
  | "disputed";

export type UploadGuidanceSlot =
  | "front"
  | "rear"
  | "left_side"
  | "right_side"
  | "damage_closeup"
  | "plate_optional"
  | "other";

export type UploadClientState =
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed"
  | "blocked_capability_expired";

export type MessageSenderKind = "customer" | "staff" | "system";

export type MessageKind = "text" | "system" | "consent_receipt" | "attachment" | "canned_reply";

export type AttachmentVisibility = "customer_visible" | "staff_only";

export type AttachmentUploadStatus = "intent_created" | "metadata_persisted";

export interface ReservationSummary {
  id: string;
  reservationNumber: string;
  stationCode: string;
  pickupDateLocal: ISODate;
  pickupDayStartEpochS: number;
  pickupDayEndEpochS: number;
  status: "active" | "cancelled" | "closed";
  hasUploadedEvidence: boolean;
}

export interface CustomerSessionView {
  sessionPublicId: string;
  roomToken: string;
  expiresEpochS: number;
}

export interface StaffSessionView {
  sessionPublicId: string;
  staffUserId: string;
  displayName: string;
  email: string;
  expiresEpochS: number;
  roleKeys: string[];
  permissions: string[];
}

export interface UploadCapabilityView {
  capabilityId: string;
  status: "enabled" | "expired" | "revoked";
  maxFiles: number;
  usedFilesCount: number;
  uploadWindowStartEpochS: number;
  uploadWindowEndEpochS: number;
}

export interface RoomSummaryView {
  roomToken: string;
  caseStatus: CaseStatus;
  lastEventSeq: number;
  lastMessageEpochS: number | null;
}

export interface ChatMessageView {
  id: string;
  senderKind: MessageSenderKind;
  messageKind: MessageKind;
  body: string | null;
  createdEpochS: number;
  clientCreatedEpochMs: number | null;
  idempotencyKey: string;
  attachment: AttachmentView | null;
}

export interface AttachmentView {
  attachmentId: string;
  messageId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  visibility: AttachmentVisibility;
  createdEpochS: number;
  senderKind: MessageSenderKind;
  uploadStatus: AttachmentUploadStatus;
}

export interface UploadIntentView {
  intentId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  visibility: AttachmentVisibility;
  uploadMode: "metadata_only";
  expiresEpochS: number;
}

export type AttachmentRetrievalMode = "metadata_only";

export interface ProtectedAttachmentView {
  attachmentId: string;
  messageId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  visibility: AttachmentVisibility;
  createdEpochS: number;
  senderKind: MessageSenderKind;
  uploadStatus: AttachmentUploadStatus;
}

export interface AttachmentRetrievalView {
  attachment: ProtectedAttachmentView;
  retrievalMode: AttachmentRetrievalMode;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CustomerRoomReadModel {
  reservation: ReservationSummary;
  customerSession: CustomerSessionView;
  uploadCapability: UploadCapabilityView;
  room: RoomSummaryView;
}

export interface StaffCaseListItem {
  caseId: string;
  roomToken: string;
  reservation: ReservationSummary;
  stationCode: string;
  caseStatus: CaseStatus;
  lastEventSeq: number;
  lastMessageEpochS: number | null;
  updatedEpochS: number | null;
}

export interface StaffInternalNoteView {
  noteId: string;
  body: string;
  createdEpochS: number;
  createdBy: {
    staffUserId: string;
    displayName: string;
  } | null;
  idempotencyKey: string;
  clientCreatedEpochMs: number | null;
}

export interface CannedReplyView {
  cannedReplyId: string;
  title: string;
  body: string;
  category: string | null;
}

export interface StaffCaseDetailView {
  caseId: string;
  roomToken: string;
  reservation: ReservationSummary;
  room: RoomSummaryView;
  uploadCapability: UploadCapabilityView;
  messages: ChatMessageView[];
  allowedTransitions: CaseStatus[];
}

export type StaffTimelineEventType = "message" | "note" | "status_change";

export interface StaffTimelineActorSummary {
  actorKind: "customer" | "staff" | "system";
  actorId?: string;
  displayName?: string;
}

export interface StaffTimelineEvent {
  eventId: string;
  eventType: StaffTimelineEventType;
  createdEpochS: number;
  actor: StaffTimelineActorSummary;
  body: string | null;
  summary: string;
  fromStatus?: CaseStatus | null;
  toStatus?: CaseStatus | null;
}

export type LiveEvent =
  | {
      type: "hello";
      roomToken: string;
      connectedEpochS: number;
      role: "customer" | "staff";
    }
  | {
      type: "message_persisted";
      roomToken: string;
      messageId: string;
      createdEpochS: number;
      senderKind: MessageSenderKind;
    }
  | {
      type: "case_status_changed";
      roomToken: string;
      caseStatus: CaseStatus;
      changedEpochS: number;
    }
  | {
      type: "note_created";
      roomToken: string;
      noteId: string;
      createdEpochS: number;
    };

export interface DriveSyncQueueMessage {
  uploadFileId: string;
  reservationId: string;
  roomId: string;
  idempotencyKey: string;
  enqueuedEpochS: number;
}

export interface IncidentEventMessage {
  eventType:
    | "invalid_reservation_attempt"
    | "upload_failure"
    | "drive_sync_failure"
    | "queue_backlog"
    | "ws_disconnect_spike"
    | "slow_validation"
    | "session_creation_spike"
    | "dlq_growth";
  severity: "debug" | "info" | "warn" | "error" | "critical";
  reservationId?: string;
  roomId?: string;
  sessionId?: string;
  details: Record<string, unknown>;
  occurredEpochS: number;
}

export interface LocalQueuedChatMessage {
  localId: string;
  roomToken: string;
  idempotencyKey: string;
  body: string;
  replyToMessageId?: string;
  createdEpochMs: number;
  attemptCount: number;
  status: "queued" | "sending" | "sent" | "failed";
}

export interface LocalQueuedUpload {
  localUploadId: string;
  roomToken: string;
  capabilityIdSnapshot: string;
  batchUuid: string;
  clientFileUuid: string;
  intentIdempotencyKey: string;
  commitIdempotencyKey: string;
  blobIdbKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  guidanceSlot: UploadGuidanceSlot;
  createdEpochMs: number;
  attemptCount: number;
  status: UploadClientState;
}
