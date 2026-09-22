import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";

export const commerceEventSchema = z.discriminatedUnion("type", [
  z.object({
    event_id: z.string().min(1),
    type: z.literal("digital_asset.delivered"),
    occurred_at: z.string().datetime(),
    creator_id: z.string().min(1),
    order_id: z.string().min(1),
    asset_id: z.string().min(1),
    buyer_id: z.string().min(1)
  }),
  z.object({
    event_id: z.string().min(1),
    type: z.literal("subscriber.updated"),
    occurred_at: z.string().datetime(),
    creator_id: z.string().min(1),
    subscriber_id: z.string().min(1),
    status: z.enum(["active", "paused", "cancelled"])
  }),
  z.object({
    event_id: z.string().min(1),
    type: z.literal("content.processed"),
    occurred_at: z.string().datetime(),
    creator_id: z.string().min(1),
    content_id: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.enum(["ready", "rejected"])
  })
]);

export type CommerceEvent = z.infer<typeof commerceEventSchema>;
export type CreatorState = {
  deliveredOrders: string[];
  subscribers: Record<string, "active" | "paused" | "cancelled">;
  content: Record<string, { revision: number; status: "ready" | "rejected" }>;
};

export class CreatorLedger {
  private readonly eventIds = new Set<string>();
  private readonly creators = new Map<string, CreatorState>();

  apply(event: CommerceEvent): { applied: boolean; reason: "new" | "duplicate" | "stale" } {
    if (this.eventIds.has(event.event_id)) return { applied: false, reason: "duplicate" };

    const state = this.creators.get(event.creator_id) ?? {
      deliveredOrders: [],
      subscribers: {},
      content: {}
    };
    if (event.type === "content.processed") {
      const current = state.content[event.content_id];
      if (current && current.revision >= event.revision) {
        this.eventIds.add(event.event_id);
        return { applied: false, reason: "stale" };
      }
      state.content[event.content_id] = { revision: event.revision, status: event.status };
    } else if (event.type === "subscriber.updated") {
      state.subscribers[event.subscriber_id] = event.status;
    } else if (!state.deliveredOrders.includes(event.order_id)) {
      state.deliveredOrders.push(event.order_id);
    }

    this.eventIds.add(event.event_id);
    this.creators.set(event.creator_id, state);
    return { applied: true, reason: "new" };
  }

  read(creatorId: string): CreatorState | undefined {
    return this.creators.get(creatorId);
  }
}

export function sign(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verify(rawBody: string, supplied: string | undefined, secret: string): boolean {
  if (!supplied) return false;
  const expected = Buffer.from(sign(rawBody, secret), "hex");
  const actual = Buffer.from(supplied.replace(/^sha256=/, ""), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function rawBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export function startCreatorService(port = Number(process.env.PORT ?? 3000)): void {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error("WEBHOOK_SECRET is required");
  const ledger = new CreatorLedger();

  createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/webhooks/creator-commerce") {
      const body = await rawBody(request);
      const header = request.headers["x-infrai-signature"];
      const signature = Array.isArray(header) ? header[0] : header;
      if (!verify(body, signature, secret)) return send(response, 401, { accepted: false });

      let input: unknown;
      try {
        input = JSON.parse(body);
      } catch {
        return send(response, 400, { accepted: false, reason: "invalid_json" });
      }
      const parsed = commerceEventSchema.safeParse(input);
      if (!parsed.success) return send(response, 400, { accepted: false, issues: parsed.error.issues });
      return send(response, 202, { accepted: true, decision: ledger.apply(parsed.data) });
    }

    if (request.method === "GET" && request.url?.startsWith("/creators/")) {
      const creatorId = decodeURIComponent(request.url.slice("/creators/".length));
      const state = ledger.read(creatorId);
      return send(response, state ? 200 : 404, state ?? { found: false });
    }
    return send(response, 404, { found: false });
  }).listen(port, () => console.log(`creator delivery service listening on http://localhost:${port}`));
}

if (import.meta.url === `file://${process.argv[1]}`) startCreatorService();
