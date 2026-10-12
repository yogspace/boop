"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "valtio";
import { Button } from "@/components/ui";
import type { StampDoc } from "@/features/calendar/model";
import { deleteStamp, shareStamp, useBoop } from "@/features/offline/store";
import { PRINT_MM, stampStl, stlName } from "@/features/stickers/export-stl";
import { STAGE, StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { Sheet } from "./sheet";

/**
 * One stamp up close: turning in 3D, as a file for a 3D printer – to build
 * it for real. Its owner also says who else may stamp with it – the members
 * of which calendars, none to begin with – and deletes it. Anyone else
 * reads whose it is.
 */
export const StampSheet = ({
  stamp,
  mine,
  locale,
  onClose,
}: {
  stamp: Snapshot<StampDoc>;
  mine: boolean;
  locale: Locale;
  onClose: () => void;
}) => {
  const t = dictionaryOf(locale);
  const { calendars, people, me } = useBoop();
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const input = useMemo(
    () => ({ shape: stamp.shape, color: stamp.color, drawing: stamp.drawing }),
    [stamp.shape, stamp.color, stamp.drawing]
  );

  // Where it can be shared: my calendars with someone else in them – and
  // those it already is shared with, to take it back.
  const targets = useMemo(
    () =>
      Object.values(calendars)
        .filter(
          (calendar) =>
            calendar.members.length > 1 ||
            stamp.sharedWith.includes(calendar.id)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [calendars, stamp.sharedWith]
  );
  const firstName = (id: string) => people[id]?.split(" ")[0] || "…";
  const share = (calendar: string, on: boolean) => {
    const rest = stamp.sharedWith.filter((id) => id !== calendar);
    void shareStamp(stamp.id, on ? [...rest, calendar] : rest);
  };

  const download = async () => {
    setBusy(true);
    try {
      const blob = await stampStl(input);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = stlName(stamp.name);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={stamp.name || t.app.stamp.untitled}>
      {!mine && (
        <p className="-mt-3 font-bold text-muted">
          {t.app.stamp.by(firstName(stamp.owner))}
        </p>
      )}
      <div className={STAGE}>
        <StickerView className="absolute inset-0" stamp={input} />
      </div>
      <p className="-mt-2 text-center text-muted text-sm">{t.app.draw.turn}</p>
      <Button disabled={busy} onClick={download} size="lg">
        {t.app.stamp.print3d}
      </Button>
      <p className="font-medium text-muted text-xs">
        {t.app.stamp.hint(PRINT_MM)}
      </p>
      {mine && (
        <div className="flex flex-col gap-2">
          <h3 className="font-black text-lg">{t.app.stamp.share}</h3>
          {targets.length > 0 ? (
            <>
              <p className="font-medium text-muted text-sm">
                {t.app.stamp.shareText}
              </p>
              <ul className="flex flex-col gap-2">
                {targets.map((calendar) => (
                  <li key={calendar.id}>
                    <label className="scribble scribble-bare scribble-soft flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2">
                      <input
                        checked={stamp.sharedWith.includes(calendar.id)}
                        className="h-5 w-5 shrink-0 accent-ink"
                        onChange={(event) =>
                          share(calendar.id, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-bold">
                          {calendar.name}
                        </span>
                        <span className="truncate font-medium text-muted text-sm">
                          {calendar.members
                            .filter((id) => id !== me?.id)
                            .map(firstName)
                            .join(", ") || t.app.stamp.onlyYou}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="font-medium text-muted text-sm">
              {t.app.stamp.shareNone}
            </p>
          )}
        </div>
      )}
      {mine &&
        (sure ? (
          <div className="flex animate-fade flex-col gap-3 rounded-2xl border-2 border-pink bg-pink-soft p-4">
            <p className="font-bold">{t.app.stamp.deleteConfirm}</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setSure(false)} size="sm" variant="ghost">
                {t.app.draw.cancel}
              </Button>
              <Button
                onClick={() => {
                  void deleteStamp(stamp.id);
                  onClose();
                }}
                size="sm"
                variant="pink"
              >
                {t.app.stamp.delete}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setSure(true)} size="sm" variant="ghost">
            {t.app.stamp.delete}
          </Button>
        ))}
    </Sheet>
  );
};
