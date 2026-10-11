/** The public address, without a trailing slash – for links in mails. */
export const serverUrl = () =>
  (process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
