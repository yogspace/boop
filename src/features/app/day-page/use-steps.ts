import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import {
  movePlacement,
  placeStamp,
  removePlacement,
  restorePlacement,
} from "@/features/offline/store";
import type { Print, Spot } from "./prints";

/**
 * Undo and redo on a day's page (day-page.tsx): the steps of a visit, taken
 * back and done again – the buttons under the page and ⌘Z, ⇧⌘Z or Ctrl+Y.
 */

/**
 * What can be taken back – and, taken back, done again. `id` is the print as
 * it is now: one that comes back (a removal taken back, a print placed
 * again) is a new one (restorePlacement), and every step that meant the
 * old one means it from then on. A print placed keeps what it was placed
 * with, a removed one what it was – to come back as just that.
 */
export type Step =
  | {
      kind: "place";
      id: string;
      print: Omit<Parameters<typeof placeStamp>[0], "id">;
    }
  | { kind: "move"; id: string; from: Spot; to: Spot }
  | { kind: "turn"; id: string; from: number; to: number }
  | { kind: "remove"; id: string; print: Print };

/**
 * The steps of this visit – done (`done`, newest last) and taken back
 * (`undone`, the last taken back last) – and a line they queue up in: a
 * step is noted (`note`) before the next undo looks, also while its print
 * is still saving. A new step leaves nothing to do again. A print moved
 * back glides there (`setGlide`); one that goes is no longer picked
 * (`setPicked`).
 */
export const useSteps = (
  setGlide: (id: string | null) => void,
  setPicked: Dispatch<SetStateAction<string | null>>
) => {
  const done = useRef<Step[]>([]);
  const undone = useRef<Step[]>([]);
  const line = useRef<Promise<void>>(Promise.resolve());
  const [can, setCan] = useState({ undo: false, redo: false });
  const tell = useCallback(
    () =>
      setCan({
        undo: done.current.length > 0,
        redo: undone.current.length > 0,
      }),
    []
  );
  const note = useCallback(
    (step: Step) => {
      line.current = line.current.then(() => {
        undone.current = [];
        const last = done.current.at(-1);
        // Turning a print on and on is one step – taken back at once. Turned
        // back to where it was (set straight, say), there is none.
        if (
          step.kind === "turn" &&
          last?.kind === "turn" &&
          last.id === step.id
        ) {
          last.to = step.to;
          if (last.to === last.from) done.current.pop();
        } else done.current.push(step);
        tell();
      });
    },
    [tell]
  );
  /** Takes the last step back (`back`) – or does the last taken back again. */
  const travel = useCallback(
    (back: boolean) => {
      line.current = line.current
        .then(async () => {
          const [from, to] = back
            ? [done.current, undone.current]
            : [undone.current, done.current];
          const step = from.pop();
          if (!step) return;
          to.push(step);
          tell();
          if (step.kind === "move") {
            setGlide(step.id);
            await movePlacement(step.id, back ? step.from : step.to);
          } else if (step.kind === "turn") {
            await movePlacement(step.id, {
              rotation: back ? step.from : step.to,
            });
          } else if ((step.kind === "place") === back) {
            // A print goes: one placed, taken back – one removed, again.
            setPicked((id) => (id === step.id ? null : id));
            await removePlacement(step.id);
          } else {
            // A print comes – a removal taken back, one placed again: as a
            // new print, which the steps that meant the old one now mean.
            const id =
              step.kind === "place"
                ? await placeStamp(step.print)
                : await restorePlacement(step.print);
            for (const other of [...done.current, ...undone.current]) {
              if (other.id === step.id) other.id = id;
            }
          }
        })
        .catch(() => undefined);
    },
    [tell, setGlide, setPicked]
  );
  const undo = useCallback(() => travel(true), [travel]);
  const redo = useCallback(() => travel(false), [travel]);
  return { can, note, undo, redo };
};
