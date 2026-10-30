import { gmail } from "./gmail-client.js";

export interface PdfAttachment {
  filename: string;
  base64: string;
}

export interface EmailData {
  messageId: string;
  sender: string;
  subject: string;
  date: string;
  emailBody: string;
  attachments: PdfAttachment[];
}

function getHeader(
  headers: { name?: string | null; value?: string | null }[],
  name: string,
): string {
  return (
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface BodyParts {
  text: string;
  html: string;
}

function extractBodyParts(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null; size?: number | null } | null;
    parts?: (typeof payload)[] | null;
  },
  result: BodyParts = { text: "", html: "" },
): BodyParts {
  const mime = payload.mimeType?.toLowerCase() ?? "";

  if (mime === "text/plain" && payload.body?.data) {
    result.text += decodeBase64Url(payload.body.data);
  } else if (mime === "text/html" && payload.body?.data) {
    result.html += decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      extractBodyParts(part, result);
    }
  }

  return result;
}

interface AttachmentRef {
  filename: string;
  attachmentId: string;
}

function collectPdfAttachmentRefs(
  payload: {
    filename?: string | null;
    mimeType?: string | null;
    body?: {
      attachmentId?: string | null;
      size?: number | null;
    } | null;
    parts?: (typeof payload)[] | null;
  },
  refs: AttachmentRef[] = [],
): AttachmentRef[] {
  if (
    payload.body?.attachmentId &&
    payload.filename &&
    payload.mimeType === "application/pdf"
  ) {
    refs.push({
      filename: payload.filename,
      attachmentId: payload.body.attachmentId,
    });
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      collectPdfAttachmentRefs(part, refs);
    }
  }

  return refs;
}

export async function readEmail(messageId: string): Promise<EmailData> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = response.data;
  const payload = message.payload;

  if (!payload) {
    throw new Error(`Message ${messageId} has no payload`);
  }

  const headers = payload.headers ?? [];

  const bodyParts = extractBodyParts(payload);
  const emailBody = bodyParts.text || stripHtml(bodyParts.html);

  const refs = collectPdfAttachmentRefs(payload);

  const attachments: PdfAttachment[] = await Promise.all(
    refs.map(async (ref) => {
      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: ref.attachmentId,
      });

      const rawData = att.data.data;
      if (!rawData) {
        throw new Error(
          `Attachment "${ref.filename}" in message ${messageId} returned no data`,
        );
      }

      const base64 = rawData.replace(/-/g, "+").replace(/_/g, "/");

      return {
        filename: ref.filename,
        base64,
      };
    }),
  );

  const rawDate = getHeader(headers, "Date");
  let isoDate: string;
  try {
    isoDate = new Date(rawDate).toISOString();
  } catch {
    isoDate = rawDate;
  }

  return {
    messageId: message.id ?? messageId,
    sender: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject"),
    date: isoDate,
    emailBody,
    attachments,
  };
}
