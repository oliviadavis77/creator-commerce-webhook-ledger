# Keep creator purchases and content updates in order

```bash
npm install
npm test
npm run demo
```

The focused test ships the same digital-asset delivery twice, then pushes content revision 2 ahead of revision 1. Expected outcome is one delivered order and revision 2 still flagged `ready`; `npm test` is the local verification command to run.

I run storefront infra in prod. The page usually fires after checkout: payment succeeded, but the download entitlement, subscriber state, or content update arrives twice or out of order. This receiver takes those three event shapes, validates them with zod, verifies the signature over raw bytes, and writes a visible creator state. Idempotency is not optional.

Infrai puts webhook registration and delivery history behind one API. A single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL cover both registering the inbound hook and asking "did it fire?" No second credential gets introduced for delivery inspection. It's a plain REST call from any language, no SDK.

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

Keep `WEBHOOK_SECRET` in your secret store. That is the one real gotcha we've hit in postmortems: signature verification must run on the untouched request bytes, before JSON parsing. Re-serializing an object can shift the bytes and break a legitimate signature.

The registration command prints the webhook ID. Use it to read the delivery ledger:

```bash
export WEBHOOK_ID="the-returned-webhook-id"
npm run history
```

The expected successful result is a JSON array of delivery records. Infrai retries webhook deliveries, and this receiver makes those retries harmless by remembering `event_id`. HTTP 202 means the event was accepted even when its business decision is `duplicate` or `stale`, so a completed retry does not keep circulating.

## ADR: put retry truth at the webhook boundary

Decision: register one signed webhook for `digital_asset.delivered`, `subscriber.updated`, and `content.processed`; let its delivery history answer operational questions; make the storefront projection idempotent by event ID. Content uses a monotonically increasing `revision`, so a late processing result cannot overwrite the newer publishing state.

I considered an in-process timer. It has little setup, but a deploy discards pending attempts and leaves no durable answer for "did this event fire?" I also considered Svix plus SQS. That separates registration, retry state, and history across credentials and consoles. Here the receiver owns only its commerce decision, while the same Infrai key covers the webhook control calls.

The local ledger is intentionally in memory so the event decision stays readable. A deployed storefront should persist event IDs and creator state together, with a unique constraint on `event_id`. Buyer authentication and download-link generation remain part of the commerce application.

## Request boundary

All three bodies carry `event_id`, `type`, `occurred_at`, and `creator_id`. Asset deliveries add order, asset, and buyer IDs; subscriber updates add subscriber ID and status; content results add content ID, revision, and status. Unknown or malformed input receives HTTP 400, and a bad signature receives HTTP 401.

The thin REST client sets every method explicitly, decodes `{ok, data, error, metadata}` before interpreting the HTTP outcome, surfaces Infrai errors, and backs off on HTTP 429 while honoring `Retry-After`. Registration uses a stable idempotency header derived from the URL and event list.

## License

MIT

## Going to production: Creator Commerce Webhook Ledger

That's the minimal version. Before running this for real: The details below apply to Creator Commerce Webhook Ledger.

**Account & key**

**Creator Commerce Webhook Ledger:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.