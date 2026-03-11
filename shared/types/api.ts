import type {
  AttachmentRetrievalView,
  AttachmentView,
  CannedReplyView,
  ChatMessageView,
  CustomerRoomReadModel,
  CustomerSessionView,
  ReservationSummary,
  RoomSummaryView,
  StaffCaseDetailView,
  StaffCaseListItem,
  StaffInternalNoteView,
  StaffSessionView,
  StaffTimelineEvent,
  UploadIntentView,
  UploadCapabilityView
} from "./domain";

export interface ApiSuccess<TData> {
  ok: true;
  data: TData;
  requestId: string;
  atEpochS: number;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  atEpochS: number;
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiError;

export interface HealthLivePayload {
  status: "live";
  service: string;
}

export interface HealthReadyPayload {
  status: "ready" | "degraded";
  checks: {
    d1: "ok" | "error";
    r2: "ok" | "error" | "unknown";
    queues: "ok" | "error" | "unknown";
  };
  reasonCodes: string[];
  checkedAtEpochS: number;
}

export interface ReservationValidationPayload {
  reservation: ReservationSummary;
  customerSession: CustomerSessionView;
  uploadCapability: UploadCapabilityView;
  roomToken: string;
}

export interface CustomerSessionPayload extends ReservationValidationPayload {}

export interface CustomerRoomPayload extends CustomerRoomReadModel {}

export interface CustomerMessagesPayload {
  roomToken: string;
  messages: ChatMessageView[];
  nextBeforeEpochS: number | null;
}

export interface CustomerMessageMutationPayload {
  message: ChatMessageView;
}

export interface UploadIntentPayload {
  intent: UploadIntentView;
}

export interface AttachmentMutationPayload {
  attachment: AttachmentView;
  message: ChatMessageView;
}

export interface AttachmentRetrievalPayload extends AttachmentRetrievalView {}

export interface StaffSessionPayload {
  staffSession: StaffSessionView;
}

export interface StaffCaseListPayload {
  cases: StaffCaseListItem[];
  nextUpdatedBeforeEpochS: number | null;
}

export interface StaffCaseDetailPayload {
  caseDetail: StaffCaseDetailView;
}

export interface StaffCaseMessagesPayload {
  messages: ChatMessageView[];
}

export interface StaffCaseNoteListPayload {
  notes: StaffInternalNoteView[];
}

export interface StaffCaseNoteMutationPayload {
  note: StaffInternalNoteView;
}

export interface StaffCaseStatusMutationPayload {
  caseId: string;
  room: RoomSummaryView;
}

export interface StaffCannedRepliesPayload {
  replies: CannedReplyView[];
}

export interface StaffCaseTimelinePayload {
  timeline: StaffTimelineEvent[];
}

export interface DiagnosticsSummaryPayload {
  openAlerts: number;
  criticalAlerts: number;
  dlqOpenItems: number;
  openCases: number;
  activeCustomerSessions: number;
  activeStaffSessions: number;
  pendingAttachmentEvents: number;
  generatedAtEpochS: number;
}
