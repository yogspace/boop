import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import type { CSSProperties } from "react";
import { isAdmin } from "@/access";
import { SeedsRunner } from "./seeds-runner";

const page: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
  maxWidth: "56rem",
  paddingBlock: "2.5rem",
};

const flat: CSSProperties = { margin: 0 };

/**
 * The admin's Seeds page: what the code brings along for the CMS – for now
 * the imprint and privacy policy – run by hand, not at start or deploy.
 */
export const SeedsView = ({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) => {
  const { req, locale, permissions, visibleEntities } = initPageResult;

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <div style={page}>
          <h1 style={flat}>Seeds</h1>
          {isAdmin(req) ? (
            <>
              <p style={flat}>
                Fills the CMS with what the code brings along. Fill never
                overwrites what was written here and can be run again.
              </p>
              <SeedsRunner />
            </>
          ) : (
            <p style={flat}>Please log in as an admin first.</p>
          )}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
};

export default SeedsView;
