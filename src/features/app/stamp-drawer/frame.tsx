import { m } from "motion/react";
import { type ReactNode, type RefObject, useSyncExternalStore } from "react";
import { Bang, Cross } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { Button, ROUND_BUTTON } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { FADING, useFadingEdges } from "../fading-edges";

/**
 * The editor's frame (stamp-drawer.tsx): how it lies and comes and goes,
 * its title, and the question before what is drawn is thrown away.
 */

/**
 * Side by side – the stage on the left, what to set beside it: wide enough,
 * and wider than tall. Else one under the other, on the whole screen.
 */
const SIDE = "(min-width: 48rem) and (min-aspect-ratio: 1/1)";

const watchSide = (change: () => void) => {
  const query = matchMedia(SIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
export const useSideBySide = () =>
  useSyncExternalStore(
    watchSide,
    () => matchMedia(SIDE).matches,
    () => true
  );

/**
 * Side by side, two sets of controls in one place, one of them showing: one
 * fades away, then the other comes, and the taller one sets the height – so
 * nothing around them moves. Where the room is too small, each scrolls on
 * its own (`grid-rows-1` on the place they share): the stamp's come from
 * their top, never from where the drawing's were scrolled to – down at the
 * button that made it 3D, past everything they have.
 */
const layer = (on: boolean) =>
  cn(
    "col-start-1 row-start-1 min-h-0 min-w-0 overflow-y-auto transition-[opacity,visibility] duration-200",
    FADING.y,
    on ? "delay-150" : "invisible opacity-0"
  );

/**
 * How the editor comes and goes: on a phone (one under the other) it slides
 * up from below and fills the screen; side by side it lies down in the
 * middle, like a sheet (sheet.tsx).
 */
const PHONE = {
  initial: { y: "100%", opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { ...SPRING.soft, opacity: { duration: 0.15 } },
  },
  exit: {
    y: "100%",
    opacity: 0,
    transition: {
      duration: 0.24,
      ease: [0.4, 0, 0.9, 0.5],
      opacity: { duration: 0.12, delay: 0.12 },
    },
  },
} as const;
const DESKTOP = {
  initial: { y: 16, scale: 0.96, opacity: 0 },
  animate: {
    y: 0,
    scale: 1,
    opacity: 1,
    transition: { ...SPRING.soft, opacity: { duration: 0.2 } },
  },
  exit: {
    y: 8,
    scale: 0.96,
    opacity: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
} as const;

/**
 * Watch out, like the other questions that throw something away: a thick
 * frame and an exclamation mark – over the drawing, where it is seen (on a
 * phone as far in as the drawing, its frame's room at the sides).
 */
export const LeaveQuestion = ({
  titleId,
  editing,
  side,
  locale,
  onLeave,
  onStay,
}: {
  titleId: string;
  /** A stamp of one's own, drawn anew – its changes would go. */
  editing: boolean;
  side: boolean;
  locale: Locale;
  onLeave: () => void;
  onStay: () => void;
}) => {
  const t = dictionaryOf(locale);
  return (
    <div
      aria-labelledby={`${titleId}-leave`}
      className={cn(
        "scribble scribble-bold absolute top-3 z-30 flex animate-fade flex-col gap-3 rounded-2xl p-4",
        side ? "inset-x-3" : "inset-x-3.5"
      )}
      role="alertdialog"
    >
      <p className="flex items-start gap-2.5 font-bold" id={`${titleId}-leave`}>
        <Bang className="h-6 w-6 shrink-0" />
        {editing ? t.app.draw.editLeaveTitle : t.app.draw.leaveTitle}
      </p>
      <p className="font-medium text-muted text-sm">
        {editing ? t.app.draw.editLeaveText : t.app.draw.leaveText}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onLeave} size="sm" variant="ghost">
          {t.app.draw.leaveGo}
        </Button>
        <Button autoFocus onClick={onStay} size="sm" variant="plain">
          {t.app.draw.leaveStay}
        </Button>
      </div>
    </div>
  );
};

/**
 * The frame round it all: on a phone a page that scrolls, the stage and its
 * bar staying at the top; side by side a sheet, the controls beside them.
 */
export const EditorFrame = ({
  side,
  going,
  draws,
  titleId,
  title,
  onClose,
  page,
  stage,
  bar,
  drawSet,
  stampSet,
  question,
  ghost,
}: {
  side: boolean;
  /** On its way out – nothing in it answers any more. */
  going: boolean;
  /** Drawing – else made 3D, the last step. */
  draws: boolean;
  titleId: string;
  title: string;
  onClose: () => void;
  /** On a phone, the page that scrolls. */
  page: RefObject<HTMLDivElement | null>;
  stage: ReactNode;
  bar: ReactNode;
  /** What is set while drawing – and, made 3D, what is left to do. */
  drawSet: ReactNode;
  stampSet: ReactNode;
  question: ReactNode;
  ghost: ReactNode;
}) => {
  // Side by side: the drawing's controls and the stamp's – each scrolls on
  // its own. On a phone the whole page scrolls instead.
  const drawControls = useFadingEdges();
  const stampControls = useFadingEdges();

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-3">
      <h2 className="font-black text-2xl" id={titleId}>
        {title}
      </h2>
      <button
        aria-label="Close"
        className={ROUND_BUTTON}
        onClick={onClose}
        type="button"
      >
        <Cross className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden touch-manipulation">
      {side && (
        // The page fades back like paper under tracing paper.
        <m.button
          animate={{ opacity: 1, transition: { duration: 0.24 } }}
          aria-label="Close"
          className="fixed inset-0 touch-none bg-bg/80 backdrop-blur-[2px]"
          exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
          initial={{ opacity: 0 }}
          onClick={going ? undefined : onClose}
          tabIndex={going ? -1 : undefined}
          type="button"
        />
      )}
      {side ? (
        <div className="pointer-events-none flex h-full items-center justify-center p-6">
          <m.div
            {...DESKTOP}
            aria-labelledby={titleId}
            aria-modal="true"
            className="scribble pointer-events-auto relative flex max-h-full max-w-full flex-col gap-4 rounded-4xl p-6"
            inert={going}
            role="dialog"
          >
            {header}
            <div className="relative flex min-h-0 gap-6">
              {/* As large as the screen allows: as tall as the room under
                  the title leaves above the bar (3.25rem), as wide as beside
                  the controls – the bar as wide as the drawing. */}
              <div className="w-[min(calc(100dvh-12.75rem),calc(100vw-32rem),56rem)] shrink-0">
                {stage}
                {bar}
              </div>
              <div className="-my-2 grid min-h-0 w-88 shrink-0 grid-rows-1">
                <div
                  className={cn(layer(draws), "px-1 py-2")}
                  ref={drawControls}
                >
                  <div className="flex flex-col gap-3">{drawSet}</div>
                </div>
                <div
                  className={cn(layer(!draws), "px-1 py-2")}
                  ref={stampControls}
                >
                  <div className="flex flex-col gap-4">{stampSet}</div>
                </div>
              </div>
              {question}
            </div>
          </m.div>
        </div>
      ) : (
        <m.div
          {...PHONE}
          aria-labelledby={titleId}
          aria-modal="true"
          className="absolute inset-0 flex flex-col bg-bg pt-[max(0.75rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]"
          inert={going}
          role="dialog"
        >
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            ref={page}
          >
            <div className="px-4 pb-2">{header}</div>
            {/* The drawing and the bar under it, one block: drawing, it
                stays at the top while what comes after scrolls by – on the
                page's own paper, which a short fade lets go of below; the
                frames keep the room they wobble in. Made 3D, it goes with
                the page: nothing to set lies under it then. */}
            <div
              className={cn(
                "z-10 bg-bg pt-1 pb-2",
                draws
                  ? "sticky top-0 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-linear-to-b after:from-bg after:to-transparent"
                  : "relative"
              )}
            >
              {/* As wide as the screen, square – and never so tall that the
                  tools under it have no room. At its sides the room its
                  frame reaches past it (14px, styles.css) – and the bar's
                  and the question's: nothing reaches past the screen, the
                  page never scrolls sideways. */}
              <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-21.25rem))] px-3.5">
                {stage}
              </div>
              {/* As wide as the drawing – but never narrower than its
                  buttons: the steps in the middle, the bin's room on
                  either side. */}
              <div className="mx-auto w-full max-w-[min(100%,max(calc(100dvh-21.25rem),14.75rem))] px-3.5">
                {bar}
              </div>
              {question}
            </div>
            {/* Only the set showing is there – the page as long as it is. */}
            <div
              className={cn(
                "flex flex-col gap-4 px-4 pt-3 pb-4",
                draws ? "animate-fade" : "hidden"
              )}
            >
              {drawSet}
            </div>
            <div
              className={cn(
                "flex-col gap-4 px-4 pt-3 pb-4",
                draws ? "hidden" : "flex animate-fade"
              )}
            >
              {stampSet}
            </div>
          </div>
        </m.div>
      )}
      {ghost}
    </div>
  );
};
