"use client";

import {
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
  useRef,
  useState,
} from "react";
import type { Snapshot } from "valtio";
import type { ColorName, StampDoc } from "@/features/calendar/model";
import { Glitter, StampSvg } from "@/features/calendar/stamp-svg";
import { PAPER } from "@/features/calendar/tint";
import { movePlacement } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import {
  DRAG,
  onPage,
  onScreen,
  type Print,
  printOf,
  type Stamp,
  seedOf,
  tidy,
  within,
} from "./prints";
import type { Hand } from "./use-hand";
import type { Step } from "./use-steps";

/**
 * A day's page itself (day-page.tsx): a sheet of dotted paper with the
 * prints on it – the stamp in hand comes down on it, a print is picked,
 * moved and let go of on it – and the faint preview of the next print.
 */
export const Paper = ({
  locale,
  page,
  fit,
  hand,
  ink,
  next,
  print,
  stamps,
  placements,
  picked,
  setPicked,
  glide,
  setGlide,
  old,
  note,
}: {
  locale: Locale;
  /** The page inside the frame, where the prints lie. */
  page: RefObject<HTMLDivElement | null>;
  /** As wide as it may be (day-page.tsx). */
  fit: string;
  hand: Hand;
  ink: ColorName;
  /** The next print's id – its preview is that very print, blot for blot. */
  next: string;
  /** A print of the stamp in hand, as its preview showed it. */
  print: (
    stamp: Stamp,
    at: { x: number; y: number },
    rotation: number,
    inked: ColorName
  ) => void;
  stamps: Snapshot<Record<string, StampDoc>>;
  /** The day's prints, the lowest first. */
  placements: readonly Print[];
  picked: string | null;
  setPicked: Dispatch<SetStateAction<string | null>>;
  /** A print on its way back after an undo – it glides instead of jumping. */
  glide: string | null;
  setGlide: (id: string | null) => void;
  /** What was on the page when it opened; anything newer appears like ink. */
  old: ReadonlySet<string>;
  note: (step: Step) => void;
}) => {
  const t = dictionaryOf(locale);
  const { inHand, take, aim, turn, preview, size, ghost, showHand, handle } =
    hand;
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
    const at = onPage(page.current, event.clientX, event.clientY);
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
    const there = onScreen(page.current, spot);
    const stay = event.pointerType !== "touch";
    if (!(handle.current && there)) touch();
    // One at a time: while the stamp is still at the last one, nothing.
    else if (!handle.current.press(there.x, there.y, touch, stay)) return;
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

  return (
    // A sheet of dotted paper, drawn round with the marker – the frame
    // outside, the page inside it clipping the prints at its edge. It is
    // the calendar's own paper (`PAPER`, in the shades the app's frame
    // hands down): pale in its color, the dots its pencil's.
    <div
      className={cn("scribble rounded-[27px] p-[3px]", fit)}
      style={PAPER as CSSProperties}
      {...showHand}
    >
      <div
        className={cn(
          "relative aspect-square w-full select-none overflow-hidden rounded-3xl bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]",
          // With a stamp in hand a finger on the page stamps, and nothing
          // scrolls from it; the preview marks the spot – no arrow on top
          // of it. Without, a swipe up or down scrolls.
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
          const stamp = stamps[p.stamp];
          const here = drag?.id === p.id ? drag : p;
          const inked = p.ink ?? stamp?.color ?? "red";
          return (
            <div
              className={cn(
                "absolute",
                glide === p.id && "transition-[left,top] duration-300"
              )}
              key={p.id}
              // Its own glide only – not one of what is inside it.
              onTransitionEnd={(event) => {
                if (event.target === event.currentTarget) setGlide(null);
              }}
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
                  // Picked: the marker drawn round it – a solid line, so it
                  // isn't taken for the keyboard's dashed ring, which goes
                  // round the outside of it. It holds still: a line astir
                  // would have the print's ink drawn anew with it. And it
                  // is the finger's now: dragged, it moves – the page
                  // doesn't scroll from it.
                  picked === p.id &&
                    "scribble scribble-sm scribble-clear touch-none [--scribble-inset:-6px] [--scribble-ring:-12px]"
                )}
                onClick={(event) => {
                  // By keyboard (Enter, Space) – a tap is told from a drag
                  // below. The stamp in hand is put down for it.
                  if (event.detail !== 0) return;
                  if (inHand) take(null);
                  setPicked(picked === p.id ? null : p.id);
                }}
                // A swipe that scrolls takes the pointer away: nothing was
                // moved, nothing is picked.
                onPointerCancel={() => {
                  if (drag?.id === p.id) setDrag(null);
                }}
                onPointerDown={(event) => {
                  const at = onPage(page.current, event.clientX, event.clientY);
                  if (!at) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDrag({
                    id: p.id,
                    x: p.x,
                    y: p.y,
                    grab: { x: at.x - p.x, y: at.y - p.y },
                    from: { x: event.clientX, y: event.clientY },
                    // A finger moves the picked print only – across any
                    // other it may be on its way down the page.
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
                  const at = onPage(page.current, event.clientX, event.clientY);
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
          // The next print, faintly: where and how the stamp will leave it.
          // Moved by preview(), so no style of React's is in its way.
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
  );
};
