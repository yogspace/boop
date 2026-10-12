/**
 * The marker – draws every scribbled frame and line on the page (the
 * `scribble` utilities, styles.css) as a path of its own: a wobbly outline
 * worked out for the element's size and corners, laid on it as a
 * `clip-path`. A path stays a path – smooth, round at the ends, sharp at any
 * zoom on any screen – and the colors stay in CSS: the ink, the fill's
 * variable (a calendar's tint, a hover's grey).
 *
 * Why paths: the marker used to be SVG filters (feTurbulence and
 * feDisplacementMap) on a plain border – and a filter pushes the box's
 * *pixels* about, at the screen's resolution and without smoothing, so every
 * line came out with frayed, stair-stepped edges. Nine-slice images
 * (border-image, mask-border) can't follow a pill, whose corners are half a
 * height CSS doesn't know, and a mask image is a whole SVG document per
 * frame in Safari. A path per element is a little text, and painting it
 * costs no more than painting a border.
 *
 * It runs inline at the top of every page (scribble-defs.tsx), so what the
 * server sent is drawn before the first paint. It watches the document for
 * scribbled elements – parsed, rendered, their classes or state changed –
 * and draws each once its size is known, and again when it changes (a
 * ResizeObserver: it reports between layout and paint, so a new frame never
 * shows undrawn). The paths go into custom properties on the element, which
 * styles.css reads. Until they are there – no script, or not yet – a frame
 * is the plain border and box it is made of: a straight line, never none.
 *
 * What it reads: the element's size and corner radii, `--scribble-width`,
 * `-style`, `-inset`, `-ring`, `-wobble` and `-seed`. These follow its
 * classes, state attributes (`aria-pressed` …) and the breakpoints – not
 * `:hover`: a line's width or dashes don't change on hover. Two drawings
 * wait until they are wanted: the focus ring (when the frame takes focus)
 * and the boil's two other drawings (when the pointer comes – or at once,
 * for a plain `scribble-boil`).
 *
 * Self-contained – no imports, nothing from outside the function: it is sent
 * to the browser as its source text. `late` (development): leave each
 * element alone until React has hydrated it – a mark on the server's HTML
 * before that would read as a hydration mismatch.
 */
