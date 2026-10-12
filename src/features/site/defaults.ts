// Client-safe: plain data and types, no server code.

/**
 * The site's link and the owner's address as the code knows them – the
 * defaults of the “Site” global (global.ts), and what the pages fall back to
 * while the global is empty or the database is out of reach.
 */
export type SiteLinks = {
  /** mxwr.de – the owner's website. */
  website: string;
};

export type SiteAddress = {
  name: string;
  street: string;
  /** Postcode and city, e.g. “64289 Darmstadt”. */
  city: string;
  country: string;
};

export type SiteContent = {
  links: SiteLinks;
  address: SiteAddress;
};

export const SITE_DEFAULTS: SiteContent = {
  links: {
    // The origin in the URL, so visits from here show up in mxwr.de's
    // statistics – even when a browser strips the referrer.
    website: "https://mxwr.de/?utm_source=boop.mxwr.de&utm_medium=referral",
  },
  address: {
    name: "Maximilian Weber",
    street: "Waltherstraße 2",
    city: "64289 Darmstadt",
    country: "Deutschland",
  },
};

export const SITE_LINK_LABELS: Record<keyof SiteLinks, string> = {
  website: "Website (mxwr.de)",
};
