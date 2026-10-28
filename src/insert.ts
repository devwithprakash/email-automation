import { pool } from "./db.js";

export async function saveInvoiceEmail(email: {
  gmailMessageId: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
}) {
  const emailDate = email.date ? new Date(email.date) : null;

  await pool.query(
    `INSERT INTO invoice_emails (gmail_message_id, sender, subject, date, snippet) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (gmail_message_id) DO NOTHING`,
    [
      email.gmailMessageId,
      email.sender,
      email.subject,
      emailDate && !Number.isNaN(emailDate.getTime()) ? emailDate : null,
      email.snippet,
    ],
  );
}
