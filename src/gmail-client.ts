import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import path from "node:path";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const localAuth = await authenticate({
  keyfilePath: path.join(process.cwd(), "credentials.json"),
  scopes: SCOPES,
});

const auth = new google.auth.OAuth2();
auth.setCredentials(localAuth.credentials);

export const gmail = google.gmail({ version: "v1", auth });
