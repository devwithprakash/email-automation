import { PubSub } from "@google-cloud/pubsub";
import { gmail } from "./gmail-client.js";
import { monitorInvoices } from "./monitor-invoice.js";
import { pool } from "./db.js";

const pubsub = new PubSub();

const subscription = pubsub.subscription("gmail-notifications-subs");

subscription.on("message", async (message) => {
  try {
    const notification = JSON.parse(
      Buffer.from(message.data).toString("utf-8"),
    ) as {
      emailAddress?: string;
      historyId?: string;
    };

    const email = notification.emailAddress;
    const notificationHistoryId = notification.historyId;

    if (!email || !notificationHistoryId) {
      throw new Error("Invalid Gmail notification");
    }

    console.log("Pub/Sub message ID:", message.id);
    console.log("Gmail notification:", notification);

    const result = await pool.query(
      `SELECT history_id
       FROM gmail_sync_state
       WHERE email = $1`,
      [email],
    );

    const lastHistoryId: string | undefined = result.rows[0]?.history_id;

    if (!lastHistoryId) {
      throw new Error(`No history checkpoint found for ${email}`);
    }

    // Fetch all history pages since the last checkpoint.
    const messageIds = new Set<string>();
    let pageToken: string | undefined;

    do {
      const response = await gmail.users.history.list({
        userId: "me",
        startHistoryId: lastHistoryId,
        historyTypes: ["messageAdded"],
        ...(pageToken ? { pageToken } : {}),
      });

      for (const history of response.data.history ?? []) {
        for (const item of history.messagesAdded ?? []) {
          const id = item.message?.id;

          if (id) {
            messageIds.add(id);
          }
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    await monitorInvoices([...messageIds]);

    await pool.query(
      `UPDATE gmail_sync_state
       SET history_id = $1,
           updated_at = NOW()
       WHERE email = $2`,
      [notificationHistoryId, email],
    );

    message.ack();

    console.log(`Processed ${messageIds.size} messages for ${email}`);
  } catch (error) {
    console.error("Failed to process notification:", error);
    message.nack();
  }
});

subscription.on("error", (error) => {
  console.error("Pub/Sub subscription error:", error);
});

console.log("Listening for Gmail notifications...");

async function shutdown() {
  console.log("Shutting down worker...");

  await subscription.close();
  await pool.end();

  console.log("Worker stopped.");
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
