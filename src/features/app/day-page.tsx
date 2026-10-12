"use client";

import { useIsPresent } from "motion/react";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Snapshot } from "valtio";
import { Sparkle } from "@/components/doodles";
import { BADGE, Button, ROUND_BUTTON } from "@/components/ui";
import { trackEvent } from "@/features/analytics/client";
import {
  type ColorName,
  type DayKey,
  type PlacementDoc,
  SPECIAL_SIZE,
  type StampDoc,
} from "@/features/calendar/model";
import { knownKey } from "@/features/calendar/palette";
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
import { FADING, useFadingEdges } from "./fading-edges";
import { InkBlot } from "./ink-blot";
import { NameTag } from "./name-tag";

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

/**
 * What can be taken back, newest last. `id` is the print as it is now: one
 * that comes back after a removal is a new one (restorePlacement).
 */
type Step =
  | { kind: "place"; id: string }
  | { kind: "move"; id: string; x: number; y: number; z: number }
  | { kind: "remove"; id: string; print: Print };

const within = (value: number) => Math.min(Math.max(value, 0), 1);

/** An angle as a print keeps it: whole degrees, −180…180. */
const tidy = (degrees: number) => {
  const turned = Math.round(degrees) % 360;
  if (turned > 180) return turned - 360;
  return turned < -180 ? turned + 360 : turned;
};

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

/**
 * A day's page of a calendar, with the prints on it, the inks and the tray
 * of stamps – in the day's sheet (day-sheet.tsx) and, for today, right in
 * the app (today-view.tsx). Tap a stamp – it's in your hand
 * (stamp-hand.tsx): small, at the pointer's side, while a faint preview on
 * the page shows the print it will leave; the wheel (or the two buttons, or
 * ← →) turns it. Tap the page – it comes down right there, as previewed;
 * tap an ink – the stamp takes that ink. With no stamp in hand the prints
 * can be moved, picked (a tap; Enter or Space) and, picked, removed (the
 * button; Delete or Backspace). Every step can be taken back.
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
 * Narrow (a phone, the day's sheet), all is one column: `heading`, the
 * page, the inks, the tray. With room enough – the today view on a wider
 * screen – the rest stands beside the page, and the page is as large as
 * the window lets it be: page, inks and tray all in sight at once.
 */
