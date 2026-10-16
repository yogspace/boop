/**
 * How a day's prints lie in its cell of the month or the year: a little
 * pile, as stamped by hand in a hurry – each a little turned and off its
 * place, overlapping the next, now and then a few pixels over the table's
 * line (never into the next day). Smaller the more there are; only when
 * even the smallest won't fit does the rest go to “+n”.
 *
 * The places come from a grid fitted to the room – as many places as
 * prints, as large as they can be – each print a little larger than its
 * place, so they overlap. Where in its place a print lies, how far it is
 * turned and how large it comes out follows from the print's id and its
 * day: the same on every render and every device, and the same print turned
 * the same in the month and the year. The corner with the day's number is
 * kept clear, and the one for “+n” when there is one.
 *
 * Plain functions of their arguments – tested in test/app/pile.test.ts.
 */

/** A print, as far as its place goes. */
export type PilePrint = {
  id: string;
  /** Stacking order – higher lies on top. */
  z: number;
  /** A special stamp's print: a little larger, on top of the others. */
  special?: boolean;
};

/** A corner of the box kept clear – how far it reaches in. */
type Corner = { width: number; height: number };

/** The room a day has for its prints – all in px. */
export type Room = {
  /** The day's box. */
  width: number;
  height: number;
  /** The prints' places lie this far inside the box's edge. */
  inset: number;
  /** How far past the box a print may reach – over the line, not beyond. */
  over: number;
  /** Kept clear, top left – where the day's number is. */
  corner?: Corner;
  /** Kept clear, bottom right, when not all fit – where “+n” is. */
  badge?: Corner;
  /** No print smaller – the rest goes to “+n” … */
  smallest: number;
  /** … and none larger (a special one a little). */
  biggest: number;
  /** At most this many. */
  most: number;
};

/** A print laid: its middle in the day's box, its size, its turn (°). */
export type Laid<P extends PilePrint> = {
  print: P;
  x: number;
  y: number;
  size: number;
  turn: number;
};

/** A day's prints laid, bottom first – and how many found no room. */
export type Pile<P extends PilePrint> = { laid: Laid<P>[]; more: number };

/** How far a print turns, either way (°). */
export const TURN = 15;

/** How far a print strays from its place's middle – of the place, either way. */
const STRAY = 0.2;

/** A print is this much larger than its place – so the prints overlap. */
const CROWD = 1.22;

/** How much a print's size varies, either way. */
const WOBBLE = 0.06;

/** A special stamp's print is this much larger. */
const SPECIAL = 1.15;

/**
 * A place whose print would have to move further than this to clear a
 * corner kept clear is no place – of the place's size. Moved further, it
 * would land on the next one's print.
 */
const PUSH = 0.45;

/** A print laid moves out of a corner by at most this much of its place. */
const MOVE = 0.5;

/**
 * Two prints' middles are moved apart to this – of the smaller one's size
 * – in at most so many rounds (`spread`); where a day is crowded they may
 * stay a little closer.
 */
const APART = 0.4;
const ROUNDS = 8;

/** A print this little in a corner kept clear only touches it (px). */
const TOUCH = 0.01;

/** The most columns and rows a grid has. */
const LINES = 6;

/** A number from a text – FNV-1a, the same on every device. */
const hashOf = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** Numbers from 0 to 1, one after the other, from a seed (mulberry32). */
const diceOf = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** From −1 to 1. */
const either = (dice: () => number) => dice() * 2 - 1;

type Place = { x: number; y: number; width: number; height: number };

/**
 * A corner kept clear, as a box – and the way out of it: into the room
 * (1: right or down, −1: left or up).
 */
type Clear = { x0: number; y0: number; x1: number; y1: number; out: 1 | -1 };

/** The corners kept clear – the badge's only when there is “+n”. */
const clearsOf = (room: Room, badge: boolean): Clear[] => {
  const clears: Clear[] = [];
  const { corner, width, height } = room;
  if (corner) {
    clears.push({ x0: 0, y0: 0, x1: corner.width, y1: corner.height, out: 1 });
  }
  if (badge && room.badge) {
    const { width: across, height: up } = room.badge;
    clears.push({
      x0: width - across,
      y0: height - up,
      x1: width,
      y1: height,
      out: -1,
    });
  }
  return clears;
};

/**
 * How far into the corners kept clear a print at `x`, `y` reaches (`reach`:
 * from its middle) – the shorter way out of the deepest one, and that one's
 * two ways (`across`, `down`: into the room).
 */
