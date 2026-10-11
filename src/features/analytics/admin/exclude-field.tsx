"use client";

import { Button } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";
import { deviceExcludeToken, setDeviceExcludeToken } from "../client";

type State = { excluded: boolean; hasToken: boolean };

const muted = { color: "var(--theme-elevation-400)" } as const;

const post = async (body: Record<string, unknown>) => {
  const response = await fetch("/next/analytics-exclude", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as Record<string, unknown>;
};

/**
 * “Don't count this device” – puts the own-devices token on the device one is
 * in the admin with, or takes it away (see ../exclude.ts). Once per own
 * device: log in, press here; afterwards it is not counted, even logged out.
 * “New token” makes every earlier one worthless.
 */
export const AnalyticsExcludeField = () => {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const status = await post({
        action: "status",
        token: deviceExcludeToken(),
      });
      setState({
        excluded: status.excluded === true,
        hasToken: status.hasToken === true,
      });
    } catch {
      setError("Status could not be loaded.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: "exclude" | "include" | "rotate") => {
    if (
      action === "rotate" &&
      !window.confirm(
        "Create a new token?\n\nEvery other device that is excluded right now will be counted again until you exclude it anew. This device stays excluded."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (action === "include") {
        setDeviceExcludeToken(null);
      } else {
        const { token } = await post({ action });
        if (typeof token !== "string") throw new Error("No token");
        setDeviceExcludeToken(token);
      }
      await load();
    } catch {
      setError("That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field-type">
      <p style={{ ...muted, fontSize: 13, margin: "0 0 12px" }}>
        {state === null
          ? "Loading …"
          : state.excluded
            ? "This device is excluded – its visits are not counted, even when logged out."
            : "This device is counted when logged out."}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {state?.excluded ? (
          <Button
            buttonStyle="subtle"
            className="boop-viz-button"
            disabled={busy}
            margin={false}
            onClick={() => run("include")}
            size="medium"
            type="button"
          >
            Count this device again
          </Button>
        ) : (
          <Button
            buttonStyle="subtle"
            className="boop-viz-button"
            disabled={busy || state === null}
            margin={false}
            onClick={() => run("exclude")}
            size="medium"
            type="button"
          >
            Don't count this device
          </Button>
        )}
        {state?.hasToken && (
          <Button
            buttonStyle="subtle"
            className="boop-viz-button"
            disabled={busy}
            margin={false}
            onClick={() => run("rotate")}
            size="medium"
            type="button"
          >
            New token (invalidates all devices)
          </Button>
        )}
      </div>
      {error && (
        <p style={{ marginTop: 8, color: "var(--theme-error-500)" }}>{error}</p>
      )}
    </div>
  );
};
