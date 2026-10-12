import type { EmailAdapter } from "payload";

/**
 * Mail without Resend (locally): nothing is sent – the recipient, the
 * subject and the mail's links go to the server log, so confirming an
 * address or choosing a new password can be clicked through from there.
 */
export const devMailAdapter =
  (): EmailAdapter =>
  ({ payload }) => ({
    name: "dev-log",
    defaultFromAddress: "boop@localhost",
    defaultFromName: "Boop",
    sendEmail: async (message) => {
      const html = String(message.html ?? "");
      const links = [
        ...new Set(
          [...html.matchAll(/href="([^"]+)"/g)].map((match) =>
            match[1].replace(/&amp;/g, "&")
          )
        ),
      ].filter((link) => link.includes("token="));
      payload.logger.info(
        `✉ To ${String(message.to)} – ${String(message.subject)}${links.map((link) => `\n   ${link}`).join("")}`
      );
    },
  });
