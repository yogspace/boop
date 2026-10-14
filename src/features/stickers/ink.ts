import type * as Three from "three";
import { FINISHES, type Finish } from "../calendar/palette";

/**
 * How a stamp is drawn – like a cartoon: flat colors, a touch of shade, and
 * bold black ink lines around it and inside, between its parts and along the
 * relief of its face. The lines are found in the picture, not on the model:
 * the stamp is drawn once into two images at the same time – its colors, and
 * what each spot shows (which part, raised or not, a little hand-drawn
 * unevenness that sticks to the stamp as it turns; on the knob, how far away
 * it is). Where two neighbours show different things there is a line, as
 * wide as the stamp is big on screen; one pass lays them over the colors,
 * smooth at the edges.
 *
 * Shared by the pictures (render.ts), the stamp being made (sticker-view.tsx)
 * and the one in hand (stamp-hand.tsx). `three` is passed in, like build.ts.
 */

/** Drawn before the stamp, without lines – what it stands on (a shadow). */
export const UNDER = 1;
/** Drawn after it, over everything – glints (glitter.ts). */
export const OVER = 2;

/** The lines: this wide, of a stamp's width (1 unit) on screen … */
export const LINE = 0.016;
/** … but never thinner than this (CSS px) – a small stamp still reads. */
const THINNEST = 1.4;
/**
 * The knob is one smooth piece – no edge between its neck and its ball. A
 * line is drawn only where one lies in front of the other: where two
 * neighbours are this far apart in depth (stamp units) – a fold. `DEEP`
 * fits the depths a knob spans into what an image holds.
 */
const FOLD = 0.05;
const DEEP = 0.9;
/** The ink's color, as sRGB. */
const INK: Rgb = [0.067, 0.063, 0.078];
/** Shade: the colors turned from the light, deeper and a touch violet. */
const SHADE: Rgb = [0.93, 0.9, 0.98];

/**
 * What every stamp's materials read, set right before it is drawn: how much
 * of the cartoon there is (0 – just the flat colors, as the drawing), the
 * clock (s) and the line's width (px) – for the sparkles (glitter.ts) and a
 * special ink's finish – and whether they twinkle.
 */
export const inkState = {
  amount: { value: 1 },
  time: { value: 0 },
  line: { value: 3 },
  twinkle: { value: 0 },
};

/** A color as sRGB, 0–1. */
export type Rgb = readonly [number, number, number];

export const rgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** The color mixed with white – like CSS `color-mix(in srgb, …)`. */
export const tint = (hex: string, white: number): Rgb =>
  rgb(hex).map((c) => c + (1 - c) * white) as unknown as Rgb;

const shaded = (color: Rgb): Rgb =>
  color.map((c, i) => c ** 1.4 * SHADE[i]) as unknown as Rgb;

const vec = (THREE: typeof Three, color: Rgb) =>
  new THREE.Vector3(color[0], color[1], color[2]);

/** Parts of a stamp, as the lines tell them apart. */
export type Part = "rubber" | "block" | "plate" | "knob";

/**
 * What a spot shows – a different number, a line between. Each part has
 * room for a few: the rubber's ground and its raised parts; the block's back
 * and the rest of it.
 */
const CODE: Record<Part, number> = {
  rubber: 1,
  block: 5,
  plate: 8,
  knob: 10,
};

const VERTEX = /* glsl */ `
#ifdef RUBBER
attribute float relief;
attribute float core;
varying float vRelief;
varying float vCore;
#endif
#ifdef KNOB
varying float vDeep;
#endif
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vFacing;
void main() {
#ifdef RUBBER
  vRelief = relief;
  vCore = core;
#endif
  vLocal = position;
  vFacing = normal;
  vNormal = normalize(normalMatrix * normal);
  vec4 seen = modelViewMatrix * vec4(position, 1.0);
#ifdef KNOB
  // How far behind the knob's foot, in the stamp's own units.
  vDeep = (modelViewMatrix[3].z - seen.z) / length(modelViewMatrix[0].xyz);
#endif
  gl_Position = projectionMatrix * seen;
}
`;

