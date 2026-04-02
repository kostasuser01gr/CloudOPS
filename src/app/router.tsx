import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Outlet, createBrowserRouter, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  attachmentMutationResponseSchema,
  attachmentPersistRequestSchema,
  chatMessageSchema,
  customerRoomResponseSchema,
  customerSendMessageBodySchema,
  diagnosticsSummaryResponseSchema,
  healthReadyResponseSchema,
  liveEventSchema,
  messageListResponseSchema,
  reservationLookupRequestSchema,
  reservationValidationResponseSchema,
  staffCannedRepliesResponseSchema,
  staffCaseDetailResponseSchema,
  staffCaseListResponseSchema,
  staffCreateNoteBodySchema,
  staffNoteMutationResponseSchema,
  staffNotesResponseSchema,
  staffSendMessageBodySchema,
  staffSessionResponseSchema,
  staffStatusMutationResponseSchema,
  staffTimelineEventSchema,
  staffUpdateCaseStatusBodySchema,
  uploadIntentRequestSchema,
  uploadIntentResponseSchema
} from "@shared/schemas/reservation";
import type {
  AttachmentMutationPayload,
  CustomerMessageMutationPayload,
  CustomerMessagesPayload,
  CustomerRoomPayload,
  DiagnosticsSummaryPayload,
  HealthReadyPayload,
  ReservationValidationPayload,
  StaffCaseDetailPayload,
  StaffCaseListPayload,
  StaffCaseNoteListPayload,
  StaffCaseTimelinePayload,
  StaffCannedRepliesPayload,
  StaffSessionPayload,
  UploadIntentPayload
} from "@shared/types/api";
import type {
  CaseStatus,
  ChatMessageView,
  LiveEvent,
  StaffInternalNoteView,
  StaffTimelineEvent
} from "@shared/types/domain";

import { DashboardPage, SchedulingPage, FleetPage, WasherWorkspacePage } from "../pages/index";

const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{16,128}$/u;

type MutationUiState = "idle" | "loading" | "error";
type WsUiState = "connecting" | "connected" | "disconnected" | "failed";

const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
interface FleetStore {
  syncSettings: { ui: boolean; tasks: boolean; chat: boolean };
  updateSyncSettings: (settings: Partial<FleetStore["syncSettings"]>) => void;
}

function useFleetStore() {
  const [settings, setSettings] = useState({ ui: true, tasks: true, chat: true });
  return {
    syncSettings: settings,
    updateSyncSettings: (s: any) => setSettings({ ...settings, ...s })
  };
}

function useSyncMesh(roomToken: string, onSync: (payload: any) => void) {
  const queryClient = useQueryClient();
  const senderId = useMemo(() => Math.random().toString(36).substr(2, 9), []);
  const syncMutation = useMutation({
    mutationFn: (payload: any) => fetch(`${roomToken === "staff-sync-room" ? `/api/staff-room/${roomToken}/sync` : `/api/customer-room/${roomToken}/sync`}`, {
      method: "POST",
      body: JSON.stringify({ payload, senderId }),
      headers: { "Content-Type": "application/json" }
    })
  });
  return { 
    sync: (payload: any) => syncMutation.mutate(payload), 
    senderId 
  };
}

    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional()
  }),
  requestId: z.string(),
  atEpochS: z.number()
});

function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
    requestId: z.string(),
    atEpochS: z.number()
  });
}

class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

function greekSafeError(error: unknown): string {
  if (error instanceof ApiClientError && error.code === "UNAUTHORIZED") {
    return "Η συνεδρία δεν είναι ενεργή. Συνδεθείτε ξανά.";
  }
  return "Δεν ήταν δυνατή η ολοκλήρωση. Δοκιμάστε ξανά.";
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit, dataSchema: z.ZodType<T>): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include"
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError("Invalid JSON response", response.status);
  }

  const successParsed = apiSuccessSchema(dataSchema).safeParse(payload);
  if (successParsed.success) {
    return successParsed.data.data as T;
  }

  const errorParsed = apiErrorSchema.safeParse(payload);
  if (errorParsed.success) {
    throw new ApiClientError(errorParsed.data.error.message, response.status, errorParsed.data.error.code);
  }

  throw new ApiClientError("Invalid response envelope", response.status);
}

async function throwApiClientErrorFromResponse(response: Response): Promise<never> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError("Unable to continue", response.status);
  }

  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    throw new ApiClientError(parsed.data.error.message, response.status, parsed.data.error.code);
  }

  throw new ApiClientError("Unable to continue", response.status);
}

function safeDownloadName(fileName: string): string {
  const sanitized = fileName.trim().replace(/[\\/\0-\x1F\x7F]+/gu, "_").replace(/["\r\n\\]+/gu, "_");
  return sanitized.length > 0 ? sanitized.slice(0, 200) : "attachment.bin";
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) {
    return null;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/iu);
  if (utf8Match?.[1]) {
    try {
      return safeDownloadName(decodeURIComponent(utf8Match[1]));
    } catch {
      return null;
    }
  }

  const basicMatch = disposition.match(/filename="?([^";]+)"?/iu);
  if (basicMatch?.[1]) {
    return safeDownloadName(basicMatch[1]);
  }

  return null;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeDownloadName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function wsUrl(pathname: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${pathname}`;
}

function getCookie(name: string): string | null {
  const part = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  if (!part) {
    return null;
  }

  return decodeURIComponent(part.slice(name.length + 1));
}

function getStaffCsrfToken(): string | null {
  return getCookie("__Host-cloudops_staff_csrf") ?? getCookie("cloudops_staff_csrf");
}

function newIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 12)}`;
}

function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "980px",
        padding: "1rem",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.45
      }}
    >
      <h1 style={{ marginBottom: "0.75rem" }}>{title}</h1>
      {children}
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "0.5rem",
        padding: "0.8rem",
        marginBottom: "0.8rem",
        background: "#fff"
      }}
    >
      <h2 style={{ fontSize: "1rem", marginBottom: "0.55rem" }}>{title}</h2>
      {children}
    </section>
  );
}

function RootLayout() {
  return (
    <>
      <header style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e5e7eb" }}>
        <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link to="/">Είσοδος</Link>
          <Link to="/reservation">Κράτηση</Link>
          <Link to="/staff/login">Staff Login</Link>
          <Link to="/staff">Dashboard</Link>
          <Link to="/staff/scheduling">Scheduling</Link>
          <Link to="/staff/fleet">Fleet</Link>
          <Link to="/staff/washer">Washer</Link>
          <Link to="/staff/diagnostics">Diagnostics</Link>
        </nav>
      </header>
      <Outlet />
    </>
  );
}

function LandingPage() {
  return (
    <PageShell title="CloudOPS">
      <p>Σαρώστε το QR και συνεχίστε στην ιδιωτική υποστήριξη κράτησης.</p>
      <Link to="/reservation">Έναρξη</Link>
      <div style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
        <p>Λήψη εφαρμογής:</p>
        <button onClick={() => {
          const link = document.createElement("link");
          link.rel = "manifest";
          link.href = "/manifest-staff.json";
          document.head.appendChild(link);
          alert("Τώρα μπορείτε να εγκαταστήσετε την εφαρμογή Προσωπικού από το μενού του προγράμματος περιήγησης.");
        }} style={{ padding: "0.5rem 1rem", backgroundColor: "#111827", color: "white", border: "none", borderRadius: "0.4rem", cursor: "pointer" }}>
          📲 Εγκατάσταση Staff App
        </button>
      </div>

    </PageShell>
  );
}

function ReservationEntryPage() {
  const navigate = useNavigate();
  const [submitState, setSubmitState] = useState<MutationUiState>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const form = useForm<{ reservationNumber: string }>({
    defaultValues: {
      reservationNumber: ""
    }
  });

  const submitMutation = useMutation({
    mutationFn: async (input: { reservationNumber: string }) => {
      const parsed = reservationLookupRequestSchema.safeParse(input);
      if (!parsed.success) {
        throw new ApiClientError("Invalid reservation number", 400, "INVALID_REQUEST");
      }

      return requestJson(
        "/api/customer-session/bootstrap",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(parsed.data)
        },
        reservationValidationResponseSchema
      );
    },
    onMutate: () => {
      setSubmitState("loading");
      setErrorText(null);
    },
    onSuccess: (data) => {
      setSubmitState("idle");
      navigate(`/c/${encodeURIComponent(data.roomToken)}`);
    },
    onError: (error) => {
      setSubmitState("error");
      setErrorText(greekSafeError(error));
    }
  });

  return (
    <PageShell title="Εισαγωγή Κράτησης">
      <form
        onSubmit={form.handleSubmit((values) => submitMutation.mutate(values))}
        style={{ display: "grid", gap: "0.75rem", maxWidth: "420px" }}
      >
        <label style={{ display: "grid", gap: "0.3rem" }}>
          Αριθμός κράτησης
          <input
            type="text"
            autoComplete="off"
            placeholder="π.χ. RES-123456"
            style={{ padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #9ca3af" }}
            {...form.register("reservationNumber")}
          />
        </label>

        <button
          type="submit"
          disabled={submitState === "loading"}
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.45rem",
            border: "none",
            color: "#fff",
            background: "#1f2937",
            fontWeight: 600,
            cursor: submitState === "loading" ? "not-allowed" : "pointer"
          }}
        >
          {submitState === "loading" ? "Έλεγχος..." : "Συνέχεια"}
        </button>

        {submitState === "error" && errorText ? (
          <p style={{ color: "#b91c1c", margin: 0 }}>{errorText}</p>
        ) : null}
      </form>
    </PageShell>
  );
}

