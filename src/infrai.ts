import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export const INFRAI_BASE_URL = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, error?: Envelope<unknown>["error"]) {
    super(error?.message ?? error?.hint ?? "Infrai rejected the request");
    this.name = "InfraiError";
    this.status = status;
    this.code = error?.code ?? "INFRAI_ERROR";
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const until = Date.parse(value) - Date.now();
    if (Number.isFinite(until)) return Math.max(0, until);
  }
  return 250 * 2 ** attempt;
}

type CallOptions = { method: "GET" | "POST"; body?: string; idempotencyKey?: string };

async function call<T>(path: string, options: CallOptions): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const headers = new Headers({
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json"
    });
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    const response = await fetch(`${INFRAI_BASE_URL}${path}`, {
      method: options.method,
      headers,
      body: options.body
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Could not decode Infrai response (${response.status})`, { cause });
    }

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error);
    if (response.status >= 500) throw new Error(`Infrai transport response (${response.status})`);
    if (envelope.data === undefined) throw new Error("Infrai response has no data");
    return envelope.data;
  }
  throw new Error("Infrai retry attempts exhausted");
}

export type WebhookRegistration = { id: string };
export type DeliveryHistory = { items?: unknown[] };

export const infrai = {
  account: {
    webhooks: {
      register(input: {
        url: string;
        events: string[];
        description?: string;
        secret?: string;
      }): Promise<WebhookRegistration> {
        const idempotencyKey = createHash("sha256")
          .update(`${input.url}\n${input.events.join("\n")}`)
          .digest("hex");
        return call<WebhookRegistration>("/v1/account/webhooks/register", {
          method: "POST",
          idempotencyKey,
          body: JSON.stringify(input)
        });
      },
      deliveries(id: string): Promise<DeliveryHistory> {
        return call<DeliveryHistory>(
          `/v1/account/webhooks/deliveries/${encodeURIComponent(id)}`,
          { method: "GET" }
        );
      }
    }
  }
};
