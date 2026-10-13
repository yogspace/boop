"use client";

import {
  SelectInput,
  useConfig,
  useField,
  useFormFields,
} from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import { useEffect, useState } from "react";
import type { Drawing, StampShape } from "@/features/calendar/model";
import { isShape } from "@/features/calendar/model";
import { DEFAULT_PALETTE, type StampColor } from "@/features/calendar/palette";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { stampColorsOf } from "@/features/site/stamp-colors";
import type { CardView } from "./protocol";
import { cardIdOf } from "./rules";

/**
 * A gift in the admin (gifts.ts): its color, picked from the CMS's stamp
 * colors – the ones that aren't public among them – and a look at the
 * stamp as it will come: the card's drawing in the gift's color, drawn the
 * way Site → Stamp colors shows its colors (site/admin.scss).
 */

/** The CMS's colors – asked once per page. */
let asked: Promise<StampColor[]> | null = null;

const useStampColors = (api: string) => {
  const [colors, setColors] = useState<StampColor[]>(DEFAULT_PALETTE);
  useEffect(() => {
    asked ??= fetch(`${api}/globals/site?depth=0&locale=all`, {
      credentials: "include",
    })
      .then((response) => (response.ok ? response.json() : {}))
      .then((site: { stampColors?: unknown }) =>
        stampColorsOf(site.stampColors)
      )
      .catch(() => DEFAULT_PALETTE);
    let on = true;
    void asked.then((found) => on && setColors(found));
    return () => {
      on = false;
    };
  }, [api]);
  return colors;
};

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
  const colors = useStampColors(api);
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
  const shape: StampShape =
    card?.stamp.shape ?? (isShape(fields.shape) ? fields.shape : "circle");
  const key =
    typeof fields.color === "string" && fields.color
      ? fields.color
      : card?.stamp.color;
  const color = colors.find((one) => one.key === key) ?? colors[0];
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
