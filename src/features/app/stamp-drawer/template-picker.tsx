import {
  type ChangeEvent,
  type PointerEvent,
  type RefObject,
  useMemo,
  useRef,
} from "react";
import { boxOfPieces, readPath } from "@/features/calendar/path";
import type { DrawingTemplate } from "@/features/calendar/templates";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { FADING, useFadingEdges } from "../fading-edges";
import { Sign, TILE } from "./sign";

/** The shapes to drag into the drawing – and an own picture to upload. */

/** An arrow up out of a tray – uploading a picture. */
const UPLOAD = "M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4.5 15v4.5h15V15";

/** A template's lines as a small picture – its own box, a little room round. */
const TemplateSign = ({ template }: { template: DrawingTemplate }) => {
  const box = useMemo(() => {
    const pieces = readPath(template.d);
    if (!pieces) return "0 0 100 100";
    const b = boxOfPieces(pieces);
    const side = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    const pad = side * 0.12;
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2;
    return `${mx - side / 2 - pad} ${my - side / 2 - pad} ${side + 2 * pad} ${side + 2 * pad}`;
  }, [template.d]);
  return (
    <svg aria-hidden="true" className="w-full" viewBox={box}>
      <path
        d={template.d}
        fill={template.filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={9}
        style={{ strokeWidth: 2 }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/**
 * An own picture first – it stays where it is. Then the templates: side by
 * side as they fit, row after row; on a phone in one row beside it, swiped
 * along, fading where it goes on (room inside for the tiles' lift).
 */
export const TemplatePicker = ({
  locale,
  side,
  touch,
  templates,
  tilePointer,
  onPut,
  onDown,
  onMove,
  onUp,
  onUpload,
}: {
  locale: Locale;
  side: boolean;
  /** Fingers, not a mouse – the hints for touch (use-select.ts `knob`). */
  touch: boolean;
  templates: readonly DrawingTemplate[];
  /** What last pressed a template's tile – a finger's tap puts it in. */
  tilePointer: RefObject<string>;
  onPut: (template: DrawingTemplate) => void;
  onDown: (
    event: PointerEvent<HTMLButtonElement>,
    template: DrawingTemplate
  ) => void;
  onMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) => {
  const t = dictionaryOf(locale);
  const file = useRef<HTMLInputElement>(null);
  const templateRow = useFadingEdges("x");

  const templateTiles = templates.map((template) => (
    <button
      aria-label={template.name[locale]}
      className={cn(TILE, "w-11 shrink-0 touch-pan-x p-2")}
      key={template.key}
      onClick={(event) => {
        // A finger's tap, or the keyboard – a mouse or a stylus drags (or
        // clicks) through the pointer's own events.
        if (event.detail === 0 || tilePointer.current === "touch") {
          onPut(template);
        }
      }}
      onPointerCancel={onUp}
      onPointerDown={(event) => onDown(event, template)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      title={`${template.name[locale]} – ${
        touch ? t.app.draw.templatesHintTouch : t.app.draw.templatesHint
      }`}
      type="button"
    >
      <TemplateSign template={template} />
    </button>
  ));

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 font-bold text-sm">
        {t.app.draw.templates}
        {/* How – beside it on a phone; side by side a tooltip (no room). */}
        <span
          className={cn(
            "ml-2 font-medium text-muted text-xs",
            side && "sr-only"
          )}
        >
          {touch ? t.app.draw.templatesHintTouch : t.app.draw.templatesHint}
        </span>
      </legend>
      <div className={cn("flex gap-1.5", side && "flex-wrap")}>
        <button
          aria-label={t.app.draw.upload}
          className={cn(TILE, "scribble-dashed w-11 shrink-0 p-2")}
          onClick={() => file.current?.click()}
          title={t.app.draw.upload}
          type="button"
        >
          <Sign className="w-full" d={UPLOAD} />
        </button>
        <input
          accept=".svg,image/svg+xml"
          hidden
          onChange={onUpload}
          ref={file}
          type="file"
        />
        {side ? (
          templateTiles
        ) : (
          <div
            className={cn(
              "-my-2 -mr-2 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-2 pr-2 pl-0.5",
              FADING.x
            )}
            ref={templateRow}
          >
            {templateTiles}
          </div>
        )}
      </div>
    </fieldset>
  );
};

/**
 * A template on its way in, under the pointer – until it is over the
 * drawing, where it shows as itself.
 */
export const TemplateGhost = ({
  template,
  ghost,
}: {
  template: DrawingTemplate;
  ghost: RefObject<HTMLSpanElement | null>;
}) => (
  <span
    aria-hidden="true"
    className="pointer-events-none fixed top-0 left-0 z-60 w-12 text-ink"
    ref={ghost}
  >
    <TemplateSign template={template} />
  </span>
);