const depthOf = (
  x: number,
  y: number,
  reach: number,
  clears: readonly Clear[]
) => {
  let deepest = { depth: 0, across: 0, down: 0, out: 1 };
  for (const clear of clears) {
    const inside =
      x + reach > clear.x0 &&
      x - reach < clear.x1 &&
      y + reach > clear.y0 &&
      y - reach < clear.y1;
    if (!inside) continue;
    const across =
      clear.out > 0 ? clear.x1 - (x - reach) : x + reach - clear.x0;
    const down = clear.out > 0 ? clear.y1 - (y - reach) : y + reach - clear.y0;
    // Just touching is out – also where the sums come out a hair off.
    const depth = Math.min(across, down);
    if (depth > TOUCH && depth > deepest.depth) {
      deepest = { depth, across, down, out: clear.out };
    }
  }
  return deepest;
};

/** How far a print of `size` in the place's middle would have to move. */
const pushOf = (place: Place, size: number, clears: readonly Clear[]) =>
  depthOf(
    place.x + place.width / 2,
    place.y + place.height / 2,
    size / 2,
    clears
  ).depth;

type Grid = { size: number; places: Place[] };

/**
 * Every grid the room can have, with the places clear of its corners and
 * the size its prints get there – the largest first, of those the one with
 * fewer places. A room is measured out once (as long as it is the same
 * object): without “+n” and with.
 */
const measured = new WeakMap<Room, Map<boolean, Grid[]>>();
const gridsOf = (room: Room, badge: boolean): Grid[] => {
  const known = measured.get(room) ?? new Map<boolean, Grid[]>();
  measured.set(room, known);
  const was = known.get(badge);
  if (was) return was;
  const clears = clearsOf(room, badge);
  const width = Math.max(0, room.width - 2 * room.inset);
  const height = Math.max(0, room.height - 2 * room.inset);
  const grids: (Grid & { count: number })[] = [];
  for (let rows = 1; rows <= LINES; rows++) {
    for (let cols = 1; cols <= LINES; cols++) {
      const place = { width: width / cols, height: height / rows };
      const fits = Math.min(place.width, place.height);
      const size = Math.min(
        cols * rows > 1 ? fits * CROWD : fits,
        room.biggest
      );
      const places: Place[] = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const at = {
            ...place,
            x: room.inset + col * place.width,
            y: room.inset + row * place.height,
          };
          if (pushOf(at, size, clears) <= PUSH * fits) places.push(at);
        }
      }
      grids.push({ size, places, count: cols * rows });
    }
  }
  grids.sort((a, b) => b.size - a.size || a.count - b.count);
  known.set(badge, grids);
  return grids;
};

/** As many prints as fit at no less than the smallest – one at least. */
const fitOf = (grids: readonly Grid[], room: Room, prints: number) => {
  let count = Math.min(prints, room.most);
  let grid = grids.find((g) => g.places.length >= count);
  while (count > 1 && (!grid || grid.size < room.smallest)) {
    count--;
    grid = grids.find((g) => g.places.length >= count);
  }
  return { count, grid };
};

/**
 * Lays a day's prints in its room (`day`: its key – it and each print's id
 * decide where in its place a print lies, how far it turns). `prints` in
 * the order they get room – the first ones when not all fit; laid, they
 * come back bottom first: by `z`, a special one over the rest.
 */
export const layoutPrints = <P extends PilePrint>(
  prints: readonly P[],
  room: Room,
  day: string
): Pile<P> => {
  if (!prints.length || room.width <= 0 || room.height <= 0) {
    return { laid: [], more: 0 };
  }
  let badge = false;
  let { count, grid } = fitOf(gridsOf(room, false), room, prints.length);
  // Not all fit: “+n” takes its corner – and maybe one more place.
  if (count < prints.length && room.badge) {
    badge = true;
    ({ count, grid } = fitOf(gridsOf(room, true), room, prints.length));
  }
  if (!grid) return { laid: [], more: prints.length };
  const clears = clearsOf(room, badge);

  // Places to spare: those deepest in a corner go first, then others –
  // which, the day decides. The rest are shuffled, so a busy day isn't laid
  // out in rows.
  const dice = diceOf(hashOf(day));
  const size = grid.size;
  const places = grid.places
    .map((place) => ({
      place,
      push: pushOf(place, size, clears),
      draw: dice(),
    }))
    .sort((a, b) => a.push - b.push || a.draw - b.draw)
    .slice(0, count)
    .map(({ place }) => ({ place, draw: dice() }))
    .sort((a, b) => a.draw - b.draw)
    .map(({ place }) => place);

  const laid = prints
    .slice(0, count)
    .map((print, i) =>
      lay(
        print,
        places[i],
        size,
        room,
        clears,
        diceOf(hashOf(`${day} ${print.id}`))
      )
    );
  spread(laid, room, clears);
  laid.sort(
    (a, b) =>
      Number(Boolean(a.print.special)) - Number(Boolean(b.print.special)) ||
      a.print.z - b.print.z
  );
  return { laid, more: prints.length - count };
};