async function readCustomerRoom(roomToken: string): Promise<CustomerRoomPayload> {
  const data = await requestJson(`/api/customer-room/${encodeURIComponent(roomToken)}`, { method: "GET" }, customerRoomResponseSchema);
  return data as CustomerRoomPayload;
}

async function readCustomerMessages(roomToken: string): Promise<CustomerMessagesPayload> {
  const data = await requestJson(
    `/api/customer-room/${encodeURIComponent(roomToken)}/messages?limit=100`,
    { method: "GET" },
    messageListResponseSchema
  );
  return data as CustomerMessagesPayload;
}

async function postCustomerMessage(roomToken: string, input: { body: string }): Promise<CustomerMessageMutationPayload> {
  const parsed = customerSendMessageBodySchema.safeParse({
    body: input.body,
    clientCreatedEpochMs: Date.now(),
    idempotencyKey: newIdempotencyKey("cust_msg")
  });

  if (!parsed.success) {
    throw new ApiClientError("Invalid message", 400, "INVALID_REQUEST");
  }

  const data = await requestJson(
    `/api/customer-room/${encodeURIComponent(roomToken)}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(parsed.data)
    },
    z.object({
      message: chatMessageSchema
    })
  );
  return data as CustomerMessageMutationPayload;
}

async function createCustomerUploadIntent(
  roomToken: string,
  input: { fileName: string; contentType: string; sizeBytes: number; visibility: "customer_visible"; idempotencyKey: string }
): Promise<UploadIntentPayload> {
  const parsed = uploadIntentRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiClientError("Invalid upload intent", 400, "INVALID_REQUEST");
  }

  const data = await requestJson(
    `/api/customer-room/${encodeURIComponent(roomToken)}/upload-intents`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(parsed.data)
    },
    uploadIntentResponseSchema
  );

  return data as UploadIntentPayload;
}

async function createCustomerAttachment(
  roomToken: string,
  input: {
    intentId: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    visibility: "customer_visible";
    idempotencyKey: string;
    clientCreatedEpochMs: number;
  }
): Promise<AttachmentMutationPayload> {
  const parsed = attachmentPersistRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiClientError("Invalid attachment payload", 400, "INVALID_REQUEST");
  }

  const data = await requestJson(
    `/api/customer-room/${encodeURIComponent(roomToken)}/attachments`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(parsed.data)
    },
    attachmentMutationResponseSchema
  );

  return data as AttachmentMutationPayload;
}

async function downloadCustomerAttachmentContent(roomToken: string, attachmentId: string, fallbackFileName: string): Promise<void> {
  const response = await fetch(
    `/api/customer-room/${encodeURIComponent(roomToken)}/attachments/${encodeURIComponent(attachmentId)}/content`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  if (!response.ok) {
    await throwApiClientErrorFromResponse(response);
  }

  const blob = await response.blob();
  const fileName = filenameFromDisposition(response.headers.get("content-disposition")) ?? safeDownloadName(fallbackFileName);
  triggerBlobDownload(blob, fileName);
}

function statusBadge(state: WsUiState) {
  const map: Record<WsUiState, { text: string; color: string }> = {
    connecting: { text: "Σύνδεση...", color: "#9a3412" },
    connected: { text: "Συνδεδεμένο", color: "#166534" },
    disconnected: { text: "Αποσυνδέθηκε", color: "#b45309" },
    failed: { text: "Σφάλμα σύνδεσης", color: "#b91c1c" }
  };

  return <span style={{ color: map[state].color, fontWeight: 600 }}>{map[state].text}</span>;
}

function CustomerChatPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const [wsState, setWsState] = useState<WsUiState>("connecting");
  const [composer, setComposer] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentOpenError, setAttachmentOpenError] = useState<string | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);

  const { syncSettings, updateSyncSettings } = useFleetStore();
  const { sync, senderId } = useSyncMesh(roomToken, (p) => {
    if (syncSettings.ui && p.type === "composer_update") {
      setComposer(p.value);
    }
  });


  useEffect(() => {
    if (syncSettings.chat) {
       sync({ type: "composer_update", value: composer });
    }
  }, [composer, syncSettings.chat]);

  const roomToken = params.roomToken ?? "";
  const roomTokenValid = OPAQUE_ID_RE.test(roomToken);

  const roomQuery = useQuery({
    queryKey: ["customer-room", roomToken],
    enabled: roomTokenValid,
    queryFn: () => readCustomerRoom(roomToken)
  });

  const messagesQuery = useQuery({
    queryKey: ["customer-messages", roomToken],
    enabled: roomTokenValid && roomQuery.isSuccess,
    queryFn: () => readCustomerMessages(roomToken)
  });

  const sendMutation = useMutation({
    mutationFn: (input: { body: string }) => postCustomerMessage(roomToken, input),
    onMutate: () => {
      setSendError(null);
    },
    onSuccess: (data) => {
      setComposer("");
      queryClient.setQueryData<CustomerMessagesPayload | undefined>(["customer-messages", roomToken], (current) => {
        if (!current) {
          return current;
        }

        const exists = current.messages.some((message) => message.id === data.message.id);
        if (exists) {
          return current;
        }

        return {
          ...current,
          messages: [data.message, ...current.messages]
        };
      });
    },
    onError: (error) => {
      setSendError(greekSafeError(error));
    }
  });

  const attachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const idempotencyKey = newIdempotencyKey("cust_att");
      const intent = await createCustomerUploadIntent(roomToken, {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        visibility: "customer_visible",
        idempotencyKey
      });

      return createCustomerAttachment(roomToken, {
        intentId: intent.intent.intentId,
        objectKey: intent.intent.objectKey,
        fileName: intent.intent.fileName,
        contentType: intent.intent.contentType,
        sizeBytes: intent.intent.sizeBytes,
        visibility: "customer_visible",
        idempotencyKey,
        clientCreatedEpochMs: Date.now()
      });
    },
    onMutate: () => {
      setAttachmentError(null);
    },
    onSuccess: () => {
      setSelectedAttachment(null);
      void queryClient.invalidateQueries({ queryKey: ["customer-messages", roomToken] });
    },
    onError: (error) => {
      setAttachmentError(greekSafeError(error));
    }
  });

  const attachmentReadMutation = useMutation({
    mutationFn: (input: { attachmentId: string; fileName: string }) =>
      downloadCustomerAttachmentContent(roomToken, input.attachmentId, input.fileName),
    onMutate: (input) => {
      setAttachmentOpenError(null);
      setOpeningAttachmentId(input.attachmentId);
    },
    onSuccess: () => {
      setOpeningAttachmentId(null);
    },
    onError: (error) => {
      setAttachmentOpenError(greekSafeError(error));
      setOpeningAttachmentId(null);
    }
  });

  useEffect(() => {
    if (!roomTokenValid) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      setWsState("connecting");
      socket = new WebSocket(wsUrl(`/api/customer-room/${encodeURIComponent(roomToken)}/connect`));

      socket.onopen = () => {
        setWsState("connected");
      };

      socket.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }

        const parsed = liveEventSchema.safeParse(payload);
        if (!parsed.success) {
          return;
        }

        const liveEvent: LiveEvent = parsed.data;
        if (liveEvent.type === "hello") {
          setWsState("connected");
          return;
        }

        if (liveEvent.type === "message_persisted") {
          void queryClient.invalidateQueries({ queryKey: ["customer-messages", roomToken] });
          return;
        }

        if (liveEvent.type === "tab_sync") {
          if (liveEvent.senderId !== senderId) {
            onSync(liveEvent.payload);
          }
          return;
        }

        if (liveEvent.type === "case_status_changed") {
          void queryClient.invalidateQueries({ queryKey: ["customer-room", roomToken] });
        }
      };

      socket.onerror = () => {
        setWsState("failed");
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }
        setWsState("disconnected");
        reconnectTimer = window.setTimeout(connect, 2_000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [queryClient, roomToken, roomTokenValid]);

  if (!roomTokenValid) {
    return (
      <PageShell title="Ιδιωτική Υποστήριξη">
        <p>Μη έγκυρο δωμάτιο συνομιλίας.</p>
      </PageShell>
    );
  }

  if (roomQuery.isLoading) {
    return (
      <PageShell title="Ιδιωτική Υποστήριξη">
        <p>Φόρτωση...</p>
      </PageShell>
    );
  }

  if (roomQuery.isError) {
    return (
      <PageShell title="Ιδιωτική Υποστήριξη">
        <p>{greekSafeError(roomQuery.error)}</p>
      </PageShell>
    );
  }

  const room = roomQuery.data;
  if (!room) {
    return (
      <PageShell title="Ιδιωτική Υποστήριξη">
        <p>Δεν ήταν δυνατή η φόρτωση.</p>
      </PageShell>
    );
  }
  const messages = messagesQuery.data?.messages ?? [];

  return (
    <PageShell title="Ιδιωτική Υποστήριξη">
      <Card title="Σύνοψη κράτησης">
        <p style={{ margin: 0 }}>Κράτηση: {room.reservation.reservationNumber}</p>
        <p style={{ margin: 0 }}>Σταθμός: {room.reservation.stationCode}</p>
      </Card>

      <Card title="Κατάσταση συνεδρίας">
        <p style={{ margin: 0 }}>Σύνδεση: {statusBadge(wsState)}</p>
        <p style={{ margin: 0 }}>Υπόθεση: {room.room.caseStatus}</p>
      </Card>
      <Card title="Συγχρονισμός">
        <div style={{ display: "flex", gap: "1rem" }}>
          <label><input type="checkbox" checked={syncSettings.chat} onChange={e => updateSyncSettings({ chat: e.target.checked })} /> Chat</label>
          <label><input type="checkbox" checked={syncSettings.ui} onChange={e => updateSyncSettings({ ui: e.target.checked })} /> UI State State</label>
        </div>
      </Card>


      <Card title="Δυνατότητα μεταφόρτωσης">
        {!room.reservation.hasUploadedEvidence ? (
          <>
            <p style={{ margin: "0 0 0.6rem 0" }}>Κατάσταση: {room.uploadCapability.status}</p>
            <div
              style={{
                border: "2px dashed #6b7280",
                borderRadius: "0.5rem",
                padding: "1rem",
                textAlign: "center",
                fontWeight: 700
              }}
            >
              Μεγάλο κουμπί μεταφόρτωσης (placeholder)
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: "#166534", fontWeight: 600 }}>
            ✓ Η μεταφόρτωση αποδεικτικών έχει ολοκληρωθεί.
          </p>
        )}
      </Card>

      </Card>

      <Card title="Υποστήριξη">
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.8rem", minHeight: "220px" }}>
          {messagesQuery.isLoading ? <p>Φόρτωση μηνυμάτων...</p> : null}
          {!messagesQuery.isLoading && messages.length === 0 ? <p>Τα μηνύματα θα εμφανιστούν εδώ.</p> : null}
          {messages.map((message) => (
            <article key={message.id} style={{ marginBottom: "0.7rem" }}>
              <strong>{message.senderKind === "customer" ? "Εσείς" : "Υποστήριξη"}</strong>
              {message.messageKind === "attachment" && message.attachment ? (
                <div style={{ margin: "0.2rem 0" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Συνημμένο: {message.attachment.fileName}</p>
                  <small>
                    {message.attachment.contentType} • {Math.max(1, Math.round(message.attachment.sizeBytes / 1024))} KB
                  </small>
                  <div style={{ marginTop: "0.35rem" }}>
                    <button
                      type="button"
                      onClick={() =>
                        attachmentReadMutation.mutate({
                          attachmentId: message.attachment!.attachmentId,
                          fileName: message.attachment!.fileName
                        })
                      }
                      disabled={
                        attachmentReadMutation.isPending &&
                        openingAttachmentId === message.attachment.attachmentId
                      }
                    >
                      {attachmentReadMutation.isPending &&
                      openingAttachmentId === message.attachment.attachmentId
                        ? "Άνοιγμα..."
                        : "Άνοιγμα / λήψη"}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: "0.2rem 0" }}>{message.body ?? ""}</p>
              )}
              <small>{new Date(message.createdEpochS * 1000).toLocaleString("el-GR")}</small>
            </article>
          ))}
        </div>
        {attachmentOpenError ? <p style={{ color: "#b91c1c", marginTop: "0.5rem" }}>{attachmentOpenError}</p> : null}

        <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.55rem" }}>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            <label style={{ fontWeight: 600 }}>Αποστολή συνημμένου</label>
            <input
              type="file"
              onChange={(event) => setSelectedAttachment(event.target.files?.[0] ?? null)}
              aria-label="Επιλογή αρχείου"
            />
            <button
              type="button"
              onClick={() => {
                if (selectedAttachment) {
                  attachmentMutation.mutate(selectedAttachment);
                }
              }}
              disabled={!selectedAttachment || attachmentMutation.isPending}
            >
              {attachmentMutation.isPending ? "Μεταφόρτωση..." : "Αποστολή συνημμένου"}
            </button>
            {attachmentError ? <p style={{ color: "#b91c1c", margin: 0 }}>{attachmentError}</p> : null}
          </div>

          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder="Γράψτε μήνυμα προς την υποστήριξη..."
            rows={3}
            style={{ padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #9ca3af" }}
          />

          <button
            type="button"
            onClick={() => sendMutation.mutate({ body: composer })}
            disabled={sendMutation.isPending || composer.trim().length === 0}
            style={{
              padding: "0.7rem 1rem",
              borderRadius: "0.45rem",
              border: "none",
              color: "#fff",
              background: "#111827",
              fontWeight: 600
            }}
          >
            {sendMutation.isPending ? "Αποστολή..." : "Αποστολή"}
          </button>

          {sendError ? <p style={{ color: "#b91c1c", margin: 0 }}>{sendError}</p> : null}
        </div>
      </Card>
    </PageShell>
  );
}

function StaffLoginPage() {
  const navigate = useNavigate();
  const [submitState, setSubmitState] = useState<MutationUiState>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const form = useForm<{ email: string; password: string }>({
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const mutation = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const parsed = z
        .object({
          email: z.string().trim().email(),
          password: z.string().min(8)
        })
        .safeParse(input);

      if (!parsed.success) {
        throw new ApiClientError("Invalid login payload", 400, "INVALID_REQUEST");
      }

      return requestJson(
        "/api/staff-session/login",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(parsed.data)
        },
        staffSessionResponseSchema
      );
    },
    onMutate: () => {
      setSubmitState("loading");
      setErrorText(null);
    },
    onSuccess: () => {
      setSubmitState("idle");
      navigate("/staff");
    },
    onError: (error) => {
      setSubmitState("error");
      setErrorText(greekSafeError(error));
    }
  });

  return (
    <PageShell title="Είσοδος προσωπικού">
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} style={{ maxWidth: "420px", display: "grid", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.3rem" }}>
          Email
          <input
            type="email"
            placeholder="staff@example.com"
            style={{ padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #9ca3af" }}
            {...form.register("email")}
          />
        </label>

        <label style={{ display: "grid", gap: "0.3rem" }}>
          Κωδικός
          <input
            type="password"
            style={{ padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #9ca3af" }}
            {...form.register("password")}
          />
        </label>

        <button
          type="submit"
          disabled={submitState === "loading"}
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.45rem",
            border: "none",
            color: "#fff",
            background: "#1f2937",
            fontWeight: 600
          }}
        >
          {submitState === "loading" ? "Σύνδεση..." : "Είσοδος"}
        </button>

        {errorText ? <p style={{ color: "#b91c1c", margin: 0 }}>{errorText}</p> : null}
      </form>
    </PageShell>
  );
}

async function readStaffSession(): Promise<StaffSessionPayload> {
  const data = await requestJson("/api/staff-session/me", { method: "GET" }, staffSessionResponseSchema);
  return data as StaffSessionPayload;
}

async function readStaffCases(statusFilter: string): Promise<StaffCaseListPayload> {
  const query = new URLSearchParams();
  if (statusFilter) {
    query.set("status", statusFilter);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await requestJson(`/api/staff/cases${suffix}`, { method: "GET" }, staffCaseListResponseSchema);
  return data as StaffCaseListPayload;
}

async function readStaffCaseDetail(caseId: string): Promise<StaffCaseDetailPayload> {
  const data = await requestJson(`/api/staff/cases/${encodeURIComponent(caseId)}`, { method: "GET" }, staffCaseDetailResponseSchema);
  return data as StaffCaseDetailPayload;
}

async function readStaffNotes(caseId: string): Promise<StaffCaseNoteListPayload> {
  const data = await requestJson(`/api/staff/cases/${encodeURIComponent(caseId)}/notes`, { method: "GET" }, staffNotesResponseSchema);
  return data as StaffCaseNoteListPayload;
}

async function readStaffTimeline(caseId: string): Promise<StaffCaseTimelinePayload> {
  const data = await requestJson(
    `/api/staff/cases/${encodeURIComponent(caseId)}/timeline`,
    { method: "GET" },
    z.object({ timeline: z.array(staffTimelineEventSchema) })
  );
  return data as StaffCaseTimelinePayload;
}

async function readStaffCannedReplies(): Promise<StaffCannedRepliesPayload> {
  const data = await requestJson("/api/staff/canned-replies", { method: "GET" }, staffCannedRepliesResponseSchema);
  return data as StaffCannedRepliesPayload;
}

async function readHealthReady(): Promise<HealthReadyPayload> {
  const response = await fetch("/api/health/ready", {
    method: "GET",
    credentials: "include"
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError("Unable to continue", response.status);
  }

  const successParsed = apiSuccessSchema(healthReadyResponseSchema).safeParse(payload);
  if (successParsed.success) {
    return successParsed.data.data;
  }

  const errorParsed = apiErrorSchema.safeParse(payload);
  if (errorParsed.success) {
    if (errorParsed.data.error.code === "HEALTH_NOT_READY") {
      const degradedDetailsSchema = z.object({
        checks: healthReadyResponseSchema.shape.checks,
        reasonCodes: z.array(z.string().min(1).max(80)),
        checkedAtEpochS: z.number().int().positive()
      });
      const detailsParsed = degradedDetailsSchema.safeParse(errorParsed.data.error.details ?? {});
      if (detailsParsed.success) {
        return {
          status: "degraded",
          checks: detailsParsed.data.checks,
          reasonCodes: detailsParsed.data.reasonCodes,
          checkedAtEpochS: detailsParsed.data.checkedAtEpochS
        };
      }
    }
    throw new ApiClientError(errorParsed.data.error.message, response.status, errorParsed.data.error.code);
  }

  throw new ApiClientError("Unable to continue", response.status);
}

async function readDiagnosticsSummary(): Promise<DiagnosticsSummaryPayload> {
  const data = await requestJson("/api/diagnostics/summary", { method: "GET" }, diagnosticsSummaryResponseSchema);
  return data as DiagnosticsSummaryPayload;
}

async function createStaffUploadIntent(
  caseId: string,
  input: { fileName: string; contentType: string; sizeBytes: number; visibility: "customer_visible"; idempotencyKey: string }
): Promise<UploadIntentPayload> {
  const parsed = uploadIntentRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiClientError("Invalid upload intent", 400, "INVALID_REQUEST");
  }

  const csrf = getStaffCsrfToken();
  if (!csrf) {
    throw new ApiClientError("Missing CSRF", 401, "UNAUTHORIZED");
  }

  const data = await requestJson(
    `/api/staff/cases/${encodeURIComponent(caseId)}/upload-intents`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf
      },
      body: JSON.stringify(parsed.data)
    },
    uploadIntentResponseSchema
  );

  return data as UploadIntentPayload;
}

async function createStaffAttachment(
  caseId: string,
  input: {
    intentId: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    visibility: "customer_visible";
    idempotencyKey: string;
    clientCreatedEpochMs: number;
  }
): Promise<AttachmentMutationPayload> {
  const parsed = attachmentPersistRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiClientError("Invalid attachment payload", 400, "INVALID_REQUEST");
  }

  const csrf = getStaffCsrfToken();
  if (!csrf) {
    throw new ApiClientError("Missing CSRF", 401, "UNAUTHORIZED");
  }

  const data = await requestJson(
    `/api/staff/cases/${encodeURIComponent(caseId)}/attachments`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf
      },
      body: JSON.stringify(parsed.data)
    },
    attachmentMutationResponseSchema
  );

  return data as AttachmentMutationPayload;
}

async function downloadStaffAttachmentContent(caseId: string, attachmentId: string, fallbackFileName: string): Promise<void> {
  const response = await fetch(
    `/api/staff/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(attachmentId)}/content`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  if (!response.ok) {
    await throwApiClientErrorFromResponse(response);
  }

  const blob = await response.blob();
  const fileName = filenameFromDisposition(response.headers.get("content-disposition")) ?? safeDownloadName(fallbackFileName);
  triggerBlobDownload(blob, fileName);
}

function useStaffSessionQuery() {
  return useQuery({
    queryKey: ["staff-session-me"],
    queryFn: readStaffSession,
    retry: false
  });
}

function StaffDashboardPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [previewCaseId, setPreviewCaseId] = useState<string | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [activeDept, setActiveDept] = useState<"fleet" | "shifts" | "inventory">("fleet");
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([]);

  const chatMutation = useMutation({
    mutationFn: (msg: string) => fetch("/api/staff/chat", {
      method: "POST",
      body: JSON.stringify({ department: activeDept, message: msg }),
      headers: { "Content-Type": "application/json" }
    }),
    onSuccess: (res: any) => setChatHistory([...chatHistory, { role: "user", content: chatMessage }, { role: "assistant", content: res.data.response }])
  });

  const [narrowPreviewLayout, setNarrowPreviewLayout] = useState(false);
  const previewTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const staffSession = useStaffSessionQuery();

  const { syncSettings } = useFleetStore();
  const { sync } = useSyncMesh("staff-sync-room", (p) => {
    if (syncSettings.ui && p.type === "filter_update") {
      setStatusFilter(p.value);
    }
  });

  useEffect(() => {
    if (syncSettings.ui) {
       sync({ type: "filter_update", value: statusFilter });
    }
  }, [statusFilter, syncSettings.ui]);

  const casesQuery = useQuery({
    queryKey: ["staff-case-list", statusFilter],
    enabled: staffSession.isSuccess,
    queryFn: () => readStaffCases(statusFilter)
  });

  const previewCaseQuery = useQuery({
    queryKey: ["staff-case-detail", previewCaseId],
    enabled: staffSession.isSuccess && typeof previewCaseId === "string" && previewCaseId.length > 0,
    queryFn: () => readStaffCaseDetail(previewCaseId ?? "")
  });

  if (staffSession.isLoading) {
    return (
      <PageShell title="Staff Dashboard">
        <p>Φόρτωση...</p>
      </PageShell>
    );
  }

  if (staffSession.isError) {
    return (
      <PageShell title="Staff Dashboard">
        <p>Μη εξουσιοδοτημένη πρόσβαση.</p>
        <Link to="/staff/login">Μετάβαση σε είσοδο</Link>
      </PageShell>
    );
  }

  const staffSessionData = staffSession.data;
  if (!staffSessionData) {
    return (
      <PageShell title="Staff Dashboard">
        <p>Μη εξουσιοδοτημένη πρόσβαση.</p>
        <Link to="/staff/login">Μετάβαση σε είσοδο</Link>
      </PageShell>
    );
  }

  const rows: StaffCaseListPayload["cases"] = casesQuery.data?.cases ?? [];

  useEffect(() => {
    const updateLayout = () => {
      setNarrowPreviewLayout(window.innerWidth < 1080);
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => {
      window.removeEventListener("resize", updateLayout);
    };
  }, []);

  useEffect(() => {
    if (!previewCaseId) {
      return;
    }
    if (!rows.some((row) => row.caseId === previewCaseId)) {
      setPreviewCaseId(null);
      const focusTargetCaseId = activeCaseId ?? rows[0]?.caseId ?? null;
      if (focusTargetCaseId) {
        window.setTimeout(() => {
          previewTriggerRefs.current[focusTargetCaseId]?.focus();
        }, 0);
      }
    }
  }, [activeCaseId, previewCaseId, rows]);

  useEffect(() => {
    if (rows.length === 0) {
      setActiveCaseId(null);
      return;
    }

    if (activeCaseId && rows.some((row) => row.caseId === activeCaseId)) {
      return;
    }

    const nextActiveCaseId = previewCaseId && rows.some((row) => row.caseId === previewCaseId) ? previewCaseId : rows[0].caseId;
    setActiveCaseId(nextActiveCaseId);
  }, [activeCaseId, previewCaseId, rows]);

  useEffect(() => {
    if (!previewCaseId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      const closingCaseId = previewCaseId;
      setPreviewCaseId(null);
      window.setTimeout(() => {
        previewTriggerRefs.current[closingCaseId]?.focus();
      <Card title="Διαχείριση Αποθεμάτων (Inventory)">
        <div style={{ display: "grid", gap: "0.5rem" }}>
           <p style={{ margin: 0 }}>Soap (Σαπούνι): <strong>42 Λίτρα</strong> (Κάτω από το όριο!)</p>
           <p style={{ margin: 0 }}>Wax (Κερί): <strong>120 Λίτρα</strong></p>
           <button style={{ padding: "0.4rem", background: "#f59e0b", border: "none", color: "#fff", borderRadius: "0.3rem" }}>
             ⚠️ Παραγγελία Προμηθειών
           </button>
        </div>
      </Card>

      }, 0);
    };

      <Card title="FleetOps Spreadsheet Dashboard (Google Sheets Scale)">
        <div style={{ overflowX: "auto", border: "1px solid #ccc", borderRadius: "0.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>ID</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Plate (Πινακίδα)</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Model (Μοντέλο)</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Mileage (Χλμ)</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Status</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Last Wash</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Location</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{i}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>ABC-{1000 + i}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>Vehicle Model {i}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>{10000 + i * 500}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>Ready</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>2026-03-31</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>Station 00{i}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="OmniChat AI - Multi-Department Command Center">
        <div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "0.5rem", minHeight: "200px", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {["fleet", "shifts", "inventory"].map((d) => (
              <button key={d} onClick={() => setActiveDept(d as any)} style={{ padding: "0.3rem 0.6rem", background: activeDept === d ? "#2563eb" : "#e5e7eb", color: activeDept === d ? "#fff" : "#000", border: "none", borderRadius: "0.3rem" }}>
                {d.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", border: "1px solid #eee", padding: "0.5rem", maxHeight: "150px" }}>
             {chatHistory.map((c, i) => (
               <p key={i} style={{ margin: "0.3rem 0", color: c.role === "assistant" ? "#2563eb" : "#000" }}>
                 <strong>{c.role === "assistant" ? "Gemini: " : "Εσείς: "}</strong>{c.content}
               </p>
             ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} style={{ flex: 1, padding: "0.5rem", borderRadius: "0.3rem", border: "1px solid #ccc" }} placeholder="Πείτε στο Gemini τι να κάνει..." />
            <button onClick={() => chatMutation.mutate(chatMessage)} style={{ padding: "0.5rem 1rem", background: "#111827", color: "#fff", border: "none", borderRadius: "0.3rem" }}>
              Αποστολή
            </button>
          </div>
        </div>
      </Card>

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewCaseId]);

  return (
    <PageShell title="Staff Dashboard">
      <Card title="Ταυτότητα συνεδρίας">
        <p style={{ margin: 0 }}>{staffSessionData.staffSession.displayName}</p>
        <p style={{ margin: 0 }}>{staffSessionData.staffSession.email}</p>
        <p style={{ margin: 0 }}>Ρόλοι: {staffSessionData.staffSession.roleKeys.join(", ") || "-"}</p>
      </Card>

      <Card title="Ενεργές υποθέσεις">
        <label style={{ display: "grid", gap: "0.3rem", maxWidth: "280px", marginBottom: "0.7rem" }}>
          Φίλτρο κατάστασης
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">Όλες</option>
            <option value="new">new</option>
            <option value="waiting_customer">waiting_customer</option>
            <option value="under_review">under_review</option>
            <option value="escalated">escalated</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
            <option value="disputed">disputed</option>
          </select>
        </label>

        {casesQuery.isLoading ? <p>Φόρτωση λίστας...</p> : null}
        {!casesQuery.isLoading && rows.length === 0 ? <p>Δεν υπάρχουν υποθέσεις.</p> : null}

        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: previewCaseId && !narrowPreviewLayout ? "minmax(0, 1fr) minmax(320px, 430px)" : "minmax(0, 1fr)"
          }}
        >
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {rows.map((row) => (
              <article
                key={row.caseId}
                onMouseEnter={() => setActiveCaseId(row.caseId)}
                style={{
                  border: row.caseId === previewCaseId ? "2px solid #1f2937" : row.caseId === activeCaseId ? "2px solid #9ca3af" : "1px solid #e5e7eb",
                  borderRadius: "0.4rem",
                  padding: "0.6rem",
                  background: row.caseId === activeCaseId ? "#f9fafb" : "#fff"
                }}
              >
                <button
                  ref={(element) => {
                    previewTriggerRefs.current[row.caseId] = element;
                  }}
                  type="button"
                  onClick={() => {
                    setActiveCaseId(row.caseId);
                    setPreviewCaseId(row.caseId);
                  }}
                  style={{
                    margin: 0,
                    fontWeight: 700,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    color: "#111827",
                    textAlign: "left"
                  }}
                >
                  {row.reservation.reservationNumber}
                </button>
                <p style={{ margin: 0 }}>Κατάσταση: {row.caseStatus}</p>
                <p style={{ margin: 0, color: "#374151" }}>
                  Τελευταία ενημέρωση:{" "}
                  {row.updatedEpochS ? new Date(row.updatedEpochS * 1000).toLocaleString("el-GR") : "-"}
                </p>
                <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCaseId(row.caseId);
                      setPreviewCaseId((current) => (current === row.caseId ? null : row.caseId));
                    }}
                  >
                    {previewCaseId === row.caseId ? "Κλείσιμο προεπισκόπησης" : "Προεπισκόπηση"}
                  </button>
                  <Link to={`/staff/cases/${encodeURIComponent(row.caseId)}`}>Άνοιγμα υπόθεσης</Link>
                </div>
              </article>
            ))}
          </div>

          {previewCaseId ? (
            <aside
              style={{
                border: "1px solid #d1d5db",
                borderRadius: "0.45rem",
                padding: "0.75rem",
                background: "#f9fafb",
                height: "fit-content"
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Προεπισκόπηση υπόθεσης</h3>
              {previewCaseQuery.isLoading ? <p>Φόρτωση προεπισκόπησης...</p> : null}
              {previewCaseQuery.isError ? <p>Δεν ήταν δυνατή η προεπισκόπηση.</p> : null}
              {previewCaseQuery.data ? (
                <>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Κράτηση: {previewCaseQuery.data.caseDetail.reservation.reservationNumber}
                  </p>
                  <p style={{ margin: 0 }}>Σταθμός: {previewCaseQuery.data.caseDetail.reservation.stationCode}</p>
                  <p style={{ margin: 0 }}>Κατάσταση: {previewCaseQuery.data.caseDetail.room.caseStatus}</p>
                  <p style={{ margin: 0 }}>
                    Τελευταίο μήνυμα:{" "}
                    {previewCaseQuery.data.caseDetail.room.lastMessageEpochS
                      ? new Date(previewCaseQuery.data.caseDetail.room.lastMessageEpochS * 1000).toLocaleString("el-GR")
                      : "-"}
                  </p>
                  <p style={{ margin: 0 }}>
                    Μηνύματα: {previewCaseQuery.data.caseDetail.messages.length} • Συνημμένα:{" "}
                    {previewCaseQuery.data.caseDetail.messages.filter((message) => message.attachment !== null).length}
                  </p>

                  <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.45rem" }}>
                    <strong>Πρόσφατα μηνύματα</strong>
                    {previewCaseQuery.data.caseDetail.messages.slice(0, 5).map((message) => (
                      <article
                        key={message.id}
                        style={{ border: "1px solid #e5e7eb", borderRadius: "0.35rem", padding: "0.45rem", background: "#fff" }}
                      >
                        <p style={{ margin: 0, fontWeight: 600 }}>
                          {message.senderKind === "customer" ? "Πελάτης" : message.senderKind === "staff" ? "Προσωπικό" : "Σύστημα"}
                        </p>
                        <p style={{ margin: "0.2rem 0" }}>{message.body ?? "Συνημμένο/συστημικό μήνυμα"}</p>
                        <small>{new Date(message.createdEpochS * 1000).toLocaleString("el-GR")}</small>
                      </article>
                    ))}
                    {previewCaseQuery.data.caseDetail.messages.length === 0 ? <p style={{ margin: 0 }}>Δεν υπάρχουν μηνύματα.</p> : null}
                  </div>

                  <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                    <Link to={`/staff/cases/${encodeURIComponent(previewCaseId)}`}>Άνοιγμα υπόθεσης</Link>
                    <button
                      type="button"
                      onClick={() => {
                        const closingCaseId = previewCaseId;
                        setPreviewCaseId(null);
                        window.setTimeout(() => {
                          previewTriggerRefs.current[closingCaseId]?.focus();
                        }, 0);
                      }}
                    >
                      Κλείσιμο προεπισκόπησης
                    </button>
                  </div>
                </>
              ) : null}
            </aside>
          ) : null}
        </div>
      </Card>
    </PageShell>
  );
}

function mapStatusLabel(status: CaseStatus): string {
  const labels: Record<CaseStatus, string> = {
    new: "new",
    waiting_customer: "waiting_customer",
    under_review: "under_review",
    escalated: "escalated",
    resolved: "resolved",
    closed: "closed",
    disputed: "disputed"
  };

  return labels[status];
}

function StaffCaseDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const caseId = params.caseId ?? "";
  const caseIdValid = OPAQUE_ID_RE.test(caseId);

  const [wsState, setWsState] = useState<WsUiState>("connecting");
  const [messageDraft, setMessageDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedReplyId, setSelectedReplyId] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selectedStaffAttachment, setSelectedStaffAttachment] = useState<File | null>(null);
  const [staffAttachmentError, setStaffAttachmentError] = useState<string | null>(null);
  const [staffAttachmentOpenError, setStaffAttachmentOpenError] = useState<string | null>(null);
  const [openingStaffAttachmentId, setOpeningStaffAttachmentId] = useState<string | null>(null);

  const staffSession = useStaffSessionQuery();
  const { syncSettings } = useFleetStore();
  const { sync, senderId } = useSyncMesh(caseId, (p) => {
    if (syncSettings.chat && p.type === "message_draft_update") {
      setMessageDraft(p.value);
    }
  });

  useEffect(() => {
    if (syncSettings.chat) {
       sync({ type: "message_draft_update", value: messageDraft });
    }
  }, [messageDraft, syncSettings.chat]);


  const detailQuery = useQuery({
    queryKey: ["staff-case-detail", caseId],
    enabled: caseIdValid && staffSession.isSuccess,
    queryFn: () => readStaffCaseDetail(caseId)
  });

  const notesQuery = useQuery({
    queryKey: ["staff-case-notes", caseId],
    enabled: detailQuery.isSuccess,
    queryFn: () => readStaffNotes(caseId)
  });

  const timelineQuery = useQuery({
    queryKey: ["staff-case-timeline", caseId],
    enabled: detailQuery.isSuccess,
    queryFn: () => readStaffTimeline(caseId)
  });

  const cannedRepliesQuery = useQuery({
    queryKey: ["staff-canned-replies"],
    enabled: staffSession.isSuccess,
    queryFn: readStaffCannedReplies
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (bodyText: string) => {
      const parsed = staffSendMessageBodySchema.safeParse({
        body: bodyText,
        clientCreatedEpochMs: Date.now(),
        idempotencyKey: newIdempotencyKey("staff_msg")
      });

      if (!parsed.success) {
        throw new ApiClientError("Invalid message", 400, "INVALID_REQUEST");
      }

      const csrf = getStaffCsrfToken();
      if (!csrf) {
        throw new ApiClientError("Missing CSRF", 401, "UNAUTHORIZED");
      }

      return requestJson(
        `/api/staff/cases/${encodeURIComponent(caseId)}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf
          },
          body: JSON.stringify(parsed.data)
        },
        z.object({ message: chatMessageSchema })
      );
    },
    onMutate: () => {
      setMessageError(null);
    },
    onSuccess: (data) => {
      setMessageDraft("");
      queryClient.setQueryData<StaffCaseDetailPayload | undefined>(["staff-case-detail", caseId], (current) => {
        if (!current) {
          return current;
        }

        const exists = current.caseDetail.messages.some((message) => message.id === data.message.id);
        if (exists) {
          return current;
        }

        return {
          ...current,
          caseDetail: {
            ...current.caseDetail,
            messages: [data.message, ...current.caseDetail.messages]
          }
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["staff-case-timeline", caseId] });
    },
    onError: (error) => {
      setMessageError(greekSafeError(error));
    }
  });

  const createNoteMutation = useMutation({
    mutationFn: async (bodyText: string) => {
      const parsed = staffCreateNoteBodySchema.safeParse({
        body: bodyText,
        clientCreatedEpochMs: Date.now(),
        idempotencyKey: newIdempotencyKey("staff_note")
      });

      if (!parsed.success) {
        throw new ApiClientError("Invalid note", 400, "INVALID_REQUEST");
      }

      const csrf = getStaffCsrfToken();
      if (!csrf) {
        throw new ApiClientError("Missing CSRF", 401, "UNAUTHORIZED");
      }

      return requestJson(
        `/api/staff/cases/${encodeURIComponent(caseId)}/notes`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf
          },
          body: JSON.stringify(parsed.data)
        },
        staffNoteMutationResponseSchema
      );
    },
    onMutate: () => {
      setNoteError(null);
    },
    onSuccess: (data) => {
      setNoteDraft("");
      queryClient.setQueryData<StaffCaseNoteListPayload | undefined>(["staff-case-notes", caseId], (current) => {
        if (!current) {
          return current;
        }

        const exists = current.notes.some((note) => note.noteId === data.note.noteId);
        if (exists) {
          return current;
        }

        return {
          ...current,
          notes: [data.note, ...current.notes]
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["staff-case-timeline", caseId] });
    },
    onError: (error) => {
      setNoteError(greekSafeError(error));
    }
  });

  const statusMutation = useMutation({
    mutationFn: async (nextStatus: string) => {
      const parsed = staffUpdateCaseStatusBodySchema.safeParse({
        toStatus: nextStatus,
        idempotencyKey: newIdempotencyKey("staff_status"),
        reason: "manual_update"
      });

      if (!parsed.success) {
        throw new ApiClientError("Invalid status update", 400, "INVALID_REQUEST");
      }

      const csrf = getStaffCsrfToken();
      if (!csrf) {
        throw new ApiClientError("Missing CSRF", 401, "UNAUTHORIZED");
      }

      return requestJson(
        `/api/staff/cases/${encodeURIComponent(caseId)}/status`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf
          },
          body: JSON.stringify(parsed.data)
        },
        staffStatusMutationResponseSchema
      );
    },
    onMutate: () => {
      setStatusError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-case-detail", caseId] });
      void queryClient.invalidateQueries({ queryKey: ["staff-case-timeline", caseId] });
    },
    onError: (error) => {
      setStatusError(greekSafeError(error));
    }
  });

  const staffAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const idempotencyKey = newIdempotencyKey("staff_att");
      const intent = await createStaffUploadIntent(caseId, {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        visibility: "customer_visible",
        idempotencyKey
      });

      return createStaffAttachment(caseId, {
        intentId: intent.intent.intentId,
        objectKey: intent.intent.objectKey,
        fileName: intent.intent.fileName,
        contentType: intent.intent.contentType,
        sizeBytes: intent.intent.sizeBytes,
        visibility: "customer_visible",
        idempotencyKey,
        clientCreatedEpochMs: Date.now()
      });
    },
    onMutate: () => {
      setStaffAttachmentError(null);
    },
    onSuccess: () => {
      setSelectedStaffAttachment(null);
      void queryClient.invalidateQueries({ queryKey: ["staff-case-detail", caseId] });
      void queryClient.invalidateQueries({ queryKey: ["staff-case-timeline", caseId] });
    },
    onError: (error) => {
      setStaffAttachmentError(greekSafeError(error));
    }
  });

  const staffAttachmentReadMutation = useMutation({
    mutationFn: (input: { attachmentId: string; fileName: string }) =>
      downloadStaffAttachmentContent(caseId, input.attachmentId, input.fileName),
    onMutate: (input) => {
      setStaffAttachmentOpenError(null);
      setOpeningStaffAttachmentId(input.attachmentId);
    },
    onSuccess: () => {
      setOpeningStaffAttachmentId(null);
    },
    onError: (error) => {
      setStaffAttachmentOpenError(greekSafeError(error));
      setOpeningStaffAttachmentId(null);
    }
  });

  useEffect(() => {
    if (!caseIdValid || !detailQuery.data) {
      return;
    }

    const allowed = detailQuery.data.caseDetail.allowedTransitions;
    if (allowed.length === 0) {
      setSelectedStatus("");
      return;
    }

    if (!allowed.includes(selectedStatus as CaseStatus)) {
      setSelectedStatus(allowed[0]);
    }
  }, [caseIdValid, detailQuery.data, selectedStatus]);

  useEffect(() => {
    if (!caseIdValid) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      setWsState("connecting");
      socket = new WebSocket(wsUrl(`/api/staff/cases/${encodeURIComponent(caseId)}/connect`));

      socket.onopen = () => {
        setWsState("connected");
      };

      socket.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }

        const parsed = liveEventSchema.safeParse(payload);
        if (!parsed.success) {
          return;
        }

        const liveEvent: LiveEvent = parsed.data;

        if (liveEvent.type === "hello") {
          setWsState("connected");
          return;
        }

        if (liveEvent.type === "message_persisted") {
          void queryClient.invalidateQueries({ queryKey: ["staff-case-detail", caseId] });
          void queryClient.invalidateQueries({ queryKey: ["staff-case-timeline", caseId] });
          return;
        }

        if (liveEvent.type === "note_created") {
          void queryClient.invalidateQueries({ queryKey: ["staff-case-notes", caseId] });
          void queryClient.invalidateQueries({ queryKey: ["staff-case-timeline", caseId] });
          return;
        if (liveEvent.type === "tab_sync") {
          if (liveEvent.senderId !== senderId) {
            onSync(liveEvent.payload);
          }
          return;
        }

        }

        if (liveEvent.type === "case_status_changed") {
          void queryClient.invalidateQueries({ queryKey: ["staff-case-detail", caseId] });
          void queryClient.invalidateQueries({ queryKey: ["staff-case-timeline", caseId] });
        }
      };

      socket.onerror = () => {
        setWsState("failed");
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }
        setWsState("disconnected");
        reconnectTimer = window.setTimeout(connect, 2_000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [caseId, caseIdValid, queryClient]);

  const selectedReply = useMemo(
    () => cannedRepliesQuery.data?.replies.find((reply) => reply.cannedReplyId === selectedReplyId) ?? null,
    [cannedRepliesQuery.data?.replies, selectedReplyId]
  );

  if (!caseIdValid) {
    return (
      <PageShell title="Λεπτομέρειες Υπόθεσης">
        <p>Μη έγκυρο αναγνωριστικό υπόθεσης.</p>
      </PageShell>
    );
  }

  if (staffSession.isLoading || detailQuery.isLoading) {
    return (
      <PageShell title="Λεπτομέρειες Υπόθεσης">
        <p>Φόρτωση...</p>
      </PageShell>
    );
  }

  if (staffSession.isError || detailQuery.isError) {
    return (
      <PageShell title="Λεπτομέρειες Υπόθεσης">
        <p>Μη εξουσιοδοτημένη πρόσβαση ή μη διαθέσιμη υπόθεση.</p>
        <Link to="/staff/login">Μετάβαση σε είσοδο</Link>
      </PageShell>
    );
  }

  const detailData = detailQuery.data;
  if (!detailData) {
    return (
      <PageShell title="Λεπτομέρειες Υπόθεσης">
        <p>Δεν ήταν δυνατή η φόρτωση της υπόθεσης.</p>
      </PageShell>
    );
  }

  const detail = detailData.caseDetail;
  const allowedTransitions = detail.allowedTransitions;
  const notes = notesQuery.data?.notes ?? [];
  const timeline = timelineQuery.data?.timeline ?? [];

  return (
    <PageShell title="Λεπτομέρειες Υπόθεσης">
      <Card title="Στοιχεία υπόθεσης">
        <p style={{ margin: 0 }}>Σύνδεση live: {statusBadge(wsState)}</p>
        <p style={{ margin: 0 }}>Κράτηση: {detail.reservation.reservationNumber}</p>
        <p style={{ margin: 0 }}>Κατάσταση: {detail.room.caseStatus}</p>
      </Card>

      <Card title="Σύνοψη κράτησης">
        <p style={{ margin: 0 }}>Σταθμός: {detail.reservation.stationCode}</p>
        <p style={{ margin: 0 }}>Ημέρα παραλαβής: {detail.reservation.pickupDateLocal}</p>
      </Card>

      <Card title="Δυνατότητα μεταφόρτωσης">
      <Card title="Ενέργειες">
        <button 
          onClick={() => {
            fetch(`/api/staff/reservations/${detail.reservation.id}/export`)
              .then(res => res.json())
              .then(data => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `evidence_vault_${detail.reservation.reservationNumber}.json`;
                a.click();
              });
          }}
          style={{ padding: "0.5rem 1rem", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "0.4rem", cursor: "pointer" }}
        >
          📦 Εξαγωγή Evidence Vault (JSON)
        </button>
      </Card>

        <p style={{ margin: 0 }}>Κατάσταση: {detail.uploadCapability.status}</p>
        <p style={{ margin: 0 }}>
          Χρήση: {detail.uploadCapability.usedFilesCount}/{detail.uploadCapability.maxFiles}
        </p>
      </Card>

      <Card title="Μηνύματα προς πελάτη">
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.8rem", minHeight: "200px" }}>
          {detail.messages.length === 0 ? <p>Δεν υπάρχουν μηνύματα.</p> : null}
          {detail.messages.map((message: ChatMessageView) => (
            <article key={message.id} style={{ marginBottom: "0.6rem" }}>
              <strong>{message.senderKind === "staff" ? "Προσωπικό" : message.senderKind === "customer" ? "Πελάτης" : "Σύστημα"}</strong>
              {message.messageKind === "attachment" && message.attachment ? (
                <div style={{ margin: "0.2rem 0" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Συνημμένο: {message.attachment.fileName}</p>
                  <small>
                    {message.attachment.contentType} • {Math.max(1, Math.round(message.attachment.sizeBytes / 1024))} KB
                  </small>
                  <div style={{ marginTop: "0.35rem" }}>
                    <button
                      type="button"
                      onClick={() =>
                        staffAttachmentReadMutation.mutate({
                          attachmentId: message.attachment!.attachmentId,
                          fileName: message.attachment!.fileName
                        })
                      }
                      disabled={
                        staffAttachmentReadMutation.isPending &&
                        openingStaffAttachmentId === message.attachment.attachmentId
                      }
                    >
                      {staffAttachmentReadMutation.isPending &&
                      openingStaffAttachmentId === message.attachment.attachmentId
                        ? "Άνοιγμα..."
                        : "Άνοιγμα / λήψη"}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: "0.2rem 0" }}>{message.body ?? ""}</p>
              )}
              <small>{new Date(message.createdEpochS * 1000).toLocaleString("el-GR")}</small>
            </article>
          ))}
        </div>
        {staffAttachmentOpenError ? <p style={{ color: "#b91c1c", marginTop: "0.5rem" }}>{staffAttachmentOpenError}</p> : null}

        <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.55rem" }}>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            <label style={{ fontWeight: 600 }}>Συνημμένο προς πελάτη</label>
            <input
              type="file"
              onChange={(event) => setSelectedStaffAttachment(event.target.files?.[0] ?? null)}
              aria-label="Επιλογή συνημμένου προσωπικού"
            />
            <button
              type="button"
              disabled={!selectedStaffAttachment || staffAttachmentMutation.isPending}
              onClick={() => {
                if (selectedStaffAttachment) {
                  staffAttachmentMutation.mutate(selectedStaffAttachment);
                }
              }}
            >
              {staffAttachmentMutation.isPending ? "Μεταφόρτωση..." : "Αποστολή συνημμένου"}
            </button>
            {staffAttachmentError ? <p style={{ color: "#b91c1c", margin: 0 }}>{staffAttachmentError}</p> : null}
          </div>

          <textarea
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
            placeholder="Πληκτρολογήστε μήνυμα προς τον πελάτη..."
            rows={3}
            style={{ padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #9ca3af" }}
          />

          <div style={{ display: "grid", gap: "0.45rem", gridTemplateColumns: "1fr auto" }}>
            <select
              value={selectedReplyId}
              onChange={(event) => setSelectedReplyId(event.target.value)}
              aria-label="Επιλογή προεπιλεγμένης απάντησης"
            >
              <option value="">Εφαρμογή προεπιλεγμένης απάντησης</option>
              {(cannedRepliesQuery.data?.replies ?? []).map((reply) => (
                <option key={reply.cannedReplyId} value={reply.cannedReplyId}>
                  {reply.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedReply}
              onClick={() => {
                if (!selectedReply) {
                  return;
                }
                setMessageDraft((current) => (current.trim().length > 0 ? `${current}\n\n${selectedReply.body}` : selectedReply.body));
              }}
            >
              Εισαγωγή
            </button>
          </div>

          <button
            type="button"
            onClick={() => sendMessageMutation.mutate(messageDraft)}
            disabled={sendMessageMutation.isPending || messageDraft.trim().length === 0}
            style={{
              padding: "0.7rem 1rem",
              borderRadius: "0.45rem",
              border: "none",
              color: "#fff",
              background: "#111827",
              fontWeight: 600
            }}
          >
            {sendMessageMutation.isPending ? "Αποστολή..." : "Αποστολή μηνύματος"}
          </button>

          {messageError ? <p style={{ color: "#b91c1c", margin: 0 }}>{messageError}</p> : null}
        </div>
      </Card>

      <Card title="Εσωτερικές σημειώσεις προσωπικού">
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.8rem" }}>
          {notesQuery.isLoading ? <p>Φόρτωση σημειώσεων...</p> : null}
          {!notesQuery.isLoading && notes.length === 0 ? <p>Δεν υπάρχουν σημειώσεις.</p> : null}
          {notes.map((note) => (
            <article key={note.noteId} style={{ marginBottom: "0.6rem" }}>
              <strong>{note.createdBy?.displayName ?? "Προσωπικό"}</strong>
              <p style={{ margin: "0.2rem 0" }}>{note.body}</p>
            </article>
          ))}
        </div>

        <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.55rem" }}>
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Νέα εσωτερική σημείωση..."
            rows={3}
            style={{ padding: "0.65rem", borderRadius: "0.4rem", border: "1px solid #9ca3af" }}
          />
          <button
            type="button"
            onClick={() => createNoteMutation.mutate(noteDraft)}
            disabled={createNoteMutation.isPending || noteDraft.trim().length === 0}
            style={{ padding: "0.7rem 1rem", borderRadius: "0.45rem", fontWeight: 600 }}
          >
            {createNoteMutation.isPending ? "Αποθήκευση..." : "Αποθήκευση σημείωσης"}
          </button>
          {noteError ? <p style={{ color: "#b91c1c", margin: 0 }}>{noteError}</p> : null}
        </div>
      </Card>

      <Card title="Ροή κατάστασης υπόθεσης">
        <p style={{ margin: "0 0 0.45rem 0" }}>Τρέχουσα: {mapStatusLabel(detail.room.caseStatus)}</p>
        <div style={{ display: "grid", gap: "0.55rem", gridTemplateColumns: "1fr auto" }}>
          <select
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            disabled={allowedTransitions.length === 0}
          >
            {allowedTransitions.length === 0 ? <option value="">Δεν υπάρχουν διαθέσιμες μεταβάσεις</option> : null}
            {allowedTransitions.map((transition: CaseStatus) => (
              <option key={transition} value={transition}>
                {mapStatusLabel(transition)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={allowedTransitions.length === 0 || statusMutation.isPending || selectedStatus.length === 0}
            onClick={() => statusMutation.mutate(selectedStatus)}
          >
            {statusMutation.isPending ? "Αποθήκευση..." : "Αποθήκευση κατάστασης"}
          </button>
        </div>
        {statusError ? <p style={{ color: "#b91c1c", margin: "0.5rem 0 0 0" }}>{statusError}</p> : null}
      </Card>

      <Card title="Ενιαία χρονογραμμή υπόθεσης">
        {timelineQuery.isLoading ? <p>Φόρτωση χρονογραμμής...</p> : null}
        {!timelineQuery.isLoading && timeline.length === 0 ? <p>Δεν υπάρχουν συμβάντα.</p> : null}
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {timeline.map((event: StaffTimelineEvent) => (
            <article key={event.eventId} style={{ border: "1px solid #e5e7eb", borderRadius: "0.35rem", padding: "0.5rem" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {event.eventType === "message"
                  ? "Μήνυμα"
                  : event.eventType === "note"
                    ? "Εσωτερική σημείωση"
                    : "Αλλαγή κατάστασης"}
              </p>
              <p style={{ margin: "0.2rem 0" }}>{event.body ?? event.summary}</p>
              <small>
                {event.actor.displayName ?? "Σύστημα"} • {new Date(event.createdEpochS * 1000).toLocaleString("el-GR")}
              </small>
            </article>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}

function DiagnosticsPage() {
  const readinessQuery = useQuery({
    queryKey: ["health-ready"],
    queryFn: readHealthReady,
    retry: false
  });

  const diagnosticsQuery = useQuery({
    queryKey: ["diagnostics-summary"],
    queryFn: readDiagnosticsSummary,
    retry: false
  });

  const readiness = readinessQuery.data;
  const diagnostics = diagnosticsQuery.data;

  return (
    <PageShell title="Diagnostics">
      <Card title="Readiness">
        {readinessQuery.isLoading ? <p>Φόρτωση readiness...</p> : null}
        {readinessQuery.isError ? <p>Μη διαθέσιμο readiness.</p> : null}
        {readiness ? (
          <>
            <p style={{ margin: 0 }}>Κατάσταση: {readiness.status}</p>
            <p style={{ margin: 0 }}>
              Έλεγχοι: D1={readiness.checks.d1}, R2={readiness.checks.r2}, Queues={readiness.checks.queues}
            </p>
            <p style={{ margin: 0 }}>Reason codes: {readiness.reasonCodes.join(", ") || "-"}</p>
          </>
        ) : null}
      </Card>

      <Card title="Diagnostics Summary">
        {diagnosticsQuery.isLoading ? <p>Φόρτωση diagnostics...</p> : null}
        {diagnosticsQuery.isError ? <p>Μη διαθέσιμο diagnostics.</p> : null}
        {diagnostics ? (
          <div style={{ display: "grid", gap: "0.25rem" }}>
            <p style={{ margin: 0 }}>Ανοιχτά alerts: {diagnostics.openAlerts}</p>
            <p style={{ margin: 0 }}>Critical alerts: {diagnostics.criticalAlerts}</p>
            <p style={{ margin: 0 }}>DLQ open items: {diagnostics.dlqOpenItems}</p>
            <p style={{ margin: 0 }}>Open cases: {diagnostics.openCases}</p>
            <p style={{ margin: 0 }}>Active customer sessions: {diagnostics.activeCustomerSessions}</p>
            <p style={{ margin: 0 }}>Active staff sessions: {diagnostics.activeStaffSessions}</p>
            <p style={{ margin: 0 }}>Pending attachment events: {diagnostics.pendingAttachmentEvents}</p>
            <p style={{ margin: 0 }}>
              Generated: {new Date(diagnostics.generatedAtEpochS * 1000).toLocaleString("el-GR")}
            </p>
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}

function NotFoundPage() {
  return (
    <PageShell title="404">
      <p>Η σελίδα δεν βρέθηκε.</p>
      <Link to="/">Επιστροφή</Link>
    </PageShell>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "reservation", element: <ReservationEntryPage /> },
      { path: "c/:roomToken", element: <CustomerChatPage /> },
      { path: "staff/login", element: <StaffLoginPage /> },
      { path: "staff", element: <StaffDashboardPage /> },
      { path: "staff/scheduling", element: <SchedulingPage /> },
      { path: "staff/fleet", element: <FleetPage /> },
      { path: "staff/washer", element: <WasherWorkspacePage /> },
      { path: "staff/cases/:caseId", element: <StaffCaseDetailPage /> },
      { path: "staff/diagnostics", element: <DiagnosticsPage /> },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);


function CustomerQRWelcomePage() {
  const { stationId } = useParams();
  const { stationId } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState<any>(null);
  
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        console.log("Location detected: ", pos.coords.latitude, pos.coords.longitude);
      });
    }
  }, []);

    <div className='p-8'>
      <h1 className='text-2xl font-bold'>Καλώς ήρθατε στο FleetOps</h1>
      <p className='mt-2'>Σταθμός: {stationId}</p>
      <button 
        onClick={() => navigate('/reservation')} 
        className='mt-4 bg-blue-600 text-white px-4 py-2 rounded'
      >
        Συνέχεια με Αριθμό Κράτησης
      </button>
    </div>
  );
}

function StaffShiftsPage() {
  const [clockInStatus, setClockInStatus] = useState<"idle" | "active">("idle");
  const [clockInStatus, setClockInStatus] = useState<"idle" | "active">("idle");
  const [activeTab, setActiveTab] = useState<"grid" | "chat">("grid");
  const [shiftData, setShiftData] = useState<any[]>([
    { staff: "John Doe", mon: "08-16", tue: "08-16", wed: "08-16", thu: "08-16", fri: "08-16", sat: "OFF", sun: "OFF" },
    { staff: "Jane Smith", mon: "16-24", tue: "16-24", wed: "16-24", thu: "16-24", fri: "16-24", sat: "OFF", sun: "OFF" }
  ]);
  
  const clockInMutation = useMutation({
    mutationFn: () => fetch("/api/staff/shifts/clock-in", { method: "POST" }),
    onSuccess: () => setClockInStatus("active")
  });

  return (
    <PageShell title="Workforce (Shifts) - Supervisor OS">
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <button onClick={() => setActiveTab("grid")} style={{ padding: "0.5rem 1rem", background: activeTab === "grid" ? "#2563eb" : "#e5e7eb", border: "none", color: activeTab === "grid" ? "#fff" : "#000", borderRadius: "0.4rem" }}>
           📅 Grid View (Google Sheets Scale)
        </button>
        <button onClick={() => setActiveTab("chat")} style={{ padding: "0.5rem 1rem", background: activeTab === "chat" ? "#2563eb" : "#e5e7eb", border: "none", color: activeTab === "chat" ? "#fff" : "#000", borderRadius: "0.4rem" }}>
           🤖 Supervisor AI Chat
        </button>
      </div>

      {activeTab === "grid" ? (
        <Card title="Shift Spreadsheet (Editable & Scalable)">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Staff</th>
                  <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Mon</th>
                  <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Tue</th>
                  <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Wed</th>
                  <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Thu</th>
                  <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Fri</th>
                </tr>
              </thead>
              <tbody>
                {shiftData.map((s, i) => (
                  <tr key={i}>
                    <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>{s.staff}</td>
                    <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>{s.mon}</td>
                    <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>{s.tue}</td>
                    <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>{s.wed}</td>
                    <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>{s.thu}</td>
                    <td style={{ border: "1px solid #ccc", padding: "0.5rem" }} contentEditable>{s.fri}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card title="Supervisor AI Command Center">
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
             <p>Πείτε στο Gemini να επεξεργαστεί τις βάρδιες:</p>
             <div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "0.5rem", minHeight: "100px" }}>
                <strong>Gemini:</strong> Έτοιμος για οποιαδήποτε επεξεργασία ή θόλωση (blur) βαρδιών.
             </div>
             <input style={{ padding: "0.5rem", borderRadius: "0.3rem", border: "1px solid #ccc" }} placeholder="π.χ. "Θόλωσε την Τρίτη για τον John Doe"" />
             <button style={{ padding: "0.5rem", background: "#111827", color: "#fff", border: "none", borderRadius: "0.3rem" }}>
               Εκτέλεση Αλλαγής
             </button>
          </div>
        </Card>
      )}

      <Card title="Κατάσταση Βάρδιας">

    onSuccess: () => setClockInStatus("active")
  });

  return (
    <PageShell title="Βάρδιες & Προσωπικό">
      <Card title="Κατάσταση Βάρδιας">
        <p>Τρέχουσα κατάσταση: <strong>{clockInStatus === "active" ? "Ενεργή" : "Ανενεργή"}</strong></p>
        <button 
          onClick={() => clockInMutation.mutate()} 
          disabled={clockInStatus === "active" || clockInMutation.isPending}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          {clockInStatus === "active" ? "Έχετε συνδεθεί" : "Έναρξη Βάρδιας (Clock-in)"}
        </button>
      </Card>
    </PageShell>
  );
}

function StaffWashRegistrationPage() {
  const [identifier, setIdentifier] = useState("");
  const [aiAlert, setAiAlert] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [washHistory, setWashHistory] = useState<any[]>([]);
  const [editRequest, setEditRequest] = useState<any>(null);
  
  const washMutation = useMutation({
    mutationFn: (id: string) => fetch("/api/staff/washes/register", {
      method: "POST",
      body: JSON.stringify({ identifier: id, stationId: "STATION_001" }),
      headers: { "Content-Type": "application/json" }
    }),
    onSuccess: (res: any) => {
      setRegStatus("Επιτυχής καταχώρηση!");
      if (res.data?.aiFlag) setAiAlert("⚠️ ΠΡΟΣΟΧΗ: Το AI εντόπισε πιθανή ζημιά στο όχημα!");
      setIdentifier("");
      setWashHistory([{ id: res.data.washId, identifier: identifier, status: "completed", timestamp: new Date().toISOString() }, ...washHistory]);
    }
  });

  const editMutation = useMutation({
    mutationFn: (data: any) => fetch("/api/staff/washes/edit-request", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" }
    }),
    onSuccess: () => alert("Το αίτημα επεξεργασίας στάλθηκε για έγκριση στο προσωπικό.")
  });

  const [regStatus, setRegStatus] = useState<string | null>(null);

  const washMutation = useMutation({
    mutationFn: (id: string) => fetch("/api/staff/washes/register", {
      method: "POST",
      body: JSON.stringify({ identifier: id, stationId: "STATION_001" }),
      headers: { "Content-Type": "application/json" }
    }),
    onSuccess: (res: any) => {
      setRegStatus("Επιτυχής καταχώρηση!");
      if (res.data?.aiFlag) {
         setAiAlert("⚠️ ΠΡΟΣΟΧΗ: Το AI εντόπισε πιθανή ζημιά στο όχημα!");
      }
      setIdentifier("");
    }

  });

  return (
    <PageShell title="Καταχώρηση Πλύσης">
      <Card title="Νέα Καταχώρηση">
        <label className="block text-sm font-medium text-gray-700">Αριθμός Κράτησης / Πινακίδα</label>
        <input 
          type="text" 
          value={identifier} 
          onChange={(e) => setIdentifier(e.target.value)} 
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          placeholder="π.χ. ABC-1234"
        />
        <button 
          onClick={() => washMutation.mutate(identifier)}
          disabled={!identifier || washMutation.isPending}
          className="mt-4 bg-green-600 text-white px-4 py-2 rounded"
        {aiAlert && <div style={{ background: "#fee2e2", border: "1px solid #dc2626", color: "#b91c1c", padding: "1rem", marginTop: "1rem", borderRadius: "0.5rem" }}>{aiAlert}</div>}

        >
          {washMutation.isPending ? "Καταχώρηση..." : "Ολοκλήρωση Πλύσης"}
        </button>
        {regStatus && <p className="mt-2 text-green-600 font-medium">{regStatus}</p>}
      </Card>
    </PageShell>
  );
}


