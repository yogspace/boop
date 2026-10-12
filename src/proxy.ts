import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

/**
 * Every page lives under its language (/de, /en). A path without one goes to
 * the visitor's language (Accept-Language), German otherwise. The admin,
 * the API, the internal routes and files are left alone (matcher below).
 *
 * The app is one page per language: whatever follows /de/app – a calendar
 * and its view, /de/app/familie/heute – gets the page of /de/app. Rewritten,
 * not redirected: the address stays as it is, and the browser reads it
 * (features/app/address.ts). One page to build, keep and cache, not one per
 * address.
 */
export const proxy = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  const [, first, section, ...rest] = pathname.split("/");
  if (isLocale(first)) {
    if (section !== "app" || rest.length === 0) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/${first}/app`;
    return NextResponse.rewrite(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${preferred(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
};

const preferred = (request: NextRequest) => {
  const header = request.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
};

export const config = {
  // Not: admin, api, internal routes, Next's files, files with an extension
  // (icons, sw.js, robots.txt, sitemap.xml …).
  matcher: ["/((?!admin|api|next|_next|.*\\..*).*)"],
};
