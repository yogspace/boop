import {
  type ChangeEvent,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { boxOf, NOTHING, type Selection } from "@/features/calendar/arrange";
import type { Art } from "@/features/calendar/art";
import {
  type Guides,
  guidesFor,
  linesAt,
  snapMove,
} from "@/features/calendar/guides";
import { importSvg } from "@/features/calendar/import-svg";
import type { StampShape } from "@/features/calendar/model";
import {
  type DrawingTemplate,
  templateArt,
} from "@/features/calendar/templates";
import type { Tool } from "../draw-tools";
import type { Locate, useSelect } from "../use-select";
import { type History, meanwhile, settled, step } from "./history";
import { addedIn, joined, shifted } from "./placing";

/**
 * What comes into the drawing from outside: a template tapped or dragged
 * in from its tile – picked once it is there – or an uploaded picture.
 */

/** An uploaded picture may be this big (bytes) – drawings are small. */
const MAX_UPLOAD = 1_000_000;
/** A template dropped in: this big (a share of the face). */
const TEMPLATE_SIZE = 0.42;
/** How near (px) a dropped template's edges and middle snap onto a guide. */
const SNAP = 6;

export const useDropIn = ({
  art,
  setHistory,
  width,
  shape,
  tool,
  select,
  locate,
  unitNow,
  chooseTool,
  setRefused,
}: {
  /** The drawing now. */
  art: Art;
  setHistory: Dispatch<SetStateAction<History>>;
  /** The width a template's lines are drawn with. */
  width: number;
  shape: StampShape;
  tool: Tool;
  select: ReturnType<typeof useSelect>;
  locate: Locate;
  unitNow: () => number;
  chooseTool: (tool: Tool) => void;
  setRefused: (refused: boolean) => void;
}) => {
  // What was dropped in, to pick once it is drawn.
  const [pickNext, setPickNext] = useState<Selection | null>(null);
  // A template being dragged in – and the guides it lies on.
  const [dropLines, setDropLines] = useState<Guides | null>(null);
  const dragging = useRef<{
    template: DrawingTemplate;
    pointer: number;
    before: Art;
    added: Art | null;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  // What last pressed a template's tile – a finger's tap puts it in.
  const tilePointer = useRef("");
  const [ghostOf, setGhostOf] = useState<DrawingTemplate | null>(null);

  // What was dropped in is picked once it is drawn – to move, size, turn.
  useEffect(() => {
    if (!pickNext || tool !== "move") return;
    select.pick(pickNext);
    setPickNext(null);
  }, [pickNext, tool, select]);

  // A picture takes the place of what was there – then it is drawn on.
  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    // The same file can be picked again.
    event.target.value = "";
    if (!chosen) return;
    setRefused(false);
    try {
      if (chosen.size > MAX_UPLOAD) throw new Error("too big");
      const picture = await importSvg(await chosen.text());
      if (!picture) throw new Error("nothing in it");
      setHistory((history) =>
        step(history, () => ({
          strokes: picture.strokes,
          fills: picture.fills,
        }))
      );
    } catch {
      setRefused(true);
    }
  };

  /** A template as it would land with its middle at (x, y) – snapped. */
  const landing = (
    template: DrawingTemplate,
    before: Art,
    x: number,
    y: number
  ) => {
    const added = templateArt(template, {
      x,
      y,
      size: TEMPLATE_SIZE,
      width,
    });
    const box = boxOf(added, {
      strokes: added.strokes.map((_, i) => i),
      fills: added.fills.map((_, i) => i),
    });
    if (!box) return { added, lines: null };
    const guides = guidesFor(before, NOTHING, shape);
    const [dx, dy] = snapMove(box, 0, 0, guides, SNAP / unitNow());
    const lines = linesAt(
      { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy },
      guides
    );
    return {
      added: dx || dy ? shifted(added, dx, dy) : added,
      lines: lines.x.length || lines.y.length ? lines : null,
    };
  };

  /** A template put in – the middle of the face, or where it was dropped. */
  const putTemplate = (template: DrawingTemplate, at = { x: 0.5, y: 0.5 }) => {
    const before = art;
    const { added } = landing(template, before, at.x, at.y);
    if (!(added.strokes.length || added.fills.length)) return;
    setHistory((history) => step(history, (now) => joined(now, added)));
    chooseTool("move");
    setPickNext(addedIn(before, added));
  };

  /** Dragging a template from its tile: into the drawing, where it lands. */
  const templateDown = (
    event: PointerEvent<HTMLButtonElement>,
    template: DrawingTemplate
  ) => {
    tilePointer.current = event.pointerType;
    // A finger scrolls the row and taps – the tap puts it in the middle.
    if (event.pointerType === "touch" || event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    dragging.current = {
      template,
      pointer: event.pointerId,
      before: art,
      added: null,
      moved: false,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const templateMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) {
        return;
      }
      drag.moved = true;
      setGhostOf(drag.template);
    }
    const at = locate(event);
    const over = at && at.x > 0 && at.y > 0 && at.x < 1 && at.y < 1;
    if (ghost.current) {
      ghost.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
      ghost.current.style.opacity = over ? "0" : "1";
    }
    if (!(at && over)) {
      if (drag.added) {
        drag.added = null;
        setHistory(meanwhile(drag.before));
        setDropLines(null);
      }
      return;
    }
    const { added, lines } = landing(drag.template, drag.before, at.x, at.y);
    drag.added = added;
    setDropLines(lines);
    setHistory(meanwhile(joined(drag.before, added)));
  };

  const templateUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    dragging.current = null;
    setGhostOf(null);
    setDropLines(null);
    if (!drag.moved) {
      // A click: into the middle.
      putTemplate(drag.template);
      return;
    }
    if (!drag.added) return;
    setHistory(settled(drag.before));
    chooseTool("move");
    setPickNext(addedIn(drag.before, drag.added));
  };

  return {
    dropLines,
    ghost,
    ghostOf,
    tilePointer,
    onUpload,
    putTemplate,
    templateDown,
    templateMove,
    templateUp,
  };
};
