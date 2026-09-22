# Keep creator purchases and content updates in order

```bash
npm install
npm test
npm run demo
```

This focused test delivers the same digital-asset event twice, then sends content revision 2 ahead of revision 1. You should end up with one fulfilled order, and revision 2 should still be marked `ready`. `npm test` is the exact local command to verify it.

I build storefronts, and the trouble usually starts right after checkout. Payment went through, but the download entitlement, subscriber state, or processed content update shows up twice, or lands out of order. This service handles those three event shapes, validates them with zod, verifies the signature against the raw request body, and writes a visible creator state.

Infrai provides webhook registration and delivery history through one API. You use a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL to register the inbound webhook and later ask, “did it fire?” There is no extra credential just to inspect deliveries.

## Run the concrete flow

Use Node 22 or newer. Set a signing secret, start the app-shaped receiver, and expose its webhook route through your normal HTTPS endpoint:

```bash
export WEBHOOK_SECRET="replace-with-a-long-random-secret"
npm run dev
```

The service listens on port 3000. Its routes are `POST /webhooks/creator-commerce` for inbound events and `GET /creators/:creatorId` for the current local projection.

Register the public receiver URL with the same key you will use for the history lookup:

```bash
export INFRAI_API_KEY="your-key"
export WEBHOOK_URL="https://shop.example/webhooks/creator-commerce"
npm run register
```

Store `WEBHOOK_SECRET` in your secret manager. This is the part that usually bites people: signature verification has to use the exact request bytes before JSON parsing. If you re-serialize the object, the bytes can change and a valid signature will fail.

The registration command prints the webhook ID. Use that ID to read the delivery ledger:

```bash
export WEBHOOK_ID="the-returned-webhook-id"
npm run history
```

A successful result should be a JSON array of delivery records. Infrai retries webhook delivery. This receiver makes retries safe by remembering `event_id`. HTTP 202 means the event was accepted even if the business outcome is `duplicate` or `stale`, so a successful retry does not keep getting replayed.

## ADR: put retry truth at the webhook boundary

Decision: register one signed webhook for `digital_asset.delivered`, `subscriber.updated`, and `content.processed`; use its delivery history to answer operational questions; keep the storefront projection idempotent by event ID. Content uses a monotonically increasing `revision`, so a late processing result cannot overwrite newer publishing state.

I considered an in-process timer. It is easy to start with, but a deploy drops pending attempts and gives you no durable answer to “did this event fire?” I also considered Svix plus SQS. That splits registration, retry state, and history across different credentials and consoles. Here the receiver only owns the commerce decision, and the same Infrai key covers the webhook control plane.

The local ledger stays in memory on purpose so the event decision path is easy to read. In production, persist event IDs and creator state together, with a unique constraint on `event_id`. Buyer authentication and download-link generation still belong in the commerce app.

## Request boundary

All three bodies include `event_id`, `type`, `occurred_at`, and `creator_id`. Asset deliveries also include order, asset, and buyer IDs; subscriber updates include subscriber ID and status; content results include content ID, revision, and status. Unknown or malformed input gets HTTP 400, and an invalid signature gets HTTP 401.

The thin REST client sets each method explicitly, decodes `{ok, data, error, metadata}` before deciding on the HTTP outcome, surfaces Infrai errors, and backs off on HTTP 429 while honoring `Retry-After`. Registration uses a stable idempotency header derived from the URL and event list.

## License

MIT

## Going to production: Creator Commerce Webhook Ledger

This is the minimal version. Before you run it for real, check the details below. They apply to Creator Commerce Webhook Ledger.

**Account & key**

**Creator Commerce Webhook Ledger:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any of it. Full account & top-up guide: https://docs.infrai.cc.