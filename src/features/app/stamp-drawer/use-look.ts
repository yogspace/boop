import { useMemo, useState } from "react";
import type { Snapshot } from "valtio";
import type {
  ColorName,
  RimPattern,
  StampDoc,
  StampShape,
} from "@/features/calendar/model";
import { knownKey, pickable } from "@/features/calendar/palette";
import { usePalette } from "@/features/calendar/palette-provider";
import { knownShape } from "@/features/calendar/shapes";
import { useShapes } from "@/features/calendar/shapes-provider";
import { useBoop } from "@/features/offline/store";

/**
 * How the stamp looks besides its drawing – its shape, color and rim, how
 * it prints: as a stamp of one's own came in, or to begin with.
 */
export const useLook = (stamp: Snapshot<StampDoc> | undefined) => {
  // Prints the other way round: the face in ink, the doodle cut out.
  const [inverted, setInverted] = useState(Boolean(stamp?.drawing?.inverted));
  // The rim's pattern (none: plain), and whether it is for the big days.
  const [rim, setRim] = useState<RimPattern | undefined>(stamp?.drawing?.rim);
  const [special, setSpecial] = useState(Boolean(stamp?.drawing?.special));
  const shapes = useShapes();
  const [pickedShape, setShape] = useState<StampShape>(
    stamp?.shape ?? shapes[0]?.key ?? ""
  );
  const shape = knownShape(pickedShape, shapes);
  // Its color: one of the stamp colors one may pick (palette.ts – the
  // special ones are Boop's gifts', an admin account picks them too) – the
  // one picked as long as they have it; else, and to begin with, “grape” or
  // their first. A stamp drawn anew keeps its own among them, whichever.
  const { me } = useBoop();
  const colors = usePalette();
  const admin = Boolean(me?.admin);
  const own = stamp?.color;
  const palette = useMemo(
    () =>
      pickable(colors, { admin }).concat(
        colors.filter((c) => c.special && !admin && c.key === own)
      ),
    [colors, admin, own]
  );
  const [picked, setColor] = useState<ColorName>(stamp?.color ?? "grape");
  const color = knownKey(picked, palette);

  return {
    inverted,
    setInverted,
    rim,
    setRim,
    special,
    setSpecial,
    shapes,
    shape,
    setShape,
    palette,
    color,
    setColor,
  };
};
