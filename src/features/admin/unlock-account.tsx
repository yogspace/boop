"use client";

import { Button, toast, useConfig, useDocumentInfo } from "@payloadcms/ui";
import { useState } from "react";

/**
 * “Unlock login” on an account's page. Too many wrong passwords lock an
 * account's login for a while (accounts/collection.ts, `lockTime`); this
 * ends that at once – the one thing the admin does to an account besides
 * deleting it. Payload's own button sits greyed out with the account's
 * fields, which are read-only here (src/access), so it gets its own, beside
 * the document's controls; admin.scss hides the greyed one.
 */
export const UnlockAccount = () => {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { data, docPermissions, id } = useDocumentInfo();
  const [busy, setBusy] = useState(false);

  const email = typeof data?.email === "string" ? data.email : "";
  const allowed = Boolean(
    docPermissions && "unlock" in docPermissions && docPermissions.unlock
  );
  if (!(id && email && allowed)) return null;

  const unlock = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${api}/accounts/unlock`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) toast.success("Login unlocked.");
      else toast.error(`Couldn't unlock the login (${response.status}).`);
    } catch {
      toast.error("Couldn't unlock the login.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      buttonStyle="secondary"
      disabled={busy}
      margin={false}
      onClick={unlock}
      size="medium"
      type="button"
    >
      {busy ? "Unlocking…" : "Unlock login"}
    </Button>
  );
};

export default UnlockAccount;
