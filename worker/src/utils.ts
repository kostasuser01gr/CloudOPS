import type { RuntimeEnv } from "./env";

const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{16,128}$/u;

export function nowEpochS(): number {
  return Math.floor(Date.now() / 1000);
}

export function requestIdFrom(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function randomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function newOpaqueId(): string {
  return `${crypto.randomUUID().replace(/-/gu, "")}${randomToken(8)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

export interface ApiErrorPayload {
  ok: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId: string;
  atEpochS: number;
}

export function ok<T>(requestId: string, data: T, headers?: HeadersInit): Response {
  return new Response(
    JSON.stringify({ ok: true, data, requestId, atEpochS: nowEpochS() }),
    { status: 200, headers: { ...commonHeaders(requestId), ...(headers ?? {}) } }
  );
}

export function fail(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  const payload: ApiErrorPayload = {
    ok: false,
    error: { code, message, details },
    requestId,
    atEpochS: nowEpochS()
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: commonHeaders(requestId)
  });
}

export function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return {};
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .reduce<Record<string, string>>((acc, part) => {
      const [rawName, ...rawValueParts] = part.split("=");
      const name = rawName?.trim();
      if (!name) return acc;
      acc[name] = decodeURIComponent(rawValueParts.join("="));
      return acc;
    }, {});
}

export function parseSessionCookie(rawValue: string | undefined): { sessionPublicId: string; secret: string } | null {
  if (!rawValue) return null;
  const [sessionPublicId, secret] = rawValue.split(".");
  if (!sessionPublicId || !secret) return null;
  if (!OPAQUE_ID_RE.test(sessionPublicId) || secret.length < 16 || secret.length > 256) return null;
  return { sessionPublicId, secret };
}

export async function parseJsonBody<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }
): Promise<{ success: true; data: T } | { success: false }> {
  let jsonValue: unknown;
  try {
    jsonValue = await request.json();
  } catch {
    return { success: false };
  }
  return schema.safeParse(jsonValue);
}

export interface StaffAuthResult {
  ok: true;
  session: { staffUserId: string; displayName: string; email: string; roleKeys: string[]; permissions: string[] };
  staffAuthSessionId: string;
}

export async function loadStaffSession(
  runtime: RuntimeEnv,
  request: Request,
  requireCsrf: boolean
): Promise<StaffAuthResult | { ok: false; reason: string }> {
  const cookies = parseCookies(request);
  const cookieName = runtime.config.STAFF_SESSION_COOKIE_NAME;
  const parsed = parseSessionCookie(cookies[cookieName]);
  if (!parsed) return { ok: false, reason: "missing_cookie" };

  const row = await runtime.bindings.DB.prepare(
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
    .first<{
      staff_auth_session_id: string;
      staff_user_id: string;
      session_public_id: string;
      session_secret_hash: string;
      csrf_token_hash: string;
      status: string;
      expires_epoch_s: number;
      email: string;
      display_name: string;
      is_active: number;
    }>();

  if (!row) return { ok: false, reason: "session_not_found" };

  const secretHash = await sha256Hex(parsed.secret);
  if (secretHash !== row.session_secret_hash) return { ok: false, reason: "session_hash_mismatch" };

  const now = nowEpochS();
  if (row.status !== "active" || row.expires_epoch_s <= now || !row.is_active) {
    return { ok: false, reason: "session_expired" };
  }

  if (requireCsrf) {
    const csrfHeader = request.headers.get("x-csrf-token");
    if (!csrfHeader) return { ok: false, reason: "missing_csrf" };
    const csrfHash = await sha256Hex(csrfHeader);
    if (csrfHash !== row.csrf_token_hash) return { ok: false, reason: "csrf_mismatch" };
  }

  // Update last seen
  await runtime.bindings.DB.prepare(
    "UPDATE staff_auth_sessions SET last_seen_epoch_s = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(now, row.staff_auth_session_id).run();

  // Load roles
  const roles = await runtime.bindings.DB.prepare(
    `SELECT sr.role_key, sr.permissions_json
     FROM staff_user_roles sur
     INNER JOIN staff_roles sr ON sr.id = sur.role_id
     WHERE sur.staff_user_id = ?`
  ).bind(row.staff_user_id).all<{ role_key: string; permissions_json: string }>();

  const roleKeys: string[] = [];
  const permissionsSet = new Set<string>();
  for (const r of roles.results ?? []) {
    roleKeys.push(r.role_key);
    try {
      const perms = JSON.parse(r.permissions_json) as string[];
      for (const p of perms) permissionsSet.add(p);
    } catch { /* ignore */ }
  }

  return {
    ok: true,
    session: {
      staffUserId: row.staff_user_id,
      displayName: row.display_name,
      email: row.email,
      roleKeys,
      permissions: Array.from(permissionsSet)
    },
    staffAuthSessionId: row.staff_auth_session_id
  };
}

export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes("*") || permissions.includes(required);
}
