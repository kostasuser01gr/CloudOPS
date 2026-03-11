import { runtimeEnvSchema, type RuntimeEnvConfig } from "@shared/schemas/auth";
import type { DriveSyncQueueMessage, IncidentEventMessage } from "@shared/types/domain";

export interface AppBindings {
  ASSETS?: Fetcher;
  DB: D1Database;
  UPLOADS_BUCKET: R2Bucket;
  CHAT_ROOM_DO: DurableObjectNamespace;
  DRIVE_SYNC_QUEUE: Queue<DriveSyncQueueMessage>;
  INCIDENT_EVENTS_QUEUE: Queue<IncidentEventMessage>;

  APP_NAME: string;
  APP_ENV: string;
  DEFAULT_LOCALE: string;
  DEFAULT_TIMEZONE: string;

  LOG_LEVEL: string;
  TRACE_ENABLED: string;
  TRACE_SAMPLE_RATE: string;

  CUSTOMER_SESSION_COOKIE_NAME: string;
  STAFF_SESSION_COOKIE_NAME: string;
  STAFF_CSRF_COOKIE_NAME: string;

  CUSTOMER_SESSION_TTL_S: string;
  STAFF_SESSION_TTL_S: string;
  STAFF_SESSION_ROTATE_AFTER_S: string;

  MAX_UPLOAD_FILES_PER_RESERVATION: string;
  MAX_UPLOAD_BYTES_PER_FILE: string;
  UPLOAD_INTENT_TTL_S: string;
  UPLOAD_MAX_PARALLEL_CLIENT_FILES: string;

  DRIVE_SYNC_MAX_ATTEMPTS: string;
  DRIVE_SYNC_RETRY_BASE_MS: string;

  DIAGNOSTICS_ENABLED: string;
  HEALTH_ENDPOINT_PREFIX: string;
  DIAGNOSTICS_ENDPOINT_PREFIX: string;

  ALERT_INVALID_RESERVATION_THRESHOLD_10M: string;
  ALERT_UPLOAD_FAILURE_THRESHOLD_10M: string;
  ALERT_DRIVE_FAILURE_THRESHOLD_10M: string;
  ALERT_VALIDATION_P95_MS_THRESHOLD: string;
  ALERT_WS_DISCONNECT_RATE_THRESHOLD: string;
  ALERT_SESSION_CREATION_SPIKE_10M: string;
  ALERT_DLQ_WARNING_COUNT_15M: string;
  ALERT_DLQ_CRITICAL_COUNT_15M: string;
  ALERT_DLQ_OLDEST_AGE_S_CRITICAL: string;
}

export interface RuntimeEnv {
  bindings: AppBindings;
  config: RuntimeEnvConfig;
}

export function loadRuntimeEnv(bindings: AppBindings): RuntimeEnv {
  const parsed = runtimeEnvSchema.safeParse(bindings);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid runtime environment: ${details}`);
  }

  return {
    bindings,
    config: parsed.data
  };
}
