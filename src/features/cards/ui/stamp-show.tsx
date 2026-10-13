"use client";

import { useMemo, useState } from "react";
import { StampSvg } from "@/features/calendar/stamp-svg";
import type { StickerInput } from "@/features/stickers/build";
import { StickerView } from "@/features/stickers/sticker-view";
import { cn } from "@/lib/cn";

/**
 * A stamp shown off in 3D – a card's, a gift's. Its drawing is there from
 * the first paint (the server's too); the live stamp comes over it face-on,
 * line for line, then grows out of it and turns to show itself
 * (sticker-view.tsx) – and the drawing goes. Without WebGL the drawing
 * stays. Drag it to turn it.
 */
export const StampShow = ({
  stamp: { shape, color, drawing },
  className,
}: {
  stamp: StickerInput;
  className?: string;
}) => {
  // The live view starts anew for another stamp – only then.
  const stamp = useMemo(
    () => ({ shape, color, drawing }),
    [shape, color, drawing]
  );
  const [live, setLive] = useState(false);
  return (
    <div className={cn("relative aspect-square w-full", className)}>
      {/* 12px in – where the live stamp's first frame lies (`inset`). */}
      <div
        className={cn(
          "absolute inset-3 transition-opacity duration-150",
          live && "opacity-0"
        )}
      >
        <StampSvg
          className="h-full w-full"
          color={color}
          drawing={drawing}
          filled
          shape={shape}
        />
      </div>
      <StickerView
        className="absolute inset-0"
        inset={12}
        onShown={() => setLive(true)}
        stamp={stamp}
      />
    </div>
  );
};
