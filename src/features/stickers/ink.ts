import type * as Three from "three";

/**
 * How a stamp is drawn – like a cartoon: flat colors, a touch of shade, and
 * bold black ink lines around it and inside, between its parts and along the
 * relief of its face. The lines are found in the picture, not on the model:
 * the stamp is drawn once into two images at the same time – its colors, and
 * what each spot shows (which part, raised or not, a little hand-drawn
 * unevenness that sticks to the stamp as it turns). Where two neighbours show
 * different things there is a line, as wide as the stamp is big on screen;
 * one pass lays them over the colors, smooth at the edges.
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
export type Part = "rubber" | "block" | "plate" | "neck" | "ball";

/**
 * What a spot shows – a different number, a line between. Each part has
 * room for a few: the rubber's ground and its raised parts; the block's back
 * and the rest of it.
 */
const CODE: Record<Part, number> = {
  rubber: 1,
  block: 5,
  plate: 8,
  neck: 10,
  ball: 12,
};

const VERTEX = /* glsl */ `
#ifdef RUBBER
attribute float relief;
varying float vRelief;
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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
varying float vRelief;
#endif
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vFacing;

// The light, from the front and a little above left – fixed to the view:
// only what turns well away from it takes the shade.
const vec3 LIGHT = vec3(-0.36, 0.46, 0.81);

// Low and slow, so the lines swell and thin like drawn by hand – stuck to
// the stamp, so nothing crawls while it turns.
float wobble(vec3 p) {
  return 0.5 + 0.3 * sin(dot(p, vec3(13.1, 7.3, 5.7)) + 1.3)
    + 0.2 * sin(dot(p, vec3(-6.3, 15.7, -8.1)) + 4.1);
}

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
  outColor = vec4(mix(fill, shadow, dark), 1.0);
  outData = vec4(part / 16.0, wobble(vLocal), 0.0, 1.0);
}
`;

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
    },
    uniforms: {
      color: { value: vec(THREE, color) },
      shade: { value: vec(THREE, shaded(color)) },
      code: { value: CODE[part] },
      amount: inkState.amount,
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

bool differs(float a, float b) {
  return abs(a - b) > 0.03;
}

// How much ink covers this spot: a line along every edge between two
// things shown, its width swelling and thinning with the wobble.
float inkAt(ivec2 p) {
  vec4 here = at(p);
  float reach = width * 1.3 + 0.5;
  // A quick look around first – most spots are far from any line.
  bool near = differs(at(p + ivec2(1, 0)).r, here.r)
    || differs(at(p + ivec2(-1, 0)).r, here.r)
    || differs(at(p + ivec2(0, 1)).r, here.r)
    || differs(at(p + ivec2(0, -1)).r, here.r);
  for (int i = 0; i < 12 && !near; i++) {
    vec2 d = vec2(cos(float(i) * 0.5236), sin(float(i) * 0.5236));
    near = differs(at(p + ivec2(round(d * reach))).r, here.r)
      || differs(at(p + ivec2(round(d * reach * 0.55))).r, here.r);
  }
  if (!near) return 0.0;
  int r = int(ceil(reach));
  float best = 0.0;
  for (int y = -r; y <= r; y++) {
    for (int x = -r; x <= r; x++) {
      float d = length(vec2(x, y));
      if (d > reach) continue;
      vec4 there = at(p + ivec2(x, y));
      if (!differs(there.r, here.r)) continue;
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

  const pass = (
    scene: Three.Object3D,
    camera: Three.Camera,
    layer: number
  ) => {
    camera.layers.set(layer);
    renderer.render(scene, camera);
  };

  return {
    render: (scene, camera, { unit, amount = 1, time = 0, twinkle = false }) => {
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
