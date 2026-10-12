"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "valtio";
import { Button } from "@/components/ui";
import type { StampDoc } from "@/features/calendar/model";
import { deleteStamp } from "@/features/offline/store";
import { PRINT_MM, stampStl, stlName } from "@/features/stickers/export-stl";
import { StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { Sheet } from "./sheet";

/**
 * One stamp up close: turning in 3D, as a file for a 3D printer – to build
 * it for real – and, for its owner, deleting it.
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
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const input = useMemo(
    () => ({ shape: stamp.shape, color: stamp.color, drawing: stamp.drawing }),
    [stamp.shape, stamp.color, stamp.drawing]
  );

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
      <div className="mx-auto w-full max-w-80">
        <StickerView stamp={input} />
      </div>
      <p className="-mt-2 text-center text-muted text-sm">{t.app.draw.turn}</p>
      <Button disabled={busy} onClick={download} size="lg">
        {t.app.stamp.print3d}
      </Button>
      <p className="font-medium text-muted text-xs">
        {t.app.stamp.hint(PRINT_MM)}
      </p>
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
