"use client";

import { Button, TextareaField, useField } from "@payloadcms/ui";
import type {
  DefaultCellComponentProps,
  TextareaFieldClientComponent,
} from "payload";
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { outlinePath } from "@/features/calendar/outline";
import { DEFAULT_PALETTE } from "@/features/calendar/palette";
import { readSvg, SVG_LIMIT } from "@/features/calendar/read-svg";
import { isOutline } from "@/features/calendar/shapes";
import { StampSvg } from "@/features/calendar/stamp-svg";
import {
  type SvgPart,
  shapeOfSvg,
  templateOfSvg,
} from "@/features/calendar/svg-outline";
import { templateArt } from "@/features/calendar/templates";
import { demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";

/**
 * A stamp shape and a drawing template in the admin (Content → Stamp shapes,
 * Drawing templates – collections.ts): the path's field, and below it what
 * the path makes – drawn by the app's own parts, so it looks here as it will
 * there; in the lists, a little picture of it. Styles: admin.scss.
 *
 * The path can come from an SVG file too – picked with the button below the
 * field, or dropped onto it: read here in the browser (read-svg.ts, in a
 * locked frame – the file is someone else's code), made into a path
 * (svg-outline.ts) and put into the field like a typed one. Nothing of the
 * file is uploaded or kept; the path is saved with the form, or undone.
 */

/** The doodle shown in a shape: the front page's heart. */
const HEART = demoStamp("heart").drawing;

/** The color shown in: the code's first. */
const INK = DEFAULT_PALETTE[0].hex;

/** A value once it has rested for a moment – typing doesn't redraw at once. */
const useRested = <T,>(value: T, ms = 250) => {
  const [rested, setRested] = useState<T>(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setRested(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return rested;
};

/** A shape as the app shows one: being drawn, printed, and in 3D. */
const ShapePreview = ({ d }: { d: string }) => {
  // One object per outline – the 3D picture is made once for it.
  const shape = useMemo(() => ({ d }), [d]);
  return (
    <div aria-hidden className="stamp-color-preview">
      <figure>
        <span className="scp-box scp-drawing">
          <StampSvg
            className="scp-svg"
            color={INK}
            drawing={HEART}
            filled
            shape={shape}
          />
        </span>
        <figcaption>Drawing</figcaption>
      </figure>
      <figure>
        <span className="scp-box scp-paper">
          <StampSvg
            className="scp-svg scp-print"
            color={INK}
            drawing={{ ...HEART, rim: "dotted" }}
            print
            shape={shape}
          />
        </span>
        <figcaption>Print, dotted rim</figcaption>
      </figure>
      <figure>
        <span className="scp-box">
          <Sticker
            className="scp-sticker"
            stamp={{ color: INK, drawing: HEART, shape }}
          />
        </span>
        <figcaption>Stamp</figcaption>
      </figure>
    </div>
  );
};

/** What came of a file – said below the field; taken, with a way back. */
type Note = {
  text: string;
  failed?: boolean;
  /** The path it put in: while the field still holds it, it can be undone. */
  taken?: string;
  undo?: () => void;
};

/** A note's sentences – those that apply. */
const sentences = (...all: (string | false)[]) => all.filter(Boolean).join(" ");

/** “1 piece”, “3 pieces”. */
const pieces = (count: number) => `${count} piece${count === 1 ? "" : "s"}`;

/** A file's shapes – or why it has none to give. */
const shapesIn = async (file: File): Promise<SvgPart[] | string> => {
  if (!(file.type === "image/svg+xml" || /\.svg$/i.test(file.name))) {
    return "Not an SVG file – pick one ending in .svg.";
  }
  if (file.size > SVG_LIMIT) return "Too big for an outline – at most 1 MB.";
  const parts = await readSvg(await file.text());
  if (!parts) return "This file can't be read as an SVG.";
  if (!parts.length) {
    return "Nothing in it to take – no shape with a fill or a line (text and pictures don't count).";
  }
  return parts;
};

/**
 * An SVG file into a path's field – picked, or dropped onto the field.
 * `take` makes the field's value of its shapes and says what it did.
 */
const useSvgUpload = (take: (parts: SvgPart[]) => Note, disabled: boolean) => {
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const read = async (file: File | undefined) => {
    if (!file || disabled || busy) return;
    setBusy(true);
    try {
      const parts = await shapesIn(file);
      setNote(
        typeof parts === "string" ? { text: parts, failed: true } : take(parts)
      );
    } catch {
      setNote({ text: "This file can't be read as an SVG.", failed: true });
    } finally {
      setBusy(false);
    }
  };
  // Only files are taken – text dragged into the field still goes in.
  const carriesFile = (event: DragEvent) =>
    !disabled && event.dataTransfer.types.includes("Files");
  const drop = {
    onDragOver: (event: DragEvent) => {
      if (!carriesFile(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setOver(true);
    },
    onDragLeave: (event: DragEvent) => {
      // Out of the field – not from one of its parts onto another.
      const to = event.relatedTarget;
      if (!(to instanceof Node && event.currentTarget.contains(to))) {
        setOver(false);
      }
    },
    onDrop: (event: DragEvent) => {
      if (!carriesFile(event)) return;
      event.preventDefault();
      setOver(false);
      read(event.dataTransfer.files[0]);
    },
  };
  return { note, setNote, busy, over, read, drop };
};

/**
 * A path's field that takes SVG files: the field, below it the button to
 * pick one and what came of the last – and the whole of it a place to drop
 * one on.
 */
const SvgDropField = ({
  upload,
  value,
  disabled,
  children,
  preview,
}: {
  upload: ReturnType<typeof useSvgUpload>;
  /** The field's value now – to know whether the last file's is still in. */
  value: string;
  /** Read-only: the field alone. */
  disabled: boolean;
  /** The field. */
  children: ReactNode;
  /** What the path makes, below it all. */
  preview: ReactNode;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const { note } = upload;
  return (
    <div
      className={`stamp-shape-field${upload.over ? " is-dropping" : ""}`}
      {...upload.drop}
    >
      {children}
      {/* Read-only: nothing to take a file into. */}
      {!disabled && (
        <div className="stamp-shape-upload">
          <input
            accept=".svg,image/svg+xml"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // The same file can be picked again.
              event.target.value = "";
              upload.read(file);
            }}
            ref={input}
            type="file"
          />
          <Button
            buttonStyle="secondary"
            disabled={upload.busy}
            margin={false}
            onClick={() => input.current?.click()}
            size="small"
            type="button"
          >
            {upload.busy ? "Reading …" : "Upload SVG"}
          </Button>
          <p
            aria-live="polite"
            className={`stamp-shape-note${note?.failed ? " is-failed" : ""}`}
          >
            {note
              ? note.text
              : "… or drop one onto the field. Read here in the browser – only the path is kept."}
            {note?.undo && note.taken === value && (
              <>
                {" "}
                <button
                  className="stamp-shape-undo"
                  onClick={() => {
                    note.undo?.();
                    upload.setNote({ text: "Undone – back as it was." });
                  }}
                  type="button"
                >
                  Undo
                </button>
              </>
            )}
          </p>
        </div>
      )}
      {preview}
    </div>
  );
};

/** The outline's path, and the shape it makes below it. */
export const StampShapeField: TextareaFieldClientComponent = (props) => {
  const { value, setValue } = useField<string>({ path: props.path });
  const text = typeof value === "string" ? value.trim() : "";
  const d = useRested(text);
  const disabled = Boolean(props.readOnly);
  const upload = useSvgUpload((parts) => {
    const shape = shapeOfSvg(parts);
    if (!shape) {
      return {
        text: "No closed outline in it – a stamp shape needs one that encloses something.",
        failed: true,
      };
    }
    const before = value ?? "";
    setValue(shape.d);
    return {
      text: sentences(
        "SVG taken – its outline.",
        shape.others > 0 && "Only the outer outline was taken.",
        shape.line && "It is drawn as a line: its middle was taken.",
        shape.walked && "Traced point by point – no curves.",
        shape.simplified && "Simplified to fit."
      ),
      taken: shape.d,
      undo: () => setValue(before),
    };
  }, disabled);
  return (
    <SvgDropField
      disabled={disabled}
      preview={
        isOutline(d) ? (
          <ShapePreview d={d} />
        ) : (
          <p className="stamp-shape-none">
            No outline yet – a closed path (… Z) draws one.
          </p>
        )
      }
      upload={upload}
      value={text}
    >
      <TextareaField {...props} />
    </SvgDropField>
  );
};

/** A shape in the list: its outline, as a little picture. */
export const StampShapeCell = ({ cellData }: DefaultCellComponentProps) => {
  const d = typeof cellData === "string" ? cellData : "";
  return (
    <svg aria-hidden="true" className="stamp-shape-icon" viewBox="0 0 1 1">
      {isOutline(d) && <path d={outlinePath({ d })} />}
    </svg>
  );
};

/** A template as it lands in a drawing – lines, or filled. */
const TemplatePreview = ({ d, filled }: { d: string; filled: boolean }) => {
  const art = templateArt(
    { d, filled },
    { x: 0.5, y: 0.5, size: 0.6, width: 0.022 }
  );
  return (
    <div aria-hidden className="stamp-color-preview">
      <figure>
        <span className="scp-box scp-drawing">
          <StampSvg className="scp-svg" color={INK} drawing={art} filled />
        </span>
        <figcaption>{filled ? "Dropped in, filled" : "Dropped in"}</figcaption>
      </figure>
    </div>
  );
};

/** The template's path, and what it drops into a drawing below it. */
export const DrawingTemplateField: TextareaFieldClientComponent = (props) => {
  const { value, setValue } = useField<string>({ path: props.path });
  // The box beside it – in the same group, if it is in one.
  const box = useField<boolean>({
    path: props.path.replace(/[^.]*$/, "filled"),
  });
  const filled = box.value === true;
  const text = typeof value === "string" ? value.trim() : "";
  const d = useRested(text);
  const disabled = Boolean(props.readOnly);
  const upload = useSvgUpload((parts) => {
    const template = templateOfSvg(parts);
    if (!template) {
      return { text: "Nothing in it makes a path.", failed: true };
    }
    const before = { d: value ?? "", filled };
    setValue(template.d);
    // Suggested – the box can be changed again.
    box.setValue(template.filled);
    return {
      text: sentences(
        `SVG taken – ${pieces(template.count)}.`,
        template.filled
          ? "Mostly filled areas: “Filled” is ticked."
          : "Mostly lines: “Filled” is unticked.",
        template.walked &&
          "Some of it traced point by point – no curves there.",
        template.simplified && "Simplified to fit."
      ),
      taken: template.d,
      undo: () => {
        setValue(before.d);
        box.setValue(before.filled);
      },
    };
  }, disabled);
  const art = templateArt(
    { d, filled },
    { x: 0.5, y: 0.5, size: 0.6, width: 0.022 }
  );
  return (
    <SvgDropField
      disabled={disabled}
      preview={
        art.strokes.length || art.fills.length ? (
          <TemplatePreview d={d} filled={filled} />
        ) : (
          <p className="stamp-shape-none">Nothing drawn yet.</p>
        )
      }
      upload={upload}
      value={text}
    >
      <TextareaField {...props} />
    </SvgDropField>
  );
};

/** A template in the list: its lines, as a little picture. */
export const DrawingTemplateCell = ({
  cellData,
}: DefaultCellComponentProps) => {
  const d = typeof cellData === "string" ? cellData : "";
  const art = templateArt(
    { d, filled: false },
    { x: 0.5, y: 0.5, size: 0.9, width: 0.06 }
  );
  return (
    <svg aria-hidden="true" className="stamp-shape-icon" viewBox="0 0 1 1">
      {art.strokes.map((stroke) => (
        <polyline
          fill="none"
          key={stroke.p.join(",")}
          points={stroke.p.join(" ")}
          strokeWidth={0.07}
        />
      ))}
    </svg>
  );
};
