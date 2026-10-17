import type { FormEvent } from "react";
import { ArrowLeft } from "@/components/doodles";
import { Button, Checkbox, Field, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/**
 * The last step, made 3D: back to drawing – or a name, the calendar's
 * members, and saving.
 */
export const FinishStep = ({
  locale,
  editing,
  calendar,
  name,
  onName,
  shared,
  onShared,
  error,
  onBack,
  onSave,
}: {
  locale: Locale;
  /** A stamp of one's own, drawn anew – its changes are saved. */
  editing: boolean;
  /** The calendar it is drawn in, if its members may stamp with it too. */
  calendar: string | null;
  name: string;
  onName: (name: string) => void;
  shared: boolean;
  onShared: (shared: boolean) => void;
  /** Saving failed. */
  error: boolean;
  onBack: () => void;
  onSave: (event: FormEvent) => void;
}) => {
  const t = dictionaryOf(locale);
  return (
    <>
      <div className="flex h-11 items-center justify-between gap-2">
        <Button className="shrink-0" onClick={onBack} size="sm" variant="plain">
          <ArrowLeft className="h-4 w-4" /> {t.app.draw.back}
        </Button>
        <p className="min-w-0 text-right font-medium text-muted text-sm leading-tight">
          {t.app.draw.turn}
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSave}>
        <Field
          label={t.app.draw.name}
          maxLength={40}
          onChange={(event) => onName(event.target.value)}
          placeholder={t.app.draw.namePlaceholder}
          value={name}
        />
        {calendar && (
          <Checkbox
            checked={shared}
            onChange={(event) => onShared(event.target.checked)}
          >
            {t.app.draw.shared}
          </Checkbox>
        )}
        {editing && (
          // What changing it does – everywhere it was ever stamped.
          <p className="font-medium text-muted text-sm">
            {t.app.draw.editNote}
          </p>
        )}
        {error && <Notice tone="error">{t.auth.failed}</Notice>}
        <Button className="w-full" size="lg" type="submit">
          {editing ? t.app.draw.saveChanges : t.app.draw.save}
        </Button>
      </form>
    </>
  );
};
