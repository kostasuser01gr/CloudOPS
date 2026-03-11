import { z } from "zod";
import { epochSecondsSchema, opaqueIdSchema, reservationNumberSchema } from "./common";

export const reservationLookupRequestSchema = z.object({
  reservationNumber: reservationNumberSchema,
  stationCode: z.string().trim().min(2).max(16).optional()
});

export type ReservationLookupRequest = z.infer<typeof reservationLookupRequestSchema>;

export const reservationSchema = z.object({
  id: opaqueIdSchema,
  reservationNumber: reservationNumberSchema,
  stationCode: z.string().trim().min(2).max(16),
  pickupDateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  pickupDayStartEpochS: epochSecondsSchema,
  pickupDayEndEpochS: epochSecondsSchema,
  status: z.enum(["active", "cancelled", "closed"])
});

export const caseStatusSchema = z.enum([
  "new",
  "waiting_customer",
  "under_review",
  "escalated",
  "resolved",
  "closed",
  "disputed"
]);

export const uploadCapabilitySchema = z.object({
  capabilityId: opaqueIdSchema,
  status: z.enum(["enabled", "expired", "revoked"]),
  maxFiles: z.number().int().positive().max(15),
  usedFilesCount: z.number().int().nonnegative().max(15),
  uploadWindowStartEpochS: epochSecondsSchema,
  uploadWindowEndEpochS: epochSecondsSchema
});

export const customerSessionSchema = z.object({
  sessionPublicId: opaqueIdSchema,
  roomToken: opaqueIdSchema,
  expiresEpochS: epochSecondsSchema
});

export const roomSummarySchema = z.object({
  roomToken: opaqueIdSchema,
  caseStatus: caseStatusSchema,
  lastEventSeq: z.number().int().nonnegative(),
  lastMessageEpochS: epochSecondsSchema.nullable()
});

export const attachmentVisibilitySchema = z.enum(["customer_visible", "staff_only"]);

export const attachmentSchema = z.object({
  attachmentId: opaqueIdSchema,
  messageId: opaqueIdSchema,
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(127),
  sizeBytes: z.number().int().positive(),
  storageKey: z.string().trim().min(3).max(512),
  visibility: attachmentVisibilitySchema,
  createdEpochS: epochSecondsSchema,
  senderKind: z.enum(["customer", "staff", "system"]),
  uploadStatus: z.enum(["intent_created", "metadata_persisted"])
});

export const protectedAttachmentSchema = attachmentSchema.omit({
  storageKey: true
});

export const chatMessageSchema = z.object({
  id: opaqueIdSchema,
  senderKind: z.enum(["customer", "staff", "system"]),
  messageKind: z.enum(["text", "system", "consent_receipt", "attachment", "canned_reply"]),
  body: z.string().max(4000).nullable(),
  createdEpochS: epochSecondsSchema,
  clientCreatedEpochMs: z.number().int().nonnegative().nullable(),
  idempotencyKey: z.string().min(12).max(128),
  attachment: attachmentSchema.nullable()
});

export const reservationValidationResponseSchema = z.object({
  reservation: reservationSchema,
  customerSession: customerSessionSchema,
  uploadCapability: uploadCapabilitySchema,
  roomToken: opaqueIdSchema
});

export type ReservationValidationResponse = z.infer<typeof reservationValidationResponseSchema>;

export const customerRoomResponseSchema = z.object({
  reservation: reservationSchema,
  customerSession: customerSessionSchema,
  uploadCapability: uploadCapabilitySchema,
  room: roomSummarySchema
});

export type CustomerRoomResponse = z.infer<typeof customerRoomResponseSchema>;

export const messageListResponseSchema = z.object({
  roomToken: opaqueIdSchema,
  messages: z.array(chatMessageSchema),
  nextBeforeEpochS: epochSecondsSchema.nullable()
});

export const healthReadyResponseSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  checks: z.object({
    d1: z.enum(["ok", "error"]),
    r2: z.enum(["ok", "error", "unknown"]),
    queues: z.enum(["ok", "error", "unknown"])
  }),
  reasonCodes: z.array(z.string().min(1).max(80)),
  checkedAtEpochS: epochSecondsSchema
});

export const diagnosticsSummaryResponseSchema = z.object({
  openAlerts: z.number().int().nonnegative(),
  criticalAlerts: z.number().int().nonnegative(),
  dlqOpenItems: z.number().int().nonnegative(),
  openCases: z.number().int().nonnegative(),
  activeCustomerSessions: z.number().int().nonnegative(),
  activeStaffSessions: z.number().int().nonnegative(),
  pendingAttachmentEvents: z.number().int().nonnegative(),
  generatedAtEpochS: epochSecondsSchema
});

export const customerSendMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  clientCreatedEpochMs: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/u)
});

export const staffSendMessageBodySchema = customerSendMessageBodySchema;

export const uploadIntentRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(127),
  sizeBytes: z.number().int().positive(),
  visibility: attachmentVisibilitySchema.default("customer_visible"),
  idempotencyKey: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/u)
});

export const uploadIntentResponseSchema = z.object({
  intent: z.object({
    intentId: opaqueIdSchema,
    objectKey: z.string().trim().min(3).max(512),
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(3).max(127),
    sizeBytes: z.number().int().positive(),
    visibility: attachmentVisibilitySchema,
    uploadMode: z.literal("metadata_only"),
    expiresEpochS: epochSecondsSchema
  })
});

