import { serverUrl } from "./server-url";

/**
 * The frame of Boop's mails to people: warm paper, a white card, one big
 * button – tables and inline styles, so every mail program shows it alike.
 * The texts come escaped from the caller's data (`escapeHtml`).
 */

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const PAPER = "#fff4e8";
const INK = "#1f1d2b";
const MUTED = "#6b6878";
const BUTTON = "#ff7a59";
const FONT =
  "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const mailLayout = ({
  lang,
  preheader,
  title,
  paragraphs,
  button,
  footnote,
}: {
  lang: string;
  /** The preview line under the subject in the inbox. */
  preheader: string;
  title: string;
  /** Plain text, escaped here. */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Small print under the card, plain text. */
  footnote?: string;
}) => {
  const site = serverUrl();
  const host = site.replace(/^https?:\/\//, "");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 8px 16px;font-family:${FONT};font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.02em;">boop<span style="color:${BUTTON};">.</span></td></tr>
<tr><td style="background:#ffffff;border:2px solid ${INK};border-radius:20px;padding:28px 24px;font-family:${FONT};color:${INK};">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:800;">${escapeHtml(title)}</h1>
${paragraphs
  .map(
    (text) =>
      `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:${INK};">${escapeHtml(text)}</p>`
  )
  .join("\n")}
${
  button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;"><tr><td style="background:${BUTTON};border:2px solid ${INK};border-radius:999px;">
<a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;font-weight:800;color:${INK};text-decoration:none;">${escapeHtml(button.label)}</a>
</td></tr></table>
<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">${escapeHtml(button.url)}</p>`
    : ""
}
</td></tr>
<tr><td style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">
${footnote ? `${escapeHtml(footnote)}<br>` : ""}<a href="${escapeHtml(site)}" style="color:${MUTED};">${escapeHtml(host)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};
