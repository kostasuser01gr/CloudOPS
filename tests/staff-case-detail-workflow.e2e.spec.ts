import { expect, test } from "@playwright/test";

const BASE_URL = process.env.CLOUDOPS_E2E_BASE_URL ?? "http://127.0.0.1:8787";
const STAFF_EMAIL = process.env.CLOUDOPS_E2E_STAFF_EMAIL ?? "staff@example.com";
const STAFF_PASSWORD = process.env.CLOUDOPS_E2E_STAFF_PASSWORD ?? "ChangeMe123!";
const CASE_ID = process.env.CLOUDOPS_E2E_CASE_ID ?? "";
const ROOM_TOKEN = process.env.CLOUDOPS_E2E_ROOM_TOKEN ?? "";

test.skip(!CASE_ID, "Set CLOUDOPS_E2E_CASE_ID to run staff case-detail workflow tests");

test.describe("Staff Case Detail Workflow - Live Refresh Consistency", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/staff/login`);
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Κωδικός").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Είσοδος" }).click();
    await expect(page).toHaveURL(/\/staff$/u);
  });

  test("version/health/diagnostics endpoints expose operator-safe envelopes", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const versionResponse = await fetch("/api/version", { credentials: "include" });
      const versionJson = await versionResponse.json();

      const liveResponse = await fetch("/api/health/live", { credentials: "include" });
      const liveJson = await liveResponse.json();

      const readyResponse = await fetch("/api/health/ready", { credentials: "include" });
      const readyJson = await readyResponse.json();

      const diagnosticsResponse = await fetch("/api/diagnostics/summary", { credentials: "include" });
      const diagnosticsJson = await diagnosticsResponse.json();

      const diagnosticsData = diagnosticsJson?.data ?? {};
      return {
        versionOk: versionJson?.ok === true && typeof versionJson?.data?.service === "string",
        liveOk: liveJson?.ok === true && liveJson?.data?.status === "live",
        readyOk:
          (readyJson?.ok === true && typeof readyJson?.data?.status === "string") ||
          (readyJson?.ok === false && readyJson?.error?.code === "HEALTH_NOT_READY"),
        diagnosticsOk:
          diagnosticsJson?.ok === true &&
          typeof diagnosticsData?.openAlerts === "number" &&
          typeof diagnosticsData?.openCases === "number" &&
          typeof diagnosticsData?.activeCustomerSessions === "number",
        hasLeakySecrets:
          JSON.stringify(versionJson).includes("password_hash") ||
          JSON.stringify(diagnosticsJson).includes("session_secret_hash")
      };
    });

    expect(result.versionOk).toBeTruthy();
    expect(result.liveOk).toBeTruthy();
    expect(result.readyOk).toBeTruthy();
    expect(result.diagnosticsOk).toBeTruthy();
    expect(result.hasLeakySecrets).toBeFalsy();
  });

  test("staff canned replies endpoint remains protected and safe", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/staff/canned-replies", {
        method: "GET",
        credentials: "include"
      });
      const json = await response.json();
      const replies = Array.isArray(json?.data?.replies) ? json.data.replies : [];
      const leaky = JSON.stringify(json).includes("session_secret_hash") || JSON.stringify(json).includes("password_hash");

      return {
        ok: json?.ok === true,
        repliesShapeOk: replies.every(
          (reply: unknown) =>
            typeof (reply as { cannedReplyId?: unknown }).cannedReplyId === "string" &&
            typeof (reply as { title?: unknown }).title === "string" &&
            typeof (reply as { body?: unknown }).body === "string"
        ),
        noSecretLeak: !leaky
      };
    });

    expect(result.ok).toBeTruthy();
    expect(result.repliesShapeOk).toBeTruthy();
    expect(result.noSecretLeak).toBeTruthy();
  });

  test("staff can load protected case detail", async ({ page }) => {
    await page.goto(`${BASE_URL}/staff/cases/${encodeURIComponent(CASE_ID)}`);
    await expect(page.getByText("Λεπτομέρειες Υπόθεσης")).toBeVisible();
    await expect(page.getByText("Σύνοψη κράτησης")).toBeVisible();
  });

  test("staff inbox quick-preview opens safely and full-case navigation remains intact", async ({ page }) => {
    await page.goto(`${BASE_URL}/staff`);
    await expect(page.getByText("Ενεργές υποθέσεις")).toBeVisible();

    const previewButtons = page.getByRole("button", { name: /Προεπισκόπηση|Κλείσιμο προεπισκόπησης/u });
    if ((await previewButtons.count()) === 0) {
      test.skip(true, "No visible cases for quick-preview in current environment");
    }

    await previewButtons.first().click();
    await expect(page.getByText("Προεπισκόπηση υπόθεσης")).toBeVisible();
    const previewPane = page.getByText("Προεπισκόπηση υπόθεσης").locator("..");
    await expect(previewPane.getByRole("link", { name: "Άνοιγμα υπόθεσης" })).toBeVisible();

    const firstCaseRow = previewButtons.first().locator("xpath=ancestor::article[1]");
    const statusText = (await firstCaseRow.getByText(/^Κατάσταση:/u).first().innerText()).replace(/^Κατάσταση:\s*/u, "");
    const statusFilter = page.getByLabel("Φίλτρο κατάστασης");
    await statusFilter.selectOption(statusText);
    await expect(statusFilter).toHaveValue(statusText);
    await expect(page.getByText("Προεπισκόπηση υπόθεσης")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Προεπισκόπηση υπόθεσης")).toHaveCount(0);
    await expect(statusFilter).toHaveValue(statusText);

    await previewButtons.first().click();
    await expect(page.getByText("Προεπισκόπηση υπόθεσης")).toBeVisible();

    await previewPane.getByRole("link", { name: "Άνοιγμα υπόθεσης" }).click();
    await expect(page).toHaveURL(/\/staff\/cases\//u);
    await expect(page.getByText("Λεπτομέρειες Υπόθεσης")).toBeVisible();

    await page.goto(`${BASE_URL}/staff`);
    const closeButtons = page.getByRole("button", { name: "Κλείσιμο προεπισκόπησης" });
    if ((await closeButtons.count()) > 0) {
      await closeButtons.first().click();
      await expect(page.getByText("Προεπισκόπηση υπόθεσης")).toHaveCount(0);
    }
  });

  test("staff can send a plain-text message and it persists", async ({ page }) => {
    const body = `E2E message ${Date.now()}`;
    await page.goto(`${BASE_URL}/staff/cases/${encodeURIComponent(CASE_ID)}`);
    await page.getByPlaceholder("Πληκτρολογήστε μήνυμα προς τον πελάτη...").fill(body);
    await page.getByRole("button", { name: "Αποστολή μηνύματος" }).click();
    await expect(page.getByText(body)).toBeVisible();
  });

  test("staff can create upload intent, persist attachment metadata, and download protected content", async ({ page }) => {
    await page.goto(`${BASE_URL}/staff/cases/${encodeURIComponent(CASE_ID)}`);

    const result = await page.evaluate(async (caseId) => {
      const csrfCookie = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("__Host-cloudops_staff_csrf="));
      if (!csrfCookie) {
        return { ok: false };
      }
      const csrf = decodeURIComponent(csrfCookie.split("=")[1] ?? "");
      const idempotencyKey = `e2e_att_${Date.now()}`;

      const intentResponse = await fetch(`/api/staff/cases/${encodeURIComponent(caseId)}/upload-intents`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf
        },
        body: JSON.stringify({
          fileName: "damage-photo.jpg",
          contentType: "image/jpeg",
          sizeBytes: 4096,
          visibility: "customer_visible",
          idempotencyKey
        })
      });
      const intentJson = await intentResponse.json();
      if (!intentJson?.ok) {
        return { ok: false };
      }

      const attachmentResponse = await fetch(`/api/staff/cases/${encodeURIComponent(caseId)}/attachments`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf
        },
        body: JSON.stringify({
          intentId: intentJson.data.intent.intentId,
          objectKey: intentJson.data.intent.objectKey,
          fileName: intentJson.data.intent.fileName,
          contentType: intentJson.data.intent.contentType,
          sizeBytes: intentJson.data.intent.sizeBytes,
          visibility: "customer_visible",
          idempotencyKey,
          clientCreatedEpochMs: Date.now()
        })
      });
      const attachmentJson = await attachmentResponse.json();
      if (!attachmentJson?.ok || !attachmentJson?.data?.attachment?.attachmentId) {
        return { ok: false };
      }

      const metadataResponse = await fetch(
        `/api/staff/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(attachmentJson.data.attachment.attachmentId)}`,
        {
          method: "GET",
          credentials: "include"
        }
      );
      const metadataJson = await metadataResponse.json();

      const contentResponse = await fetch(
        `/api/staff/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(
          attachmentJson.data.attachment.attachmentId
        )}/content`,
        {
          method: "GET",
          credentials: "include"
        }
      );
      const contentBytes = await contentResponse.arrayBuffer();
      const cacheControl = contentResponse.headers.get("cache-control") ?? "";
      const nosniff = contentResponse.headers.get("x-content-type-options") ?? "";
      const disposition = contentResponse.headers.get("content-disposition") ?? "";

      return {
        ok:
          attachmentJson?.ok === true &&
          metadataJson?.ok === true &&
          contentResponse.ok &&
          contentBytes.byteLength > 0 &&
          cacheControl.includes("no-store") &&
          nosniff.toLowerCase() === "nosniff" &&
          disposition.toLowerCase().includes("attachment")
      };
    }, CASE_ID);

    expect(result.ok).toBeTruthy();
    await expect(page.getByText(/Συνημμένο:/u)).toBeVisible();
  });

  test("staff can create a staff-only note and it appears in notes/timeline", async ({ page }) => {
    const note = `E2E note ${Date.now()}`;
    await page.goto(`${BASE_URL}/staff/cases/${encodeURIComponent(CASE_ID)}`);
    await page.getByPlaceholder("Νέα εσωτερική σημείωση...").fill(note);
    await page.getByRole("button", { name: "Αποθήκευση σημείωσης" }).click();
    await expect(page.getByText(note)).toBeVisible();

    const timeline = page.getByText("Ενιαία χρονογραμμή υπόθεσης").locator("..");
    await expect(timeline).toContainText(/Εσωτερική σημείωση/u);
  });

  test("valid status transitions are accepted and invalid transitions rejected", async ({ page }) => {
    await page.goto(`${BASE_URL}/staff/cases/${encodeURIComponent(CASE_ID)}`);

    const statusSelect = page.locator("select").filter({ has: page.locator("option") }).first();
    const options = await statusSelect.locator("option").allInnerTexts();
    test.skip(options.length === 0, "No valid transitions available from current status");

    await statusSelect.selectOption({ label: options[0] });
    await page.getByRole("button", { name: "Αποθήκευση κατάστασης" }).click();
    await expect(page.getByText("Στοιχεία υπόθεσης")).toBeVisible();

    const responsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/staff/cases/${encodeURIComponent(CASE_ID)}/status`) && response.status() >= 400
    );

    await page.evaluate(async (caseId) => {
      const csrfCookie = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("__Host-cloudops_staff_csrf="));
      if (!csrfCookie) {
        return;
      }
      const csrf = decodeURIComponent(csrfCookie.split("=")[1] ?? "");

      await fetch(`/api/staff/cases/${encodeURIComponent(caseId)}/status`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf
        },
        body: JSON.stringify({
          toStatus: "new",
          idempotencyKey: `e2e_invalid_${Date.now()}_abcdef`,
          reason: "invalid transition probe"
        })
      });
    }, CASE_ID);

    const response = await responsePromise;
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("timeline renders mixed event types", async ({ page }) => {
    await page.goto(`${BASE_URL}/staff/cases/${encodeURIComponent(CASE_ID)}`);
    await expect(page.getByText("Ενιαία χρονογραμμή υπόθεσης")).toBeVisible();

    const timeline = page.getByText("Ενιαία χρονογραμμή υπόθεσης").locator("..");
    await expect(timeline).toContainText(/Μήνυμα|Εσωτερική σημείωση|Αλλαγή κατάστασης/u);
  });

  test("customer read path still excludes staff-only note content", async ({ page }) => {
    test.skip(!ROOM_TOKEN, "Set CLOUDOPS_E2E_ROOM_TOKEN to validate customer read path");

    const customerMessagesResponse = await page.evaluate(async (roomToken) => {
      const response = await fetch(`/api/customer-room/${encodeURIComponent(roomToken)}/messages`, {
        credentials: "include"
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { ok: false, messages: [] as Array<{ body?: string | null }> };
      }

      const data = payload as { ok?: boolean; data?: { messages?: Array<{ body?: string | null }> } };
      return {
        ok: data.ok === true,
        messages: Array.isArray(data.data?.messages) ? data.data.messages : []
      };
    }, ROOM_TOKEN);

    expect(customerMessagesResponse.ok).toBeTruthy();
    const hasNoteLikePayload = customerMessagesResponse.messages.some(
      (message: { body?: string | null }) => typeof message.body === "string" && message.body.includes("E2E note")
    );
    expect(hasNoteLikePayload).toBeFalsy();
  });

  test("customer can create upload intent, persist attachment metadata, and download protected content", async ({ page }) => {
    test.skip(!ROOM_TOKEN, "Set CLOUDOPS_E2E_ROOM_TOKEN to validate customer attachment path");

    await page.goto(`${BASE_URL}/c/${encodeURIComponent(ROOM_TOKEN)}`);

    const response = await page.evaluate(async (roomToken) => {
      const idempotencyKey = `e2e_customer_att_${Date.now()}`;
      const intentResponse = await fetch(`/api/customer-room/${encodeURIComponent(roomToken)}/upload-intents`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          fileName: "customer-photo.jpg",
          contentType: "image/jpeg",
          sizeBytes: 2048,
          visibility: "customer_visible",
          idempotencyKey
        })
      });
      const intentJson = await intentResponse.json();
      if (!intentJson?.ok) {
        return { ok: false };
      }

      const attachmentResponse = await fetch(`/api/customer-room/${encodeURIComponent(roomToken)}/attachments`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          intentId: intentJson.data.intent.intentId,
          objectKey: intentJson.data.intent.objectKey,
          fileName: intentJson.data.intent.fileName,
          contentType: intentJson.data.intent.contentType,
          sizeBytes: intentJson.data.intent.sizeBytes,
          visibility: "customer_visible",
          idempotencyKey,
          clientCreatedEpochMs: Date.now()
        })
      });
      const attachmentJson = await attachmentResponse.json();
      if (!attachmentJson?.ok || !attachmentJson?.data?.attachment?.attachmentId) {
        return { ok: false, attachmentId: null };
      }

      const metadataResponse = await fetch(
        `/api/customer-room/${encodeURIComponent(roomToken)}/attachments/${encodeURIComponent(attachmentJson.data.attachment.attachmentId)}`,
        {
          method: "GET",
          credentials: "include"
        }
      );
      const metadataJson = await metadataResponse.json();

      const contentResponse = await fetch(
        `/api/customer-room/${encodeURIComponent(roomToken)}/attachments/${encodeURIComponent(
          attachmentJson.data.attachment.attachmentId
        )}/content`,
        {
          method: "GET",
          credentials: "include"
        }
      );
      const contentBytes = await contentResponse.arrayBuffer();
      const cacheControl = contentResponse.headers.get("cache-control") ?? "";
      const nosniff = contentResponse.headers.get("x-content-type-options") ?? "";
      const disposition = contentResponse.headers.get("content-disposition") ?? "";

      return {
        ok:
          attachmentJson?.ok === true &&
          metadataJson?.ok === true &&
          contentResponse.ok &&
          contentBytes.byteLength > 0 &&
          cacheControl.includes("no-store") &&
          nosniff.toLowerCase() === "nosniff" &&
          disposition.toLowerCase().includes("attachment"),
        attachmentId: attachmentJson.data.attachment.attachmentId
      };
    }, ROOM_TOKEN);

    expect(response.ok).toBeTruthy();
  });

  test("customer cannot retrieve attachment from another room", async ({ page }) => {
    test.skip(!ROOM_TOKEN, "Set CLOUDOPS_E2E_ROOM_TOKEN to validate customer attachment authorization");

    await page.goto(`${BASE_URL}/c/${encodeURIComponent(ROOM_TOKEN)}`);

    const response = await page.evaluate(async (roomToken) => {
      const idempotencyKey = `e2e_customer_att_cross_${Date.now()}`;
      const intentResponse = await fetch(`/api/customer-room/${encodeURIComponent(roomToken)}/upload-intents`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          fileName: "cross-room-photo.jpg",
          contentType: "image/jpeg",
          sizeBytes: 2048,
          visibility: "customer_visible",
          idempotencyKey
        })
      });
      const intentJson = await intentResponse.json();
      if (!intentJson?.ok) {
        return { ok: false, denied: false };
      }

      const attachmentResponse = await fetch(`/api/customer-room/${encodeURIComponent(roomToken)}/attachments`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          intentId: intentJson.data.intent.intentId,
          objectKey: intentJson.data.intent.objectKey,
          fileName: intentJson.data.intent.fileName,
          contentType: intentJson.data.intent.contentType,
          sizeBytes: intentJson.data.intent.sizeBytes,
          visibility: "customer_visible",
          idempotencyKey,
          clientCreatedEpochMs: Date.now()
        })
      });
      const attachmentJson = await attachmentResponse.json();
      if (!attachmentJson?.ok || !attachmentJson?.data?.attachment?.attachmentId) {
        return { ok: false, denied: false };
      }

      const fakeRoomToken = `X${"a".repeat(23)}`;
      const deniedMetadataResponse = await fetch(
        `/api/customer-room/${encodeURIComponent(fakeRoomToken)}/attachments/${encodeURIComponent(attachmentJson.data.attachment.attachmentId)}`,
        {
          method: "GET",
          credentials: "include"
        }
      );
      const deniedContentResponse = await fetch(
        `/api/customer-room/${encodeURIComponent(fakeRoomToken)}/attachments/${encodeURIComponent(
          attachmentJson.data.attachment.attachmentId
        )}/content`,
        {
          method: "GET",
          credentials: "include"
        }
      );

      return {
        ok: true,
        denied: deniedMetadataResponse.status >= 400 && deniedContentResponse.status >= 400
      };
    }, ROOM_TOKEN);

    expect(response.ok).toBeTruthy();
    expect(response.denied).toBeTruthy();
  });
});
