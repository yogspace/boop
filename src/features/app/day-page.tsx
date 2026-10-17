"use client";

import { m, useIsPresent } from "motion/react";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Snapshot } from "valtio";
import { ArrowRight, Plus, Sparkle } from "@/components/doodles";
import { SPRING } from "@/components/motion";
import { ROUND_BUTTON } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import {
  type ColorName,
  type DayKey,
  type PlacementDoc,
  SPECIAL_SIZE,
  type StampDoc,
} from "@/features/calendar/model";
import { cleanNote, noteId, noteText } from "@/features/calendar/note";
import { knownKey, pickable } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import { Glitter, StampSvg } from "@/features/calendar/stamp-svg";
import { PAPER } from "@/features/calendar/tint";
import {
  movePlacement,
  placeStamp,
  removePlacement,
  restorePlacement,
  useBoop,
} from "@/features/offline/store";
import { StampHand, type StampHandle } from "@/features/stickers/stamp-hand";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/id";
import { opensHere } from "./address";
import { FADING, useFadingEdges } from "./fading-edges";
import { InkBlot } from "./ink-blot";
import { NameTag } from "./name-tag";
import type { ShelfOrder } from "./shelf";
import { NAME_UNDER, OrderMenu } from "./stamp-shelf";

type Stamp = Snapshot<StampDoc>;
type Print = Snapshot<PlacementDoc>;

/** How far a finger moves before a tap becomes a drag. */
const DRAG = 8;

/**
 * A print's width on the page, and how much of the unit square its picture
 * spans (stamp-svg.tsx) – so one unit, the stamp's width, is a quarter page.
 */
const PRINT = 0.26;
const VIEW_BOX = 1.04;

/** A stamp's print width on the page – a special stamp's is bigger. */
const printOf = (stamp: Stamp | null | undefined) =>
  stamp?.drawing?.special ? PRINT * SPECIAL_SIZE : PRINT;

/** How much of the next print's preview shows. */
const GHOST = 0.4;

/** Turning the stamp in hand: degrees per tap on a button or key. */
const STEP = 15;

/** A print's own imperfections, from its id. */
export const seedOf = (id: string) =>
  (Number.parseInt(id.slice(0, 6), 16) || 7) % 997;

/** Where a print lies – what moving it changes. */
type Spot = Pick<PlacementDoc, "x" | "y" | "z">;

/**
 * What can be taken back – and, taken back, done again. `id` is the print as
 * it is now: one that comes back (a removal taken back, a print placed
 * again) is a new one (restorePlacement), and every step that meant the
 * old one means it from then on. A print placed keeps what it was placed
 * with, a removed one what it was – to come back as just that.
 */
type Step =
  | {
      kind: "place";
      id: string;
      print: Omit<Parameters<typeof placeStamp>[0], "id">;
    }
  | { kind: "move"; id: string; from: Spot; to: Spot }
  | { kind: "turn"; id: string; from: number; to: number }
  | { kind: "remove"; id: string; print: Print };

const within = (value: number) => Math.min(Math.max(value, 0), 1);

/** An angle as a print keeps it: whole degrees, −180…180. */
const tidy = (degrees: number) => {
  const turned = Math.round(degrees) % 360;
  if (turned > 180) return turned - 360;
  return turned < -180 ? turned + 360 : turned;
};

/** An angle as it reads: “15°”, “−30°” – a real minus. */
const angleOf = (degrees: number) =>
  `${degrees < 0 ? "−" : ""}${Math.abs(degrees)}°`;

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

/** The word over a group of buttons – and over the inks, the stamps. */
const CAPTION = "font-bold text-muted text-sm";

/**
 * How far the stamp in hand (or the print picked) is turned – a button that
 * sets it straight, looking like the words it is: a soft blot behind them
 * when pointed at. As wide for any angle – nothing beside it moves.
 */
const ANGLE =
  "scribble scribble-bare scribble-clear scribble-sm w-12 rounded-full py-1 text-center font-black text-sm tabular-nums transition-transform duration-150 ease-out enabled:hover:scribble-soft enabled:active:scale-90";

/**
 * How far a wheel event turns the stamp, in degrees: a notch (about 100 px)
 * is 6°. Small steps count a little more than their share – a trackpad turns
 * it smoothly, a slow wheel still visibly – and none is more than 12°.
 */
const wheelTurn = (event: WheelEvent) => {
  const delta = event.deltaY || event.deltaX;
  // Lines (Firefox) are about 33 px each.
  const px = Math.abs(delta) * (event.deltaMode === 1 ? 33 : 1);
  return Math.sign(delta) * Math.min(12, 0.38 * px ** 0.6);
};

