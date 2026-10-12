"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import {
  buildSticker,
  disposeSticker,
  type StickerInput,
  stage,
} from "./build";

/**
 * The stamp being made, live in 3D: it starts flat and face-on – just like
 * the drawing – then grows its thickness and its relief and tilts into the
 * room, and keeps turning gently. Drag to turn it yourself.
 */
export const StickerView = ({
  stamp,
  className,
}: {
  stamp: StickerInput;
  className?: string;
}) => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    let cleanup = () => {};
    void (async () => {
      const THREE = await import("three");
      const box = host.current;
      if (gone || !box) return;
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      const resize = () => renderer.setSize(box.clientWidth, box.clientWidth);
      resize();
      renderer.domElement.style.touchAction = "none";
      box.appendChild(renderer.domElement);
      const { scene, camera } = await stage(THREE, renderer);
      if (gone) {
        renderer.dispose();
        return;
      }
      const sticker = buildSticker(THREE, stamp);
      scene.add(sticker);

      // Turning by hand – it swings back when let go.
      let turn = 0;
      let from: number | null = null;
      const canvas = renderer.domElement;
      const down = (event: PointerEvent) => {
        from = event.clientX;
        canvas.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent) => {
        if (from === null) return;
        turn += (event.clientX - from) / 90;
        from = event.clientX;
      };
      const up = () => {
        from = null;
      };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      const observer = new ResizeObserver(resize);
      observer.observe(box);

      const start = performance.now();
      // Overshoots a little at the end – it pops into 3D.
      const ease = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
      let frame = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1100);
        const e = ease(t);
        const time = (now - start) / 1000;
        sticker.scale.set(1, 1, Math.max(0.02, e));
        sticker.rotation.x = -0.42 * e;
        sticker.rotation.y = e * (0.25 + Math.sin(time * 0.9) * 0.4) + turn;
        sticker.rotation.z = -0.05 * e;
        if (from === null) turn *= 0.94;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        disposeSticker(sticker);
        renderer.dispose();
        canvas.remove();
      };
    })();
    return () => {
      gone = true;
      cleanup();
    };
  }, [stamp]);

  return (
    <div
      className={cn(
        "aspect-square w-full cursor-grab active:cursor-grabbing",
        className
      )}
      ref={host}
    />
  );
};
