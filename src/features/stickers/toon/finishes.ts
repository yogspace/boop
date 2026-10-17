/**
 * The special inks' finishes in the rubber's shader (material.ts) – metal,
 * glitter, hologram, wood, confetti, stars, marble, heat (palette.ts
 * `FINISHES`, in that order) – as GLSL: `finished()` paints the ink in one.
 */
export const FINISH_GLSL = /* glsl */ `
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
`;
