import { commerceEventSchema, CreatorLedger } from "./creator_delivery_service.js";

const ledger = new CreatorLedger();
const events = [
  {
    event_id: "evt_checkout_104",
    type: "digital_asset.delivered",
    occurred_at: "2026-09-21T08:00:00.000Z",
    creator_id: "creator_7",
    order_id: "order_104",
    asset_id: "asset_lightroom_pack",
    buyer_id: "buyer_12"
  },
  {
    event_id: "evt_render_9",
    type: "content.processed",
    occurred_at: "2026-09-21T08:01:00.000Z",
    creator_id: "creator_7",
    content_id: "video_9",
    revision: 2,
    status: "ready"
  }
] as const;

for (const input of events) {
  const event = commerceEventSchema.parse(input);
  console.log(event.type, ledger.apply(event));
}
console.log(JSON.stringify(ledger.read("creator_7"), null, 2));
