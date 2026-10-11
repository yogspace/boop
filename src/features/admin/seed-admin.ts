import type { Payload } from "payload";

/**
 * The first admin from the environment (PAYLOAD_ADMIN_EMAIL and
 * PAYLOAD_ADMIN_PASSWORD), created at start as long as there is none.
 *
 * Without it, /admin would offer “create first user” to whoever comes first –
 * on a public site that must not be a race. Once the admin exists, both
 * variables can go; they are never read again.
 */
export const seedAdmin = async (payload: Payload) => {
  const { totalDocs } = await payload.count({
    collection: "users",
    overrideAccess: true,
  });
  if (totalDocs > 0) return;

  const email = process.env.PAYLOAD_ADMIN_EMAIL;
  const password = process.env.PAYLOAD_ADMIN_PASSWORD;
  if (!(email && password)) {
    if (process.env.NODE_ENV === "production") {
      payload.logger.warn(
        "No admin yet and PAYLOAD_ADMIN_EMAIL/PASSWORD not set – /admin offers “create first user” to anyone."
      );
    }
    return;
  }
  await payload.create({
    collection: "users",
    data: { email, password },
    overrideAccess: true,
  });
  payload.logger.info(`Admin ${email} created.`);
};
