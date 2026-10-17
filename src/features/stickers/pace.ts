/**
 * Work on the stamps in 3D – building a model, compiling a program,
 * rendering a picture – goes on in slices: about SLICE at a time, then the
 * page has its turn – a frame drawn, a tap answered – so nothing stutters
 * meanwhile. Shared by all of it (render.ts, ink.ts): one clock.
 */

/** How long work goes on at a time (ms). */
const SLICE = 12;

/**
 * The page's turn: right after the next frame – it is drawn, taps come
 * first. (`scheduler.yield` would go on sooner, but before the frame: in
 * Chrome the page then draws only every 60–120 ms while pictures are made.)
 * `idle` – for what nobody waits for: once nothing else is to be done
 * (`requestIdleCallback`, never more than a moment late).
 */
const breathe = (idle: boolean) => {
  if (idle && typeof requestIdleCallback === "function") {
    return new Promise<void>((resolve) =>
      requestIdleCallback(() => resolve(), { timeout: 400 })
    );
  }
  return new Promise<void>((resolve) => {
    // A hidden page draws no frames.
    if (document.hidden) setTimeout(resolve, 0);
    else requestAnimationFrame(() => setTimeout(resolve, 0));
  });
};

let slice = 0;

/** Goes on – or, the slice used up, first lets the page have its turn. */
export const pace = async (idle = false) => {
  if (performance.now() - slice < SLICE) return;
  await breathe(idle);
  slice = performance.now();
};
