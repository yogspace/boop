"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ComponentProps,
  type MouseEvent,
  useCallback,
  useLayoutEffect,
} from "react";

/**
 * Page transitions with the browser's View Transitions API: the old page is
 * captured, the router navigates, and once the new page is on screen
 * (`TransitionDone` sees the new path) the browser animates between them –
 * see `::view-transition-*` in styles.css. Browsers without the API simply
 * navigate.
 */

let finish: (() => void) | null = null;

type Router = ReturnType<typeof useRouter>;

const go = (router: Router, href: string, replace = false) => {
  const move = () => (replace ? router.replace(href) : router.push(href));
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    move();
    return;
  }
  document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
        move();
        // Never hold the page longer than this.
        setTimeout(resolve, 1500);
      })
  );
};

/** Navigating with a transition – for code (after a login, a logout …). */
export const useTransitionRouter = () => {
  const router = useRouter();
  return {
    push: useCallback((href: string) => go(router, href), [router]),
    replace: useCallback((href: string) => go(router, href, true), [router]),
  };
};

/** A link that changes pages with the transition. */
export const Link = ({
  onClick,
  ...props
}: ComponentProps<typeof NextLink>) => {
  const router = useRouter();
  return (
    <NextLink
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        const href = typeof props.href === "string" ? props.href : null;
        if (
          event.defaultPrevented ||
          !href ||
          href.startsWith("http") ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.button !== 0 ||
          props.target
        ) {
          return;
        }
        event.preventDefault();
        go(router, href, Boolean(props.replace));
      }}
    />
  );
};

/** Ends a running transition once the new page is rendered. */
export const TransitionDone = () => {
  const pathname = usePathname();
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs for every new path – that is the signal
  useLayoutEffect(() => {
    finish?.();
    finish = null;
  }, [pathname]);
  return null;
};
