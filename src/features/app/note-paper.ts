import type { NoteContent } from "@/features/calendar/model";
import type { Locale } from "@/i18n/config";

/**
 * A day's note on its page, the browser's side of it (day-note.tsx): what
 * the browser may change there, the note drawn onto the page, whether
 * anything is written, the cursor to its end – and, under it, when someone
 * else last wrote.
 */

/** Bold with ⌘ on Apple's systems (Ctrl there moves the cursor), else Ctrl. */
export const apple = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * What may change the page: typing (also composed, corrected, swapped),
 * line breaks, deleting, undo – and bold, italic or underline. Anything
 * else the browser offers is turned down.
 */
export const ALLOWED =
  /^(insert(Text|ReplacementText|LineBreak|CompositionText|FromComposition|Transpose|FromYank)|delete(?!ByDrag).*|history(Undo|Redo)|format(Bold|Italic|Underline|Remove))$/;

/** What adds to the text – held at the note's length. */
export const GROWS = /^insert(Text|ReplacementText|LineBreak|FromYank)$/;

/**
 * An italic run in pieces, a word each with the space after it. Italic
 * leans the other way here (`ITALIC`, day-note.tsx) – a skew, which only a
 * box can take – and one box per word lets the line still break between
 * them.
 */
const words = (text: string) => text.match(/\S+\s*|\s+/g) ?? [text];

/**
 * Draws a note onto the page – text nodes, `<b>`, `<i>`, `<u>` and `<br>`
 * only. Italic outermost: an underline drawn inside its box leans with it.
 */
export const draw = (page: HTMLElement, content: NoteContent | null) => {
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
export const drawn = (content: NoteContent | null) => {
  const page = document.createElement("div");
  draw(page, content);
  return page.innerHTML;
};

/** Nothing written – a line break the browser keeps for the cursor aside. */
export const isBlank = (page: HTMLElement) =>
  !page.textContent && page.querySelectorAll("br").length <= 1;

/** The cursor at the end of the page. */
export const caretToEnd = (page: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(page);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

/** When, said the short way: “vor 2 Std.”, “gestern”, “2 hr. ago”. */
export const ago = (iso: string, locale: Locale, justNow: string) => {
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
