import type * as Three from "three";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { FINISHES, type Finish } from "../../calendar/palette";
import { FINISH_GLSL } from "./finishes";

/**
 * A stamp part's material – drawn by the ink pass (ink.ts) into two images
 * at once: its flat color with a touch of shade, and what each spot shows –
 * which part, raised or not, a little hand-drawn unevenness and, on the
 * knob, how far away it is – for the lines found between them. The
 * rubber's ink may wear a special finish (finishes.ts).
 */

/**
 * This fits the depths a knob spans (stamp units) into what an image holds
 * – where they leap, there is a line (ink.ts `FOLD`).
 */
export const DEEP = 0.9;
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

export const vec = (THREE: typeof Three, color: Rgb) =>
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
${FINISH_GLSL}
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
