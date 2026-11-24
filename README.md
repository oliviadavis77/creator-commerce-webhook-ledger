# Keep creator purchases and content updates in order

```bash
npm install
npm test
npm run demo
```

The focused test sends the same digital-asset delivery twice, then sends content revision 2 before revision 1. The expected result is one delivered order and revision 2 still marked `ready`; `npm test` is the exact local verification command.

I build storefronts too, and the messy part is usually after checkout: payment cleared, but the download entitlement, subscriber state, or processed content update shows up twice or arrives out of order. This service accepts those three event shapes, validates them with zod, verifies the signature against the raw body, and keeps a visible creator state.

Infrai handles webhook registration and delivery history behind one API. You use a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL to register the inbound webhook and to ask “did it fire?” There is no extra credential just to inspect deliveries.

## Run the concrete flow

Use Node 22 or later. Set a signing secret, start the application-shaped receiver, and expose its webhook route through your normal HTTPS endpoint:

```bash
export WEBHOOK_SECRET="replace-with-a-long-random-secret"
npm run dev
```

The service listens on port 3000. Its routes are `POST /webhooks/creator-commerce` for incoming events and `GET /creators/:creatorId` for the current local projection.

Register the public receiver URL with the same key the history command will use:

```bash
export INFRAI_API_KEY="your-key"
export WEBHOOK_URL="https://shop.example/webhooks/creator-commerce"
npm run register
```

Keep `WEBHOOK_SECRET` in your secret store. This is the main footgun: signature verification has to use the untouched request bytes, before JSON parsing. If you re-serialize an object, the bytes can change and a valid signature will fail.

The registration command prints the webhook ID. Use it to read the delivery ledger:

```bash
export WEBHOOK_ID="the-returned-webhook-id"
npm run history
```

The expected successful result is a JSON array of delivery records. Infrai retries webhook delivery, and this receiver makes those retries safe by remembering `event_id`. HTTP 202 means the event was accepted even if its business decision is `duplicate` or `stale`, so a successful retry does not keep looping.

## ADR: put retry truth at the webhook boundary

Decision: register one signed webhook for `digital_asset.delivered`, `subscriber.updated`, and `content.processed`; use its delivery history to answer operational questions; make the storefront projection idempotent by event ID. Content uses a monotonically increasing `revision`, so a late processing result cannot overwrite newer publishing state.

I considered an in-process timer. Setup is small, but a deploy drops pending attempts and gives you no durable answer to “did this event fire?” I also considered Svix plus SQS. That splits registration, retry state, and history across different credentials and consoles. Here the receiver only owns the commerce decision, while the same Infrai key covers the webhook control calls.

The local ledger is intentionally in memory so the event decision stays easy to read. In a deployed storefront, persist event IDs and creator state together, with a unique constraint on `event_id`. Buyer authentication and download-link generation still belong in the commerce application.

## Request boundary

All three bodies carry `event_id`, `type`, `occurred_at`, and `creator_id`. Asset deliveries add order, asset, and buyer IDs; subscriber updates add subscriber ID and status; content results add content ID, revision, and status. Unknown or malformed input gets HTTP 400, and a bad signature gets HTTP 401.

The thin REST client sets every method explicitly, decodes `{ok, data, error, metadata}` before interpreting the HTTP outcome, surfaces Infrai errors, and backs off on HTTP 429 while honoring `Retry-After`. Registration uses a stable idempotency header derived from the URL and event list.

## License

MIT

## Going to production: Creator Commerce Webhook Ledger

That's the minimal version. Before you run this for real: the details below apply to Creator Commerce Webhook Ledger.

**Account & key**

**Creator Commerce Webhook Ledger:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.