/** One print in its place: turned, a little off it, a little larger or not. */
const lay = <P extends PilePrint>(
  print: P,
  place: Place,
  base: number,
  room: Room,
  clears: readonly Clear[],
  roll: () => number
): Laid<P> => {
  const turn = either(roll) * TURN;
  // A turned square reaches further – by this much.
  const wide =
    Math.abs(Math.cos((turn * Math.PI) / 180)) +
    Math.abs(Math.sin((turn * Math.PI) / 180));
  const special = print.special ? SPECIAL : 1;
  const size = Math.min(
    Math.max(room.smallest, base * (1 + either(roll) * WOBBLE)) * special,
    room.biggest * special,
    // Within the box and what it may reach past it.
    (Math.min(room.width, room.height) + 2 * room.over) / wide
  );
  const reach = (size / 2) * wide;
  const held = (at: Spot) => heldIn(room, reach, at);
  let at = held({
    x: place.x + place.width / 2 + either(roll) * STRAY * place.width,
    y: place.y + place.height / 2 + either(roll) * STRAY * place.height,
  });
  // Out of a corner kept clear, into the room: sideways or up and down,
  // whichever leaves it clearer within the room – the shorter way, where
  // both do. Never by more than a part of its place that way (`MOVE`):
  // further, it would land on the next print. What is left in the corner
  // lies under the number or “+n”.
  const depth = ({ x, y }: Spot) => depthOf(x, y, reach, clears).depth;
  for (let i = 0; i < clears.length; i++) {
    const now = depthOf(at.x, at.y, reach, clears);
    if (!now.depth) break;
    const across = Math.min(now.across, MOVE * place.width);
    const down = Math.min(now.down, MOVE * place.height);
    const ways = [
      held({ x: at.x + now.out * across, y: at.y }),
      held({ x: at.x, y: at.y + now.out * down }),
    ];
    if (now.down < now.across) ways.reverse();
    at = ways.reduce((best, way) => (depth(way) < depth(best) ? way : best));
  }
  return { print, x: at.x, y: at.y, size, turn };
};

type Spot = { x: number; y: number };

/** How far a print reaches from its middle, turned (a square, at worst). */
const reachOf = ({ size, turn }: { size: number; turn: number }) =>
  (size / 2) *
  (Math.abs(Math.cos((turn * Math.PI) / 180)) +
    Math.abs(Math.sin((turn * Math.PI) / 180)));

/** A print's middle where it reaches a few pixels over the line at most. */
const heldIn = (room: Room, reach: number, { x, y }: Spot): Spot => ({
  x: within(x, reach - room.over, room.width + room.over - reach),
  y: within(y, reach - room.over, room.height + room.over - reach),
});

const within = (value: number, low: number, high: number) =>
  low > high ? (low + high) / 2 : Math.min(Math.max(value, low), high);

/**
 * Prints that came to lie (nearly) on one another – each moved out of a
 * corner towards the next – are moved apart, both a little, a few rounds:
 * a pile, not a stack. Within the room still.
 */
const spread = <P extends PilePrint>(
  laid: Laid<P>[],
  room: Room,
  clears: readonly Clear[]
) => {
  const depth = (print: Laid<P>, at: Spot) =>
    depthOf(at.x, at.y, reachOf(print), clears).depth;
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false;
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const [a, b] = [laid[i], laid[j]];
        const want = APART * Math.min(a.size, b.size);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const apart = Math.hypot(dx, dy);
        if (apart >= want) continue;
        // Right on one another: apart sideways, the first to the left.
        const [ux, uy] = apart > TOUCH ? [dx / apart, dy / apart] : [1, 0];
        const to = (print: Laid<P>, by: number) =>
          heldIn(room, reachOf(print), {
            x: print.x + ux * by,
            y: print.y + uy * by,
          });
        // Both a little – or the one only that doesn't go into a corner.
        const gap = want - apart;
        let [toA, toB] = [to(a, -gap / 2), to(b, gap / 2)];
        const deeperA = depth(a, toA) > depth(a, a) + TOUCH;
        const deeperB = depth(b, toB) > depth(b, b) + TOUCH;
        if (deeperA && !deeperB) [toA, toB] = [a, to(b, gap)];
        if (deeperB && !deeperA) [toA, toB] = [to(a, -gap), b];
        Object.assign(a, { x: toA.x, y: toA.y });
        Object.assign(b, { x: toB.x, y: toB.y });
        moved = true;
      }
    }
    if (!moved) return;
  }
};

/**
 * Prints in the order they get room: the given order (top first), but
 * different stamps before a second print of one already there – so a busy
 * day shows its variety. `kindOf`: what makes two prints the same.
 */
export const varietyFirst = <P>(
  prints: readonly P[],
  kindOf: (print: P) => string
): P[] => {
  const seen = new Set<string>();
  const first: P[] = [];
  const again: P[] = [];
  for (const print of prints) {
    const kind = kindOf(print);
    (seen.has(kind) ? again : first).push(print);
    seen.add(kind);
  }
  return [...first, ...again];
};
