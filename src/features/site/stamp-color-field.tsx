"use client";

import {
  TextField,
  useField,
  useFormFields,
  useRowLabel,
} from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import { type RefObject, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PALETTE,
  type Finish,
  isHex,
  wornFinish,
} from "@/features/calendar/palette";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";

/**
 * A stamp color in the admin (Site → Stamp colors): the hex field with a
 * color picker beside it, and below a stamp in the color – drawn by the
 * app's own parts, so it looks here as it will there. Styles: admin.scss.
 */

/** The stamp shown: the front page's heart. */
const HEART = demoStamp("heart");

/** The picker's and the preview's color while the field holds none (yet). */
const FALLBACK = DEFAULT_PALETTE[0].hex;

/**
 * A blot of ink (40 × 40) – flat, a little uneven, like the inks to dip a
 * stamp into on a day (features/app/day-sheet.tsx).
 */
const BLOT =
  "M20.5 3C27 2.2 34.5 6 36.6 13.2 38.6 20 36.4 28.6 30.4 33.2 24.6 37.6 15.6 38.2 9.4 33.8 3.4 29.6 1.2 21 4 14 6.6 7.6 13.4 3.8 20.5 3Z";

/** Whether an element has come into view – a closed row's never does. */
const useSeen = (ref: RefObject<Element | null>) => {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.some((entry) => entry.isIntersecting) && setSeen(true)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
};

/** A value once it has rested for a moment – null before the first time. */
const useRested = <T,>(value: T, ms = 250) => {
  const [rested, setRested] = useState<T | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setRested(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return rested;
};

/**
 * The finish the row's color wears – as its “Public” box and its finish are
 * set right now (palette.ts `wornFinish`): none while it is public.
 */
const useRowFinish = (path: string): Finish | undefined => {
  const row = path.slice(0, path.lastIndexOf("."));
  const open = useFormFields(([fields]) => fields[`${row}.public`]?.value);
  const finish = useFormFields(([fields]) => fields[`${row}.finish`]?.value);
  return wornFinish({ special: open === false, finish });
};

/**
 * A stamp in the color, the ways the app shows one: being drawn, printed on
 * a day, as the ink to dip into, and in 3D – lying in the tray and coming
 * down. The app's parts take a color's key – and, through `hexOf`
 * (palette.ts), a literal hex as it is: so they draw any color, saved or not
 * – its finish given along, for a special one.
 */
const StampColorPreview = ({
  color,
  finish,
}: {
  color: string;
  finish: Finish | undefined;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const seen = useSeen(box);
  // The 3D pictures render in the browser only (WebGL), and take a moment:
  // not for a closed row, nor for every step of dragging the picker.
  const rested = useRested(color);
  const ink = seen && rested ? rested : null;
  const { drawing, shape } = HEART;
  return (
    <div aria-hidden className="stamp-color-preview" ref={box}>
      <figure>
        <span className="scp-box scp-drawing">
          <StampSvg
            className="scp-svg"
            color={color}
            drawing={drawing}
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
            color={color}
            drawing={drawing}
            finish={finish}
            print
            shape={shape}
          />
        </span>
        <figcaption>Print</figcaption>
      </figure>
      <figure>
        <span className="scp-box">
          <svg aria-hidden="true" className="scp-blot" viewBox="0 0 40 40">
            <path d={BLOT} fill={color} />
          </svg>
        </span>
        <figcaption>Ink</figcaption>
      </figure>
      <figure>
        <span className="scp-box">
          {ink && (
            <Sticker
              className="scp-sticker"
              stamp={{ color: ink, drawing, shape, finish }}
            />
          )}
        </span>
        <figcaption>Stamp</figcaption>
      </figure>
      <figure>
        <span className="scp-box">
          {ink && (
            <Sticker
              className="scp-sticker"
              pose="press"
              stamp={{ color: ink, drawing, shape, finish }}
            />
          )}
        </span>
        <figcaption>Stamping</figcaption>
      </figure>
    </div>
  );
};

/** The hex field, a color picker beside it, the stamp in the color below. */
export const StampColorField: TextFieldClientComponent = (props) => {
  const { value, setValue } = useField<string>({ path: props.path });
  const color = isHex(value) ? value.toLowerCase() : FALLBACK;
  const finish = useRowFinish(props.path);
  return (
    <div className="stamp-color-field">
      <div className="stamp-color-input">
        <input
          aria-label="Pick the color"
          className="stamp-color-picker"
          disabled={props.readOnly}
          onChange={(event) => setValue(event.target.value)}
          type="color"
          value={color}
        />
        <TextField {...props} />
      </div>
      <StampColorPreview color={color} finish={finish} />
    </div>
  );
};

/**
 * A color's row, closed: its swatch, its name and its key – the first is
 * the default, one not public is said so.
 */
export const StampColorRowLabel = () => {
  const { data, rowNumber = 0 } = useRowLabel<{
    key?: string;
    color?: string;
    name?: string;
    public?: boolean;
  }>();
  return (
    <span className="stamp-color-row">
      <i
        style={{ background: isHex(data?.color) ? data.color : "transparent" }}
      />
      <span>
        {data?.name || "Color"}
        {data?.key && <small> · {data.key}</small>}
        {rowNumber === 0 && <small> – the default</small>}
        {data?.public === false && <small> – not public</small>}
      </span>
    </span>
  );
};
