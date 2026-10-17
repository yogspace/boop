import { type Dispatch, type SetStateAction, useEffect } from "react";
import { type Print, STEP } from "./prints";

/**
 * A day's page by keyboard (day-page.tsx): steps back and forth, the stamp
 * in hand turned or put down, the print picked turned, let go of or taken
 * off. The keys listen on the whole window – `keyboard` false keeps them
 * off while something else lies over the page.
 */

/** Whether a key is being typed into a field – then it is the field's. */
const typing = (event: KeyboardEvent) => {
  const at = event.target;
  return (
    at instanceof HTMLElement &&
    (at.isContentEditable || at.matches("input, textarea, select"))
  );
};

export const useKeys = ({
  keyboard,
  holding,
  sorting,
  marked,
  take,
  turnBy,
  undo,
  redo,
  remove,
  turnPrint,
  setPicked,
}: {
  keyboard: boolean;
  holding: boolean;
  /** The order's menu is open over the tray: Escape is its, first. */
  sorting: boolean;
  /** The print picked. */
  marked: Print | null;
  take: (id: string | null) => void;
  turnBy: (degrees: number) => void;
  undo: () => void;
  redo: () => void;
  remove: (print: Print) => void;
  turnPrint: (print: Print, degrees: number) => void;
  setPicked: Dispatch<SetStateAction<string | null>>;
}) => {
  // Escape puts the stamp down first – only then it closes a sheet the page
  // is in (which listens on the window too, so this one goes ahead of it).
  // ⌘Z / Ctrl+Z takes a step back, ⇧⌘Z / Ctrl+Y (and Ctrl+⇧Z) does it
  // again; ← → and [ ] turn the stamp in hand.
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const again =
        (mod && event.shiftKey && key === "z") ||
        (event.ctrlKey && !event.metaKey && !event.shiftKey && key === "y");
      if (!event.altKey && (again || (mod && !event.shiftKey && key === "z"))) {
        // Typing, they are the typing's.
        if (typing(event)) return;
        event.preventDefault();
        if (again) redo();
        else undo();
        return;
      }
      if (!holding || mod) return;
      if (event.key === "Escape") {
        if (sorting) return;
        event.stopImmediatePropagation();
        take(null);
      } else if (event.key === "ArrowLeft" || event.key === "[") {
        if (typing(event)) return;
        event.preventDefault();
        turnBy(-STEP);
      } else if (event.key === "ArrowRight" || event.key === "]") {
        if (typing(event)) return;
        event.preventDefault();
        turnBy(STEP);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyboard, holding, sorting, take, turnBy, undo, redo]);

  // A picked print: Delete or Backspace takes it off the page, ← → and [ ]
  // turn it, Escape lets go of it – and, like putting the stamp down, goes
  // ahead of a sheet's own Escape, which would close it.
  useEffect(() => {
    if (!(marked && keyboard)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        if (sorting) return;
        event.stopImmediatePropagation();
        setPicked(null);
        return;
      }
      if (typing(event)) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove(marked);
      } else if (event.key === "ArrowLeft" || event.key === "[") {
        event.preventDefault();
        turnPrint(marked, -STEP);
      } else if (event.key === "ArrowRight" || event.key === "]") {
        event.preventDefault();
        turnPrint(marked, STEP);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyboard, marked, sorting, remove, turnPrint, setPicked]);
};
