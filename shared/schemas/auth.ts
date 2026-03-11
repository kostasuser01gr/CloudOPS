import { z } from "zod";
import {
  opaqueIdSchema,
  positiveIntStringSchema,
  reservationNumberSchema,
  requestIdSchema
} from "./common";

export const customerBootstrapRequestSchema = z.object({
  reservationNumber: reservationNumberSchema,
  stationCode: z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9_-]+$/u).optional(),
  requestId: requestIdSchema.optional()
});

export type CustomerBootstrapRequest = z.infer<typeof customerBootstrapRequestSchema>;

export const customerSessionCookiePayloadSchema = z.object({
  sid: opaqueIdSchema,
  v: z.number().int().positive(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive()
});

export type CustomerSessionCookiePayload = z.infer<typeof customerSessionCookiePayloadSchema>;

export const staffLoginRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(256),
  otpCode: z.string().trim().regex(/^[0-9]{6}$/u).optional(),
  requestId: requestIdSchema.optional()
});

export type StaffLoginRequest = z.infer<typeof staffLoginRequestSchema>;

export const staffSessionCookiePayloadSchema = z.object({
  sid: opaqueIdSchema,
  csrf: opaqueIdSchema,
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive()
});

export type StaffSessionCookiePayload = z.infer<typeof staffSessionCookiePayloadSchema>;

export const runtimeEnvSchema = z.object({
  APP_NAME: z.string().min(1).max(64),
  APP_ENV: z.enum(["development", "staging", "production"]).default("production"),
  DEFAULT_LOCALE: z.string().min(2).max(16),
  DEFAULT_TIMEZONE: z.string().min(2).max(64),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  TRACE_ENABLED: z.enum(["true", "false"]).transform((v) => v === "true"),
  TRACE_SAMPLE_RATE: z.coerce.number().min(0).max(1),

  CUSTOMER_SESSION_COOKIE_NAME: z.string().min(1),
  STAFF_SESSION_COOKIE_NAME: z.string().min(1),
  STAFF_CSRF_COOKIE_NAME: z.string().min(1),

  CUSTOMER_SESSION_TTL_S: positiveIntStringSchema,
  STAFF_SESSION_TTL_S: positiveIntStringSchema,
  STAFF_SESSION_ROTATE_AFTER_S: positiveIntStringSchema,

  MAX_UPLOAD_FILES_PER_RESERVATION: positiveIntStringSchema,
  MAX_UPLOAD_BYTES_PER_FILE: positiveIntStringSchema,
  UPLOAD_INTENT_TTL_S: positiveIntStringSchema,
  UPLOAD_MAX_PARALLEL_CLIENT_FILES: positiveIntStringSchema,

  DRIVE_SYNC_MAX_ATTEMPTS: positiveIntStringSchema,
  DRIVE_SYNC_RETRY_BASE_MS: positiveIntStringSchema,

  DIAGNOSTICS_ENABLED: z.enum(["true", "false"]).transform((v) => v === "true"),
  HEALTH_ENDPOINT_PREFIX: z.string().min(1),
  DIAGNOSTICS_ENDPOINT_PREFIX: z.string().min(1),

  ALERT_INVALID_RESERVATION_THRESHOLD_10M: positiveIntStringSchema,
  ALERT_UPLOAD_FAILURE_THRESHOLD_10M: positiveIntStringSchema,
  ALERT_DRIVE_FAILURE_THRESHOLD_10M: positiveIntStringSchema,
  ALERT_VALIDATION_P95_MS_THRESHOLD: positiveIntStringSchema,
  ALERT_WS_DISCONNECT_RATE_THRESHOLD: z.coerce.number().min(0).max(1),
  ALERT_SESSION_CREATION_SPIKE_10M: positiveIntStringSchema,
  ALERT_DLQ_WARNING_COUNT_15M: positiveIntStringSchema,
  ALERT_DLQ_CRITICAL_COUNT_15M: positiveIntStringSchema,
  ALERT_DLQ_OLDEST_AGE_S_CRITICAL: positiveIntStringSchema
});

export type RuntimeEnvConfig = z.infer<typeof runtimeEnvSchema>;
