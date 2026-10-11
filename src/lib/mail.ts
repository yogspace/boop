/**
 * Outgoing mail via the Resend HTTP API (port 443 – the server blocks SMTP).
 * Configured by RESEND_API_KEY and MAIL_FROM; without them nothing is sent
 * and the caller learns so. The accounts' mails (verification, password
 * reset) go through Payload's email adapter instead (payload.config.ts).
 */
type SendMailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Pictures in the mail – shown where the HTML says `cid:<contentId>`. */
  inline?: { filename: string; contentId: string; content: Buffer }[];
};

type SendMailResult = { ok: true } | { ok: false; error: string };

export const sendMail = async ({
  to,
  subject,
  text,
  html,
  replyTo,
  inline,
}: SendMailArgs): Promise<SendMailResult> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) return { ok: false, error: "Mail not configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        ...(html && { html }),
        ...(replyTo && { reply_to: replyTo }),
        ...(inline?.length && {
          attachments: inline.map((file) => ({
            filename: file.filename,
            content: file.content.toString("base64"),
            content_id: file.contentId,
          })),
        }),
      }),
    });
    if (!response.ok) {
      // The real error goes to the log, never to the caller.
      console.error(
        "[mail] Resend failed:",
        response.status,
        await response.text()
      );
      return { ok: false, error: "Send failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[mail] Resend request failed:", error);
    return { ok: false, error: "Send failed" };
  }
};

/** “Boop <hello@example.com>” → name and address, for Payload's adapter. */
export const mailSender = () => {
  const from = process.env.MAIL_FROM ?? "";
  const match = from.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return match
    ? { name: match[1] || "Boop", address: match[2] }
    : { name: "Boop", address: from };
};
