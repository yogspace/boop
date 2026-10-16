"use client";

import {
  SelectInput,
  useConfig,
  useField,
  useFormFields,
} from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import { useEffect, useState } from "react";
import type { Drawing } from "@/features/calendar/model";
import { DEFAULT_PALETTE, type StampColor } from "@/features/calendar/palette";
import {
  DEFAULT_SHAPES,
  isShapeKey,
  knownShape,
  type StampShapeDef,
} from "@/features/calendar/shapes";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { stampColorsOf } from "@/features/site/stamp-colors";
import { stampShapesOf } from "@/features/site/stamp-shapes";
import type { CardView } from "./protocol";
import { cardIdOf } from "./rules";

/**
 * A gift in the admin (gifts.ts): its color, picked from the CMS's stamp
 * colors – the ones that aren't public among them – and a look at the
 * stamp as it will come: the card's drawing in the gift's color, drawn the
 * way Site → Stamp colors shows its colors (site/admin.scss).
 */

type SiteLooks = { colors: StampColor[]; shapes: StampShapeDef[] };

/** The CMS's colors and shapes – asked once per page. */
let asked: Promise<SiteLooks> | null = null;

const CODE_LOOKS: SiteLooks = {
  colors: DEFAULT_PALETTE,
  shapes: DEFAULT_SHAPES,
};

const useSiteLooks = (api: string) => {
  const [looks, setLooks] = useState<SiteLooks>(CODE_LOOKS);
  useEffect(() => {
    asked ??= fetch(`${api}/globals/site?depth=0&locale=all`, {
      credentials: "include",
    })
      .then((response) => (response.ok ? response.json() : {}))
      .then((site: { stampColors?: unknown; stampShapes?: unknown }) => ({
        colors: stampColorsOf(site.stampColors),
        shapes: stampShapesOf(site.stampShapes),
      }))
      .catch(() => CODE_LOOKS);
    let on = true;
    void asked.then((found) => on && setLooks(found));
    return () => {
      on = false;
    };
  }, [api]);
  return looks;
};

const useStampColors = (api: string) => useSiteLooks(api).colors;

/** The color: one of the CMS's, by name – or none, the card's. */
export const GiftColorField: TextFieldClientComponent = ({ path, field }) => {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const colors = useStampColors(api);
  const { value, setValue, showError, errorMessage } = useField<string>({
    path,
  });
  // By name, as plain text – so typing in the field finds one.
  const options = colors.map((color) => ({
    value: color.key,
    label: `${color.name.en} · ${color.key}${color.special ? " – not public" : ""}`,
  }));
  return (
    <SelectInput
      description={field.admin?.description}
      isClearable
      label="Color"
      name={field.name}
      onChange={(option) => {
        const picked = Array.isArray(option) ? option[0] : option;
        setValue(typeof picked?.value === "string" ? picked.value : "");
      }}
      options={options}
      path={path}
      placeholder="The card's color"
      showError={showError}
      value={value ?? ""}
      {...(errorMessage && { Error: <p>{errorMessage}</p> })}
    />
  );
};

/**
 * The stamp as it will come: the card's drawing – while the card is there,
 * else what the gift took from it when saved – in the gift's color, drawn
 * and printed.
 */
export const GiftPreview = () => {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { colors, shapes } = useSiteLooks(api);
  const fields = useFormFields(([all]) => ({
    card: all.card?.value,
    color: all.color?.value,
    shape: all.shape?.value,
    drawing: all.drawing?.value,
  }));
  const id = cardIdOf(fields.card);
  // The card last asked for, by its id – null: there is none (any more).
  const [asked, setAsked] = useState<{
    id: string;
    card: CardView | null;
  } | null>(null);
  useEffect(() => {
    if (!id) return;
    let on = true;
    fetch(`${api}/cards/${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((card: CardView | null) => on && setAsked({ id, card }));
    return () => {
      on = false;
    };
  }, [api, id]);
  const answered = Boolean(id) && asked?.id === id;
  const card = answered ? (asked?.card ?? null) : null;

  const drawing = (card?.stamp.drawing ??
    (fields.drawing as Drawing | null | undefined) ??
    null) as Drawing | null;
  // The shape's outline itself – the admin has no shapes of the app's.
  const key =
    card?.stamp.shape ??
    (isShapeKey(fields.shape) ? fields.shape : shapes[0].key);
  const shape = {
    d: (shapes.find((one) => one.key === knownShape(key, shapes)) ?? shapes[0])
      .d,
  };
  const colorKey =
    typeof fields.color === "string" && fields.color
      ? fields.color
      : card?.stamp.color;
  const color = colors.find((one) => one.key === colorKey) ?? colors[0];
  if (!drawing) {
    return (
      <p style={{ color: "var(--theme-elevation-650)" }}>
        {id
          ? answered && "No card with this link (any more)."
          : "Paste a card's link to see the stamp."}
      </p>
    );
  }
  // The look of Site → Stamp colors (site/admin.scss).
  return (
    <div aria-hidden className="stamp-color-preview">
      <figure>
        <span className="scp-box scp-drawing">
          <StampSvg
            className="scp-svg"
            color={color.hex}
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
            color={color.hex}
            drawing={drawing}
            print
            shape={shape}
          />
        </span>
        <figcaption>Print</figcaption>
      </figure>
    </div>
  );
};
