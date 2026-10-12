import type { CSSProperties } from "react";
import { supportMode } from "@/access";

const band: CSSProperties = {
  padding: "calc(var(--base) * 0.6) var(--gutter-h)",
  background: "var(--theme-warning-150)",
  borderBottom: "1px solid var(--theme-warning-500)",
  color: "var(--theme-warning-850)",
  fontWeight: 600,
};

/**
 * The band on top of every admin page while support mode is on
 * (`ADMIN_SUPPORT=1`, src/access): people's content is readable then, and
 * nobody should forget it is. Asked on the server at each page – nothing
 * shows otherwise.
 */
export const SupportBanner = () =>
  supportMode() ? (
    <div role="status" style={band}>
      Support mode: personal content visible – calendars, stamps, prints, notes,
      invitations and notification devices can be read here (not changed). Take
      ADMIN_SUPPORT out of the server's environment when done.
    </div>
  ) : null;

export default SupportBanner;
