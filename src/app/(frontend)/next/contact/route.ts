import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * The contact form in the imprint (features/legal/contact-form.tsx): name,
 * email and message go by mail to MAIL_CONTACT_RECIPIENT (via Resend) –
 * nothing is stored. It answers with a status alone (the `error` is for
 * the log): the form says it in the visitor's words (`contact` in the
 * dictionary, editable in the CMS).
 */
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// At most five messages per IP in ten minutes.
const tooMany = rateLimit({ limit: 5, windowMs: 10 * 60 * 1000 });

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const POST = async (request: Request) => {
  if (tooMany(clientIp(request))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Not an object");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Honeypot: a field people never see – bots fill it. Pretend success.
  if (text(body.website)) return NextResponse.json({ ok: true });

  // One line for the subject, however the name was typed.
  const name = text(body.name).replace(/\s+/g, " ");
  const email = text(body.email);
  const message = text(body.message);
  if (!(name && message && EMAIL.test(email))) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (name.length > 200 || email.length > 200 || message.length > 5000) {
    return NextResponse.json({ error: "Too long" }, { status: 400 });
  }

  // The recipient comes from the server's environment – never from the form.
  const recipient = process.env.MAIL_CONTACT_RECIPIENT;
  if (!(recipient && EMAIL.test(recipient))) {
    return NextResponse.json(
      { error: "No recipient configured" },
      { status: 500 }
    );
  }

  // For the operator alone – in German, like the statistics report: no
  // interface text, so not in the CMS. The message goes as it was typed.
  const result = await sendMail({
    to: recipient,
    replyTo: email,
    subject: `Boop · Kontakt: ${name}`,
    text: `Von: ${name} <${email}>\n\n${message}`,
  });
  if (!result.ok) {
    const status = result.error === "Mail not configured" ? 500 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
};