/** Whether a key is being typed into a field – then it is the field's. */
const typing = (event: KeyboardEvent) => {
  const at = event.target;
  return (
    at instanceof HTMLElement &&
    (at.isContentEditable || at.matches("input, textarea, select"))
  );
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
 * tools (the inks, the stamp in hand), what to do now and the tray. With
 * room for two (the today view on a wide screen, the day's sheet there) the
 * note is under the steps, and the tools, what to do now and the tray stand
 * beside it all (`AREAS`).
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
  /** The day's note (day-note.tsx) – under the page, beside it or not. */
  dayNote?: ReactNode;
  className?: string;
} & TrayProps) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const page = useRef<HTMLDivElement>(null);
  const hand = useRef<StampHandle>(null);
  // Going – the view it is in gives way to another, its sheet closes.
  const leaving = !useIsPresent();
  // The stamps' row, where it scrolls sideways: it fades where it goes on.
  const fade = useFadingEdges("x");
  // The inks' row on a phone, the same – once there are more than fit.
  const inkRow = useFadingEdges("x");
  const row = useRef<HTMLDivElement | null>(null);
  const tray = useCallback(
    (box: HTMLDivElement | null) => {
      row.current = box;
      return fade(box);
    },
    [fade]
  );
  // The stamp in hand – with none, the prints can be moved and picked.
  const [held, setHeld] = useState<string | null>(null);
  const inHand = stamps.find((s) => s.id === held) ?? null;
  const holding = Boolean(inHand);
  // How wide its print comes out.
  const size = printOf(inHand);
  // The next print: where the stamp is aimed (the page, 0–1), whether its
  // preview shows, and how it is turned – degrees, running on past ±180 so
  // nothing ever spins back the long way. Kept beside React: they change
  // with every move of the pointer.
  const aim = useRef({ x: 0.5, y: 0.5, on: false });
  const turn = useRef(0);
  const ghost = useRef<HTMLDivElement>(null);
  // Its id is made ahead – so the preview is that very print, blot for blot.
  const [next, setNext] = useState(newId);
  const nextId = useRef(next);
  const [picked, setPicked] = useState<string | null>(null);
  // The order's menu open over the tray: Escape is its, first.
  const [sorting, setSorting] = useState(false);
  // A print being moved – written once it is let go. It keeps where it was
  // taken hold of (`grab`, from its middle). `loose`: it may be moved – by
  // the mouse any print, by a finger only the picked one. `strayed`: the
  // pointer went too far for a tap, so letting go picks nothing.
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    grab: { x: number; y: number };
    from: { x: number; y: number };
    loose: boolean;
    strayed: boolean;
    moved: boolean;
  } | null>(null);
  // Where a pointer came down beside the prints – let go right there (a
  // tap, not a swipe that scrolls), the picked print is let go of.
  const beside = useRef<{ id: number; x: number; y: number } | null>(null);
  // A print on its way back after an undo – it glides instead of jumping.
  const [glide, setGlide] = useState<string | null>(null);
  // What was on the page when it opened; anything newer appears like ink.
  const [old] = useState(() => new Set(Object.keys(boop.placements)));

  // On a phone the page and the note lie side by side in a row that snaps
  // (`sides`): which one is in sight – followed as the row is swiped –, and
  // whether anything is written in the note.
  const sides = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>("page");
  useEffect(() => {
    const box = sides.current;
    if (!box) return;
    const follow = () => {
      const far = box.scrollWidth - box.clientWidth;
      setSide(far > 0 && box.scrollLeft > far / 2 ? "note" : "page");
    };
    const sizes = new ResizeObserver(follow);
    sizes.observe(box);
    box.addEventListener("scroll", follow, { passive: true });
    return () => {
      sizes.disconnect();
      box.removeEventListener("scroll", follow);
    };
  }, []);
  /** Glides to the page or the note – no focus in it: no keyboard comes up. */
  const showSide = useCallback((to: Side) => {
    const box = sides.current;
    box?.scrollTo({
      left: to === "note" ? box.scrollWidth : 0,
      behavior: "smooth",
    });
  }, []);
  const noted = Boolean(
    noteText(
      cleanNote(boop.notes[noteId(calendar, date)]?.content ?? null)
    ).trim()
  );

  // One unit on the page in px – pressed, the stamp is exactly that wide.
  const [unit, setUnit] = useState(0);
  useEffect(() => {
    const box = page.current;
    if (!box) return;
    const measure = () => setUnit((box.clientWidth * PRINT) / VIEW_BOX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // The inks: the stamp colors. A stamp taken into the hand comes in its own
  // (`take`) – another ink is picked for it by its blot, and holds until the
  // next stamp is taken. As long as the palette has it; else, and to begin
  // with, “red” or the palette's first.
  const palette = usePalette();
  const [chosen, setInk] = useState<ColorName>("red");
  const ink = knownKey(chosen, palette);
  // The pads to pick from: the colors one may pick (palette.ts – the special
  // ones are Boop's gifts', an admin account has them all) – and, should it
  // be a special one, the ink in use and the own color of the stamp in
  // hand: a gift's stamp comes in its own, and finds back to it.
  const open = pickable(palette, { admin: Boolean(boop.me?.admin) });
  const pads = palette.filter(
    (color) =>
      open.includes(color) || color.key === ink || color.key === inHand?.color
  );

  // Undo and redo: the steps of this visit – done (`done`, newest last) and
  // taken back (`undone`, the last taken back last) – and a line they queue
  // up in: a step is noted before the next undo looks, also while its print
  // is still saving. A new step leaves nothing to do again.
  const done = useRef<Step[]>([]);
  const undone = useRef<Step[]>([]);
  const line = useRef<Promise<void>>(Promise.resolve());
  const [can, setCan] = useState({ undo: false, redo: false });
  const tell = useCallback(
    () =>
      setCan({
        undo: done.current.length > 0,
        redo: undone.current.length > 0,
      }),
    []
  );
  const note = useCallback(
    (step: Step) => {
      line.current = line.current.then(() => {
        undone.current = [];
        const last = done.current.at(-1);
        // Turning a print on and on is one step – taken back at once. Turned
        // back to where it was (set straight, say), there is none.
        if (
          step.kind === "turn" &&
          last?.kind === "turn" &&
          last.id === step.id
        ) {
          last.to = step.to;
          if (last.to === last.from) done.current.pop();
        } else done.current.push(step);
        tell();
      });
    },
    [tell]
  );
  /** Takes the last step back (`back`) – or does the last taken back again. */
  const travel = useCallback(
    (back: boolean) => {
      line.current = line.current
        .then(async () => {
          const [from, to] = back
            ? [done.current, undone.current]
            : [undone.current, done.current];
          const step = from.pop();
          if (!step) return;
          to.push(step);
          tell();
          if (step.kind === "move") {
            setGlide(step.id);
            await movePlacement(step.id, back ? step.from : step.to);
          } else if (step.kind === "turn") {
            await movePlacement(step.id, {
              rotation: back ? step.from : step.to,
            });
          } else if ((step.kind === "place") === back) {
            // A print goes: one placed, taken back – one removed, again.
            setPicked((id) => (id === step.id ? null : id));
            await removePlacement(step.id);
          } else {
            // A print comes – a removal taken back, one placed again: as a
            // new print, which the steps that meant the old one now mean.
            const id =
              step.kind === "place"
                ? await placeStamp(step.print)
                : await restorePlacement(step.print);
            for (const other of [...done.current, ...undone.current]) {
              if (other.id === step.id) other.id = id;
            }
          }
        })
        .catch(() => undefined);
    },
    [tell]
  );
  const undo = useCallback(() => travel(true), [travel]);
  const redo = useCallback(() => travel(false), [travel]);

  /** Puts the preview where the stamp is aimed, turned like it – no render. */
  const preview = useCallback(() => {
    const box = ghost.current;
    const inked = box?.firstElementChild;
    if (!(box && inked instanceof HTMLElement)) return;
    const { x, y, on } = aim.current;
    // In its own widths – the page is 1 / size of them; its middle there.
    const to = (at: number) => `${((at / size) * 100 - 50).toFixed(2)}%`;
    box.style.transform = `translate(${to(x)}, ${to(y)})`;
    inked.style.rotate = `${Math.round(turn.current)}deg`;
    inked.style.opacity = on ? `${GHOST}` : "0";
  }, [size]);
  useEffect(() => {
    if (holding) preview();
  }, [holding, preview]);

  // How far the stamp in hand is turned, in words beside its buttons –
  // written as it turns, like the preview: no render. Pressed, it is set
  // straight (`straighten`) – straight already, there is nothing to press.
  const angle = useRef<HTMLButtonElement | null>(null);
  const showAngle = useCallback(() => {
    const button = angle.current;
    if (!button) return;
    const degrees = tidy(turn.current);
    button.textContent = angleOf(degrees);
    button.disabled = degrees === 0;
  }, []);

  /** Turns the stamp in hand – its preview turns, the 3D stamp spins along. */
  const turnBy = useCallback(
    (degrees: number) => {
      turn.current += degrees;
      // Turned by button or key, it shows where the stamp was last aimed.
      aim.current.on = true;
      preview();
      showAngle();
      hand.current?.turn(Math.round(turn.current));
    },
    [preview, showAngle]
  );

  /**
   * The stamp in hand straight again – turned back the short way, as the
   * buttons turn it: to the nearest full turn.
   */
  const straighten = () =>
    turnBy(360 * Math.round(turn.current / 360) - turn.current);

  /**
   * Takes a stamp into the hand (or puts it down) – straight again, and in
   * its own color.
   */
  const take = useCallback(
    (id: string | null) => {
      setHeld(id);
      const own = stamps.find((s) => s.id === id)?.color;
      if (own) setInk(own);
      setPicked(null);
      turn.current = 0;
      aim.current.on = false;
      preview();
      showAngle();
      hand.current?.turn(0);
    },
    [preview, showAngle, stamps]
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

  // The wheel turns the stamp in hand, and the page doesn't scroll
  // meanwhile – which React's own (passive) wheel listener couldn't stop.
  useEffect(() => {
    const box = page.current;
    if (!(box && holding)) return;
    const onWheel = (event: WheelEvent) => {
      // A pinch (ctrl + wheel) stays the browser's.
      if (event.ctrlKey) return;
      event.preventDefault();
      turnBy(wheelTurn(event));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [holding, turnBy]);

  // Escape puts the stamp down first – only then it closes a sheet the page
  // is in (which listens on the window too, so this one goes ahead of it).
  // ⌘Z / Ctrl+Z takes a step back, ⇧⌘Z / Ctrl+Y (and Ctrl+⇧Z) does it
  // again; ← → and [ ] turn the stamp in hand.
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const again =
        (mod && event.shiftKey && key === "z") ||
        (event.ctrlKey && !event.metaKey && !event.shiftKey && key === "y");
      if (!event.altKey && (again || (mod && !event.shiftKey && key === "z"))) {
        // Typing, they are the typing's.
        if (typing(event)) return;
        event.preventDefault();
        if (again) redo();
        else undo();
        return;
      }
      if (!holding || mod) return;
      if (event.key === "Escape") {
        if (sorting) return;
        event.stopImmediatePropagation();
        take(null);
      } else if (event.key === "ArrowLeft" || event.key === "[") {
        if (typing(event)) return;
        event.preventDefault();
        turnBy(-STEP);
      } else if (event.key === "ArrowRight" || event.key === "]") {
        if (typing(event)) return;
        event.preventDefault();
        turnBy(STEP);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyboard, holding, sorting, take, turnBy, undo, redo]);

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

  // A picked print: Delete or Backspace takes it off the page, ← → and [ ]
  // turn it, Escape lets go of it – and, like putting the stamp down, goes
  // ahead of a sheet's own Escape, which would close it.
  useEffect(() => {
    if (!(marked && keyboard)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        if (sorting) return;
        event.stopImmediatePropagation();
        setPicked(null);
        return;
      }
      if (typing(event)) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove(marked);
      } else if (event.key === "ArrowLeft" || event.key === "[") {
        event.preventDefault();
        turnPrint(marked, -STEP);
      } else if (event.key === "ArrowRight" || event.key === "]") {
        event.preventDefault();
        turnPrint(marked, STEP);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyboard, marked, sorting, remove, turnPrint]);

  /**
   * A point on the page (0–1) – also beyond it, for whoever clamps. Inside
   * its border, where the prints are placed: a print lands right under the
   * pointer.
   */
  const onPage = (clientX: number, clientY: number) => {
    const sheet = page.current;
    if (!sheet) return null;
    const box = sheet.getBoundingClientRect();
    return {
      x: (clientX - box.left - sheet.clientLeft) / sheet.clientWidth,
      y: (clientY - box.top - sheet.clientTop) / sheet.clientHeight,
    };
  };

  /** Back from the page to the screen – where a spot on it is now. */
  const onScreen = (spot: { x: number; y: number }) => {
    const sheet = page.current;
    if (!sheet) return null;
    const box = sheet.getBoundingClientRect();
    return {
      x: box.left + sheet.clientLeft + spot.x * sheet.clientWidth,
      y: box.top + sheet.clientTop + spot.y * sheet.clientHeight,
    };
  };

  /**
   * A print of this stamp on the page, as its preview showed it – noted, so
   * it can be taken back. The next print gets a new id (and look).
   */
  const print = (
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
  };

  // Where a finger last was. A browser may stir the hover once something
  // has scrolled – a “mouse” moving to just that spot, where no mouse is:
  // the finger's echo, which mustn't call the stamp back. A mouse anywhere
  // else is one.
  const finger = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const keep = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      finger.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointerdown", keep, true);
    window.addEventListener("pointerup", keep, true);
    return () => {
      window.removeEventListener("pointerdown", keep, true);
      window.removeEventListener("pointerup", keep, true);
    };
  }, []);
  const echo = (event: PointerEvent<HTMLElement>) => {
    const last = finger.current;
    if (event.pointerType === "touch") return true;
    if (
      last &&
      Math.abs(event.clientX - last.x) < 1 &&
      Math.abs(event.clientY - last.y) < 1
    ) {
      return true;
    }
    finger.current = null;
    return false;
  };

  // Over the page and the inks the stamp in hand keeps to the pointer's
  // side, and on the page the preview goes along under it. A finger doesn't
  // hover: there the stamp only comes for the press, where it is tapped,
  // and is gone again (stamp-hand.tsx) – and the preview only shows once it
  // is turned (where it was last tapped).
  const carry = (event: PointerEvent<HTMLElement>) => {
    if (!inHand || echo(event)) return;
    const at = onPage(event.clientX, event.clientY);
    if (!at) return;
    const inside = at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
    if (inside) aim.current = { ...at, on: true };
    else aim.current.on = false;
    preview();
    hand.current?.point(event.clientX, event.clientY);
  };
  const letGo = (event: PointerEvent<HTMLElement>) => {
    if (echo(event)) return;
    aim.current.on = false;
    preview();
    hand.current?.hide();
  };

  /** Down comes the stamp – the print appears as it touches. */
  const stampHere = (event: PointerEvent<HTMLDivElement>) => {
    if (!inHand) {
      // Beside the prints: a tap there lets go of the picked one (`tapped`).
      beside.current =
        event.target === event.currentTarget
          ? { id: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = onPage(event.clientX, event.clientY);
    if (!at) return;
    const stamp = inHand;
    const inked = ink;
    const spot = { x: within(at.x), y: within(at.y) };
    const rotation = tidy(turn.current);
    const touch = () => {
      print(stamp, spot, rotation, inked);
      // The print took its preview's place – it's back when the stamp
      // moves on (and stays if it already has).
      if (aim.current.x === spot.x && aim.current.y === spot.y) {
        aim.current.on = false;
        preview();
      }
    };
    // Down right onto its print – kept on the page, so not always where the
    // pointer is. A finger is gone after the tap: the stamp goes too.
    const there = onScreen(spot);
    const stay = event.pointerType !== "touch";
    if (!(hand.current && there)) touch();
    // One at a time: while the stamp is still at the last one, nothing.
    else if (!hand.current.press(there.x, there.y, touch, stay)) return;
    aim.current.x = spot.x;
    aim.current.y = spot.y;
    preview();
  };

  /** Let go where it came down beside the prints: the picked one is let go of. */
  const tapped = (event: PointerEvent<HTMLDivElement>) => {
    const from = beside.current;
    beside.current = null;
    if (from?.id !== event.pointerId) return;
    const far = Math.hypot(event.clientX - from.x, event.clientY - from.y);
    if (far < DRAG) setPicked(null);
  };

  // The page and the inks are where the stamp in hand shows – it lingers a
  // moment as the pointer goes from one to the other (stamp-hand.tsx).
  const showHand = {
    onPointerEnter: carry,
    onPointerLeave: letGo,
    onPointerMove: carry,
  };

  /** A button that turns the stamp in hand – or, with none, the print picked. */
  const turnButton = (degrees: number, label: string, keys: string) => (
    <button
      aria-keyshortcuts={keys}
      aria-label={label}
      className={cn(ROUND_BUTTON, "h-11 w-11")}
      onClick={() => {
        if (inHand) turnBy(degrees);
        else if (marked) turnPrint(marked, degrees);
      }}
      title={label}
      type="button"
    >
      {/* The same arrow, the other way round. */}
      <TurnSign className={cn("h-5 w-5", degrees > 0 && "-scale-x-100")} />
    </button>
  );

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
            {/* A sheet of dotted paper, drawn round with the marker – the frame
          outside, the page inside it clipping the prints at its edge. It is
          the calendar's own paper (`PAPER`, in the shades the app's frame
          hands down): pale in its color, the dots its pencil's. */}
            <div
              className={cn("scribble rounded-[27px] p-[3px]", fit)}
              style={PAPER as CSSProperties}
              {...showHand}
            >
              <div
                className={cn(
                  "relative aspect-square w-full select-none overflow-hidden rounded-3xl bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]",
                  // With a stamp in hand a finger on the page stamps, and
                  // nothing scrolls from it; the preview marks the spot – no
                  // arrow on top of it. Without, a swipe up or down scrolls.
                  inHand ? "touch-none cursor-none" : "touch-pan-y"
                )}
                onPointerCancel={() => {
                  beside.current = null;
                }}
                onPointerDown={stampHere}
                onPointerUp={tapped}
                ref={page}
              >
                {placements.length === 0 && (
                  <p className="pointer-events-none absolute inset-0 flex animate-fade items-center justify-center p-10 text-center font-bold text-muted">
                    {t.app.day.empty}
                  </p>
                )}
                {placements.map((p) => {
                  const stamp = boop.stamps[p.stamp];
                  const here = drag?.id === p.id ? drag : p;
                  const inked = p.ink ?? stamp?.color ?? "red";
                  return (
                    <div
                      className={cn(
                        "absolute",
                        glide === p.id && "transition-[left,top] duration-300"
                      )}
                      key={p.id}
                      onTransitionEnd={() => setGlide(null)}
                      style={{
                        width: `${printOf(stamp) * 100}%`,
                        left: `${here.x * 100}%`,
                        top: `${here.y * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.scale})`,
                        zIndex: drag?.id === p.id ? 1000 : p.z,
                      }}
                    >
                      <button
                        aria-label={stamp?.name || t.app.day.print}
                        aria-pressed={picked === p.id}
                        className={cn(
                          "relative block w-full rounded-2xl mix-blend-multiply",
                          // With a stamp in hand the page is for stamping.
                          inHand
                            ? "pointer-events-none"
                            : "cursor-grab active:cursor-grabbing",
                          !old.has(p.id) && "animate-ink",
                          // Picked: the marker drawn round it – a solid line, so
                          // it isn't taken for the keyboard's dashed ring, which
                          // goes round the outside of it. It holds still: a line
                          // astir would have the print's ink drawn anew with it.
                          // And it is the finger's now: dragged, it moves – the
                          // page doesn't scroll from it.
                          picked === p.id &&
                            "scribble scribble-sm scribble-clear touch-none [--scribble-inset:-6px] [--scribble-ring:-12px]"
                        )}
                        onClick={(event) => {
                          // By keyboard (Enter, Space) – a tap is told from a
                          // drag below. The stamp in hand is put down for it.
                          if (event.detail !== 0) return;
                          if (inHand) take(null);
                          setPicked(picked === p.id ? null : p.id);
                        }}
                        // A swipe that scrolls takes the pointer away: nothing
                        // was moved, nothing is picked.
                        onPointerCancel={() => {
                          if (drag?.id === p.id) setDrag(null);
                        }}
                        onPointerDown={(event) => {
                          const at = onPage(event.clientX, event.clientY);
                          if (!at) return;
                          event.currentTarget.setPointerCapture(
                            event.pointerId
                          );
                          setDrag({
                            id: p.id,
                            x: p.x,
                            y: p.y,
                            grab: { x: at.x - p.x, y: at.y - p.y },
                            from: { x: event.clientX, y: event.clientY },
                            // A finger moves the picked print only – across
                            // any other it may be on its way down the page.
                            loose:
                              event.pointerType === "mouse" || picked === p.id,
                            strayed: false,
                            moved: false,
                          });
                        }}
                        onPointerMove={(event) => {
                          if (drag?.id !== p.id) return;
                          const far =
                            Math.hypot(
                              event.clientX - drag.from.x,
                              event.clientY - drag.from.y
                            ) >= DRAG;
                          if (!drag.loose) {
                            if (far && !drag.strayed) {
                              setDrag({ ...drag, strayed: true });
                            }
                            return;
                          }
                          const at = onPage(event.clientX, event.clientY);
                          if (!(at && (drag.moved || far))) return;
                          setDrag({
                            ...drag,
                            x: within(at.x - drag.grab.x),
                            y: within(at.y - drag.grab.y),
                            moved: true,
                          });
                        }}
                        onPointerUp={() => {
                          if (drag?.id !== p.id) return;
                          setDrag(null);
                          // A finger across a print not picked: not a tap.
                          if (drag.strayed) return;
                          if (drag.moved) {
                            const top =
                              Math.max(...placements.map((q) => q.z)) + 1;
                            const to = {
                              x: drag.x,
                              y: drag.y,
                              z: p.z < top - 1 ? top : p.z,
                            };
                            note({
                              kind: "move",
                              id: p.id,
                              from: { x: p.x, y: p.y, z: p.z },
                              to,
                            });
                            void movePlacement(p.id, to);
                          } else setPicked(picked === p.id ? null : p.id);
                        }}
                        type="button"
                      >
                        <StampSvg
                          className="pointer-events-none h-auto w-full"
                          color={inked}
                          drawing={stamp?.drawing ?? null}
                          print
                          seed={seedOf(p.id)}
                          shape={stamp?.shape}
                        />
                        {stamp?.drawing?.special && (
                          // In the print's blend, so its white falls on ink only.
                          <Glitter
                            color={inked}
                            drawing={stamp.drawing}
                            seed={seedOf(p.id)}
                            shape={stamp.shape}
                          />
                        )}
                      </button>
                    </div>
                  );
                })}
                {inHand && (
                  // The next print, faintly: where and how the stamp will leave
                  // it. Moved by preview(), so no style of React's is in its way.
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 left-0 aspect-square mix-blend-multiply will-change-transform"
                    ref={ghost}
                    style={{ width: `${size * 100}%`, zIndex: 2000 }}
                  >
                    <div className="relative opacity-0 transition-[rotate,opacity] duration-150 ease-out">
                      <StampSvg
                        className="h-auto w-full"
                        color={ink}
                        drawing={inHand.drawing}
                        print
                        seed={seedOf(next)}
                        shape={inHand.shape}
                      />
                      {inHand.drawing?.special && (
                        <Glitter
                          color={ink}
                          drawing={inHand.drawing}
                          seed={seedOf(next)}
                          shape={inHand.shape}
                          still
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right under the page, in one column as in two: the steps back
          and forth together on the left – filled while there is one to
          take, it should be seen; faint while there is none – and on the
          right the bin for the print picked. Its place is kept while there
          is none: nothing moves as it comes and goes. */}
            <div className={cn("flex items-center justify-between gap-4", fit)}>
              <div className="flex items-center gap-2">
                {(
                  [
                    [undo, can.undo, t.app.day.undo, "Meta+Z Control+Z", ""],
                    // The same arrow, the other way round.
                    [
                      redo,
                      can.redo,
                      t.app.day.redo,
                      "Meta+Shift+Z Control+Shift+Z Control+Y",
                      "-scale-x-100",
                    ],
                  ] as const
                ).map(([go, able, label, keys, flip]) => (
                  <button
                    aria-keyshortcuts={keys}
                    aria-label={label}
                    className={cn(
                      ROUND_BUTTON,
                      "h-12 w-12",
                      able && "scribble-ink"
                    )}
                    disabled={!able}
                    key={label}
                    onClick={go}
                    title={label}
                    type="button"
                  >
                    <StepSign className={cn("h-6 w-6", flip)} />
                  </button>
                ))}
              </div>
              <button
                aria-keyshortcuts="Delete Backspace"
                aria-label={t.app.day.remove}
                // Red, like every button that deletes something.
                className={cn(
                  ROUND_BUTTON,
                  "scribble-danger h-11 w-11",
                  !(marked && !inHand) && "invisible"
                )}
                onClick={() => {
                  if (marked) remove(marked);
                }}
                title={t.app.day.remove}
                type="button"
              >
                <BinSign className="h-5 w-5" />
              </button>
            </div>
          </div>
          {dayNote && (
            <div className="w-full shrink-0 snap-center">
              <div className={fit}>{dayNote}</div>
            </div>
          )}
        </div>

        {/* Under the note – or, with room, beside the page: the tools, what
          to do now and the tray. */}
        <div className="flex min-w-0 flex-col gap-4 [grid-area:side]">
          {/* The tools, each under its word: the inks, and under them the
          stamp in hand (or the print picked, which the same two buttons
          turn). */}
          <div className="flex flex-col gap-3">
            <fieldset className="min-w-0" {...showHand}>
              <legend className={cn(CAPTION, "mb-1.5")}>{t.app.day.ink}</legend>
              {/* Flat blots of ink. On a phone in one row: more than there is
              room for, it scrolls sideways (only – up and down the swipe is
              the page's) and fades where it goes on (fading-edges.ts), with
              room all round inside the scroller, so the marker ring round the
              one in use, lifted, isn't cut. Wider, closer together – one
              set of pads – they wrap: nothing scrolls, cuts or fades.
              Beside the page a little smaller and right against each
              other: eight to a row – a gift's own ink, come with its stamp,
              still finds room in the first. */}
              <div
                className={cn(
                  "-m-4 flex gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain p-4 sm:m-0 sm:flex-wrap sm:gap-0.5 sm:overflow-visible sm:mask-none sm:p-0 @2xl:gap-0",
                  FADING.x
                )}
                ref={inkRow}
              >
                {pads.map(({ key: c, hex, name: names }, i) => (
                  <button
                    aria-label={names[locale]}
                    aria-pressed={ink === c}
                    className={cn(
                      "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform @2xl:h-10 @2xl:w-10",
                      ink === c
                        ? "scale-110"
                        : "hover:-rotate-6 hover:scale-110"
                    )}
                    key={c}
                    onClick={() => setInk(c)}
                    type="button"
                  >
                    <InkBlot hex={hex} index={i} on={ink === c} />
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Under the inks, a row of its own: the stamp's group. Faint
              while there is nothing to turn, like the steps – there all
              along: nothing moves as it comes and goes. */}
            <fieldset className="min-w-0" disabled={!(inHand || marked)}>
              <legend className={cn(CAPTION, "mb-1.5")}>
                {marked && !inHand ? t.app.day.print : t.app.day.inHand}
              </legend>
              <div className="flex items-center gap-1">
                {turnButton(-STEP, t.app.day.turnLeft, "ArrowLeft [")}
                {/* How far it is turned – pressed, straight again: the
                  print as the buttons turn it, a step to take back. */}
                {inHand ? (
                  <button
                    aria-label={t.app.day.straighten}
                    className={ANGLE}
                    key="hand"
                    onClick={straighten}
                    ref={(box) => {
                      angle.current = box;
                      showAngle();
                    }}
                    title={t.app.day.straighten}
                    type="button"
                  />
                ) : (
                  <button
                    aria-label={t.app.day.straighten}
                    className={cn(ANGLE, !marked && "opacity-40")}
                    disabled={!marked?.rotation}
                    key="print"
                    onClick={() => {
                      if (marked) turnPrint(marked, -marked.rotation);
                    }}
                    title={t.app.day.straighten}
                    type="button"
                  >
                    {angleOf(marked?.rotation ?? 0)}
                  </button>
                )}
                {turnButton(STEP, t.app.day.turnRight, "ArrowRight ]")}
              </div>
            </fieldset>
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

          {/* The stamps: their order right beside their word, to pick (one
          choice with the shelf's), and at the end of the line the way to
          the shelf; a new one last. */}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
              <span className={CAPTION}>{t.app.stamps}</span>
              {stamps.length > 1 && (
                <OrderMenu
                  locale={locale}
                  onPick={onOrder}
                  onShow={setSorting}
                  order={order}
                />
              )}
              <a
                className="group ml-auto flex shrink-0 items-center gap-1 py-1 font-bold text-sm"
                href={shelf}
                onClick={(event) => {
                  if (!opensHere(event)) return;
                  event.preventDefault();
                  onShelf();
                }}
              >
                <span className="group-hover:scribble-underline">
                  {t.app.allStamps}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
              </a>
            </div>
            {stamps.length === 0 && (
              <p className="text-muted text-sm">{t.app.noStamps}</p>
            )}
            {/* The stamps stand free, no frame each: the one in hand is lifted
              and ringed with the marker. A new one is drawn from the last
              tile. Where nothing points (a finger), each wears its name right
              under it – one line, always there, so the rows are as high with
              names as without.
              On a phone, two rows to swipe – sideways only: up and down the
              swipe is the page's. No bar; it fades where it goes on
              (fading-edges.ts). Room all round inside the scroller (it clips
              both ways): a stamp can lift, turn and wear its ring and focus
              ring without losing a corner – 20px above and below: with less,
              the rows would scroll up and down by what sticks out. Wider,
              a little larger, they wrap – as many to a row as fit, close
              together from the left, all in sight: nothing scrolls, cuts or
              fades. Beside the page larger still, three to a row – just as
              wide as the tools over them. */}
            <div
              className={cn(
                "-m-4 grid auto-cols-[4.75rem] grid-flow-col grid-rows-2 items-start gap-x-3 gap-y-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 py-5 sm:m-0 sm:grid-flow-row sm:grid-cols-[repeat(auto-fill,5.5rem)] sm:grid-rows-none sm:gap-4 sm:overflow-visible sm:mask-none sm:px-0 sm:py-2 @2xl:grid-cols-[repeat(auto-fill,6rem)]",
                FADING.x
              )}
              ref={tray}
            >
              {stamps.map((s) => (
                <div
                  className="flex w-19 shrink-0 flex-col sm:w-22 @2xl:w-24"
                  data-stamp={s.id}
                  key={s.id}
                >
                  {/* Its name on a tag when pointed at – in the top layer, so
                    the scroller doesn't clip it. (Another anchor than the
                    shelf's.) */}
                  <NameTag id={`tray-${s.id}`} text={s.name}>
                    {({ onClick: hideTag, ...anchor }) => (
                      <button
                        {...anchor}
                        aria-label={s.name || t.app.day.print}
                        aria-pressed={held === s.id}
                        className={cn(
                          "scribble scribble-clear relative h-19 w-19 shrink-0 rounded-[26px] p-0.5 transition-transform duration-150 ease-out [--scribble-inset:-4px] sm:h-22 sm:w-22 @2xl:h-24 @2xl:w-24",
                          held === s.id
                            ? "scribble-bold -translate-y-1"
                            : "scribble-bare hover:-rotate-6 hover:scribble-soft active:scale-90"
                        )}
                        onClick={(event) => {
                          hideTag();
                          // By keyboard there is no pointing at the page: the
                          // stamp comes down somewhere on it – in the hand's
                          // ink if it is the one held, else in its own.
                          if (event.detail === 0) {
                            const spot = () => 0.25 + Math.random() * 0.5;
                            print(
                              s,
                              { x: spot(), y: spot() },
                              tidy(turn.current),
                              held === s.id ? ink : knownKey(s.color, palette)
                            );
                            return;
                          }
                          take(held === s.id ? null : s.id);
                        }}
                        type="button"
                      >
                        <span className="block">
                          <Sticker className="pointer-events-none" stamp={s} />
                        </span>
                        {s.drawing?.special && (
                          // A stamp for the big days.
                          <Sparkle className="pointer-events-none absolute top-0.5 right-0.5 h-3.5 w-3.5 text-ink" />
                        )}
                      </button>
                    )}
                  </NameTag>
                  {/* Said by the button already. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      NAME_UNDER,
                      "hidden h-4 [@media(hover:none)]:block",
                      held === s.id && "text-ink"
                    )}
                  >
                    {s.name}
                  </span>
                </div>
              ))}
              {/* A new one, last – drawn, it comes back into the hand. */}
              <button
                className="scribble scribble-dashed group flex h-19 w-19 shrink-0 flex-col items-center justify-center gap-1 rounded-3xl px-1 text-center font-bold text-[11px] leading-tight transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scribble-boil active:translate-y-px active:scale-[0.97] sm:h-22 sm:w-22 @2xl:h-24 @2xl:w-24"
                onClick={onNew}
                type="button"
              >
                <span className="scribble scribble-sm scribble-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-200 group-hover:rotate-90">
                  <Plus className="h-4 w-4" />
                </span>
                {t.app.newStamp}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pressed, the stamp is as wide as its print – a special one wider.
        Once the page is on its way out (another view, its sheet closing),
        nothing is in hand any more: the stamp is gone before the page is. */}
      <StampHand
        ink={ink}
        ref={hand}
        stamp={leaving ? null : inHand}
        unit={(unit * size) / PRINT}
      />
    </div>
  );
};

/** What a phone shows of a day: its page, or its note. */
type Side = "page" | "note";

/**
 * Which of the two shows on a phone – a pill like the views'
 * (view-switch.tsx), smaller, the stroke behind the one in sight. A dot by
 * the note's word once something is written in it.
 */
const SideSwitch = ({
  side,
  noted,
  locale,
  onPick,
  className,
}: {
  side: Side;
  noted: boolean;
  locale: Locale;
  onPick: (side: Side) => void;
  className?: string;
}) => {
  const t = dictionaryOf(locale).app.day;
  // Its own stroke – the today view's may lie under a day's sheet.
  const mark = useId();
  return (
    <fieldset
      className={cn(
        "scribble scribble-sm scribble-thin scribble-clear flex w-fit shrink-0 gap-0.5 rounded-full p-1",
        className
      )}
    >
      <legend className="sr-only">{t.sides}</legend>
      {(["page", "note"] as const).map((each) => (
        <button
          aria-label={each === "note" && noted ? t.noted : undefined}
          aria-pressed={side === each}
          className={cn(
            "relative isolate flex items-center gap-1 rounded-full px-3 py-1 font-bold text-sm transition-colors",
            side === each ? "text-ink" : "text-muted hover:text-ink"
          )}
          key={each}
          onClick={() => onPick(each)}
          type="button"
        >
          {side === each && (
            <m.span
              aria-hidden="true"
              className="scribble scribble-bare scribble-sm absolute inset-0 -z-10 -rotate-1 rounded-full [--scribble-fill:var(--cal-mark,var(--color-soft))]"
              layoutId={mark}
              transition={SPRING.soft}
            />
          )}
          {t[each]}
          {each === "note" && noted && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-current"
            />
          )}
        </button>
      ))}
    </fieldset>
  );
};

type Sign = { className?: string };

/** A stamp, a little askew, and an arrow over it – turned to the left. */
const TurnSign = ({ className }: Sign) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    viewBox="0 0 24 24"
  >
    <rect
      height="9"
      rx="2"
      transform="rotate(-12 15 15)"
      width="9"
      x="10.5"
      y="10.5"
    />
    <path d="M15 4.5A10.5 10.5 0 0 0 4.5 15" />
    <path d="m1.8 12.4 2.7 3 2.7-3" />
  </svg>
);

/** A hooked arrow – a step back. */
const StepSign = ({ className }: Sign) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.8"
    viewBox="0 0 24 24"
  >
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

/** A bin – off the page. */
const BinSign = ({ className }: Sign) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    viewBox="0 0 24 24"
  >
    <path d="M4 6.5h16" />
    <path d="M9 6.5V4h6v2.5" />
    <path d="M6 6.5 7 19a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 19l1-12.5" />
    <path d="M10 10.5v6M14 10.5v6" />
  </svg>
);