export function drawScribbles(late: boolean): void {
  const doc = globalThis.document;
  const page = globalThis as { scribbling?: boolean };
  if (!doc || page.scribbling || !globalThis.ResizeObserver) return;
  page.scribbling = true;

  type Point = [number, number];
  /** A line's middle: where it runs, which way is out (its normal), half its width there. */
  type Run = { points: Point[]; normals: Point[]; half: number[] };

  /** A seeded random number generator (mulberry32). */
  const random = (seed: number) => {
    let state = seed;
    return () => {
      state = (state + 0x6d_2b_79_f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  };

  // ── Paths ────────────────────────────────────────────────────────────────

  /**
   * Path text, kept small: each step relative to the last point, in tenths
   * of a pixel – counted in whole tenths, so nothing drifts.
   */
  const pen = () => {
    let x = 0;
    let y = 0;
    let d = "";
    const tenth = (v: number) => Math.round(v * 10);
    const nums = (values: number[]) =>
      values.reduce((out, v, i) => {
        const s = String(v / 10).replace(/^(-?)0\./, "$1.");
        return out + (i && s[0] !== "-" ? " " : "") + s;
      }, "");
    const to = (command: string, p: Point, before: number[] = []) => {
      const nx = tenth(p[0]);
      const ny = tenth(p[1]);
      if (command !== "l" || nx !== x || ny !== y) {
        d += command + nums([...before, nx - x, ny - y]);
      }
      x = nx;
      y = ny;
    };
    return {
      move: (p: Point) => {
        x = 0;
        y = 0;
        to("M", p);
      },
      line: (p: Point) => to("l", p),
      curve: (c: Point, p: Point) =>
        to("q", p, [tenth(c[0]) - x, tenth(c[1]) - y]),
      arc: (r: number, p: Point) => {
        const t = tenth(r);
        to(`a${nums([t, t])} 0 0 1 `, p);
      },
      close: () => {
        d += "z";
      },
      text: () => d,
    };
  };
  type Pen = ReturnType<typeof pen>;

  const mid = (a: Point, b: Point): Point => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];

  /** Smoothly through the points: every one a corner, rounded off from middle to middle. */
  const trace = (p: Pen, points: Point[], start: boolean) => {
    if (start) p.move(points[0]);
    else p.line(points[0]);
    for (let i = 1; i < points.length - 1; i++) {
      p.curve(points[i], mid(points[i], points[i + 1]));
    }
    p.line(points[points.length - 1]);
  };

  /** The same, round and closed. */
  const loop = (p: Pen, points: Point[]) => {
    const last = points.length - 1;
    p.move(mid(points[last], points[0]));
    points.forEach((point, i) => {
      p.curve(point, mid(point, points[i === last ? 0 : i + 1]));
    });
    p.close();
  };

  /** Which way is out at each point – clockwise, the left hand. */
  const normalsOf = (points: Point[], closed: boolean) =>
    points.map((_, i): Point => {
      const last = points.length - 1;
      const a = points[i > 0 ? i - 1 : closed ? last : 0];
      const b = points[i < last ? i + 1 : closed ? 0 : last];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[1] - a[1]) / length, (a[0] - b[0]) / length];
    });

  const side = ({ points, normals, half }: Run, way: number) =>
    points.map(
      (p, i): Point => [
        p[0] + normals[i][0] * half[i] * way,
        p[1] + normals[i][1] * half[i] * way,
      ]
    );

  /** A stroke with round ends: out along one side, round the end, back along the other. */
  const capsule = (p: Pen, run: Run) => {
    const out = side(run, 1);
    const back = side(run, -1).reverse();
    trace(p, out, true);
    p.arc(run.half[run.half.length - 1], back[0]);
    trace(p, back, false);
    p.arc(run.half[0], out[0]);
    p.close();
  };

  /** A closed stroke: the ring between its two sides (the inner one turning back, so it is a hole). */
  const band = (p: Pen, run: Run) => {
    loop(p, side(run, 1));
    loop(p, side(run, -1).reverse());
  };

  /**
   * A closed stroke in dashes: some three and a half widths of dash (with its
   * round ends) to two of gap, as a dashed border has them, spaced evenly
   * round – where they start is the seed's.
   */
  const dashes = (p: Pen, run: Run, width: number, seed: number) => {
    const { points, normals, half } = run;
    const count = points.length;
    const along = [0];
    for (let i = 1; i <= count; i++) {
      const a = points[i - 1];
      const b = points[i % count];
      along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = along[count];
    const period = 5 * width + 2;
    const runs = Math.max(2, Math.round(total / period));
    const each = total / runs;
    const dash = (each * 2.7 * width) / period;
    const phase = random(seed)() * each;
    // A point (and its normal and width) anywhere along the line.
    const pick = (s: number): [Point, Point, number] => {
      const x = ((s % total) + total) % total;
      let lo = 0;
      let hi = count - 1;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (along[m] <= x) lo = m;
        else hi = m - 1;
      }
      const j = (lo + 1) % count;
      const t = (x - along[lo]) / (along[lo + 1] - along[lo] || 1);
      const lerp = (a: number, b: number) => a + (b - a) * t;
      const nx = lerp(normals[lo][0], normals[j][0]);
      const ny = lerp(normals[lo][1], normals[j][1]);
      const n = Math.hypot(nx, ny) || 1;
      return [
        [lerp(points[lo][0], points[j][0]), lerp(points[lo][1], points[j][1])],
        [nx / n, ny / n],
        lerp(half[lo], half[j]),
      ];
    };
    const steps = Math.max(2, Math.ceil(dash / 2.5));
    for (let k = 0; k < runs; k++) {
      const start = phase + k * each;
      const picked = Array.from({ length: steps + 1 }, (_, i) =>
        pick(start + (dash * i) / steps)
      );
      capsule(p, {
        points: picked.map((q) => q[0]),
        normals: picked.map((q) => q[1]),
        half: picked.map((q) => q[2]),
      });
    }
  };

  // ── The hand ─────────────────────────────────────────────────────────────

  /** Smooth noise round a loop (u = 0…1, about −1…1): random heights, a soft curve through them, its end meeting its start. */
  const noise = (count: number, next: () => number) => {
    const heights = Array.from({ length: count }, () => next() * 2 - 1);
    const h = (i: number) => heights[((i % count) + count) % count];
    return (u: number) => {
      const x = u * count;
      const i = Math.floor(x);
      const t = x - i;
      const [a, b, c, e] = [h(i - 1), h(i), h(i + 1), h(i + 2)];
      return (
        b +
        0.5 *
          t *
          (c - a + t * (2 * a - 5 * b + 4 * c - e + t * (3 * (b - c) + e - a)))
      );
    };
  };

  /**
   * How the hand goes along a line `length` px long: how far it strays from
   * it (px – `amp` at most, about) and how thick the line runs (×), at
   * u = 0…1. A bump every 46px or so and a finer one on it – the noise the
   * filters had.
   */
  const handOf = (length: number, seed: number, amp: number) => {
    const next = random(seed);
    const count = Math.max(3, Math.round(length / 46));
    const coarse = noise(count, next);
    const fine = noise(count * 2, next);
    const thick = noise(Math.max(3, Math.round(length / 30)), next);
    return (u: number): [number, number] => [
      amp * 0.55 * (coarse(u) + 0.5 * fine(u)),
      1 + 0.12 * thick(u),
    ];
  };

  // ── Frames ───────────────────────────────────────────────────────────────

  /**
   * Points round a box with rounded corners (radii from the top left,
   * clockwise – fitted as CSS does when they don't fit), clockwise, each
   * with its way out and how far round it lies.
   */
  const around = (
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number[]
  ) => {
    const r = radii.map((v) => Math.max(0, v));
    const fit = Math.min(
      1,
      w / (r[0] + r[1] || 1),
      h / (r[1] + r[2] || 1),
      w / (r[2] + r[3] || 1),
      h / (r[3] + r[0] || 1)
    );
    const [a, b, c, e] = r.map((v) => v * fit);
    const corner = (
      cx: number,
      cy: number,
      radius: number,
      from: number
    ): [number, (s: number) => [Point, Point]] => [
      (radius * Math.PI) / 2,
      (s) => {
        const turn = from + (radius ? s / radius : 0);
        const out: Point = [Math.cos(turn), Math.sin(turn)];
        return [[cx + radius * out[0], cy + radius * out[1]], out];
      },
    ];
    const parts: [number, (s: number) => [Point, Point]][] = [
      [
        w - a - b,
        (s) => [
          [x + a + s, y],
          [0, -1],
        ],
      ],
      corner(x + w - b, y + b, b, -Math.PI / 2),
      [
        h - b - c,
        (s) => [
          [x + w, y + b + s],
          [1, 0],
        ],
      ],
      corner(x + w - c, y + h - c, c, 0),
      [
        w - c - e,
        (s) => [
          [x + w - c - s, y + h],
          [0, 1],
        ],
      ],
      corner(x + e, y + h - e, e, Math.PI / 2),
      [
        h - e - a,
        (s) => [
          [x, y + h - e - s],
          [-1, 0],
        ],
      ],
      corner(x + a, y + a, a, Math.PI),
    ];
    // Corners close enough that the smallest stays round; the straight
    // stretches less so – the wobble is long.
    const smallest = Math.min(...[a, b, c, e].filter((v) => v > 1), 9);
    const fine = Math.min(3.5, Math.max(1.5, (smallest * Math.PI) / 8));
    const points: [Point, Point, number][] = [];
    let total = 0;
    parts.forEach(([length, place], i) => {
      if (length <= 0) return;
      const count = Math.ceil(length / (i % 2 ? fine : 6));
      for (let k = 0; k < count; k++) {
        const s = (k * length) / count;
        points.push([...place(s), total + s]);
      }
      total += length;
    });
    return { points, total };
  };

  /** A wobbly line round a rounded box – its middle, `width` wide. */
  const wobble = (
    box: [number, number, number, number],
    radii: number[],
    width: number,
    amp: number,
    seed: number
  ): Run | null => {
    const [x, y, w, h] = box;
    if (w < 1 || h < 1) return null;
    const { points: base, total } = around(x, y, w, h, radii);
    const hand = handOf(total, seed, amp);
    const thick: number[] = [];
    const points = base.map(([p, out, s]): Point => {
      const [off, t] = hand(s / total);
      thick.push((width / 2) * t);
      return [p[0] + out[0] * off, p[1] + out[1] * off];
    });
    return { points, normals: normalsOf(points, true), half: thick };
  };

  type Frame = {
    w: number;
    h: number;
    radii: number[];
    inset: number;
    ring: number;
    width: number;
    dashed: boolean;
    amp: number;
    seed: number;
    boil: boolean;
    focus: boolean;
  };

  /** How far the frame's pseudo-elements reach past its box – room for the wobble, the line and the focus ring. */
  const roomOf = (f: Frame) =>
    Math.ceil(Math.max(f.amp + f.width + 2, f.inset - f.ring + f.amp + 4));

  /**
   * A frame, in its pseudo-elements' own coordinates: the fill's outline,
   * the line, and – when it has focus – the line with the ring round it.
   */
  const frame = (f: Frame, room: number, seed: number) => {
    const shift = room - f.inset;
    const edge = f.inset + f.width / 2;
    const run = wobble(
      [edge + shift, edge + shift, f.w - 2 * edge, f.h - 2 * edge],
      f.radii.map((r) => r - f.width / 2),
      f.width,
      f.amp,
      seed
    );
    if (!run) return null;
    // The fill reaches the line's outer edge, as a box's background reaches
    // under its border – so a dash's gaps show the fill, as they did.
    const shape = pen();
    loop(shape, side(run, 1));
    const line = pen();
    if (f.width > 0) {
      if (f.dashed) dashes(line, run, f.width, seed);
      else band(line, run);
    }
    let focus = "";
    if (f.focus) {
      // The ring: a 2px dashed line round its own box, `--scribble-ring` in.
      const edge = f.ring + 1;
      const ring = wobble(
        [edge + shift, edge + shift, f.w - 2 * edge, f.h - 2 * edge],
        f.radii.map((r) => r - 1),
        2,
        f.amp,
        f.seed * 7 + 5
      );
      const p = pen();
      if (ring) dashes(p, ring, 2, f.seed);
      focus = line.text() + p.text();
    }
    return { shape: shape.text(), line: line.text(), focus };
  };

  // ── Lines ────────────────────────────────────────────────────────────────

  type Mark = {
    w: number;
    h: number;
    standing: boolean;
    width: number;
    amp: number;
    seed: number;
  };

  /** A line through the middle of its box, lying (along its width) or standing – round ends, inside the box. */
  const mark = (m: Mark) => {
    const [length, across] = m.standing ? [m.h, m.w] : [m.w, m.h];
    const half = m.width / 2;
    const room = across / 2 - half - 0.5;
    const from = half + 0.5;
    const to = length - half - 0.5;
    if (to - from < 1 || room < 0) return "";
    const hand = handOf(length, m.seed, Math.min(m.amp, room / 0.85));
    const count = Math.max(2, Math.ceil((to - from) / 4));
    const points: Point[] = [];
    const thick: number[] = [];
    for (let i = 0; i <= count; i++) {
      const s = from + ((to - from) * i) / count;
      const [off, t] = hand(s / length);
      const away = across / 2 + Math.max(-room, Math.min(room, off));
      points.push(m.standing ? [away, s] : [s, away]);
      thick.push(half * t);
    }
    const p = pen();
    capsule(p, { points, normals: normalsOf(points, false), half: thick });
    return p.text();
  };

  // ── The page ─────────────────────────────────────────────────────────────

  const SELECTOR =
    ".scribble, .scribble-rule, .scribble-rule-y, [class*='scribble-underline']";

  /** Frames the pointer has been over: their boil is drawn (and kept). */
  const hot = new WeakSet<Element>();

  /** A length from CSS (px, em, rem), or the fallback when it isn't set. */
  const px = (value: string, fallback: number, em: number, rem: number) => {
    const v = Number.parseFloat(value);
    if (Number.isNaN(v)) return fallback;
    const unit = value.trim().replace(/^[-+\d.e]+/, "");
    return unit === "rem" ? v * rem : unit === "em" ? v * em : v;
  };

  /** Its place among its siblings – so neighbors take turns with the wobbles. */
  const placeOf = (el: Element) => {
    let place = 1;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
      place++;
    }
    return place;
  };

  /** What there is to draw for an element, as it stands – or nothing. */
  const read = (
    el: HTMLElement,
    size: ResizeObserverSize | undefined,
    rem: number
  ) => {
    const css = getComputedStyle(el);
    const em = Number.parseFloat(css.fontSize) || 16;
    const get = (name: string, fallback: number) =>
      px(css.getPropertyValue(name), fallback, em, rem);
    // Inline elements report no size to the observer.
    const w = size?.inlineSize || el.offsetWidth;
    const h = size?.blockSize || el.offsetHeight;
    if (w < 2 || h < 2) return null;
    const seed = Math.round(get("--scribble-seed", 0)) || placeOf(el);
    if (el.classList.contains("scribble")) {
      const radii = [
        css.borderTopLeftRadius,
        css.borderTopRightRadius,
        css.borderBottomRightRadius,
        css.borderBottomLeftRadius,
      ].map((r) => {
        const v = Number.parseFloat(r) || 0;
        return r.endsWith("%") ? (v / 100) * Math.min(w, h) : v;
      });
      return {
        frame: {
          w,
          h,
          radii,
          inset: get("--scribble-inset", 0),
          ring: get("--scribble-ring", -6),
          width: Math.max(0, get("--scribble-width", 3)),
          dashed: css.getPropertyValue("--scribble-style").trim() === "dashed",
          amp: get("--scribble-wobble", 3.5),
          seed,
          boil: el.classList.contains("scribble-boil") || hot.has(el),
          focus: el.matches(":focus, .scribble-field:focus-within"),
        },
      };
    }
    const underline =
      !el.classList.contains("scribble-rule") &&
      !el.classList.contains("scribble-rule-y");
    return {
      mark: {
        // The underline is the element's ::after: 0.12em wider each side, 0.5em high.
        w: underline ? w + 0.24 * em : w,
        h: underline ? 0.5 * em : h,
        standing: el.classList.contains("scribble-rule-y"),
        width: get("--scribble-width", underline ? 3 : 2),
        amp: get("--scribble-wobble", 3),
        seed,
      },
    };
  };

  const clip = (d: string | undefined) => (d ? `path("${d}")` : "initial");

  const paint = (el: HTMLElement, look: { frame?: Frame; mark?: Mark }) => {
    const style = el.style;
    if (look.mark) {
      style.setProperty("--scribble-mark", clip(mark(look.mark)));
      return;
    }
    const f = look.frame as Frame;
    const room = roomOf(f);
    style.setProperty("--scribble-room", `${room}px`);
    // The same line drawn three times over, for boiling – else once.
    for (let k = 1; k <= 3; k++) {
      const art = k === 1 || f.boil ? frame(f, room, f.seed * 3 + k) : null;
      const tail = k === 1 ? "" : `-${k}`;
      style.setProperty(`--scribble-shape${tail}`, clip(art?.shape));
      style.setProperty(`--scribble-stroke${tail}`, clip(art?.line));
      style.setProperty(`--scribble-focus${tail}`, clip(art?.focus));
    }
  };

  const drawn = new WeakMap<Element, string>();
  const waiting = new Set<HTMLElement>();
  let tries = 0;

  const hydrated = (el: Element) =>
    Object.keys(el).some((key) => key.startsWith("__reactFiber$"));

  const observer = new ResizeObserver((entries) => {
    // Read everything first, then write: one style pass, no thrashing.
    const jobs: [HTMLElement, ReturnType<typeof read>][] = [];
    const rem =
      Number.parseFloat(getComputedStyle(doc.documentElement).fontSize) || 16;
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      if (!el.isConnected) continue;
      if (late && !hydrated(el)) {
        wait(el);
        continue;
      }
      const look = read(el, entry.borderBoxSize?.[0], rem);
      if (!look) continue;
      const key = JSON.stringify(look);
      if (drawn.get(el) === key) continue;
      drawn.set(el, key);
      jobs.push([el, look]);
    }
    for (const [el, look] of jobs) if (look) paint(el, look);
  });

  const watch = (el: Element) => observer.observe(el, { box: "border-box" });
  // Observed anew, it is measured – and drawn, if anything changed – before the next paint.
  const again = (el: Element) => {
    observer.unobserve(el);
    watch(el);
  };
  const each = (root: Element, act: (el: Element) => void) => {
    if (root.matches(SELECTOR)) act(root);
    for (const el of root.querySelectorAll(SELECTOR)) act(el);
  };

  // Not hydrated yet (development): asked again each frame, for a while.
  const retry = () => {
    for (const el of waiting) {
      if (!el.isConnected) waiting.delete(el);
      else if (hydrated(el)) {
        waiting.delete(el);
        again(el);
      }
    }
    if (waiting.size && ++tries < 600) requestAnimationFrame(retry);
    else waiting.clear();
  };
  const wait = (el: HTMLElement) => {
    waiting.add(el);
    if (waiting.size === 1) {
      tries = 0;
      requestAnimationFrame(retry);
    }
  };

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.removedNodes) {
          if (node instanceof Element && !node.isConnected) {
            each(node, (el) => observer.unobserve(el));
          }
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.isConnected) each(node, watch);
        }
      } else if (record.target instanceof Element) {
        each(record.target, again);
      }
    }
  }).observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "class",
      "aria-pressed",
      "aria-expanded",
      "aria-current",
      "aria-selected",
      "aria-checked",
    ],
  });

  // Focus comes or goes: the frames round it draw their ring, or drop it.
  const focused = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    for (let el = target.closest(".scribble"); el; ) {
      again(el);
      el = el.parentElement?.closest(".scribble") ?? null;
    }
  };
  doc.addEventListener("focusin", focused);
  doc.addEventListener("focusout", focused);

  // The pointer comes: frames that boil when it does (`hover:scribble-boil`,
  // also round a `group`) get their two other drawings – before the hover
  // shows.
  doc.addEventListener("pointerover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const heat = (el: Element) => {
      if (hot.has(el) || !el.className.toString().includes("scribble-boil")) {
        return;
      }
      hot.add(el);
      again(el);
    };
    for (let el: Element | null = target; el; el = el.parentElement) {
      if (el.classList.contains("scribble")) heat(el);
      if (el.classList.contains("group")) {
        for (const inner of el.querySelectorAll(".scribble")) heat(inner);
      }
    }
  });

  // A breakpoint passed: a line's width may be another (`sm:[--scribble-width:…]`).
  for (const width of ["40rem", "48rem", "64rem", "80rem"]) {
    matchMedia(`(min-width: ${width})`).addEventListener("change", () => {
      for (const el of doc.querySelectorAll(SELECTOR)) again(el);
    });
  }

  for (const el of doc.querySelectorAll(SELECTOR)) watch(el);
}
