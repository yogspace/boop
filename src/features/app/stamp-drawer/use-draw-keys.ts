import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import type { Tool } from "../draw-tools";
import type { useLine } from "../use-line";
import { NUDGE, type useSelect } from "../use-select";
import { back, forward, type History } from "./history";

/** The editor's keys while drawing. */

/** Whether a key goes to a field – then it is the field's, not a tool's. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("input, textarea, select, [contenteditable]"));

/**
 * The keys, while drawing and not in a field: ⌘Z / Ctrl+Z a step back,
 * with ⇧ (or Ctrl+Y) forward again; P or B the pen, L the line, E the
 * eraser, V picking, A a line's points – ⌘A all of it. ⌘+ and ⌘− zoom,
 * ⌘0 shows the whole face; the space bar held, a drag moves it. With
 * something picked: Escape lets go (before the editor hears it and closes),
 * Delete removes it, the arrows move it, ⌘D a copy, ⌘C/⌘X/⌘V within the
 * editor. A line being drawn: Enter or Escape ends it, ⌫ takes its last
 * point. Editing points: Delete takes the picked one, Escape or Enter is
 * done.
 */
export const useDrawKeys = ({
  draws,
  tool,
  area,
  spaceHeld,
  select,
  line,
  zoom,
  setHistory,
  chooseTool,
  editPoints,
  leavePoints,
}: {
  draws: boolean;
  tool: Tool;
  area: RefObject<HTMLDivElement | null>;
  /** The space bar is held – a drag moves the view (use-stage-pointer.ts). */
  spaceHeld: RefObject<boolean>;
  select: ReturnType<typeof useSelect>;
  line: ReturnType<typeof useLine>;
  zoom: { zoomBy: (factor: number) => void; reset: () => void };
  setHistory: Dispatch<SetStateAction<History>>;
  chooseTool: (tool: Tool) => void;
  editPoints: () => void;
  leavePoints: (stroke: number | null) => void;
}) => {
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (typing(event.target)) return;
    const key = event.key.toLowerCase();
    const chosen = tool === "move" && select.picked;
    const removes = key === "delete" || key === "backspace";
    const ends = key === "enter" || key === "escape";
    if (event.metaKey || event.ctrlKey) {
      if (event.altKey) return;
      if (key === "z") setHistory(event.shiftKey ? forward : back);
      else if (key === "y") setHistory(forward);
      else if (key === "+" || key === "=") zoom.zoomBy(1.5);
      else if (key === "-") zoom.zoomBy(1 / 1.5);
      else if (key === "0") zoom.reset();
      else if (key === "a") {
        chooseTool("move");
        select.all();
      } else if (key === "d" && chosen) select.duplicate();
      else if (key === "c" && chosen) select.copy();
      else if (key === "x" && chosen) select.cut();
      else if (key === "v" && select.paste()) chooseTool("move");
      else return;
      event.preventDefault();
      return;
    }
    if (event.altKey) return;
    if (key === " ") {
      spaceHeld.current = true;
      if (area.current) area.current.style.cursor = "grab";
    } else if (key === "p" || key === "b") chooseTool("pen");
    else if (key === "l") chooseTool("line");
    else if (key === "e") chooseTool("eraser");
    else if (key === "v") chooseTool("move");
    else if (key === "a") editPoints();
    else if (tool === "line" && line.active && ends) {
      line.finish();
      event.stopImmediatePropagation();
    } else if (tool === "line" && line.active && removes) line.back();
    else if (tool === "points" && ends) {
      leavePoints(line.editing);
      event.stopImmediatePropagation();
    } else if (tool === "points" && line.anchor !== null && removes) {
      line.removePoint();
    } else if (chosen && key === "escape") {
      select.clear();
      event.stopImmediatePropagation();
    } else if (chosen && removes) {
      select.remove();
    } else if (chosen && key.startsWith("arrow")) {
      const by = event.shiftKey ? NUDGE.big : NUDGE.small;
      const way = key.slice(5);
      select.nudge(
        way === "left" ? -by : way === "right" ? by : 0,
        way === "up" ? -by : way === "down" ? by : 0
      );
    } else return;
    event.preventDefault();
  };
  useEffect(() => {
    if (!draws) return;
    const onKey = (event: KeyboardEvent) => keys.current(event);
    const onUp = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      spaceHeld.current = false;
      if (area.current) area.current.style.cursor = "";
    };
    // Caught on the way down – before the editor's own Escape
    // (use-save-and-leave.ts).
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onUp);
    };
  }, [draws, area, spaceHeld]);
};
