"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Button, Field } from "@/components/ui";
import type { ColorName } from "@/features/calendar/model";
import { knownKey } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/**
 * The app's own little dialogs – instead of the browser's prompt and
 * confirm boxes: naming a calendar, and making sure before something goes.
 */

/** A calendar's name (and color) – new or changed. */
export const CalendarSheet = ({
  locale,
  title,
  name: initialName = "",
  color: initialColor = knownKey("sky"),
  submit,
  onSave,
  onClose,
}: {
  locale: Locale;
  title: string;
  name?: string;
  color?: ColorName;
  submit: string;
  onSave: (name: string, color: ColorName) => void;
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<ColorName>(initialColor);
  // The stamp colors to pick from. A calendar whose color the palette no
  // longer has shows in the first – and keeps its own until another is picked.
  const palette = usePalette();
  const shown = knownKey(color, palette);
  const save = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    onSave(clean, color);
    onClose();
  };
  return (
    <Sheet onClose={onClose} title={title}>
      <form className="flex flex-col gap-5" onSubmit={save}>
        <Field
          autoFocus
          label={t.app.newCalendarName}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.app.calendarPlaceholder}
          required
          value={name}
        />
        {/* Ink blots to pick from – the picked one gets a scribbled ring. */}
        <fieldset className="flex flex-wrap items-center gap-3.5">
          <legend className="mb-3 font-bold text-sm">{t.app.draw.color}</legend>
          {palette.map(({ key: c, hex, name: names }) => (
            <button
              aria-label={names[locale]}
              aria-pressed={shown === c}
              className={cn(
                "scribble scribble-sm scribble-clear h-9 w-9 rounded-full transition-transform duration-150 [--scribble-inset:-5px] [--scribble-ring:-9px] [filter:var(--scribble-c)]",
                shown === c ? "scale-110" : "scribble-bare hover:scale-110"
              )}
              key={c}
              onClick={() => setColor(c)}
              style={{ background: hex }}
              type="button"
            />
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            {t.app.draw.cancel}
          </Button>
          <Button disabled={!name.trim()} type="submit">
            {submit}
          </Button>
        </div>
      </form>
    </Sheet>
  );
};

/** “Really?” – with the consequence spelled out. */
export const ConfirmSheet = ({
  locale,
  title,
  children,
  confirm,
  onConfirm,
  onClose,
}: {
  locale: Locale;
  title: string;
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  return (
    <Sheet onClose={onClose} title={title}>
      <p className="font-medium text-lg">{children}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} variant="ghost">
          {t.app.draw.cancel}
        </Button>
        <Button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          variant="danger"
        >
          {confirm}
        </Button>
      </div>
    </Sheet>
  );
};
