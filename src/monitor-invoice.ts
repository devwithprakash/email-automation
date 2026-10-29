import { saveInvoiceEmail } from "./insert.js";
import { gmail } from "./gmail-client.js";

const INVOICE_QUERY =
  'newer_than:2d {invoice receipt billing "payment receipt" "payment confirmation" "order confirmation" "tax invoice" statement purchase transaction}';

async function fetchInvoiceIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;

  do {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: INVOICE_QUERY,
      ...(pageToken ? { pageToken } : {}),
    });

    for (const msg of response.data.messages ?? []) {
      if (msg.id) ids.add(msg.id);
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return ids;
}

export const monitorInvoices = async (messageIds: string[]) => {
  if (messageIds.length === 0) return;

  const invoiceIds = await fetchInvoiceIds();
  const invoiceMessageIds = messageIds.filter((id) => invoiceIds.has(id));

  let saved = 0;
  const skipped = messageIds.length - invoiceMessageIds.length;
  let failed = 0;

  for (const messageId of invoiceMessageIds) {
    try {
      const result = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
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
      console.error(`Failed to process message ${messageId}:`, error);
    }
  }

  console.log({
    matched: messageIds.length,
    processed: saved,
    skipped,
    failed,
  });
};
