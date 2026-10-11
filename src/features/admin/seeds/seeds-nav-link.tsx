"use client";

import { useConfig } from "@payloadcms/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SEEDS_PATH } from "./definitions";

/** “Seeds” at the end of the admin's navigation, in Payload's own look. */
export const SeedsNavLink = () => {
  const {
    config: {
      routes: { admin },
    },
  } = useConfig();
  const pathname = usePathname();
  const href = `${admin}${SEEDS_PATH}`;

  return (
    <Link className="nav__link" href={href} id="nav-seeds">
      {pathname === href && <div className="nav__link-indicator" />}
      <span className="nav__link-label">Seeds</span>
    </Link>
  );
};

export default SeedsNavLink;
