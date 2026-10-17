import {
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ColorName } from "@/features/calendar/model";
import type { StampHandle } from "@/features/stickers/stamp-hand";
import {
  angleOf,
  GHOST,
  onPage,
  PRINT,
  printOf,
  type Stamp,
  tidy,
  VIEW_BOX,
  wheelTurn,
} from "./prints";

/**
 * The stamp in hand on a day's page (day-page.tsx): which one, how it is
 * turned, where it is aimed – the faint preview of its next print on the
 * page and the 3D stamp at the pointer's side (stamp-hand.tsx) going along.
 */

/** What `useHand` hands back – for the page and the tools that turn it. */
export type Hand = ReturnType<typeof useHand>;

/**
 * Holds a stamp of `stamps` – with none, the prints can be moved and picked.
 * Taken, it comes in its own ink (`setInk`), and the print picked is let go
 * of (`setPicked`). The wheel over the `page` turns it.
 */
export const useHand = ({
  stamps,
  page,
  setInk,
  setPicked,
}: {
  stamps: readonly Stamp[];
  page: RefObject<HTMLDivElement | null>;
  setInk: Dispatch<SetStateAction<ColorName>>;
  setPicked: Dispatch<SetStateAction<string | null>>;
}) => {
  const hand = useRef<StampHandle>(null);
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
  }, [page]);

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
    [preview, showAngle, stamps, setInk, setPicked]
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
  }, [page, holding, turnBy]);

  // Where a finger last was. A browser may stir the hover once something
  // has scrolled – a “mouse” moving to just that spot, where no mouse is:
  // the finger's echo, which mustn't call the stamp back. A mouse anywhere
  // else is one. And whether the last press was a finger's
  // (`showForFinger`).
  const finger = useRef<{ x: number; y: number } | null>(null);
  const fingered = useRef(false);
  useEffect(() => {
    const keep = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      finger.current = { x: event.clientX, y: event.clientY };
    };
    const press = (event: globalThis.PointerEvent) => {
      fingered.current = event.pointerType === "touch";
    };
    window.addEventListener("pointerdown", keep, true);
    window.addEventListener("pointerup", keep, true);
    window.addEventListener("pointerdown", press, true);
    return () => {
      window.removeEventListener("pointerdown", keep, true);
      window.removeEventListener("pointerup", keep, true);
      window.removeEventListener("pointerdown", press, true);
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
  // is turned, taken or given another ink (where it was last tapped).
  const carry = (event: PointerEvent<HTMLElement>) => {
    if (!inHand || echo(event)) return;
    const at = onPage(page.current, event.clientX, event.clientY);
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

  /**
   * A stamp or an ink tapped with a finger, which doesn't hover: the
   * preview shows where the stamp was last aimed – as when it is turned
   * (`turnBy`), and gone the same way. The mouse shows it by pointing.
   */
  const showForFinger = useCallback(() => {
    if (!fingered.current) return;
    aim.current.on = true;
    preview();
  }, [preview]);

  // The page and the inks are where the stamp in hand shows – it lingers a
  // moment as the pointer goes from one to the other (stamp-hand.tsx).
  const showHand = {
    onPointerEnter: carry,
    onPointerLeave: letGo,
    onPointerMove: carry,
  };

  return {
    /** The 3D stamp at the pointer's side (stamp-hand.tsx). */
    handle: hand,
    held,
    inHand,
    holding,
    size,
    unit,
    aim,
    turn,
    ghost,
    angle,
    preview,
    showAngle,
    turnBy,
    straighten,
    take,
    showForFinger,
    showHand,
  };
};
