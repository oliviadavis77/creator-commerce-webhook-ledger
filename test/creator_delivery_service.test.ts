import assert from "node:assert/strict";
import test from "node:test";
import { commerceEventSchema, CreatorLedger, sign, verify } from "../src/creator_delivery_service.js";

test("a retried delivery is counted once and an older content revision cannot win", () => {
  const ledger = new CreatorLedger();
  const delivery = commerceEventSchema.parse({
    event_id: "evt_delivery_1",
    type: "digital_asset.delivered",
    occurred_at: "2026-09-21T08:00:00.000Z",
    creator_id: "creator_7",
    order_id: "order_104",
    asset_id: "asset_pack",
    buyer_id: "buyer_12"
  });
  assert.deepEqual(ledger.apply(delivery), { applied: true, reason: "new" });
  assert.deepEqual(ledger.apply(delivery), { applied: false, reason: "duplicate" });

  const revision2 = commerceEventSchema.parse({
    event_id: "evt_content_2",
    type: "content.processed",
    occurred_at: "2026-09-21T08:02:00.000Z",
    creator_id: "creator_7",
    content_id: "video_9",
    revision: 2,
    status: "ready"
  });
  const revision1 = commerceEventSchema.parse({
    event_id: "evt_content_1",
    type: "content.processed",
    occurred_at: "2026-09-21T08:01:00.000Z",
    creator_id: "creator_7",
    content_id: "video_9",
    revision: 1,
    status: "rejected"
  });
  ledger.apply(revision2);
  assert.deepEqual(ledger.apply(revision1), { applied: false, reason: "stale" });
  assert.equal(ledger.read("creator_7")?.deliveredOrders.length, 1);
  assert.deepEqual(ledger.read("creator_7")?.content.video_9, { revision: 2, status: "ready" });
});

test("signature verification covers the exact request body", () => {
  const body = JSON.stringify({ event_id: "evt_1" });
  const signature = sign(body, "local-test-secret");
  assert.equal(verify(body, `sha256=${signature}`, "local-test-secret"), true);
  assert.equal(verify(`${body} `, `sha256=${signature}`, "local-test-secret"), false);
});