export const attachmentPersistRequestSchema = z.object({
  intentId: opaqueIdSchema,
  objectKey: z.string().trim().min(3).max(512),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(127),
  sizeBytes: z.number().int().positive(),
  visibility: attachmentVisibilitySchema.default("customer_visible"),
  idempotencyKey: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/u),
  clientCreatedEpochMs: z.number().int().nonnegative().optional()
});

export const attachmentMutationResponseSchema = z.object({
  attachment: attachmentSchema,
  message: chatMessageSchema
});

export const attachmentRetrievalResponseSchema = z.object({
  attachment: protectedAttachmentSchema,
  retrievalMode: z.literal("metadata_only"),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(127),
  sizeBytes: z.number().int().positive()
});

export const customerAttachmentRouteParamsSchema = z.object({
  roomToken: opaqueIdSchema,
  attachmentId: opaqueIdSchema
});

export const staffAttachmentRouteParamsSchema = z.object({
  caseId: opaqueIdSchema,
  attachmentId: opaqueIdSchema
});

export const staffCreateNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  clientCreatedEpochMs: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/u)
});

export const staffUpdateCaseStatusBodySchema = z.object({
  toStatus: z.enum(["new", "waiting_customer", "under_review", "resolved", "closed"]),
  idempotencyKey: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/u),
  reason: z.string().trim().max(500).optional()
});

export const staffSessionResponseSchema = z.object({
  staffSession: z.object({
    sessionPublicId: opaqueIdSchema,
    staffUserId: opaqueIdSchema,
    displayName: z.string().min(1).max(255),
    email: z.string().email(),
    expiresEpochS: epochSecondsSchema,
    roleKeys: z.array(z.string().min(1).max(64)),
    permissions: z.array(z.string().min(1).max(128))
  })
});

export const staffCaseListItemSchema = z.object({
  caseId: opaqueIdSchema,
  roomToken: opaqueIdSchema,
  reservation: reservationSchema,
  stationCode: z.string().min(2).max(16),
  caseStatus: caseStatusSchema,
  lastEventSeq: z.number().int().nonnegative(),
  lastMessageEpochS: epochSecondsSchema.nullable(),
  updatedEpochS: epochSecondsSchema.nullable()
});

export const staffCaseListResponseSchema = z.object({
  cases: z.array(staffCaseListItemSchema),
  nextUpdatedBeforeEpochS: epochSecondsSchema.nullable()
});

export const staffCaseDetailResponseSchema = z.object({
  caseDetail: z.object({
    caseId: opaqueIdSchema,
    roomToken: opaqueIdSchema,
    reservation: reservationSchema,
    room: roomSummarySchema,
    uploadCapability: uploadCapabilitySchema,
    messages: z.array(chatMessageSchema),
    allowedTransitions: z.array(caseStatusSchema)
  })
});

export const staffInternalNoteSchema = z.object({
  noteId: opaqueIdSchema,
  body: z.string().min(1).max(2000),
  createdEpochS: epochSecondsSchema,
  createdBy: z
    .object({
      staffUserId: opaqueIdSchema,
      displayName: z.string().min(1).max(255)
    })
    .nullable(),
  idempotencyKey: z.string().min(12).max(128),
  clientCreatedEpochMs: z.number().int().nonnegative().nullable()
});

export const staffNotesResponseSchema = z.object({
  notes: z.array(staffInternalNoteSchema)
});

export const staffNoteMutationResponseSchema = z.object({
  note: staffInternalNoteSchema
});

export const staffCannedReplySchema = z.object({
  cannedReplyId: opaqueIdSchema,
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(4000),
  category: z.string().min(1).max(128).nullable()
});

export const staffCannedRepliesResponseSchema = z.object({
  replies: z.array(staffCannedReplySchema)
});

export const staffStatusMutationResponseSchema = z.object({
  caseId: opaqueIdSchema,
  room: roomSummarySchema
});

export const staffTimelineEventSchema = z.object({
  eventId: opaqueIdSchema,
  eventType: z.enum(["message", "note", "status_change"]),
  createdEpochS: epochSecondsSchema,
  actor: z.object({
    actorKind: z.enum(["customer", "staff", "system"]),
    actorId: opaqueIdSchema.optional(),
    displayName: z.string().min(1).max(255).optional()
  }),
  body: z.string().max(4000).nullable(),
  summary: z.string().min(1).max(1000),
  fromStatus: caseStatusSchema.nullable().optional(),
  toStatus: caseStatusSchema.nullable().optional()
});

export const staffCaseTimelineResponseSchema = z.object({
  timeline: z.array(staffTimelineEventSchema)
});

export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    roomToken: opaqueIdSchema,
    connectedEpochS: epochSecondsSchema,
    role: z.enum(["customer", "staff"])
  }),
  z.object({
    type: z.literal("message_persisted"),
    roomToken: opaqueIdSchema,
    messageId: opaqueIdSchema,
    createdEpochS: epochSecondsSchema,
    senderKind: z.enum(["customer", "staff", "system"])
  }),
  z.object({
    type: z.literal("case_status_changed"),
    roomToken: opaqueIdSchema,
    caseStatus: caseStatusSchema,
    changedEpochS: epochSecondsSchema
  }),
  z.object({
    type: z.literal("note_created"),
    roomToken: opaqueIdSchema,
    noteId: opaqueIdSchema,
    createdEpochS: epochSecondsSchema
  })
]);

export type StaffTimelineEvent = z.infer<typeof staffTimelineEventSchema>;
