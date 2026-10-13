"use client";

import {
  Button,
  ConfirmationModal,
  toast,
  useConfig,
  useDocumentInfo,
  useFormModified,
  useModal,
} from "@payloadcms/ui";
import { useState } from "react";

/**
 * “Send to everyone…” on a gift's page (gifts.ts) – beside the document's
 * controls, asked once more before it goes: it can't be taken back. Only
 * what is saved goes out, so a gift with changes waiting says “save
 * first”.
 */

const MODAL = "send-gift";

export const SendGift = () => {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { id, savedDocumentData } = useDocumentInfo();
  const modified = useFormModified();
  const { openModal } = useModal();
  const [busy, setBusy] = useState(false);
  if (!id) return null;

  const name =
    typeof savedDocumentData?.name === "string" ? savedDocumentData.name : "";
  const ready = Boolean(savedDocumentData?.drawing);
  const sentAt =
    typeof savedDocumentData?.sentAt === "string"
      ? new Date(savedDocumentData.sentAt).toLocaleString()
      : null;

  const send = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${api}/gifts/${id}/send`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await response.json().catch(() => ({}))) as {
        accounts?: number;
        error?: string;
      };
      if (response.ok) {
        toast.success(
          `On its way to ${body.accounts ?? 0} accounts. “Sent to” fills in once all have it – reload in a moment.`
        );
      } else {
        toast.error(body.error ?? `Couldn't send it (${response.status}).`);
      }
    } catch {
      toast.error("Couldn't send it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        buttonStyle="secondary"
        disabled={busy || modified || !ready}
        margin={false}
        onClick={() => openModal(MODAL)}
        size="medium"
        tooltip={
          modified
            ? "Save first – only what is saved goes out."
            : ready
              ? undefined
              : "Paste a card's link and save first."
        }
        type="button"
      >
        {busy ? "Sending…" : "Send to everyone…"}
      </Button>
      <ConfirmationModal
        body={
          <p>
            Every account with a confirmed address gets “{name}” as a stamp of
            its own, sees it in the app and – if they want – as a
            notification.{" "}
            {sentAt
              ? `It went out before (${sentAt}): only those without it get it now.`
              : "Accounts that have it already are left out."}{" "}
            It can't be taken back.
          </p>
        }
        confirmingLabel="Sending…"
        confirmLabel="Send"
        heading="Send this gift to everyone?"
        modalSlug={MODAL}
        onConfirm={send}
      />
    </>
  );
};

export default SendGift;