export const DayPage = ({
  calendar,
  date,
  locale,
  stamps,
  heading,
  keyboard = true,
  className,
}: {
  calendar: string;
  date: DayKey;
  locale: Locale;
  stamps: readonly Stamp[];
  heading?: ReactNode;
  keyboard?: boolean;
  className?: string;
}) => {
  const t = dictionaryOf(locale);
  const boop = useBoop();
  const page = useRef<HTMLDivElement>(null);
  const hand = useRef<StampHandle>(null);
  // Going – the view it is in gives way to another, its sheet closes.
  const leaving = !useIsPresent();
  // The stamps' row, where it scrolls sideways: it fades where it goes on.
  const tray = useFadingEdges("x");
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

  // Undo: the steps of this visit, and a line they queue up in – a step is
  // noted before the next undo looks, also while its print is still saving.
  const steps = useRef<Step[]>([]);
  const line = useRef<Promise<void>>(Promise.resolve());
  const [undoable, setUndoable] = useState(false);
  const note = useCallback((step: Step) => {
    line.current = line.current.then(() => {
      steps.current.push(step);
      setUndoable(true);
    });
  }, []);
  const undo = useCallback(() => {
    line.current = line.current
      .then(async () => {
        const step = steps.current.pop();
        setUndoable(steps.current.length > 0);
        if (!step) return;
        if (step.kind === "place") {
          setPicked((id) => (id === step.id ? null : id));
          await removePlacement(step.id);
        } else if (step.kind === "move") {
          setGlide(step.id);
          await movePlacement(step.id, { x: step.x, y: step.y, z: step.z });
        } else {
          // Back as a new print – earlier steps now mean that one.
          const id = await restorePlacement(step.print);
          for (const earlier of steps.current) {
            if (earlier.id === step.id) earlier.id = id;
          }
        }
      })
      .catch(() => undefined);
  }, []);

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

  /** Turns the stamp in hand – its preview turns, the 3D stamp spins along. */
  const turnBy = useCallback(
    (degrees: number) => {
      turn.current += degrees;
      // Turned by button or key, it shows where the stamp was last aimed.
      aim.current.on = true;
      preview();
      hand.current?.turn(Math.round(turn.current));
    },
    [preview]
  );

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
      hand.current?.turn(0);
    },
    [preview, stamps]
  );

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
  // ⌘Z / Ctrl+Z takes a step back; ← → and [ ] turn the stamp in hand.
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key === "z") {
        // Typing, ⌘Z takes back the typing.
        if (typing(event)) return;
        event.preventDefault();
        undo();
        return;
      }
      if (!holding || mod) return;
      if (event.key === "Escape") {
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
  }, [keyboard, holding, take, turnBy, undo]);

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

  // A picked print: Delete or Backspace takes it off the page, Escape lets
  // go of it – and, like putting the stamp down, goes ahead of a sheet's
  // own Escape, which would close it.
  useEffect(() => {
    if (!(marked && keyboard)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        setPicked(null);
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !typing(event)
      ) {
        event.preventDefault();
        remove(marked);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyboard, marked, remove]);

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
    note({ kind: "place", id });
    void placeStamp({
      id,
      calendar,
      date,
      stamp: stamp.id,
      ...at,
      rotation,
      ink: inked,
    });
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

  return (
    // How it is laid out goes by its own width (a container – the queries
    // read the box around, so the layout is the box inside). Beside the
    // page: as wide as is left of the room, 15rem at least; the page as
    // high as the window has room under the app's bar, the greeting and the
    // calendar's name (23rem) – 16rem at least.
    <div className={cn("@container", className)}>
      <div className="flex flex-col gap-4 @lg:grid @lg:grid-cols-[auto_minmax(0,1fr)] @lg:grid-rows-[auto_1fr] @lg:gap-x-5">
        {heading && (
          <div className="@lg:col-start-2 @lg:row-start-1">{heading}</div>
        )}
        {/* A sheet of dotted paper, drawn round with the marker – the frame
          outside, the page inside it clipping the prints at its edge. It is
          the calendar's own paper (`PAPER`, in the shades the app's frame
          hands down): pale in its color, the dots its pencil's. */}
        <div
          // Not stretched to the column beside it (`self-start`): the frame
          // hugs the square page, however tall the inks and the tray are.
          className="scribble rounded-[27px] p-[3px] @lg:col-start-1 @lg:row-span-2 @lg:row-start-1 @lg:w-[clamp(16rem,calc(100dvh_-_23rem),calc(100cqw_-_15rem))] @lg:self-start"
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
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDrag({
                        id: p.id,
                        x: p.x,
                        y: p.y,
                        grab: { x: at.x - p.x, y: at.y - p.y },
                        from: { x: event.clientX, y: event.clientY },
                        // A finger moves the picked print only – across
                        // any other it may be on its way down the page.
                        loose: event.pointerType === "mouse" || picked === p.id,
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
                        const top = Math.max(...placements.map((q) => q.z)) + 1;
                        note({
                          kind: "move",
                          id: p.id,
                          x: p.x,
                          y: p.y,
                          z: p.z,
                        });
                        void movePlacement(p.id, {
                          x: drag.x,
                          y: drag.y,
                          ...(p.z < top - 1 && { z: top }),
                        });
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

        {/* What is beside the page – or under it. */}
        <div className="flex min-w-0 flex-col gap-4 @lg:col-start-2 @lg:row-start-2">
          <fieldset className="min-w-0" {...showHand}>
            <legend className="mb-2 font-bold text-muted text-sm">
              {t.app.day.ink}
            </legend>
            {/* Flat blots of ink, in a row that wraps – nothing scrolls, so
              the marker ring round the one in use is never cut. */}
            <div className="flex flex-wrap gap-1.5">
              {palette.map(({ key: c, hex, name: names }, i) => (
                <button
                  aria-label={names[locale]}
                  aria-pressed={ink === c}
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-full transition-transform",
                    ink === c ? "scale-110" : "hover:-rotate-6 hover:scale-110"
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

          {/* Beside the page there is too little room for the words beside the
          buttons: they go above them. */}
          <div className="flex min-h-10 items-center justify-between gap-2 @lg:flex-col @lg:items-start">
            <p className="font-bold text-muted text-sm">
              {inHand
                ? t.app.day.held
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
            <div className="flex shrink-0 items-center gap-3">
              {inHand && (
                // Turning without a wheel – a pair, apart from undo's arrow.
                <div className="flex gap-1">
                  {(
                    [
                      [-STEP, t.app.day.turnLeft, ""],
                      // The same arrow, the other way round.
                      [STEP, t.app.day.turnRight, "-scale-x-100"],
                    ] as const
                  ).map(([degrees, label, flip]) => (
                    <button
                      aria-label={label}
                      className={ROUND_BUTTON}
                      key={degrees}
                      onClick={() => turnBy(degrees)}
                      title={label}
                      type="button"
                    >
                      <svg
                        aria-hidden="true"
                        className={cn("h-4.5 w-4.5", flip)}
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.6"
                        viewBox="0 0 24 24"
                      >
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
              {marked && (
                <Button
                  aria-keyshortcuts="Delete Backspace"
                  onClick={() => remove(marked)}
                  size="sm"
                  variant="plain"
                >
                  {t.app.day.remove}
                </Button>
              )}
              <button
                aria-label={t.app.day.undo}
                className={ROUND_BUTTON}
                disabled={!undoable}
                onClick={undo}
                title={t.app.day.undo}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="h-4.5 w-4.5"
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
              </button>
            </div>
          </div>

          {stamps.length === 0 ? (
            <p className="text-muted text-sm">{t.app.noStamps}</p>
          ) : (
            // A row to swipe – sideways only: up and down the swipe is the
            // page's. No bar; it fades where it goes on (fading-edges.ts).
            // Room all round inside the scroller (it clips both ways): a stamp
            // can lift, turn and wear its badge and focus ring without losing a
            // corner – 20px above and below, all a frame, a turned one and
            // the badge reach: with less, the row would scroll up and down by
            // what sticks out. The one in hand: lifted, its line drawn thick.
            // Beside the page the column is narrow – there they wrap, all in
            // sight, nothing scrolls, cuts or fades.
            <div
              className={cn(
                "-m-4 flex gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 py-5 @lg:m-0 @lg:flex-wrap @lg:gap-y-3 @lg:overflow-visible @lg:mask-none @lg:p-0",
                FADING.x
              )}
              ref={tray}
            >
              {stamps.map((s) => (
                // Its name on a tag when pointed at – in the top layer, so the
                // scroller doesn't clip it. (Another anchor than the shelf's.)
                <NameTag id={`tray-${s.id}`} key={s.id} text={s.name}>
                  {({ onClick: hideTag, ...anchor }) => (
                    <button
                      {...anchor}
                      aria-label={s.name || t.app.day.print}
                      aria-pressed={held === s.id}
                      className={cn(
                        "scribble scribble-thin relative h-20 w-20 shrink-0 rounded-3xl p-1 transition-transform duration-150 ease-out",
                        held === s.id
                          ? "scribble-bold -translate-y-1.5"
                          : "hover:-rotate-6 hover:scribble-boil active:scale-90"
                      )}
                      onClick={(event) => {
                        hideTag();
                        // By keyboard there is no pointing at the page: the stamp
                        // comes down somewhere on it – in the hand's ink if it is
                        // the one held, else in its own.
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
                        <Sparkle className="pointer-events-none absolute top-1 right-1 h-3.5 w-3.5 text-ink" />
                      )}
                      {held === s.id && (
                        // (A frame is `relative` – the badge goes in a box that isn't.)
                        <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 animate-fade">
                          <span
                            className={cn(
                              BADGE,
                              "scribble-ink whitespace-nowrap px-1.5 text-[10px]"
                            )}
                          >
                            {t.app.day.inHand}
                          </span>
                        </span>
                      )}
                    </button>
                  )}
                </NameTag>
              ))}
            </div>
          )}
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
