import type { gmail_v1 } from "googleapis";
import { saveInvoiceEmail } from "./insert.js";

export const monitorInvoices = async (gmail: gmail_v1.Gmail) => {
  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 5,
    labelIds: ["INBOX"],
    q: "is:unread canva",
  });

  const messages = response.data.messages ?? [];

  if (messages.length === 0) {
    console.log("No emails found in your inbox");
    return;
  }

  let saved = 0;
  let failed = 0;

  for (const message of messages) {
    if (!message.id) continue;

    try {
      const result = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = result.data.payload?.headers ?? [];

      const getHeader = (name: string) =>
        headers.find(
          (header) => header.name?.toLowerCase() === name.toLowerCase(),
        )?.value ?? "";

      const gmailMessageId = result.data.id;

      if (!gmailMessageId) {
        throw new Error("Gmail message id is missing");
      }

      const email = {
        gmailMessageId,
        sender: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: result.data.snippet ?? "",
      };

      await saveInvoiceEmail(email);
      saved++;
    } catch (error) {
      failed++;
      console.error(`Failed to process message ${message.id}:`, error);
    }
  }

  console.log({
    matched: messages.length,
    processed: saved,
    failed,
  });
};
