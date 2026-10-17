"use client";

import { useEffect, useId, useState } from "react";
import { Bang } from "@/components/doodles";
import { Field } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { checkPassword, type Owner, type Weakness } from "../password-strength";

/** How long typing pauses before a new password is looked at. */
const SETTLE_MS = 800;

/** Why a password is easy to guess – nothing to say while there is none. */
const warningFor = (password: string, owner: Owner): Weakness | null => {
  if (!password) return null;
  const check = checkPassword(password, owner);
  return check.ok ? null : check.reason;
};

/**
 * The field for a new password, and under it a word when the password is
 * easy to guess (password-strength.ts): why, and what does better. A
 * warning, no rule – the form sends it all the same. Looked at once typing
 * pauses or the field is left, not at every key, and on this device alone.
 * `name` and `email`: whose it is, as far as the form knows.
 */
export const NewPassword = ({
  locale,
  label,
  value,
  onChange,
  name,
  email,
}: {
  locale: Locale;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  email?: string;
}) => {
  const t = dictionaryOf(locale);
  const text = t.auth.weakPassword;
  const id = useId();
  const [warning, setWarning] = useState<Weakness | null>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => setWarning(warningFor(value, { name, email })),
      SETTLE_MS
    );
    return () => clearTimeout(timer);
  }, [value, name, email]);
  return (
    <div>
      <Field
        aria-describedby={id}
        autoComplete="new-password"
        hint={t.auth.passwordHint}
        label={label}
        minLength={8}
        onBlur={() => setWarning(warningFor(value, { name, email }))}
        onChange={(event) => onChange(event.target.value)}
        required
        type="password"
        value={value}
      />
      {/* Always there, empty or not – so a screen reader hears what comes. */}
      <div aria-live="polite" id={id}>
        {warning && (
          <p
            className="mt-2.5 flex animate-fade items-start gap-2 font-medium text-sm"
            key={warning}
          >
            <Bang className="mt-px h-4 w-4 shrink-0" />
            <span>
              {text[warning]} {text.tip}
            </span>
          </p>
        )}
      </div>
    </div>
  );
};
