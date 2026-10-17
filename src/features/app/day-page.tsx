"use client";

import { useIsPresent } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { trackEvent } from "@/features/analytics/client";
import type { ColorName, DayKey } from "@/features/calendar/model";
import { cleanNote, noteId, noteText } from "@/features/calendar/note";
import { knownKey, pickable } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import {
  movePlacement,
  placeStamp,
  removePlacement,
  useBoop,
} from "@/features/offline/store";
import { StampHand } from "@/features/stickers/stamp-hand";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/id";
import { Paper } from "./day-page/paper";
import { PRINT, type Print, type Stamp, tidy } from "./day-page/prints";
import { SideSwitch, useSides } from "./day-page/sides";
import { StepBar } from "./day-page/step-bar";
import { Inks, Turning } from "./day-page/tools";
import { Tray } from "./day-page/tray";
import { useHand } from "./day-page/use-hand";
import { useKeys } from "./day-page/use-keys";
import { useSteps } from "./day-page/use-steps";
import { useFadingEdges } from "./fading-edges";
import type { ShelfOrder } from "./shelf";

// Where the year and the month (through day-sheet.tsx) have always found it.
export { seedOf } from "./day-page/prints";

/**
 * Where the parts of a day's page go (`grid-template-areas`): over all, the
 * heading (`head`) – on a phone with the switch between the page and the
 * note beside it, or the switch alone; then the page with its steps and
 * the note (`main` – on a phone side by side, to swipe); and the tools and
 * the tray (`side`), under them – or, from a container 42rem wide, beside
 * them, all along, 20rem wide: the inks eight to a row, the stamps three.
 * From 56rem (a day's sheet on a large screen) 28rem: all inks in a row,
 * the stamps four.
 */
const AREAS = {
  heading:
    "[grid-template-areas:'head'_'main'_'side'] @2xl:grid-rows-[auto_1fr] @2xl:[grid-template-areas:'head_side'_'main_side']",
  switch:
    "[grid-template-areas:'head'_'main'_'side'] @2xl:[grid-template-areas:'main_side']",
  plain:
    "[grid-template-areas:'main'_'side'] @2xl:[grid-template-areas:'main_side']",
};

/** The tray's – handed on as they are by the today view and the day's sheet. */
export type TrayProps = {
  /** In the order picked – the shelf's (shelf.ts). */
  stamps: readonly Stamp[];
  order: ShelfOrder;
  onOrder: (order: ShelfOrder) => void;
  /** Draw a new stamp – the tray's last tile. */
  onNew: () => void;
  /**
   * The shelf (stamp-shelf.tsx), all the stamps on a page of their own: its
   * address, for the link over the tray, and what following it does.
   */
  shelf: string;
  onShelf: () => void;
  /**
   * A stamp to take into the hand – one just drawn from here. Told with
   * `onGiven` once it is in it.
   */
  give?: string | null;
  onGiven?: () => void;
};

