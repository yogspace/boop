"use client";

import {
  type ClipboardEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Underline } from "@/components/doodles";
import {
  type DayKey,
  type NoteContent,
  todayKey,
} from "@/features/calendar/model";
import {
  cleanNote,
  NOTE_LIMITS,
  noteId,
  noteOf,
  noteText,
} from "@/features/calendar/note";
import { boop, setNote, useBoop } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * A day's note – what happened that day, in a few words (bold, italic,
 * underlined, line breaks). One per day of a calendar, written by its members together.
 * It stands under the day's page, wherever that shows (the day's sheet, the
 * today view).
 *
 * Written straight onto ruled paper: no button to save – it keeps itself a
 * moment after the typing stops, and when one leaves it, offline too (the
 * store's outbox, like every change).
 *
 * The editor is the browser's own (`contenteditable`), so typing, the
 * cursor, autocorrect, the IME and ⌫ over a bold word are what the system
 * does everywhere. While it has the focus its page is the browser's alone:
 * nothing here writes into it – what is typed is only read (`noteOf`) – so
 * the cursor never jumps. Bold, italic and underline go through the browser
 * too (`execCommand`, with its undo). What goes in otherwise is held to
 * plain text: a paste comes as plain text, a drop not at all, and whatever
 * else the browser offers (lists, links) is turned down. The page is drawn
 * anew from the note only while nobody writes on it – then with text nodes
 * and `b`/`i`/`u` alone, from a note checked once more (`cleanNote`):
 * nothing stored reaches the page as markup. The underline is a wavy one;
 * italic leans back (`ITALIC`).
 *
 * Someone else's change that comes in while one writes waits: the own text
 * stays, and is saved – so it is the later one and wins. Once one leaves
 * without having written since, the other's shows.
 */
export const DayNote = ({
  calendar,
  date,
  locale,
}: {
  calendar: string;
  date: DayKey;
  locale: Locale;
}) => {
  const { calendars } = useBoop();
  if (!calendars[calendar]) return null;
  // A page of its own for every day – the last one's keeps itself first.
  return (
    <NotePage
      calendar={calendar}
      date={date}
      key={`${calendar}/${date}`}
      locale={locale}
    />
  );
};

/** A line's height – the ruling runs at its pitch. */
const LINE = 32;
/** As many ruled lines, written on or not. */
const ROWS = 3;
/** The pause after typing that saves. */
const SAVE_MS = 800;

/** Bold with ⌘ on Apple's systems (Ctrl there moves the cursor), else Ctrl. */
const apple = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * What may change the page: typing (also composed, corrected, swapped),
 * line breaks, deleting, undo – and bold, italic or underline. Anything else the
 * browser offers is turned down.
 */
const ALLOWED =
  /^(insert(Text|ReplacementText|LineBreak|CompositionText|FromComposition|Transpose|FromYank)|delete(?!ByDrag).*|history(Undo|Redo)|format(Bold|Italic|Underline|Remove))$/;

/** What adds to the text – held at the note's length. */
const GROWS = /^insert(Text|ReplacementText|LineBreak|FromYank)$/;

/**
 * An italic run in pieces, a word each with the space after it. Italic
 * leans the other way here (`ITALIC`) – a skew, which only a box can take –
 * and one box per word lets the line still break between them.
 */
const words = (text: string) => text.match(/\S+\s*|\s+/g) ?? [text];

/**
 * Draws a note onto the page – text nodes, `<b>`, `<i>`, `<u>` and `<br>`
 * only. Italic outermost: an underline drawn inside its box leans with it.
 */
const draw = (page: HTMLElement, content: NoteContent | null) => {
  const doc = page.ownerDocument;
  const wrap = (node: Node, tag: string) => {
    const element = doc.createElement(tag);
    element.append(node);
    return element;
  };
  const nodes: Node[] = [];
  for (const [n, line] of (content?.lines ?? []).entries()) {
    if (n > 0) nodes.push(doc.createElement("br"));
    for (const run of line) {
      for (const piece of run.i ? words(run.text) : [run.text]) {
        let node: Node = doc.createTextNode(piece);
        if (run.u) node = wrap(node, "u");
        if (run.b) node = wrap(node, "b");
        if (run.i) node = wrap(node, "i");
        nodes.push(node);
      }
    }
  }
  page.replaceChildren(...nodes);
};

/** The page as `draw` would make it – to tell whether it needs drawing. */
const drawn = (content: NoteContent | null) => {
  const page = document.createElement("div");
  draw(page, content);
  return page.innerHTML;
};

/** Nothing written – a line break the browser keeps for the cursor aside. */
const isBlank = (page: HTMLElement) =>
  !page.textContent && page.querySelectorAll("br").length <= 1;

/** The cursor at the end of the page. */
const caretToEnd = (page: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(page);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

/** When, said the short way: “vor 2 Std.”, “gestern”, “2 hr. ago”. */
const ago = (iso: string, locale: Locale, justNow: string) => {
  const seconds = Math.min(0, (Date.parse(iso) - Date.now()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds > -60) return justNow;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86_400],
    ["week", 604_800],
    ["month", 2_629_800],
    ["year", 31_557_600],
  ];
  const [unit, size] =
    units.findLast(([, size]) => -seconds >= size) ?? units[0];
  return new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  }).format(Math.round(seconds / size), unit);
};