const FRAGMENT = /* glsl */ `
layout(location = 0) out highp vec4 outColor;
layout(location = 1) out highp vec4 outData;
uniform vec3 color;
uniform vec3 shade;
uniform float code;
uniform float amount;
#ifdef RUBBER
uniform vec3 ink;
uniform vec3 inkShade;
uniform vec3 ground;
uniform vec3 groundShade;
uniform int finish;
uniform float time;
uniform float twinkle;
varying float vRelief;
varying float vCore;
#endif
#ifdef KNOB
varying float vDeep;
#endif
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vFacing;

// The light, from the front and a little above left – fixed to the view:
// only what turns well away from it takes the shade.
const vec3 LIGHT = vec3(-0.36, 0.46, 0.81);
const vec3 WHITE = vec3(1.0, 0.99, 0.96);

// Low and slow, so the lines swell and thin like drawn by hand – stuck to
// the stamp, so nothing crawls while it turns.
float wobble(vec3 p) {
  return 0.5 + 0.3 * sin(dot(p, vec3(13.1, 7.3, 5.7)) + 1.3)
    + 0.2 * sin(dot(p, vec3(-6.3, 15.7, -8.1)) + 4.1);
}

#ifdef RUBBER
// A special color's finish (palette.ts), on what is inked: the rim and the
// doodle. Drawn like the rest – flat tones, hard edges, a few pixels soft –
// and all of it stuck to the stamp; what moves with the view moves as it
// turns. Where it twinkles, it does so out of step.

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 hash3(vec3 p) {
  return vec3(hash(p + 1.7), hash(p + 3.1), hash(p + 5.3));
}

// Smooth noise over the face, about one bump per unit.
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(vec3(i, 0.0)), hash(vec3(i + vec2(1.0, 0.0), 0.0)), u.x),
    mix(hash(vec3(i + vec2(0.0, 1.0), 0.0)), hash(vec3(i + 1.0, 0.0)), u.x),
    u.y
  );
}

// 0 below e, 1 above – the step a pixel wide.
float above(float e, float x) {
  float aa = fwidth(x);
  return smoothstep(e - aa, e + aa, x);
}

// 1 inside a stripe of half-width w round c, smooth at its edges.
float band(float x, float c, float w) {
  float aa = fwidth(x);
  return 1.0 - smoothstep(w - aa, w + aa, abs(x - c));
}

// Thin stripes, w wide, wherever x passes a whole number.
float stripes(float x, float w) {
  float aa = fwidth(x);
  return 1.0 - smoothstep(w - aa, w + aa, abs(fract(x + 0.5) - 0.5));
}

// A color of the rainbow, 0–1 round.
vec3 hue(float h) {
  return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

// The color deeper and fuller – its dark tone.
vec3 deeper(vec3 c) {
  return c * mix(c, vec3(1.0), 0.25) * 0.85;
}

// Gently up and down, each at its own pace (h) – still where nothing moves.
float beat(float h, float pace) {
  return mix(1.0, 0.5 + 0.5 * sin(time * pace * (1.4 + 2.0 * h) + h * 40.0), twinkle);
}

// A dot in each cell of a grid round p, placed and sized at random: how
// much of it covers p – soft at its edge by how big the grid shows, not by
// the distance's own change, which leaps at the cells' borders – and its
// own random number (h).
float dotAt(vec3 p, float size, out float h) {
  vec3 cell = floor(p);
  h = hash(cell);
  vec3 at = 0.5 + 0.5 * (hash3(cell) - 0.5);
  float r = size * (0.7 + 0.6 * hash(cell + 7.9));
  float aa = 0.7 * length(fwidth(p));
  return 1.0 - smoothstep(r - aa, r + aa, length(fract(p) - at));
}

// A shape's outline as cover: inside (d < 0) 1, soft by aa.
float inside(float d, float aa) {
  return 1.0 - smoothstep(-aa, aa, d);
}

// A four-pointed sparkle, its points r out.
float sparkle(vec2 p, float r) {
  float k = pow(abs(p.x) / r, 0.55) + pow(abs(p.y) / r, 0.55);
  return inside(k - 1.0, fwidth(k));
}

// How far from a five-pointed star, its points r out (Inigo Quilez' sdStar5).
float star(vec2 p, float r, float sharp) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = sharp * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// Metal, drawn like chrome in a cartoon: the face mirrors a sky over a
// horizon – light above it, one hard white glint, a deep band below and the
// ground lighter again further down – and the lines are deeper at their
// edges, round like wire. The rubber's side, round itself, takes the sky
// above and the deep band below, and its glint where it faces the light.
vec3 metal(vec3 c, vec3 n, float level) {
  float y = dot(vLocal.xy, vec2(-0.26, 0.97)) + 0.5 * n.y - 0.08 * n.x;
  const float H = 0.05;
  vec3 sky = mix(mix(c, WHITE, 0.55), mix(c, WHITE, 0.2), above(H + 0.17, y));
  vec3 below = mix(mix(c, WHITE, 0.3), c, above(H - 0.34, y));
  below = mix(below, deeper(c), above(H - 0.15, y));
  vec3 face = mix(below, sky, above(H, y));
  face = mix(face, deeper(face), 0.55 * (1.0 - above(0.8, vCore)));
  face = mix(face, WHITE, 0.95 * band(y, H + 0.035, 0.013));
  float up = n.y + 0.3 * n.x;
  vec3 side = mix(deeper(c), mix(c, WHITE, 0.45), above(0.04, up));
  float glint = dot(n, normalize(vec3(-0.5, 0.6, 0.62)));
  side = mix(side, WHITE, 0.9 * above(0.95, glint));
  return mix(side, face, level);
}

// Glitter: a fleck in every cell of a fine grid – the ink's dark and light
// tones, a few pale ones – bigger light flakes over them, a few white, and
// now and then a little sparkle on the face. Turning, flecks catch the
// light and flash white; where it is live, the flakes and sparkles twinkle.
// Half a cell off: the face (z = 0) lies in the middle of a layer of cells,
// not on the border between two.
vec3 glitter(vec3 c, vec3 n, float level) {
  vec3 light = mix(c, WHITE, 0.45);
  vec3 pale = mix(c, WHITE, 0.75);
  vec3 toward = normalize(normalize(LIGHT) + vec3(0.0, 0.0, 1.0));
  vec3 seen = mix(c, deeper(c), 0.18);
  float h;
  vec3 p = vLocal * 70.0 + 0.5;
  float dust = dotAt(p, 0.36, h);
  vec3 fleck = h < 0.42 ? deeper(c) : h < 0.86 ? light : pale;
  vec3 tilt = normalize(n + 0.55 * (hash3(floor(p) + 9.1) - 0.5));
  fleck = mix(fleck, WHITE, smoothstep(0.93, 0.97, dot(tilt, toward)));
  seen = mix(seen, fleck, dust);
  float g;
  p = vLocal * 26.0 + 17.5;
  float flake = dotAt(p, 0.3, g) * step(0.62, g) * beat(g, 1.2);
  tilt = normalize(n + 0.6 * (hash3(floor(p)) - 0.5));
  vec3 flakeColor = mix(g > 0.9 ? WHITE : pale, WHITE, smoothstep(0.9, 0.96, dot(tilt, toward)));
  seen = mix(seen, flakeColor, flake);
  vec2 q = vLocal.xy * 9.0 + 41.5;
  vec2 cell = floor(q);
  float s = hash(vec3(cell, 11.3));
  vec2 off = fract(q) - 0.5 - 0.2 * (hash3(vec3(cell, 2.2)).xy - 0.5);
  float r = (0.28 + 0.14 * hash(vec3(cell, 4.4))) * (0.25 + 0.75 * beat(s, 1.0));
  return mix(seen, WHITE, step(0.75, s) * sparkle(off, r) * level);
}

// A hologram: the colors of the rainbow, pale, laid over the ink in bands
// on a slant – they wander across it as it turns – and a white glint.
vec3 holo(vec3 c, vec3 n) {
  float t = dot(vLocal.xy, vec2(0.62, 0.78)) * 1.3 + 0.9 * (n.x + n.y)
    + 0.06 * sin(vLocal.x * 11.0 + vLocal.y * 7.0);
  float x = t * 6.0;
  float aa = fwidth(x);
  float step6 = floor(x) + smoothstep(1.0 - aa, 1.0, fract(x));
  vec3 seen = mix(c, mix(hue(step6 / 6.0), WHITE, 0.5), 0.55);
  return mix(seen, WHITE, 0.85 * band(fract(t * 0.5 + 0.25), 0.5, 0.03));
}

// Wood: the grain – long rings round a middle far below, lighter and darker
// in turn, a fine dark line between two, wavering – bending round a knot.
vec3 wood(vec3 c) {
  vec2 q = vLocal.xy;
  float knot = length((q - vec2(0.16, -0.12)) * vec2(1.0, 1.8));
  float r = length((q - vec2(-0.3, -1.7)) * vec2(0.5, 1.0)) * 15.0
    + 0.7 * noise(q * vec2(2.5, 8.0)) + 1.6 * exp(-knot * knot * 70.0);
  vec3 seen = mix(c, mix(c, WHITE, 0.18), 0.7 * above(0.5, fract(r * 0.5 + 0.1)));
  seen = mix(seen, deeper(c), stripes(r, 0.07));
  float rings = stripes(knot * 55.0, 0.12) * (1.0 - smoothstep(0.045, 0.06, knot));
  return mix(seen, deeper(c), max(rings, 1.0 - smoothstep(0.012, 0.016, knot)));
}

// Confetti: on the face, in most cells of a grid, a dot or a little strip,
// turned any way, in one of a few cheerful colors.
vec3 confetti(vec3 c, float level) {
  vec2 q = vLocal.xy * 20.0 + 0.5;
  vec2 cell = floor(q);
  vec3 h = hash3(vec3(cell, 3.0));
  float a = h.x * 6.2832;
  vec2 off = mat2(cos(a), sin(a), -sin(a), cos(a)) * (fract(q) - 0.5 - 0.3 * (h.yz - 0.5));
  vec2 box = abs(off) - vec2(0.28, 0.07);
  float d = hash(vec3(cell, 7.0)) < 0.55
    ? length(max(box, 0.0)) + min(max(box.x, box.y), 0.0) - 0.03
    : length(off) - 0.14;
  float bit = inside(d, 0.7 * length(fwidth(q))) * step(0.3, hash(vec3(cell, 9.0)));
  float pick = hash(vec3(cell, 13.0)) * 6.0;
  vec3 tone = pick < 1.0 ? vec3(0.95, 0.25, 0.22)
    : pick < 2.0 ? vec3(1.0, 0.8, 0.18)
    : pick < 3.0 ? vec3(0.16, 0.78, 0.58)
    : pick < 4.0 ? vec3(0.27, 0.65, 1.0)
    : pick < 5.0 ? vec3(1.0, 0.42, 0.7)
    : WHITE;
  return mix(c, tone, bit * level);
}

// Stars: on the face, in about half the cells of a grid, a little star –
// white or a pale yellow – that softly breathes where it is live; between
// them a fine dust of the ink's light tone.
vec3 stars(vec3 c, float level) {
  vec3 seen = mix(c, deeper(c), 0.3);
  vec2 q = vLocal.xy * 13.0 + 0.5;
  vec2 cell = floor(q);
  vec3 h = hash3(vec3(cell, 21.0));
  float r = (0.24 + 0.1 * h.z) * (0.8 + 0.2 * beat(h.x, 0.8));
  float a = (h.y - 0.5) * 0.6;
  vec2 off = mat2(cos(a), sin(a), -sin(a), cos(a)) * (fract(q) - 0.5 - 0.3 * (h.xy - 0.5));
  float lit = inside(star(off, r, 0.45), 0.7 * length(fwidth(q))) * step(0.42, h.x);
  seen = mix(seen, mix(WHITE, vec3(1.0, 0.92, 0.55), step(0.5, h.z)), lit * level);
  float g;
  float dust = dotAt(vLocal * 40.0 + 0.5, 0.22, g) * step(0.7, g) * beat(g, 1.0);
  return mix(seen, mix(c, WHITE, 0.6), dust);
}

// Marble: soft clouds of the ink's light and dark tones, swirled, and veins
// along them – a fine dark one, a finer light one.
vec3 marble(vec3 c) {
  vec2 q = vLocal.xy * 3.0;
  vec2 swirl = vec2(noise(q + 1.3), noise(q + 7.7));
  float f = 0.65 * noise(q * 1.2 + 2.2 * swirl)
    + 0.35 * noise(q * 2.7 + 3.0 * swirl + 4.0);
  float aa = 1.5 * fwidth(f);
  vec3 seen = mix(c, mix(c, WHITE, 0.45), smoothstep(0.52, 0.72, f));
  seen = mix(seen, deeper(c), 0.45 * smoothstep(0.42, 0.25, f));
  seen = mix(seen, deeper(c), 0.8 * (1.0 - smoothstep(0.008, 0.008 + aa, abs(f - 0.47))));
  return mix(seen, mix(c, WHITE, 0.75), 0.8 * (1.0 - smoothstep(0.005, 0.005 + aa, abs(f - 0.62))));
}

// Heat: it glows like hot iron – deep in its lines and towards the face's
// middle white-hot, then yellow, orange and red at the edges and the rim,
// the ink only giving them a tone. Where it is live, it flickers a little.
vec3 heat(vec3 c) {
  float flicker = twinkle * 0.07
    * sin(time * 3.3 + 6.0 * noise(vLocal.xy * 6.0 + time * 0.6));
  float t = 0.62 * smoothstep(0.6, 1.0, vCore)
    + 0.38 * (1.0 - length(vLocal.xy) * 2.0) + flicker;
  vec3 seen = mix(mix(vec3(0.82, 0.12, 0.07), c, 0.25), mix(vec3(1.0, 0.45, 0.08), c, 0.12), above(0.38, t));
  seen = mix(seen, vec3(1.0, 0.83, 0.26), above(0.6, t));
  return mix(seen, vec3(1.0, 0.97, 0.78), above(0.8, t));
}

// The ink in its finish (FINISHES' place + 1). level: how much it faces
// out of the face – the rubber's side doesn't.
vec3 finished(vec3 c, vec3 n, float level) {
  if (finish == 1) return metal(c, n, level);
  if (finish == 2) return glitter(c, n, level);
  if (finish == 3) return holo(c, n);
  if (finish == 4) return wood(c);
  if (finish == 5) return confetti(c, level);
  if (finish == 6) return stars(c, level);
  if (finish == 7) return marble(c);
  return heat(c);
}
#endif

void main() {
  float light = dot(normalize(vNormal), normalize(LIGHT));
  float soft = fwidth(light);
  float dark = amount * (1.0 - smoothstep(-0.18 - soft, -0.18 + soft, light));
  float part = code;
  vec3 fill = color;
  vec3 shadow = shade;
#ifdef RUBBER
  // Ink on the raised parts only, sharp – the ground pale.
  float edge = clamp((vRelief - 0.5) / max(fwidth(vRelief), 1e-4) + 0.5, 0.0, 1.0);
  fill = mix(ground, ink, edge);
  shadow = mix(groundShade, inkShade, edge);
  // Raised or not – the side goes with the rim, inked as far as it is.
  if (vRelief > 0.5) part += 1.0;
#endif
#ifdef BLOCK
  // Its back (extruded towards the face, so −Z) – the rest, the rounded
  // front too, is one with the sides.
  if (vFacing.z < -0.7) part += 1.0;
#endif
#ifdef PLATE
  // The engraved “boop”: a shade deeper, no lines.
  vec3 facet = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
  if (abs(facet.z) > 0.2 && vLocal.z < -GROOVE * 0.5) {
    fill = shade;
    shadow = shade * 0.9;
  }
#endif
  float deep = 0.0;
#ifdef KNOB
  deep = 0.5 + vDeep * DEEP;
#endif
  vec3 seen = mix(fill, shadow, dark);
#ifdef RUBBER
  // The finish on the ink – nothing of it without the cartoon (the
  // drawing's flat colors) – and no lines: it is only color.
  if (finish > 0) {
    vec3 inked = finished(
      mix(ink, inkShade, dark),
      normalize(vNormal),
      smoothstep(0.35, 0.65, vFacing.z)
    );
    seen = mix(seen, inked, edge * amount);
  }
#endif
  outColor = vec4(seen, 1.0);
  outData = vec4(part / 16.0, wobble(vLocal), deep, 1.0);
}
`;

