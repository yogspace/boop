"use client";

import { useIsPresent } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Snapshot } from "valtio";
import { Sparkle } from "@/components/doodles";
import { Button } from "@/components/ui";
import type { Art } from "@/features/calendar/art";
import type { StampDoc } from "@/features/calendar/model";
import { useTemplates } from "@/features/calendar/shapes-provider";
import type { StickerInput } from "@/features/stickers/build";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import type { Tool } from "./draw-tools";
import { FinishStep } from "./stamp-drawer/finish-step";
import {
  EditorFrame,
  LeaveQuestion,
  useSideBySide,
} from "./stamp-drawer/frame";
import {
  artOf,
  BLANK,
  back,
  forward,
  type History,
  meanwhile,
  settled,
  step,
} from "./stamp-drawer/history";
import { HistoryBar } from "./stamp-drawer/history-bar";
import {
  ColorPicker,
  Flags,
  RimPicker,
  ShapePicker,
} from "./stamp-drawer/look-pickers";
import { Stage } from "./stamp-drawer/stage";
import { TemplateGhost, TemplatePicker } from "./stamp-drawer/template-picker";
import {
  ToolHint,
  ToolPicker,
  WidthPicker,
} from "./stamp-drawer/tool-controls";
import { useDrawKeys } from "./stamp-drawer/use-draw-keys";
import { useDrawingBox } from "./stamp-drawer/use-drawing-box";
import { useDropIn } from "./stamp-drawer/use-drop-in";
import { useLook } from "./stamp-drawer/use-look";
import { usePen } from "./stamp-drawer/use-pen";
import { useSaveAndLeave } from "./stamp-drawer/use-save-and-leave";
import { useStagePointer } from "./stamp-drawer/use-stage-pointer";
import { WIDTHS, type Width } from "./stamp-drawer/widths";
import { useLine } from "./use-line";
import { useSelect } from "./use-select";
import { useZoom } from "./use-zoom";

/**
 * Making a stamp: pick its body (it morphs from shape to shape) and a color
 * (it fades), doodle onto it – or drag a shape in, or upload a picture (SVG)
 * and draw on – and when done the drawing turns into the stamp right where
 * it is: a 3D rubber stamp to look at from every side, then to stamp with,
 * as often as you like. Back to drawing, the stamp flies back onto its
 * drawing the way it came. Saved on the device at once, synced later.
 *
 * On a phone it fills the screen and scrolls as one page: the drawing as
 * wide as it is, the bar with the steps back and forth under it – the two
 * stay at the top while the tools after them scroll by. Side by side, it
 * lies in the middle, the drawing as large as the screen allows, the bar
 * under it too (stamp-drawer/frame.tsx).
 *
 * Drawing:
 * - The pen draws calm lines (freehand.ts): it follows on a short string,
 *   so a trembling finger draws a steady line; every point the screen
 *   reports goes in (coalesced events). What is under way is drawn on a
 *   layer of its own – one path – and joins the drawing as one step when
 *   the pen lifts (stamp-drawer/use-pen.ts).
 * - Two fingers zoom and move the view (use-zoom.ts) – so do a trackpad, ⌘
 *   with the wheel, the space bar with a drag; the drawing stays in its own
 *   units. On touch a loupe (loupe.tsx) shows what the finger covers.
 * - With a stylus only the stylus draws: fingers move the view, a palm
 *   leaves no line. A finger that comes after the first has drawn a while
 *   is taken for a palm, too (stamp-drawer/use-stage-pointer.ts).
 * - The page never scrolls or zooms under the drawing, and the drawing is a
 *   layer of its own (no mask or clip round it) – what changes repaints
 *   there alone (stamp-drawer/stage.tsx).
 *
 * A stamp of one's own opens in it again (`stamp`), as it is: its drawing
 * – lines with their points, filled areas –, shape, color, rim, flags, name
 * and sharing. The steps begin there; saved, only what changed goes
 * (`updateStamp`), and its prints show it at once.
 */
