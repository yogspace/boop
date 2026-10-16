"use client";

import { TextareaField, useField, useFormFields } from "@payloadcms/ui";
import type {
  DefaultCellComponentProps,
  TextareaFieldClientComponent,
} from "payload";
import { useEffect, useMemo, useState } from "react";
import { outlinePath } from "@/features/calendar/outline";
import { DEFAULT_PALETTE } from "@/features/calendar/palette";
import { isOutline } from "@/features/calendar/shapes";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { templateArt } from "@/features/calendar/templates";
import { demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";

/**
 * A stamp shape and a drawing template in the admin (Content → Stamp shapes,
 * Drawing templates – collections.ts): the path's field, and below it what
 * the path makes – drawn by the app's own parts, so it looks here as it will
 * there; in the lists, a little picture of it. Styles: admin.scss.
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

/** The outline's path, and the shape it makes below it. */
export const StampShapeField: TextareaFieldClientComponent = (props) => {
  const { value } = useField<string>({ path: props.path });
  const d = useRested(typeof value === "string" ? value.trim() : "");
  return (
    <div className="stamp-shape-field">
      <TextareaField {...props} />
      {isOutline(d) ? (
        <ShapePreview d={d} />
      ) : (
        <p className="stamp-shape-none">
          No outline yet – a closed path (… Z) draws one.
        </p>
      )}
    </div>
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
  const { value } = useField<string>({ path: props.path });
  // The box beside it – in the same group, if it is in one.
  const filledPath = props.path.replace(/[^.]*$/, "filled");
  const filled = useFormFields(([fields]) => fields[filledPath]?.value);
  const d = useRested(typeof value === "string" ? value.trim() : "");
  const art = templateArt(
    { d, filled: filled === true },
    { x: 0.5, y: 0.5, size: 0.6, width: 0.022 }
  );
  return (
    <div className="stamp-shape-field">
      <TextareaField {...props} />
      {art.strokes.length || art.fills.length ? (
        <TemplatePreview d={d} filled={filled === true} />
      ) : (
        <p className="stamp-shape-none">Nothing drawn yet.</p>
      )}
    </div>
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
