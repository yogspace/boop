"use client";

import { useRef, useState } from "react";
import type { useBoop } from "@/features/offline/store";
import type { Address, Panel } from "../address";
import { heldStamp } from "./history";
import type { Place } from "./use-place";

/**
 * What lies over the app: a day's sheet, the editor, a calendar's settings
 * and its share sheet, the account's sheet, a stamp's, the dialogs – which
 * is open, which waits for another to go first (one sheet at a time), and
 * which of them the address names (`panel`, address.ts).
 */
export const useSheets = ({
  boop,
  place,
}: {
  boop: ReturnType<typeof useBoop>;
  place: Place;
}) => {
  const { shown, calendar, openDay, stepTo, setDay } = place;
  const [drawing, setDrawing] = useState(false);
  // A new stamp drawn from a day's page (its tray's last tile): back on
  // that day it is in the hand – `handed`, once saved, until the page has
  // taken it. A day's sheet and the editor take turns, one gone before the
  // other comes (`dayUp`, `drawerUp`: there, or still on its way out) – two
  // at once would undo each other's hold on the page behind (sheet.tsx).
  const fromDay = useRef(false);
  const [handed, setHanded] = useState<string | null>(null);
  const [dayUp, setDayUp] = useState(false);
  const [drawerUp, setDrawerUp] = useState(false);
  // Something drawn in the new stamp's editor: the browser's back doesn't
  // throw it away – it stays, and the editor asks (`ask` counts up).
  const drawn = useRef(false);
  const [askLeave, setAskLeave] = useState(0);
  // An invitation's popup over the app (invitations.tsx) – or a card that
  // came to the account, greeted (arrivals.tsx). One at a time.
  const [inviting, setInviting] = useState(false);
  const [arriving, setArriving] = useState(false);
  const noteDrawn = useRef((now: boolean) => {
    drawn.current = now;
  }).current;
  // Whose share sheet, whose settings are open – by id: should that calendar
  // go meanwhile (deleted, or someone took the account out), its sheet goes
  // too, rather than turn into another calendar's.
  const [sharing, setSharing] = useState<string | null>(null);
  const [settings, setSettings] = useState<string | null>(null);
  // From the settings on to the share sheet: one goes, then the next comes –
  // two at once would undo each other's hold on the page behind (sheet.tsx).
  const shareNext = useRef<string | null>(null);
  const [account, setAccount] = useState(false);
  // A sheet the address asks for (a reload, a link, back and forth) – it
  // opens once the calendar it belongs to is known.
  const [asking, setAsking] = useState<Panel | null>(shown.panel);
  const [opened, setOpened] = useState<string | null>(null);
  // A stamp of one's own drawn anew, by id – in the editor, like a new one.
  // Its sheet makes way first (`editNext`), and comes back once the editor
  // is gone (`backTo`): one sheet at a time.
  const [editing, setEditing] = useState<string | null>(null);
  const editNext = useRef<string | null>(null);
  const backTo = useRef<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "logout" | null>(null);

  const me = boop.me?.id;
  /** A stamp the account may draw anew: its own, one it drew itself. */
  const canEdit = (id: string) => {
    const stamp = boop.stamps[id];
    return Boolean(stamp && stamp.owner === me && !stamp.origin);
  };
  // Over the shelf, without a calendar too (every one may go).
  if (asking && boop.status === "ready" && (calendar || shown.shelf)) {
    setAsking(null);
    if (asking === "settings" && calendar) setSettings(calendar.id);
    // Sharing is the owner's – for anyone else the address asks for nothing.
    if (asking === "share" && calendar && calendar.owner === boop.me?.id) {
      setSharing(calendar.id);
    }
    if (asking === "account") setAccount(true);
    if (asking === "draw") setDrawing(true);
    // Drawing a stamp anew: the one the history entry keeps – if it still is
    // one the account drew. Its sheet, open, makes way first.
    const held = asking === "edit" ? heldStamp() : null;
    if (held && canEdit(held)) {
      if (opened) {
        backTo.current = opened === held ? held : null;
        editNext.current = held;
        setOpened(null);
      } else setEditing(held);
    }
  }
  // The sheet open over the view, for the address – the share sheet already
  // while the settings make way for it.
  const shownId = calendar?.id;
  const edited = editing && canEdit(editing) ? boop.stamps[editing] : null;
  // Gone meanwhile (deleted on another device) – the editor with it.
  if (editing && !edited) setEditing(null);
  const panel: Panel | null =
    edited || editNext.current
      ? "edit"
      : drawing
        ? "draw"
        : account
          ? "account"
          : shownId && settings === shownId
            ? "settings"
            : shownId && (sharing ?? shareNext.current) === shownId
              ? "share"
              : null;
  // A day's sheet and the editor: one at a time – each waits until the
  // other is gone (`drawFromDay`).
  const showDay =
    Boolean(calendar && openDay) && !drawing && !edited && !drawerUp;
  const showDrawer = (drawing || Boolean(edited)) && !dayUp;
  if (showDay && !dayUp) setDayUp(true);
  if (showDrawer && !drawerUp) setDrawerUp(true);

  /**
   * A stamp's sheet makes way for the editor, with the stamp in it – and
   * comes back once it is gone: closed, saved, or back in the history.
   */
  const editStamp = (id: string) => {
    stepTo({ panel: "edit" }, { stamp: id });
    editNext.current = id;
    backTo.current = id;
    setOpened(null);
  };

  /**
   * A new stamp, from a day's page – a step over that day's own: back, or
   * the editor closing, is that day again (the today view, or its sheet
   * once the editor is gone), and a stamp saved is in the hand there.
   */
  const drawFromDay = () => {
    fromDay.current = true;
    stepTo({ panel: "draw" });
    setDay(null);
    setDrawing(true);
  };

  /**
   * Back from the editor with something drawn (or changed): forward again
   * to its entry, and the question – and nothing else on the way back.
   * True when it stays so.
   */
  const keepDrawing = (next: Address) => {
    if (!drawn.current) return false;
    if (next.panel !== "draw" && next.panel !== "edit") {
      window.history.go(1);
      setAskLeave((n) => n + 1);
    }
    return true;
  };

  /**
   * Back and forth in the history: the sheets go, and the one that entry
   * showed (`next`) opens anew, once its calendar is known.
   */
  const closeAll = (next: Panel | null) => {
    setSettings(null);
    setSharing(null);
    setAccount(false);
    setDrawing(false);
    setEditing(null);
    shareNext.current = null;
    editNext.current = null;
    setAsking(next);
  };

  // Something lies over the today view – its page's keys are off then (the
  // account's menu too, BoopApp).
  const over = Boolean(
    openDay ||
      drawing ||
      edited ||
      sharing ||
      settings ||
      account ||
      dialog ||
      opened
  );

  return {
    panel,
    over,
    edited,
    showDay,
    showDrawer,
    drawing,
    setDrawing,
    setEditing,
    fromDay,
    handed,
    setHanded,
    setDayUp,
    setDrawerUp,
    askLeave,
    noteDrawn,
    inviting,
    setInviting,
    arriving,
    setArriving,
    sharing,
    setSharing,
    settings,
    setSettings,
    shareNext,
    account,
    setAccount,
    opened,
    setOpened,
    editNext,
    backTo,
    dialog,
    setDialog,
    editStamp,
    drawFromDay,
    keepDrawing,
    closeAll,
  };
};

export type Sheets = ReturnType<typeof useSheets>;
