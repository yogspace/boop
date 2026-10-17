import type * as Three from "three";
import { pace } from "./pace";
import { DEEP, inkState, type Rgb, vec } from "./toon/material";

/**
 * How a stamp is drawn – like a cartoon: flat colors, a touch of shade, and
 * bold black ink lines around it and inside, between its parts and along the
 * relief of its face. The lines are found in the picture, not on the model:
 * the stamp is drawn once into two images at the same time – its colors, and
 * what each spot shows (which part, raised or not, a little hand-drawn
 * unevenness that sticks to the stamp as it turns; on the knob, how far away
 * it is). Where two neighbours show different things there is a line, as
 * wide as the stamp is big on screen; one pass – this one – lays them over
 * the colors, smooth at the edges. What the parts draw into the two images
 * is their material's (toon/material.ts).
 *
 * Shared by the pictures (render.ts), the stamp being made (sticker-view.tsx)
 * and the one in hand (stamp-hand.tsx). `three` is passed in, like build.ts.
 */

export {
  inkRubber,
  inkState,
  type Part,
  type Rgb,
  rgb,
  setFinish,
  tint,
  toonMaterial,
} from "./toon/material";

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
 * neighbours are this far apart in depth (stamp units) – a fold.
 */
const FOLD = 0.05;
/** The ink's color, as sRGB. */
const INK: Rgb = [0.067, 0.063, 0.078];

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
   * `time` (s) and `twinkle` for the sparkles and the finishes; `thinnest`
   * – the lines never thinner than this (the canvas' px), THINNEST CSS px
   * unless said otherwise.
   */
  render: (
    scene: Three.Scene,
    camera: Three.Camera,
    options: {
      unit: number;
      amount?: number;
      time?: number;
      twinkle?: boolean;
      thinnest?: number;
    }
  ) => void;
  /**
   * Has the browser compile the programs for what is in `scene` – as
   * `render` draws it (`flat`: also with no cartoon, straight onto the
   * canvas) – and waits for them without holding up the page: one after
   * the other, the page having its turn between (pace.ts – Safari works a
   * program over right there, some milliseconds each), and where it can
   * (KHR_parallel_shader_compile) the browser finishes them out of the way.
   * The first frame then draws at once – compiling would otherwise stall
   * it, a good while on some devices.
   */
  warm: (
    scene: Three.Object3D,
    camera: Three.Camera,
    options?: { flat?: boolean }
  ) => Promise<void>;
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
  // Copies of materials, compiled ahead to be drawn flat too – kept, or
  // their programs would go with them.
  const copies: Three.Material[] = [];
  // What compiling ahead puts the materials on – drawn never.
  const speck = new THREE.BufferGeometry();
  speck.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
  );

  const pass = (scene: Three.Object3D, camera: Three.Camera, layer: number) => {
    camera.layers.set(layer);
    renderer.render(scene, camera);
  };

  return {
    render: (
      scene,
      camera,
      {
        unit,
        amount = 1,
        time = 0,
        twinkle = false,
        thinnest = THINNEST * renderer.getPixelRatio(),
      }
    ) => {
      const mask = camera.layers.mask;
      const line = Math.max(LINE * unit, thinnest);
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
    warm: async (scene, camera, { flat = false } = {}) => {
      // A program is made for a material as it is drawn where it is drawn:
      // the stamp's parts into the two images, what lies under and over it
      // – and the ink pass – onto the canvas. Each material goes, on a
      // speck, where it will be drawn.
      const programs: [Three.Material, Three.WebGLRenderTarget | null][] = [];
      scene.traverse((child) => {
        const { isMesh, layers } = child as Three.Mesh;
        if (!isMesh) return;
        const material = (child as Three.Mesh).material as Three.Material;
        if (!layers.isEnabled(0)) {
          programs.push([material, null]);
          return;
        }
        programs.push([material, target]);
        if (!flat) return;
        // Drawn flat as well, a part goes there as a copy – a material
        // waits for one program only; the copy shares it all the same.
        const copy = material.clone();
        copies.push(copy);
        programs.push([copy, null]);
      });
      programs.push([composite, null]);
      const ready: Promise<unknown>[] = [];
      for (const [material, into] of programs) {
        await pace();
        const before = renderer.getRenderTarget();
        renderer.setRenderTarget(into);
        ready.push(
          renderer.compileAsync(new THREE.Mesh(speck, material), camera)
        );
        renderer.setRenderTarget(before);
      }
      await Promise.all(ready);
    },
    dispose: () => {
      target.dispose();
      composite.dispose();
      triangle.dispose();
      speck.dispose();
      for (const copy of copies) copy.dispose();
    },
  };
};
