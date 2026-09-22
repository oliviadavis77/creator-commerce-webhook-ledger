import { infrai } from "./infrai.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "register") {
    const url = process.env.WEBHOOK_URL;
    const secret = process.env.WEBHOOK_SECRET;
    if (!url || !secret) throw new Error("WEBHOOK_URL and WEBHOOK_SECRET are required");
    const webhook = await infrai.account.webhooks.register({
      url,
      events: ["digital_asset.delivered", "subscriber.updated", "content.processed"],
      description: "Creator storefront delivery and publishing updates",
      secret
    });
    console.log(JSON.stringify({ webhook_id: webhook.id }, null, 2));
    return;
  }

  if (command === "history") {
    const id = process.env.WEBHOOK_ID;
    if (!id) throw new Error("WEBHOOK_ID is required");
    const history = await infrai.account.webhooks.deliveries(id);
    console.log(JSON.stringify(history.items ?? [], null, 2));
    return;
  }
  throw new Error("Use register or history");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
