import { pool } from "./db.js";
import { gmail } from "./gmail-client.js";

const topicName = "projects/gmail-automation-512915/topics/gmail-notifications";

async function startGmailWatch() {
  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    },
  });

  const historyId = response.data.historyId;

  if (!historyId) {
    throw new Error("Gmail did not return a history ID");
  }

  // Get the authenticated Gmail account's email address.
  const profile = await gmail.users.getProfile({
    userId: "me",
  });

  const email = profile.data.emailAddress;

  if (!email) {
    throw new Error("Could not retrieve the Gmail account email");
  }

  await pool.query(
    `INSERT INTO gmail_sync_state (email, history_id)
     VALUES ($1, $2)
     ON CONFLICT (email)
     DO UPDATE SET
       history_id = EXCLUDED.history_id,
       updated_at = NOW()`,
    [email, historyId],
  );

  console.log("Gmail watch started");
  console.log("History ID: ", response.data.historyId);
  console.log("Expiration: ", response.data.expiration);
}

startGmailWatch()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