export const StampDrawer = ({
  stamp,
  calendar,
  locale,
  onClose,
  onSaved,
  onDrawn,
  ask = 0,
}: {
  /** A stamp of one's own, drawn anew – none: a new one. */
  stamp?: Snapshot<StampDoc>;
  /**
   * The calendar it is drawn in, if its members may get to stamp with it too
   * – null when nobody else is in it. The stamp is its maker's either way.
   */
  calendar: string | null;
  locale: Locale;
  onClose: () => void;
  /** Told the stamp's id once it is saved – just before it closes. */
  onSaved?: (id: string) => void;
  /**
   * Told whether the browser's back should ask: something is drawn, and
   * the question isn't out yet.
   */
  onDrawn?: (drawn: boolean) => void;
  /** Counts up when the browser's back wants to leave: it asks. */
  ask?: number;
}) => {
  const t = dictionaryOf(locale);
  const titleId = useId();
  const side = useSideBySide();
  const going = !useIsPresent();
  const area = useRef<HTMLDivElement>(null);
  // The drawing box on the stage – what zooms, and what is measured
  // (use-drawing-box.ts).
  const paper = useRef<HTMLDivElement>(null);
  // On a phone, the page that scrolls.
  const page = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<"draw" | "3d">("draw");
  // A stamp drawn anew begins as it is – no step back to before it.
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    now: stamp ? artOf(stamp.drawing) : BLANK,
    future: [],
  }));
  const { strokes, fills } = history.now;
  const [width, setWidth] = useState<Width>("thin");
  const [refused, setRefused] = useState(false);
  const look = useLook(stamp);
  const { inverted, rim, special, shape, color } = look;
  const templates = useTemplates();
  const [name, setName] = useState(stamp?.name ?? "");
  const [shared, setShared] = useState(
    Boolean(stamp && calendar && stamp.sharedWith.includes(calendar))
  );
  // Drawing – freehand or point by point –, erasing, picking and moving,
  // or editing a line's points: the pen to begin with.
  const [tool, setTool] = useState<Tool>("pen");
  // The 3D view – a new one each time, counted – and the stamp it shows: the
  // drawing as it was made into one.
  const [view3d, setView3d] = useState(0);
  const [made, setMade] = useState<StickerInput | null>(null);
  // Its first frame is on screen: the drawing can fade away under it.
  const [shown, setShown] = useState(false);
  const draws = stage === "draw";
  const empty = !(strokes.length || fills.length);
  const zoom = useZoom(paper, draws);
  const { view } = zoom;
  const zoomed = view.s > 1.001;
  const box = useDrawingBox(paper, zoom.latest);

  // three.js loads while drawing – the stamp is quick to appear.
  useEffect(() => {
    void import("three");
  }, []);

  // The page behind stays where it is – until the editor is gone.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const changes = {
    live: (next: Art) => setHistory(meanwhile(next)),
    settle: (before: Art) => setHistory(settled(before)),
    put: (next: Art) => setHistory((history) => step(history, () => next)),
  };
  const select = useSelect({
    on: draws && tool === "move",
    area,
    art: history.now,
    shape,
    locate: box.locate,
    ...changes,
    // Twice on a line with anchors: its points.
    onEdit: (stroke) => {
      setTool("points");
      line.edit(stroke);
    },
  });
  const line = useLine({
    mode: draws && (tool === "line" || tool === "points") ? tool : null,
    area,
    art: history.now,
    shape,
    width: WIDTHS[width],
    locate: box.locate,
    ...changes,
    onLeave: (stroke) => leavePoints(stroke),
  });
  // The one line with anchors that is picked – its points can be edited.
  const anchored =
    tool === "move" &&
    select.picked &&
    !select.picked.items.fills.length &&
    select.picked.items.strokes.length === 1 &&
    history.now.strokes[select.picked.items.strokes[0]]?.a
      ? select.picked.items.strokes[0]
      : null;

  const freehand = usePen({
    tool,
    width,
    art: history.now,
    setHistory,
    point: box.point,
    onStage: box.onStage,
    unitNow: box.unitNow,
  });

  // Another tool ends what the one before was at – a line being drawn
  // stays as far as it got.
  const chooseTool = (next: Tool) => {
    freehand.stopErasing();
    freehand.dropPen();
    setTool(next);
  };

  // A line's points: the picked line's, if it is one with anchors – else
  // the next one clicked.
  const editPoints = () => {
    chooseTool("points");
    if (anchored !== null) line.edit(anchored);
  };

  // Done with the points: back to picking, the line picked.
  const leavePoints = (stroke: number | null) => {
    chooseTool("move");
    if (stroke !== null) select.pick({ strokes: [stroke], fills: [] });
  };

  const pointer = useStagePointer({
    tool,
    area,
    paper,
    zoom,
    zoomed,
    inBox: box.inBox,
    select,
    line,
    freehand,
    setRefused,
  });
  const dropIn = useDropIn({
    art: history.now,
    setHistory,
    width: WIDTHS[width],
    shape,
    tool,
    select,
    locate: box.locate,
    unitNow: box.unitNow,
    chooseTool,
    setRefused,
  });
  useDrawKeys({
    draws,
    tool,
    area,
    spaceHeld: pointer.spaceHeld,
    select,
    line,
    zoom,
    setHistory,
    chooseTool,
    editPoints,
    leavePoints,
  });

  const doodle = useMemo(
    () => ({ strokes, fills, inverted, rim, special }),
    [strokes, fills, inverted, rim, special]
  );
  const sticker = useMemo(
    () => ({ shape, color, drawing: doodle }),
    [shape, color, doodle]
  );

  // A step of its own – it can be taken back, too.
  const clear = () => setHistory((history) => step(history, () => BLANK));

  // On a phone each step begins at the top of the page: the title, the
  // stage, what to set first – never scrolled to where the other one's end
  // was, under the stage.
  const toTop = () => page.current?.scrollTo({ top: 0 });

  const toStamp = () => {
    freehand.stopErasing();
    freehand.dropPen();
    setRefused(false);
    setShown(false);
    // Face-on, the stamp lies right over the whole drawing.
    zoom.reset();
    setMade(sticker);
    setView3d((n) => n + 1);
    setStage("3d");
    toTop();
  };

  // The drawing comes back under the stamp, which flies onto it and fades
  // (out of its presence, it stays until it has landed).
  const toDrawing = () => {
    setStage("draw");
    setShown(false);
    toTop();
  };

  const { leaving, setLeaving, leave, close, onSave, error } = useSaveAndLeave({
    stamp,
    calendar,
    art: history.now,
    inverted,
    rim,
    special,
    shape,
    color,
    name,
    shared,
    going,
    ask,
    onClose,
    onSaved,
    onDrawn,
  });

  // What is set while drawing – and, made 3D, what is left to do.
  const drawSet = (
    <>
      <ShapePicker
        locale={locale}
        onPick={look.setShape}
        shape={shape}
        shapes={look.shapes}
        side={side}
      />
      <ColorPicker
        color={color}
        locale={locale}
        onPick={look.setColor}
        palette={look.palette}
      />
      <div className="flex flex-col gap-2">
        <ToolPicker locale={locale} onChoose={chooseTool} tool={tool} />
        <WidthPicker
          anchored={anchored}
          boxSize={box.boxSize}
          line={line}
          locale={locale}
          onEditPoints={editPoints}
          onLeavePoints={leavePoints}
          onWidth={setWidth}
          scale={view.s}
          select={select}
          tool={tool}
          width={width}
        />
        <ToolHint line={line} locale={locale} tool={tool} touch={select.knob} />
      </div>
      <TemplatePicker
        locale={locale}
        onDown={dropIn.templateDown}
        onMove={dropIn.templateMove}
        onPut={dropIn.putTemplate}
        onUp={dropIn.templateUp}
        onUpload={dropIn.onUpload}
        side={side}
        templates={templates}
        tilePointer={dropIn.tilePointer}
        touch={select.knob}
      />
      <RimPicker locale={locale} onPick={look.setRim} rim={rim} shape={shape} />
      <Flags
        inverted={inverted}
        locale={locale}
        onInverted={look.setInverted}
        onSpecial={look.setSpecial}
        special={special}
      />
      <Button
        className="w-full"
        disabled={empty}
        onClick={toStamp}
        size={side ? "md" : "lg"}
      >
        {t.app.draw.make3d} <Sparkle className="h-5 w-5" />
      </Button>
    </>
  );
  const stampSet = (
    <FinishStep
      calendar={calendar}
      editing={Boolean(stamp)}
      error={error}
      locale={locale}
      name={name}
      onBack={toDrawing}
      onName={setName}
      onSave={onSave}
      onShared={setShared}
      shared={shared}
    />
  );

  return (
    <EditorFrame
      bar={
        <HistoryBar
          canBack={history.past.length > 0}
          canForward={history.future.length > 0}
          draws={draws}
          empty={empty}
          locale={locale}
          onBack={() => setHistory(back)}
          onClear={clear}
          onForward={() => setHistory(forward)}
          side={side}
        />
      }
      drawSet={drawSet}
      draws={draws}
      ghost={
        dropIn.ghostOf && (
          <TemplateGhost ghost={dropIn.ghost} template={dropIn.ghostOf} />
        )
      }
      going={going}
      onClose={close}
      page={page}
      question={
        leaving && (
          <LeaveQuestion
            editing={Boolean(stamp)}
            locale={locale}
            onLeave={leave}
            onStay={() => setLeaving(false)}
            side={side}
            titleId={titleId}
          />
        )
      }
      side={side}
      stage={
        <Stage
          area={area}
          art={history.now}
          color={color}
          doodle={doodle}
          draws={draws}
          dropLines={dropIn.dropLines}
          empty={empty}
          glitter={freehand.glitter}
          inverted={inverted}
          line={line}
          live={freehand.live}
          liveCopy={freehand.liveCopy}
          locale={locale}
          loupe={pointer.loupe}
          loupeOn={pointer.loupeOn}
          made={made}
          onDown={pointer.onDown}
          onLeave={pointer.onLeave}
          onMove={pointer.onMove}
          onShown={() => setShown(true)}
          onUp={pointer.onUp}
          onZoomReset={zoom.reset}
          paper={paper}
          refused={refused}
          select={select}
          shape={shape}
          shown={shown}
          special={special}
          tip={freehand.tip}
          tool={tool}
          view={view}
          view3d={view3d}
          zoomed={zoomed}
        />
      }
      stampSet={stampSet}
      title={
        !draws
          ? t.app.draw.done
          : stamp
            ? t.app.draw.editTitle
            : t.app.draw.title
      }
      titleId={titleId}
    />
  );
};