/** No finish to begin with – `setFinish` gives the rubber one. */
const finishUniforms = () => ({ finish: { value: 0 } });

/**
 * The finish of a special color (palette.ts `finishOf`) on the rubber's
 * material – or none: the plain cartoon colors. Only its ink wears it: the
 * rim and the doodle.
 */
export const setFinish = (
  material: Three.Material,
  finish: Finish | undefined
) => {
  const { uniforms } = material as Three.ShaderMaterial;
  if (!uniforms?.finish) return;
  uniforms.finish.value = finish ? FINISHES.indexOf(finish) + 1 : 0;
};

/**
 * A stamp part's material: its flat color (sRGB) and shade. The rubber's
 * colors come from `inkRubber()`; `defines` carry what the shader must know
 * of the model (the plate's GROOVE).
 */
export const toonMaterial = (
  THREE: typeof Three,
  part: Part,
  color: Rgb,
  defines: Record<string, number> = {}
) =>
  new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: {
      ...Object.fromEntries(
        Object.entries(defines).map(([key, value]) => [key, value.toFixed(5)])
      ),
      ...(part === "rubber" && { RUBBER: "" }),
      ...(part === "block" && { BLOCK: "" }),
      ...(part === "plate" && { PLATE: "" }),
      ...(part === "knob" && { KNOB: "", DEEP: DEEP.toFixed(5) }),
    },
    uniforms: {
      color: { value: vec(THREE, color) },
      shade: { value: vec(THREE, shaded(color)) },
      code: { value: CODE[part] },
      amount: inkState.amount,
      time: inkState.time,
      twinkle: inkState.twinkle,
      ...(part === "rubber" && finishUniforms()),
      ink: { value: new THREE.Vector3() },
      inkShade: { value: new THREE.Vector3() },
      ground: { value: new THREE.Vector3() },
      groundShade: { value: new THREE.Vector3() },
    },
  });

