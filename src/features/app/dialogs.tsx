"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Button, Field } from "@/components/ui";
import type { ColorName } from "@/features/calendar/model";
import { knownKey } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { InkBlot } from "./ink-blot";
import { Sheet } from "./sheet";

/**
 * The app's own little dialogs – instead of the browser's prompt and
 * confirm boxes: naming a calendar, and making sure before something goes –
 * and the parts of them other sheets use too: the colors to pick from, a
 * name to change where it stands.
 */

/**
 * The stamp colors as ink blots to pick from – the picked one gets a
 * scribbled ring. A color the palette no longer has shows as the first –
 * and stays what it is until another is picked. `children`: a line about
 * the pick, below the blots.
 */
export const ColorPicker = ({
  locale,
  value,
  onChange,
  children,
}: {
  locale: Locale;
  value: ColorName;
  onChange: (color: ColorName) => void;
  children?: ReactNode;
}) => {
  const t = dictionaryOf(locale);
  const palette = usePalette();
  const shown = knownKey(value, palette);
  return (
    <fieldset className="flex flex-wrap items-center gap-3.5">
      <legend className="mb-3 font-bold text-sm">{t.app.draw.color}</legend>
      {/* Blots of ink, the one picked ringed – like the day's stamp pads. */}
      {palette.map(({ key: c, hex, name: names }, i) => (
        <button
          aria-label={names[locale]}
          aria-pressed={shown === c}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full transition-transform",
            shown === c ? "scale-110" : "hover:-rotate-6 hover:scale-110"
          )}
          key={c}
          onClick={() => onChange(c)}
          type="button"
        >
          <InkBlot hex={hex} index={i} on={shown === c} />
        </button>
      ))}
      {children && <div className="w-full">{children}</div>}
    </fieldset>
  );
};

/**
 * A name to change where it stands: its field, and beside it the button
 * that keeps it – awake only while the name differs from the one kept.
 * Without `required` no name at all is fine, too.
 */
export const NameForm = ({
  label,
  name,
  maxLength,
  required = false,
  placeholder,
  save,
  onSave,
}: {
  label: string;
  /** The name as it is kept. */
  name: string;
  maxLength: number;
  required?: boolean;
  placeholder?: string;
  /** What the button says. */
  save: string;
  onSave: (name: string) => void;
}) => {
  const [value, setValue] = useState(name);
  // Renamed elsewhere meanwhile (another device): that is its name now.
  const [kept, setKept] = useState(name);
  if (kept !== name) {
    setKept(name);
    setValue(name);
  }
  const clean = value.trim().slice(0, maxLength);
  const changed = clean !== name && !(required && !clean);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    onSave(clean);
    setValue(clean);
  };
  return (
    <form className="flex items-end gap-2.5" onSubmit={submit}>
      <Field
        className="min-w-0 flex-1"
        label={label}
        maxLength={maxLength}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      <Button className="h-12" disabled={!changed} type="submit">
        {save}
      </Button>
    </form>
  );
};

/** A new calendar: its name and its color. */
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
        <ColorPicker locale={locale} onChange={setColor} value={color} />
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