/**
 * A day's page of a calendar, with the prints on it, the inks and the tray
 * of stamps – in the day's sheet (day-sheet.tsx) and, for today, right in
 * the app (today-view.tsx). Tap a stamp – it's in your hand
 * (stamp-hand.tsx): small, at the pointer's side, while a faint preview on
 * the page shows the print it will leave; the wheel (or the two buttons, or
 * ← →) turns it. Tap the page – it comes down right there, as previewed;
 * tap an ink – the stamp takes that ink. With no stamp in hand the prints
 * can be moved, picked (a tap; Enter or Space) and, picked, turned (the
 * same two buttons, ← →) and removed (its button; Delete or Backspace).
 * Every step can be taken back, and done again (⌘Z, ⇧⌘Z or Ctrl+Y).
 *
 * The tray's stamps are in the shelf's order (shelf.ts) – picked here or
 * there, it is the same choice. Its last tile draws a new one: `onNew`,
 * and back here it comes into the hand (`give`). A link over it leads to
 * the shelf (`onShelf`).
 *
 * Whose a finger on the page is: with no stamp in hand, the page's and the
 * sheet's – a swipe up or down scrolls them, right across the prints
 * (`touch-action: pan-y`), and moves nothing. A print is picked with a tap
 * first; only the picked one – marked, and the finger's from then on
 * (`touch-none`) – is moved by dragging. With a stamp in hand the page is
 * for stamping: no finger scrolls from it. The mouse scrolls with its
 * wheel, so it drags any print at once, as ever.
 *
 * The keys listen on the whole window – `keyboard` false keeps them off
 * while something else lies over the page (a sheet over the today view).
 *
 * Narrow (a phone), all is one column: `heading`, the page – as large as
 * the width lets it be, no higher than the window has room for – with the
 * steps back and forth and the bin under it, and beside it, a swipe or a
 * tap on the switch over them away, the day's note (`dayNote`); then the
 * tools (the inks, the stamp in hand), what to do now and the tray. A stamp
 * taken from the tray – or an ink, with one in hand – brings the page back
 * into sight, should the note be: it is to stamp with. With
 * room for two (the today view on a wide screen, the day's sheet there) the
 * note is under the steps, and the tools, what to do now and the tray stand
 * beside it all (`AREAS`).
 *
 * Its parts lie in day-page/: the paper with the prints (paper.tsx), the
 * steps under it (step-bar.tsx), the tools (tools.tsx), the tray
 * (tray.tsx) and the switch between the page and the note (sides.tsx); the
 * stamp in hand, the steps and the keys are hooks of their own
 * (use-hand.ts, use-steps.ts, use-keys.ts).
 */