/** Inks the rubber's material: the raised parts in `ink`, the ground pale. */
export const inkRubber = (material: Three.Material, ink: Rgb, ground: Rgb) => {
  const { uniforms } = material as Three.ShaderMaterial;
  if (!uniforms?.ink) return;
  uniforms.ink.value.set(...ink);
  uniforms.inkShade.value.set(...shaded(ink));
  uniforms.ground.value.set(...ground);
  uniforms.groundShade.value.set(...shaded(ground));
};

const COMPOSITE = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) out highp vec4 outColor;
uniform highp sampler2D colors;
uniform highp sampler2D data;
uniform float width;
uniform float amount;
uniform vec3 ink;
uniform int scale;

ivec2 size;

vec4 at(ivec2 p) {
  return texelFetch(data, clamp(p, ivec2(0), size - 1), 0);
}

// Two spots show different things: another part – or, on the knob, one
// well behind the other.
bool differs(vec4 a, vec4 b) {
  return abs(a.r - b.r) > 0.03 || abs(a.b - b.b) > FOLD;
}

// How much ink covers this spot: a line along every edge between two
// things shown, its width swelling and thinning with the wobble.
float inkAt(ivec2 p) {
  vec4 here = at(p);
  float reach = width * 1.3 + 0.5;
  // A quick look around first – most spots are far from any line.
  bool near = differs(at(p + ivec2(1, 0)), here)
    || differs(at(p + ivec2(-1, 0)), here)
    || differs(at(p + ivec2(0, 1)), here)
    || differs(at(p + ivec2(0, -1)), here);
  for (int i = 0; i < 12 && !near; i++) {
    vec2 d = vec2(cos(float(i) * 0.5236), sin(float(i) * 0.5236));
    near = differs(at(p + ivec2(round(d * reach))), here)
      || differs(at(p + ivec2(round(d * reach * 0.55))), here);
  }
  if (!near) return 0.0;
  int r = int(ceil(reach));
  float best = 0.0;
  for (int y = -r; y <= r; y++) {
    for (int x = -r; x <= r; x++) {
      float d = length(vec2(x, y));
      if (d > reach) continue;
      vec4 there = at(p + ivec2(x, y));
      if (!differs(there, here)) continue;
      // The edge lies half a step short of the spot that differs.
      float w = width * (0.7 + 0.6 * (here.r > 0.01 ? here.g : there.g));
      best = max(best, clamp(w - d + 1.0, 0.0, 1.0));
    }
  }
  return best;
}

