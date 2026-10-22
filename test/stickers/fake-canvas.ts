/**
 * A canvas good enough for the stamp's height maps without a browser: under
 * shifts and scales it fills rectangles and round dots – whatever else it is
 * asked to draw (outlines, lines) it leaves out.
 */
export const fakeCanvas = () => {
  const size = { width: 0, height: 0 };
  let data = new Uint8ClampedArray(0);
  // A point on the canvas: scale · where it is drawn + shift.
  const at = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let dots: { x: number; y: number; r: number }[] = [];
  const paint = (
    style: string,
    covers: (x: number, y: number) => boolean,
    box: [number, number, number, number]
  ) => {
    data = data.length ? data : new Uint8ClampedArray(size.width * size.height);
    const value = style === "#fff" ? 255 : 0;
    const [x0, y0, x1, y1] = box;
    for (let y = Math.max(0, Math.floor(y0)); y < size.height && y <= y1; y++) {
      for (
        let x = Math.max(0, Math.floor(x0));
        x < size.width && x <= x1;
        x++
      ) {
        if (covers(x + 0.5, y + 0.5)) data[y * size.width + x] = value;
      }
    }
  };
  const idle = () => undefined;
  const context = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    translate: (x: number, y: number) => {
      at.tx += at.sx * x;
      at.ty += at.sy * y;
    },
    scale: (x: number, y: number) => {
      at.sx *= x;
      at.sy *= y;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      const xs = [at.sx * x + at.tx, at.sx * (x + w) + at.tx];
      const ys = [at.sy * y + at.ty, at.sy * (y + h) + at.ty];
      const box: [number, number, number, number] = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ];
      paint(
        context.fillStyle,
        (px, py) =>
          px >= box[0] && px <= box[2] && py >= box[1] && py <= box[3],
        box
      );
    },
    beginPath: () => {
      dots = [];
    },
    arc: (x: number, y: number, r: number) => {
      dots.push({
        x: at.sx * x + at.tx,
        y: at.sy * y + at.ty,
        r: Math.abs(at.sx) * r,
      });
    },
    fill: () => {
      for (const { x, y, r } of dots) {
        paint(context.fillStyle, (px, py) => Math.hypot(px - x, py - y) <= r, [
          x - r,
          y - r,
          x + r,
          y + r,
        ]);
      }
    },
    getImageData: () => ({
      // One value per pixel is kept – read as its red.
      data: Uint8ClampedArray.from(
        { length: data.length * 4 },
        (_, i) => data[i >> 2]
      ),
    }),
    moveTo: idle,
    lineTo: idle,
    quadraticCurveTo: idle,
    closePath: idle,
    clip: idle,
    stroke: idle,
    save: idle,
    restore: idle,
  };
  return {
    set width(value: number) {
      size.width = value;
    },
    set height(value: number) {
      size.height = value;
    },
    getContext: () => context,
  };
};
