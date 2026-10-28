import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import path from "node:path";
import { monitorInvoices } from "./monitor-invoice.js";
import { pool } from "./db.js";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

async function main() {
  const localAuth = await authenticate({
    keyfilePath: path.join(process.cwd(), "credentials.json"),
    scopes: SCOPES,
  });

  const auth = new google.auth.OAuth2();
  auth.setCredentials(localAuth.credentials);

  const gmail = google.gmail({ version: "v1", auth });

  try {
    await monitorInvoices(gmail);
  } catch (error) {
    console.error("Monitoring failed", error);
  } finally {
    await pool.end();

    console.log("Database connection closed");
  }
}

main().catch(console.error)
