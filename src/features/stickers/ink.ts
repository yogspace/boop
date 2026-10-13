import type * as Three from "three";
import type { Finish } from "../calendar/palette";

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
 * clock (s) and the line's width (px) – for the glitter – and whether it
 * twinkles.
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
varying float vRelief;
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
uniform float metal;
uniform float glitter;
uniform float time;
uniform float twinkle;
#ifdef RUBBER
uniform vec3 ink;
uniform vec3 inkShade;
uniform vec3 ground;
uniform vec3 groundShade;
varying float vRelief;
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

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

// 1 inside a stripe of half-width w round c, smooth at its edges.
float band(float x, float c, float w) {
  float aa = fwidth(x);
  return 1.0 - smoothstep(w - aa, w + aa, abs(x - c));
}

// A metal ink, drawn like a cartoon: a round part takes the sky above the
// horizon (lighter), a darker band below it and one hard glint; a flat one
// two light streaks across it.
vec3 metalOf(vec3 c, vec3 n, float level) {
  float up = n.y + 0.3 * n.x;
  float aa = fwidth(up);
  vec3 curved = mix(c * 0.66, mix(c, WHITE, 0.4), smoothstep(-aa, aa, up - 0.04));
  float glint = dot(n, normalize(vec3(-0.5, 0.6, 0.62)));
  float ga = fwidth(glint);
  curved = mix(curved, WHITE, 0.85 * smoothstep(0.95 - ga, 0.95 + ga, glint));
  float d = (vLocal.x + vLocal.y) * 0.7071;
  vec3 streaked = mix(c, WHITE, 0.5 * max(band(d, 0.1, 0.06), band(d, 0.26, 0.022)));
  return mix(curved, streaked, level);
}

// Glitter in the ink: flecks stuck to the stamp – a few of the cells of a
// grid hold one, a little diamond – that twinkle out of step where it is
// live. Each one soft at its edge by how big the grid shows (not by the
// distance's own change, which leaps at the cells' borders).
float flecks(vec3 p) {
  vec3 cell = floor(p);
  float h = hash(cell);
  vec3 at = 0.5 + 0.2 * (vec3(hash(cell + 1.7), hash(cell + 3.1), hash(cell + 5.3)) - 0.5);
  vec3 off = abs(fract(p) - at);
  float d = off.x + off.y + off.z;
  float r = 0.3 + 0.16 * hash(cell + 7.9);
  float aa = 0.7 * length(fwidth(p));
  float beat = 0.55 + 0.45 * sin(time * (1.6 + 2.4 * h) + h * 40.0);
  return step(0.5, h) * (1.0 - smoothstep(r - aa, r + aa, d)) * mix(0.9, beat, twinkle);
}

void main() {
  float light = dot(normalize(vNormal), normalize(LIGHT));
  float soft = fwidth(light);
  float dark = amount * (1.0 - smoothstep(-0.18 - soft, -0.18 + soft, light));
  float part = code;
  vec3 fill = color;
  vec3 shadow = shade;
  // How much of it wears the finish: the ink – all of the knob, the
  // rubber's raised parts.
  float inked = 1.0;
  // How level it is – the rubber's face, against the round knob.
  float level = 0.0;
#ifdef RUBBER
  // Ink on the raised parts only, sharp – the ground pale.
  float edge = clamp((vRelief - 0.5) / max(fwidth(vRelief), 1e-4) + 0.5, 0.0, 1.0);
  fill = mix(ground, ink, edge);
  shadow = mix(groundShade, inkShade, edge);
  // Raised or not – the side goes with the rim, inked as far as it is.
  if (vRelief > 0.5) part += 1.0;
  inked = edge;
  level = 1.0;
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
  // A special color's finish – nothing of it without the cartoon (the
  // drawing's flat colors) – and no lines: they are only light.
  float finish = inked * amount;
  if (metal > 0.0) {
    seen = mix(seen, metalOf(seen, normalize(vNormal), level), metal * finish);
  }
  if (glitter > 0.0) {
    // Half a cell off: the face (z = 0) lies in the middle of a layer of
    // cells, not on the border between two.
    // Two sizes of it: a fine dust, and fewer big flakes over it – seen
    // from across the shelf, too.
    float dust = flecks(vLocal * 11.0 + 0.5);
    float flakes = flecks(vLocal * 5.5 + 0.5 + 17.0);
    seen = mix(seen, WHITE, 0.95 * max(dust, flakes) * glitter * finish);
  }
  outColor = vec4(seen, 1.0);
  outData = vec4(part / 16.0, wobble(vLocal), deep, 1.0);
}
`;

/** No finish to begin with – a material's own, `setFinish` changes it. */
const finishUniforms = () => ({ metal: { value: 0 }, glitter: { value: 0 } });

/**
 * The finish of a special color (palette.ts) on a material – metal or
 * glitter, or none: the plain cartoon colors. Only the ink wears it: the
 * knob all over, the rubber on its raised parts.
 */
export const setFinish = (
  material: Three.Material,
  finish: Finish | undefined
) => {
  const { uniforms } = material as Three.ShaderMaterial;
  if (!uniforms?.metal) return;
  uniforms.metal.value = finish === "metal" ? 1 : 0;
  uniforms.glitter.value = finish === "glitter" ? 1 : 0;
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
      ...finishUniforms(),
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
   * `time` (s) and `twinkle` for the glitter.
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
