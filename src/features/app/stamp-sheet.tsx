"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "valtio";
import { Bang } from "@/components/doodles";
import { Button, Checkbox } from "@/components/ui";
import type { StampDoc } from "@/features/calendar/model";
import { CardSender } from "@/features/cards/ui/card-sender";
import { GiftSender } from "@/features/cards/ui/gift-sender";
import { SentCards } from "@/features/cards/ui/sent-cards";
import {
  deleteStamp,
  renameStamp,
  shareStamp,
  useBoop,
} from "@/features/offline/store";
import { PRINT_MM, stampStl, stlName } from "@/features/stickers/export-stl";
import { STAGE, StickerView } from "@/features/stickers/sticker-view";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { NameForm } from "./dialogs";
import { TOOL_SIGNS } from "./draw-tools";
import { Sheet } from "./sheet";

/**
 * One stamp up close: turning in 3D, as a file for a 3D printer – to build
 * it for real. Its owner also names it anew, sees and says whom it is
 * shared with – the members of which calendars may stamp with it, none to
 * begin with, and where its cards went –, sends it as a card (one they drew
 * themselves: what came as a card or a gift is not passed on) and deletes
 * it. One they drew they also open in the editor again (`onEdit`): its look
 * is theirs to change – a copy's is its original's. An account with the admin box also sends such a stamp to everyone, as
 * a gift from Boop. Anyone else reads whose it is; one that came to its
 * owner says from whom, with the giver's words.
 */
export const StampSheet = ({
  stamp,
  mine,
  locale,
  onClose,
  onEdit,
}: {
  stamp: Snapshot<StampDoc>;
  mine: boolean;
  locale: Locale;
  onClose: () => void;
  /** Draws it anew – the sheet makes way for the editor. */
  onEdit?: () => void;
}) => {
  const t = dictionaryOf(locale);
  const { calendars, people, me, online } = useBoop();
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  // Cards made of it while the sheet is open – its list reads anew.
  const [made, setMade] = useState(0);
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
      {mine && stamp.origin && (
        <p className="-mt-3 font-bold text-muted">
          {t.app.stamp.origin(stamp.origin.name.split(" ")[0] ?? "")}
        </p>
      )}
      {mine && stamp.origin?.message && (
        // The giver's words – on a slip, as they came.
        <p className="scribble scribble-thin scribble-soft wrap-break-word -rotate-1 whitespace-pre-line rounded-2xl px-4 py-3 font-medium">
          {stamp.origin.message}
        </p>
      )}
      <div className={STAGE}>
        <StickerView className="absolute inset-0" stamp={input} />
      </div>
      <p className="-mt-2 text-center text-muted text-sm">{t.app.draw.turn}</p>
      {mine && !stamp.origin && onEdit && (
        <Button onClick={onEdit} size="lg" variant="plain">
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
          >
            <path d={TOOL_SIGNS.pen} />
          </svg>
          {t.app.stamp.edit}
        </Button>
      )}
      <Button disabled={busy} onClick={download} size="lg">
        {t.app.stamp.print3d}
      </Button>
      <p className="font-medium text-muted text-xs">
        {t.app.stamp.hint(PRINT_MM)}
      </p>
      {mine && (
        <NameForm
          label={t.app.draw.name}
          maxLength={40}
          name={stamp.name}
          onSave={(name) => void renameStamp(stamp.id, name)}
          placeholder={t.app.draw.namePlaceholder}
          save={t.app.save}
        />
      )}
      {mine && (
        // Whom it is shared with: the calendars whose members may stamp
        // with it – and, for one drawn by its owner, the cards made of it.
        <div className="flex flex-col gap-3">
          <h3 className="font-black text-lg">{t.app.stamp.sharedWith}</h3>
          <div className="flex flex-col gap-2">
            <h4 className="font-bold text-sm">{t.app.calendars}</h4>
            {targets.length > 0 ? (
              <>
                <p className="font-medium text-muted text-sm">
                  {t.app.stamp.shareText}
                </p>
                <ul className="flex flex-col gap-2">
                  {targets.map((calendar) => (
                    <li key={calendar.id}>
                      <Checkbox
                        checked={stamp.sharedWith.includes(calendar.id)}
                        className="scribble scribble-bare scribble-soft gap-3 rounded-2xl px-3 py-2 text-base"
                        onChange={(event) =>
                          share(calendar.id, event.target.checked)
                        }
                      >
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
                      </Checkbox>
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
          {!stamp.origin && (
            <div className="flex flex-col gap-2">
              <h4 className="font-bold text-sm">{t.app.stamp.card.sent}</h4>
              <SentCards
                fresh={made}
                locale={locale}
                online={online}
                stamp={stamp.id}
              />
            </div>
          )}
        </div>
      )}
      {mine && !stamp.origin && (
        <CardSender
          locale={locale}
          name={stamp.name}
          online={online}
          onMade={() => setMade((n) => n + 1)}
          stamp={stamp.id}
        />
      )}
      {mine && !stamp.origin && me?.admin && (
        // Boop's gifts – the server asks for the box once more.
        <GiftSender locale={locale} online={online} stamp={stamp.id} />
      )}
      {mine &&
        (sure ? (
          // Watch out: a thick frame and an exclamation mark, like an error.
          <div className="scribble scribble-bold flex animate-fade flex-col gap-3 rounded-2xl p-4">
            <p className="flex items-start gap-2.5 font-bold">
              <Bang className="h-6 w-6 shrink-0" />
              {t.app.stamp.deleteConfirm}
            </p>
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
                variant="danger"
              >
                {t.app.stamp.delete}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="self-start"
            onClick={() => setSure(true)}
            size="sm"
            variant="danger"
          >
            {t.app.stamp.delete}
          </Button>
        ))}
    </Sheet>
  );
};
