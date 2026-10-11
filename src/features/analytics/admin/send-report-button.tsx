"use client";

import { Button } from "@payloadcms/ui";
import { useState } from "react";

type Status = "idle" | "sending" | "done" | "error";

/**
 * Sends the report now (the stats-digest route with ?force=1), authorized by
 * the admin session. A forced send ignores the interval and “off” and does
 * not move the schedule – for trying out the mail.
 */
export const SendReportButton = () => {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const trigger = async () => {
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/next/cron/stats-digest?force=1", {
        credentials: "include",
      });
      const data = (await response.json()) as {
        total?: number;
        error?: string;
      };
      if (response.ok) {
        setStatus("done");
        setMessage(`Report sent (${data.total ?? 0} views in the period).`);
      } else {
        setStatus("error");
        setMessage(data.error ?? "Sending failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error.");
    }
  };

  return (
    <div className="field-type">
      <Button
        buttonStyle="subtle"
        className="boop-viz-button"
        disabled={status === "sending"}
        margin={false}
        onClick={trigger}
        size="medium"
        type="button"
      >
        {status === "sending" ? "Sending …" : "Send the report now"}
      </Button>
      {message ? (
        <p
          style={{
            marginTop: 8,
            color:
              status === "error"
                ? "var(--theme-error-500)"
                : "var(--theme-elevation-400)",
          }}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
};