export const DayPage = ({
  calendar,
  date,
  locale,
  stamps,
  order,
  onOrder,
  onNew,
  shelf,
  onShelf,
  give = null,
  onGiven,
  heading,
  keyboard = true,
  inSheet = false,
  dayNote,
  className,
}: {
  calendar: string;
  date: DayKey;
  locale: Locale;
  heading?: ReactNode;
  keyboard?: boolean;
  /** In the day's sheet: less height for the page – the sheet takes some. */
  inSheet?: boolean;
  /** The day's note (day-note.tsx) – under the page, on a phone beside it. */
  dayNote?: ReactNode;
  className?: string;
} & TrayProps) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const page = useRef<HTMLDivElement>(null);
  // Going – the view it is in gives way to another, its sheet closes.
  const leaving = !useIsPresent();
  // The stamps' row, where it scrolls sideways: it fades where it goes on.
  const fade = useFadingEdges("x");
  const row = useRef<HTMLDivElement | null>(null);
  const tray = useCallback(
    (box: HTMLDivElement | null) => {
      row.current = box;
      return fade(box);
    },
    [fade]
  );
  const [picked, setPicked] = useState<string | null>(null);
  // The order's menu open over the tray: Escape is its, first.
  const [sorting, setSorting] = useState(false);
  // A print on its way back after an undo – it glides instead of jumping.
  const [glide, setGlide] = useState<string | null>(null);
  // What was on the page when it opened; anything newer appears like ink.
  const [old] = useState(() => new Set(Object.keys(boop.placements)));

  // On a phone the page and the note lie side by side in a row that snaps:
  // which one is in sight, and whether anything is written in the note.
  const { sides, note: notePane, side, showSide, toPage } = useSides();
  const noted = Boolean(
    noteText(
      cleanNote(boop.notes[noteId(calendar, date)]?.content ?? null)
    ).trim()
  );

  // The inks: the stamp colors. A stamp taken into the hand comes in its own
  // (`take`) – another ink is picked for it by its blot, and holds until the
  // next stamp is taken. As long as the palette has it; else, and to begin
  // with, “red” or the palette's first.
  const palette = usePalette();
  const [chosen, setInk] = useState<ColorName>("red");
  const ink = knownKey(chosen, palette);

  // The stamp in hand – with none, the prints can be moved and picked.
  const hand = useHand({ stamps, page, setInk, setPicked });
  const { inHand, held, size, unit, take, turnBy, turn, showForFinger } = hand;

  // The pads to pick from: the colors one may pick (palette.ts – the special
  // ones are Boop's gifts', an admin account has them all) – and, should it
  // be a special one, the ink in use and the own color of the stamp in
  // hand: a gift's stamp comes in its own, and finds back to it.
  const open = pickable(palette, { admin: Boolean(boop.me?.admin) });
  const pads = palette.filter(
    (color) =>
      open.includes(color) || color.key === ink || color.key === inHand?.color
  );

  /**
   * A stamp taken from the tray – or put down. Taken, it is to stamp with:
   * a finger sees its preview (`showForFinger`), and on a phone the page
   * comes into sight, should the note be (`toPage`).
   */
  const fromTray = useCallback(
    (id: string | null) => {
      take(id);
      if (!id) return;
      showForFinger();
      toPage();
    },
    [take, showForFinger, toPage]
  );

  /** An ink picked – with a stamp in hand, to stamp with, as above. */
  const pickInk = (pad: ColorName, byPointer: boolean) => {
    setInk(pad);
    if (!inHand) return;
    if (byPointer) showForFinger();
    toPage();
  };

  const { can, note, undo, redo } = useSteps(setGlide, setPicked);

  // The next print's id, made ahead – so the preview is that very print,
  // blot for blot.
  const [next, setNext] = useState(newId);
  const nextId = useRef(next);

  /**
   * A print of this stamp on the page, as its preview showed it – noted, so
   * it can be taken back. The next print gets a new id (and look).
   */
  const print = useCallback(
    (
      stamp: Stamp,
      at: { x: number; y: number },
      rotation: number,
      inked: ColorName
    ) => {
      const id = nextId.current;
      nextId.current = newId();
      setNext(nextId.current);
      const placed = {
        calendar,
        date,
        stamp: stamp.id,
        ...at,
        rotation,
        ink: inked,
      };
      note({ kind: "place", id, print: placed });
      void placeStamp({ id, ...placed });
      trackEvent("stamp-placed");
    },
    [calendar, date, note]
  );

  // A stamp handed in – one just drawn from this tray: into the hand as
  // soon as it is among the stamps, and into sight in the row (sideways
  // only – the page stays where it is).
  useEffect(() => {
    if (!(give && stamps.some((s) => s.id === give))) return;
    take(give);
    onGiven?.();
    const box = row.current;
    const item = box?.querySelector<HTMLElement>(`[data-stamp="${give}"]`);
    if (!(box && item)) return;
    const left =
      item.getBoundingClientRect().left -
      box.getBoundingClientRect().left +
      box.scrollLeft;
    box.scrollTo({
      left: left - (box.clientWidth - item.offsetWidth) / 2,
      behavior: "smooth",
    });
  }, [give, stamps, take, onGiven]);

  const placements = useMemo(
    () =>
      Object.values(boop.placements)
        .filter((p) => p.calendar === calendar && p.date === date)
        .sort((a, b) => a.z - b.z),
    [boop.placements, calendar, date]
  );
  // The picked print, as long as it is on the page – another device may
  // have taken it off meanwhile.
  const marked = placements.find((p) => p.id === picked) ?? null;

  /** Takes a print off the page – noted, so it can be taken back. */
  const remove = useCallback(
    (print: Print) => {
      note({ kind: "remove", id: print.id, print });
      void removePlacement(print.id);
      setPicked(null);
    },
    [note]
  );

  /** Turns a print on the page – noted, so it can be taken back. */
  const turnPrint = useCallback(
    (print: Print, degrees: number) => {
      const to = tidy(print.rotation + degrees);
      note({ kind: "turn", id: print.id, from: print.rotation, to });
      void movePlacement(print.id, { rotation: to });
    },
    [note]
  );

  useKeys({
    keyboard,
    holding: hand.holding,
    sorting,
    marked,
    take,
    turnBy,
    undo,
    redo,
    remove,
    turnPrint,
    setPicked,
  });

  // The page as wide as there is room – but no higher than the window, with
  // the heading over it and the steps under it in sight too (11rem); 16rem
  // at least. In a sheet, its title and edges too – the page in the middle
  // of it. The steps and the note go as wide.
  const fit = inSheet
    ? "mx-auto w-full max-w-[max(16rem,calc(100dvh_-_24rem))]"
    : "w-full max-w-[max(16rem,calc(100dvh_-_11rem))]";

  return (
    <div className={cn("@container", className)}>
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[minmax(0,1fr)_20rem] @2xl:gap-x-6 @4xl:grid-cols-[minmax(0,1fr)_28rem] @4xl:gap-x-8",
          heading ? AREAS.heading : dayNote ? AREAS.switch : AREAS.plain
        )}
      >
        {(heading || dayNote) && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 [grid-area:head]",
              !heading && "@2xl:hidden"
            )}
          >
            {heading}
            {dayNote && (
              <SideSwitch
                className="ml-auto @2xl:hidden"
                locale={locale}
                noted={noted}
                onPick={showSide}
                side={side}
              />
            )}
          </div>
        )}

        {/* The page with its steps, and the note: on a phone side by side
          in a row that snaps – sideways only (and no finger moves it from
          the page itself, which is for stamping, scrolling up and down and
          moving prints: the switch over it is). Both as high: nothing under
          them moves as one goes from one to the other. No bar; room all
          round inside the scroller, which clips, for what reaches a little
          out – a frame, a lifted button –, and so much between the two that
          none of the other shows. With room, one under the other. */}
        <div
          className="relative -m-4 flex snap-x snap-mandatory scroll-px-4 gap-8 overflow-x-auto overflow-y-hidden overscroll-x-contain p-4 [grid-area:main] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden @2xl:m-0 @2xl:snap-none @2xl:flex-col @2xl:gap-4 @2xl:overflow-visible @2xl:p-0"
          ref={sides}
        >
          <div className="flex w-full shrink-0 snap-center flex-col gap-4">
            <Paper
              fit={fit}
              glide={glide}
              hand={hand}
              ink={ink}
              locale={locale}
              next={next}
              note={note}
              old={old}
              page={page}
              picked={picked}
              placements={placements}
              print={print}
              setGlide={setGlide}
              setPicked={setPicked}
              stamps={boop.stamps}
            />
            <StepBar
              can={can}
              className={fit}
              locale={locale}
              onRemove={() => {
                if (marked) remove(marked);
              }}
              redo={redo}
              removable={Boolean(marked && !inHand)}
              undo={undo}
            />
          </div>
          {dayNote && (
            <div className="w-full shrink-0 snap-center" ref={notePane}>
              <div className={fit}>{dayNote}</div>
            </div>
          )}
        </div>

        {/* Under the note – or, with room, beside the page: the tools, what
          to do now and the tray. */}
        <div className="flex min-w-0 flex-col gap-4 [grid-area:side]">
          <div className="flex flex-col gap-3">
            <Inks
              ink={ink}
              locale={locale}
              onInk={pickInk}
              pads={pads}
              showHand={hand.showHand}
            />
            <Turning
              angle={hand.angle}
              inHand={inHand}
              locale={locale}
              marked={marked}
              showAngle={hand.showAngle}
              straighten={hand.straighten}
              turnBy={turnBy}
              turnPrint={turnPrint}
            />
          </div>

          {/* What to do now – with the stamp in hand by its name. Always as
          high – two lines, under a wide page one: what lies under it doesn't
          move as it changes. */}
          <p className="line-clamp-2 min-h-10 font-medium text-muted text-sm sm:@max-2xl:line-clamp-1 sm:@max-2xl:min-h-5">
            {inHand
              ? t.app.day.holding(inHand.name)
              : marked
                ? t.app.day.picked
                : t.app.day.tray}
            {(inHand || marked) && (
              // Only where there is likely a wheel – and a keyboard.
              <span className="hidden [@media(hover:hover)]:inline">
                {" "}
                {inHand ? t.app.day.wheel : t.app.day.pickedKeys}
              </span>
            )}
          </p>

          <Tray
            held={held}
            ink={ink}
            locale={locale}
            onNew={onNew}
            onOrder={onOrder}
            onShelf={onShelf}
            onSorting={setSorting}
            onTake={fromTray}
            order={order}
            print={print}
            row={tray}
            shelf={shelf}
            stamps={stamps}
            turn={turn}
          />
        </div>
      </div>

      {/* Pressed, the stamp is as wide as its print – a special one wider.
        Once the page is on its way out (another view, its sheet closing),
        nothing is in hand any more: the stamp is gone before the page is. */}
      <StampHand
        ink={ink}
        ref={hand.handle}
        stamp={leaving ? null : inHand}
        unit={(unit * size) / PRINT}
      />
    </div>
  );
};