void main() {
  size = textureSize(data, 0);
  ivec2 base = ivec2(gl_FragCoord.xy) * scale;
  vec4 sum = vec4(0.0);
  for (int j = 0; j < scale; j++) {
    for (int i = 0; i < scale; i++) {
      ivec2 p = base + ivec2(i, j);
      vec4 color = texelFetch(colors, p, 0);
      float k = amount * inkAt(p);
      sum += vec4(ink * k + color.rgb * (1.0 - k), k + color.a * (1.0 - k));
    }
  }
  outColor = sum / float(scale * scale);
}
`;

export type Ink = {
  /**
   * Draws the scene: `unit` – how many of the canvas' pixels one stamp unit
   * spans on screen (the lines follow it); `amount` – how much cartoon (0:
   * flat colors only, drawn straight, smooth-edged – like the drawing);
   * `time` (s) and `twinkle` for the sparkles and the finishes.
   */
  render: (
    scene: Three.Scene,
    camera: Three.Camera,
    options: { unit: number; amount?: number; time?: number; twinkle?: boolean }
  ) => void;
  dispose: () => void;
};

/**
 * The ink pass for a renderer – its canvas transparent where nothing is.
 * `supersample`: the stamp is drawn this many times finer and averaged down
 * (for pictures – a live canvas at a pixel ratio of 2 needs none). Follows
 * the renderer's size by itself.
 */
export const createInk = (
  THREE: typeof Three,
  renderer: Three.WebGLRenderer,
  { supersample = 1 } = {}
): Ink => {
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    count: 2,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  const composite = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: COMPOSITE,
    defines: { FOLD: (FOLD * DEEP).toFixed(5) },
    uniforms: {
      colors: { value: target.textures[0] },
      data: { value: target.textures[1] },
      width: { value: 1 },
      amount: inkState.amount,
      ink: { value: vec(THREE, INK) },
      scale: { value: supersample },
    },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    // Its colors come premultiplied – laid over what is under the stamp.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  );
  const screen = new THREE.Mesh(triangle, composite);
  screen.frustumCulled = false;
  screen.layers.enableAll();
  const size = new THREE.Vector2();

  const pass = (scene: Three.Object3D, camera: Three.Camera, layer: number) => {
    camera.layers.set(layer);
    renderer.render(scene, camera);
  };

  return {
    render: (
      scene,
      camera,
      { unit, amount = 1, time = 0, twinkle = false }
    ) => {
      const mask = camera.layers.mask;
      const ratio = renderer.getPixelRatio();
      const line = Math.max(LINE * unit, THINNEST * ratio);
      inkState.amount.value = amount;
      inkState.time.value = time;
      inkState.line.value = line;
      inkState.twinkle.value = twinkle ? 1 : 0;
      renderer.setRenderTarget(null);
      renderer.clear();
      if (amount <= 0) {
        // Just the colors, straight onto the canvas – smooth edges.
        camera.layers.mask = (1 << 0) | (1 << UNDER) | (1 << OVER);
        renderer.render(scene, camera);
        camera.layers.mask = mask;
        return;
      }
      renderer.getDrawingBufferSize(size);
      const w = size.x * supersample;
      const h = size.y * supersample;
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      composite.uniforms.width.value = (line * supersample) / 2;
      renderer.setRenderTarget(target);
      renderer.clear();
      pass(scene, camera, 0);
      renderer.setRenderTarget(null);
      pass(scene, camera, UNDER);
      renderer.render(screen, camera);
      pass(scene, camera, OVER);
      camera.layers.mask = mask;
    },
    dispose: () => {
      target.dispose();
      composite.dispose();
      triangle.dispose();
    },
  };
};
