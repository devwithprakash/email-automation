import { pool } from "./db.js";

type InvoiceEmailInput = {
  gmailMessageId: string;
  sender: string;
  subject: string;
  emailDate: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: number;
  currency: string | null;
};

export async function saveInvoiceEmail(email: InvoiceEmailInput) {
  await pool.query(
    `INSERT INTO invoice_emails (
      gmail_message_id,
      sender,
      subject,
      email_date,
      vendor_name,
      invoice_number,
      total_amount,
      currency
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (gmail_message_id) DO NOTHING`,
    [
      email.gmailMessageId,
      email.sender,
      email.subject,
      email.emailDate ? new Date(email.emailDate) : null,
      email.vendorName,
      email.invoiceNumber,
      email.totalAmount,
      email.currency,
    ],
  );
}
