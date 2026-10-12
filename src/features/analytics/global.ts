import type { Field, GlobalConfig } from "payload";
import { adminOnly } from "@/access";

/** A view of the admin as a field of its own (`ui`: no data). */
const view = (name: string, Field: string): Field => ({
  name,
  type: "ui",
  admin: { components: { Field } },
});

const ADMIN = "@/features/analytics/admin";

/**
 * The statistics in the admin. The views read the anonymous page views and
 * actions over the REST API (admin/data.ts), the accounts as totals
 * (admin/accounts.tsx); data of its own is only what steers the mail report
 * (interval, last sent) and the token of the excluded devices.
 *
 * Main area: the numbers. Sidebar: what steers them – the range for ALL
 * sections, the mail report, one's own devices.
 */
export const Analytics: GlobalConfig = {
  slug: "analytics",
  label: "Analytics",
  access: {
    read: adminOnly,
    update: adminOnly,
  },
  admin: {
    group: "Analytics",
    description:
      "Anonymous page views and actions (no IP, nothing stored on visitors' devices), and accounts as totals only. The time range in the sidebar applies to every section.",
  },
  fields: [
    {
      type: "collapsible",
      label: "Overview",
      fields: [view("overview", `${ADMIN}/overview#AnalyticsOverview`)],
    },
    {
      type: "collapsible",
      label: "Visitors",
      fields: [view("visitors", `${ADMIN}/visitors#AnalyticsVisitors`)],
    },
    {
      type: "collapsible",
      label: "Actions",
      fields: [view("actions", `${ADMIN}/actions#AnalyticsActions`)],
    },
    {
      type: "collapsible",
      label: "Accounts",
      fields: [view("accounts", `${ADMIN}/accounts#AnalyticsAccounts`)],
    },
    {
      // Unnamed groups: only a heading and a line in the sidebar, no nesting
      // of the data.
      type: "group",
      label: "Time range",
      admin: { position: "sidebar" },
      fields: [view("range", `${ADMIN}/range#AnalyticsRange`)],
    },
    {
      type: "group",
      label: "Email report",
      admin: { position: "sidebar" },
      fields: [
        {
          name: "reportInterval",
          type: "select",
          label: "How often the report is sent",
          defaultValue: "off",
          options: [
            { label: "Off (no report)", value: "off" },
            { label: "Daily", value: "daily" },
            { label: "Weekly", value: "weekly" },
            { label: "Monthly", value: "monthly" },
          ],
          admin: {
            description:
              '"Off" disables the report. Takes effect without a redeploy.',
          },
        },
        {
          name: "lastDigestAt",
          type: "date",
          label: "Last sent",
          // Only the report cron writes it (local API). Through the form an
          // outdated value would go back if it was open while a report went
          // out and saved afterwards.
          access: { update: () => false },
          admin: {
            readOnly: true,
            date: {
              pickerAppearance: "dayAndTime",
              displayFormat: "dd.MM.yyyy HH:mm",
            },
            description: "Set automatically whenever a report has gone out.",
          },
        },
        view("sendReport", `${ADMIN}/send-report-button#SendReportButton`),
      ],
    },
    {
      type: "group",
      label: "Own devices",
      admin: { position: "sidebar" },
      fields: [
        view("excludeDevice", `${ADMIN}/exclude-field#AnalyticsExcludeField`),
        {
          // The current own-devices token. Written and read ONLY on the
          // server (exclude.ts): closed over REST so it never reaches a
          // browser through the form, and so saving this form cannot
          // overwrite a token that was rotated while the form was open.
          name: "analyticsExcludeToken",
          type: "text",
          access: { read: () => false, update: () => false },
          admin: { hidden: true },
        },
      ],
    },
  ],
};