/**
 * A toggle drawn round, filled with ink while on. It keeps the focus where
 * it is (on the page, with its selection): pressing it is no leaving.
 */
/** What a toggle asks the browser for. */
const COMMANDS = { b: "bold", i: "italic", u: "underline" } as const;

/**
 * Italic on this paper leans back, the other way than type does: each piece
 * of it (`draw`, a word) a little box skewed about its middle – so it
 * neither eats the space before it nor leaves a gap after. It stays
 * `italic` – that is how the browser tells it is on, for ⌘I to switch it
 * off again – but the browser may not slant the letters itself (Satoshi
 * has no italic of its own): upright, then leaning back. An underline
 * inside leans along.
 */
const ITALIC =
  "[&_i]:inline-block [&_i]:skew-x-[14deg] [&_i]:[font-synthesis-style:none]";

const TOGGLE =
  "scribble scribble-sm scribble-thin flex h-9 w-9 shrink-0 select-none flex-col items-center justify-center rounded-full leading-none transition-transform duration-150 ease-out hover:-rotate-6 active:scale-90 aria-pressed:scribble-ink aria-pressed:hover:rotate-0";

const NotePage = ({
  calendar,
  date,
  locale,
}: {
  calendar: string;
  date: DayKey;
  locale: Locale;
}) => {
  const t = dictionaryOf(locale).app.note;
  const { notes, people, me } = useBoop();
  const id = useMemo(() => noteId(calendar, date), [calendar, date]);
  const note = notes[id];
  // Checked once more before it shows – whatever the device kept.
  const content = useMemo(
    () => (note ? cleanNote(note.content) : null),
    [note]
  );

  const page = useRef<HTMLDivElement>(null);
  /** What the page says, as a note – read at every keystroke. */
  const latest = useRef(content);
  /** Typed since the last save. */
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [blank, setBlank] = useState(!content);
  const [marks, setMarks] = useState({ b: false, i: false, u: false });
  const [rows, setRows] = useState(ROWS);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    void setNote(calendar, date, latest.current);
  }, [calendar, date]);

  /** The note onto the page – only while nobody writes on it. */
  const show = useCallback((next: NoteContent | null) => {
    const el = page.current;
    if (!el || dirty.current || el === document.activeElement) return;
    if (el.innerHTML !== drawn(next)) draw(el, next);
    latest.current = next;
    setBlank(!next);
  }, []);

  useLayoutEffect(() => show(content), [content, show]);

  // Leaving the day, the app or the page: what was typed keeps itself.
  useEffect(() => {
    const away = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [save]);

  // As many ruled lines as written ones – at least a few.
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setRows(Math.max(ROWS, Math.round(el.offsetHeight / LINE)))
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Bold, italic and underline where the cursor is – for the toggles. */
  const readMarks = useCallback(() => {
    const el = page.current;
    const at = window.getSelection()?.anchorNode;
    if (!(el && at && el.contains(at))) return;
    setMarks({
      b: document.queryCommandState("bold"),
      i: document.queryCommandState("italic"),
      u: document.queryCommandState("underline"),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", readMarks);
    return () => document.removeEventListener("selectionchange", readMarks);
  }, [readMarks]);

  /** How long the note would be with `adding` more in place of the selection. */
  const tooLong = (adding: number) => {
    const selected = window.getSelection()?.toString().length ?? 0;
    const length = noteText(latest.current).length;
    return length - selected + adding > NOTE_LIMITS.chars;
  };

  const lineBreak = () => {
    if (tooLong(1)) return;
    // A plain <br> – one line, not a paragraph in a <div>.
    if (!document.execCommand("insertLineBreak")) {
      document.execCommand("insertHTML", false, "<br>");
    }
  };

  // Turned down before it happens: what the browser would put in that is
  // no plain text, bold, italic or underline – and what would make the note too
  // long. A new paragraph is a line break here.
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const before = (event: InputEvent) => {
      if (event.inputType === "insertParagraph") {
        event.preventDefault();
        lineBreak();
      } else if (!ALLOWED.test(event.inputType)) {
        event.preventDefault();
      } else if (
        !event.isComposing &&
        GROWS.test(event.inputType) &&
        tooLong(event.data?.length ?? 1)
      ) {
        event.preventDefault();
      }
    };
    el.addEventListener("beforeinput", before);
    return () => el.removeEventListener("beforeinput", before);
  });

  const onInput = () => {
    const el = page.current;
    if (!el) return;
    latest.current = noteOf(el);
    dirty.current = true;
    setBlank(isBlank(el));
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_MS);
  };

  const format = (mark: "b" | "i" | "u") => {
    const el = page.current;
    if (!el) return;
    if (document.activeElement !== el) {
      el.focus();
      caretToEnd(el);
    }
    document.execCommand(COMMANDS[mark]);
    readMarks();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Mid-word in an IME, Enter and the rest are the IME's.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      lineBreak();
      return;
    }
    const mod = apple()
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
    if (!mod || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i" || key === "u") {
      event.preventDefault();
      format(key);
    }
  };

  /** A paste comes as plain text – what fits, its lines as lines. */
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const selected = window.getSelection()?.toString().length ?? 0;
    const room = NOTE_LIMITS.chars - noteText(latest.current).length + selected;
    const text = event.clipboardData
      .getData("text/plain")
      .replace(/\r\n?/g, "\n")
      .slice(0, Math.max(0, room));
    for (const [i, line] of text.split("\n").entries()) {
      if (i > 0) lineBreak();
      if (line) document.execCommand("insertText", false, line);
    }
  };

  const onBlur = () => {
    save();
    // Only the app left (another window, another app): it all stays as it
    // is, cursor and all, for when one comes back.
    if (!document.hasFocus()) return;
    setMarks({ b: false, i: false, u: false });
    // Done writing: the note as it is now – the own, just saved, or someone
    // else's that came in meanwhile – drawn the way it is kept.
    queueMicrotask(() => show(cleanNote(boop.notes[id]?.content ?? null)));
  };

  const today = todayKey();
  const placeholder =
    date === today ? t.today : date < today ? t.past : t.future;
  // Who wrote last, when it wasn't oneself.
  const other = note?.editedBy && note.editedBy !== me?.id ? note : null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!other) return;
    const minute = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(minute);
  }, [other]);
  const keys = apple() ? "⌘" : `${t.ctrl}+`;

  return (
    <div className="flex flex-col gap-1">
      <div className="group relative">
        {/* Ruled with the pencil – a line under every line, darker while
            one writes. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 text-line transition-colors duration-200 [--scribble-width:1.5px] group-focus-within:text-muted"
        >
          {Array.from({ length: rows }, (_, i) => (
            <span
              className="scribble-rule absolute inset-x-0 -translate-y-1/2"
              key={i}
              style={{ top: (i + 1) * LINE - 3 }}
            />
          ))}
        </span>
        {blank && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 font-medium text-muted"
            style={{ lineHeight: `${LINE}px` }}
          >
            {placeholder}
          </span>
        )}
        {/* biome-ignore lint/a11y/useSemanticElements: a textbox with bold and underline – no <textarea> holds those */}
        <div
          aria-label={t.label}
          aria-multiline="true"
          aria-placeholder={placeholder}
          className={cn(
            "relative whitespace-pre-wrap wrap-break-word text-base text-ink caret-ink outline-none [&_b]:font-extrabold [&_u]:underline [&_u]:decoration-wavy [&_u]:decoration-[1.5px] [&_u]:underline-offset-[4px]",
            ITALIC
          )}
          contentEditable
          onBlur={onBlur}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
          onFocus={readMarks}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          ref={page}
          role="textbox"
          spellCheck
          style={{ lineHeight: `${LINE}px`, minHeight: ROWS * LINE }}
          suppressContentEditableWarning
          tabIndex={0}
        />
      </div>
      {/* The marks first, from the left – who wrote last after them. */}
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 gap-2 py-1">
          <button
            aria-label={t.bold}
            aria-pressed={marks.b}
            className={TOGGLE}
            onClick={() => format("b")}
            onMouseDown={(event) => event.preventDefault()}
            title={`${t.bold} (${keys}B)`}
            type="button"
          >
            <span aria-hidden="true" className="font-black text-sm">
              B
            </span>
          </button>
          <button
            aria-label={t.italic}
            aria-pressed={marks.i}
            className={TOGGLE}
            onClick={() => format("i")}
            onMouseDown={(event) => event.preventDefault()}
            title={`${t.italic} (${keys}I)`}
            type="button"
          >
            {/* Leaning back, like the italics on the page. */}
            <span
              aria-hidden="true"
              className="inline-block origin-bottom skew-x-[14deg] font-bold font-serif text-sm"
            >
              I
            </span>
          </button>
          <button
            aria-label={t.underline}
            aria-pressed={marks.u}
            className={TOGGLE}
            onClick={() => format("u")}
            onMouseDown={(event) => event.preventDefault()}
            title={`${t.underline} (${keys}U)`}
            type="button"
          >
            <span aria-hidden="true" className="font-bold text-sm">
              U
            </span>
            <Underline className="-mt-px h-1 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <p className="min-w-0 truncate font-bold text-muted text-xs">
          {other &&
            t.by(
              people[other.editedBy] ?? "",
              ago(other.changedAt, locale, t.justNow)
            )}
        </p>
      </div>
    </div>
  );
};
