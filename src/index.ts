import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import path from "node:path";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

async function main() {
  const localAuth = await authenticate({
    keyfilePath: path.join(process.cwd(), "credentials.json"),
    scopes: SCOPES,
  });

  const auth = new google.auth.OAuth2();
  auth.setCredentials(localAuth.credentials);

  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 5,
    labelIds: ["INBOX"],
    q: "is:unread canva"
  });

  const messages = response.data.messages ?? [];

  if (messages.length === 0) {
    console.log("No emails found in your inbox");
    return;
  }

  const emails = await Promise.all(
    messages.map(async ({ id }) => {
      if (!id) return null;

      const result = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = result.data.payload?.headers ?? [];

      const getHeader = (name: string) =>
        headers.find(
          (header) => header.name?.toLowerCase() === name.toLowerCase(),
        )?.value ?? "";

      return {
        id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: result.data.snippet ?? "",
      };
    }),
  );

  console.dir(emails.filter(Boolean), { depth: null });
}

main().catch(console.error);
