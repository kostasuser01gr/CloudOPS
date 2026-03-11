import type { LiveEvent } from "@shared/types/domain";
import { liveEventSchema } from "@shared/schemas/reservation";
import { loadRuntimeEnv, type AppBindings } from "./env";
import { routeRequest } from "./router";

function nowEpochS(): number {
  return Math.floor(Date.now() / 1000);
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

interface SocketAttachment {
  role: "customer" | "staff";
  roomToken: string;
  connectedEpochS: number;
}

function canReceiveEvent(role: SocketAttachment["role"], event: LiveEvent): boolean {
  if (event.type === "note_created" && role !== "staff") {
    return false;
  }
  return true;
}

export class ChatRoomDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AppBindings
  ) {}

  private parseAttachment(ws: WebSocket): SocketAttachment | null {
    const attachment = ws.deserializeAttachment();
    if (!attachment || typeof attachment !== "object") {
      return null;
    }

    const candidate = attachment as Partial<SocketAttachment>;
    if (
      (candidate.role !== "customer" && candidate.role !== "staff") ||
      typeof candidate.roomToken !== "string" ||
      typeof candidate.connectedEpochS !== "number"
    ) {
      return null;
    }

    return {
      role: candidate.role,
      roomToken: candidate.roomToken,
      connectedEpochS: candidate.connectedEpochS
    };
  }

  private broadcast(event: LiveEvent): void {
    const sockets = this.state.getWebSockets();
    const payload = JSON.stringify(event);

    for (const socket of sockets) {
      const attachment = this.parseAttachment(socket);
      if (!attachment) {
        continue;
      }

      if (!canReceiveEvent(attachment.role, event)) {
        continue;
      }

      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "send failed");
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get("upgrade")?.toLowerCase();

    if (upgrade === "websocket") {
      const role = url.searchParams.get("role");
      const roomToken = url.searchParams.get("roomToken");

      if ((role !== "customer" && role !== "staff") || !roomToken) {
        return jsonResponse(400, {
          ok: false,
          error: {
            code: "INVALID_CONNECT_REQUEST",
            message: "Unable to continue"
          }
        });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      const attachment: SocketAttachment = {
        role,
        roomToken,
        connectedEpochS: nowEpochS()
      };

      server.serializeAttachment(attachment);
      this.state.acceptWebSocket(server);
      server.send(
        JSON.stringify({
          type: "hello",
          roomToken,
          connectedEpochS: nowEpochS(),
          role
        } satisfies LiveEvent)
      );

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method.toUpperCase() === "POST" && url.pathname === "/publish") {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse(400, {
          ok: false,
          error: {
            code: "INVALID_JSON",
            message: "Unable to continue"
          }
        });
      }

      const parsed = liveEventSchema.safeParse(payload);
      if (!parsed.success) {
        return jsonResponse(400, {
          ok: false,
          error: {
            code: "INVALID_EVENT_PAYLOAD",
            message: "Unable to continue"
          }
        });
      }

      this.broadcast(parsed.data);
      return jsonResponse(202, {
        ok: true,
        data: {
          accepted: true,
          roomToken: parsed.data.roomToken,
          type: parsed.data.type
        }
      });
    }

    if (request.method.toUpperCase() === "GET") {
      return jsonResponse(200, {
        ok: true,
        data: {
          appName: this.env.APP_NAME,
          websocketCount: this.state.getWebSockets().length
        }
      });
    }

    return jsonResponse(405, {
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Unable to continue"
      }
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const payload = typeof message === "string" ? message : new TextDecoder().decode(message);

    if (payload === "ping") {
      ws.send("pong");
      return;
    }

    ws.send(
      JSON.stringify({
        type: "system",
        summary: "live shell connected",
        atEpochS: nowEpochS()
      })
    );
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "WebSocket error");
  }
}

async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: AppBindings
): Promise<void> {
  void env;

  for (const message of batch.messages) {
    try {
      if (typeof message.body !== "object" || message.body === null) {
        throw new Error("Invalid queue payload");
      }
      message.ack();
    } catch (error) {
      console.error("Queue processing failure", {
        queue: batch.queue,
        id: message.id,
        reason: error instanceof Error ? error.message : "unknown"
      });
      message.retry();
    }
  }
}

const worker: ExportedHandler<AppBindings> = {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      const runtime = loadRuntimeEnv(env);
      return await routeRequest(runtime, request, ctx);
    } catch (error) {
      console.error("Fetch pipeline failure", {
        reason: error instanceof Error ? error.message : "unknown"
      });

      return jsonResponse(500, {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error"
        },
        atEpochS: nowEpochS()
      });
    }
  },

  async queue(batch, env): Promise<void> {
    await handleQueueBatch(batch, env);
  },

  async scheduled(controller, env): Promise<void> {
    const runtime = loadRuntimeEnv(env);

    console.info("Scheduled tick", {
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
      app: runtime.config.APP_NAME
    });
  }
};

export default worker;
