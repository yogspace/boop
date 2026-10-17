"use client";

import { type Ref, useEffect, useImperativeHandle, useState } from "react";
import type { ColorName } from "@/features/calendar/model";
import type { StickerInput } from "./build";
import { createHand } from "./hand/hand";

/**
 * The stamp in your hand, live in 3D. Carried, it is a small companion of
 * the pointer – upright, parked up-left of it, swinging a little as it goes;
 * the spot the pointer is on stays free. Pressed, it is lifted over that
 * spot – towards you, so bigger than its print, tipping over flat – and
 * comes down on the page with a blow: seen from above now, its back to you,
 * its outline exactly the print's as it touches. It squashes a little, comes
 * off again (bigger once more) and goes back to the pointer's side, small.
 * Turned (`turn()`), it spins about its own axis: pressed, it lies exactly
 * as the print does.
 *
 * A finger doesn't point: there it is no companion. It only comes for the
 * press – flies to the spot, comes down, comes off – and is gone again by
 * itself (`press()` without `stay`).
 *
 * One small canvas that travels along – fixed, on the body itself, so no
 * sheet clips it – moved and drawn without React (hand/hand.ts), through
 * the ref: `point()`, `hide()`, `press()`, `turn()`. It only draws while something
 * moves. Fixed means it doesn't go along when something scrolls: it lets go
 * then (`drop`), rather than stand where the spot it was at no longer is.
 *
 * Taken, a stamp is built a part at a time and its programs compiled out of
 * the way (render.ts, ink.ts) – the page never stalls on it; until it is
 * ready, a press just leaves its print.
 */

export type StampHandle = {
  /** The pointer is here (client px) – the stamp keeps to its side. */
  point: (x: number, y: number) => void;
  /** The pointer went elsewhere – the stamp goes too. */
  hide: () => void;
  /**
   * Onto this spot and back – `contact` runs as it touches (at once without
   * WebGL or with reduced motion). With `stay` (a mouse) it then keeps
   * beside the spot until it is pointed elsewhere; without (a finger, which
   * never points elsewhere) it goes as it comes off the page. One press at a
   * time: while it is still at it, the next one is refused (`false`) and
   * nothing touches.
   */
  press: (x: number, y: number, contact: () => void, stay?: boolean) => boolean;
  /**
   * Turned like a print with this `rotation` (degrees, clockwise) – it spins
   * there the shortest way round.
   */
  turn: (degrees: number) => void;
};

export const StampHand = ({
  stamp,
  ink,
  unit,
  ref,
}: {
  /** The stamp in hand – null: none, nothing shows. */
  stamp: StickerInput | null;
  /** The ink its rubber carries. */
  ink: ColorName;
  /** One print width where it stamps, in px – pressed, its face is that wide. */
  unit: number;
  ref?: Ref<StampHandle>;
}) => {
  const [hand] = useState(createHand);
  useImperativeHandle(
    ref,
    () => ({
      point: hand.point,
      hide: hand.hide,
      press: hand.press,
      turn: hand.turn,
    }),
    [hand]
  );

  useEffect(() => () => hand.dispose(), [hand]);
  useEffect(() => hand.resize(unit), [hand, unit]);
  useEffect(() => hand.paint(ink), [hand, ink]);

  const shape = stamp?.shape;
  const color = stamp?.color;
  const drawing = stamp?.drawing;
  useEffect(() => {
    hand.hold(
      shape && color ? { shape, color, drawing: drawing ?? null } : null
    );
  }, [hand, shape, color, drawing]);

  return null;
};
