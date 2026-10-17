/**
 * An invitation opened before logging in – taken up after the login:
 * following its link was the yes. The invitation's page keeps it on the
 * device (invite.tsx); logging in, or a new password, takes it up.
 */

const INVITE_KEY = "boop-invite";

export const pendingInvite = {
  get: () => {
    try {
      return localStorage.getItem(INVITE_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(INVITE_KEY, token);
      else localStorage.removeItem(INVITE_KEY);
    } catch {
      // No storage – an invitation to the account's own address still
      // waits in the app.
    }
  },
};

export const acceptInvite = async (token: string) => {
  const response = await fetch(
    `/api/invites/${encodeURIComponent(token)}/accept`,
    { method: "POST", credentials: "include" }
  ).catch(() => null);
  return Boolean(response?.ok);
};

/** After any login: an invitation waiting on this device is taken up. */
export const afterLogin = async () => {
  const token = pendingInvite.get();
  if (!token) return;
  await acceptInvite(token);
  pendingInvite.set(null);
};
