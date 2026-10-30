import { saveInvoiceEmail } from "./insert.js";
import { gmail } from "./gmail-client.js";
import { readEmail } from "./read-email.js";
import { extractInvoice } from "./invoice-agent.js";
import { pool } from "./db.js";

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
      const exists = await pool.query(
        `SELECT 1 FROM invoice_emails WHERE gmail_message_id = $1`,
        [messageId],
      );

      if (exists.rows.length > 0) {
        console.log(`Already processed, skipping: ${messageId}`);
        continue;
      }
      const email = await readEmail(messageId);

      const invoice = await extractInvoice({
        sender: email.sender,
        subject: email.subject,
        emailBody: email.emailBody,
        attachments: email.attachments,
      });

      if (!invoice.is_invoice) {
        console.log(`Skipping non-invoice email: ${messageId}`);
        continue;
      }

      if (invoice.total_amount === null) {
        throw new Error(`Invoice total could not be extracted: ${messageId}`);
      }

      await saveInvoiceEmail({
        gmailMessageId: email.messageId,
        sender: email.sender,
        subject: email.subject,
        emailDate: email.date,
        vendorName: invoice.vendor_name,
        invoiceNumber: invoice.invoice_number,
        totalAmount: invoice.total_amount,
        currency: invoice.currency,
      });
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
