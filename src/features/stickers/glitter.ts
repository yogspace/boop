import type * as Three from "three";
import type { StickerInput } from "./build";
import { inkState, OVER } from "./ink";

/**
 * A special stamp glitters: a few small four-pointed sparkles about it –
 * white, outlined in the ink of its lines – that twinkle in the live
 * views (still in pictures and for reduced motion). They turn with the stamp
 * and are drawn over everything (ink.ts' OVER), one quad each, all in one go.
 */

/**
 * Where (the stamp's own space: face at z = 0, knob towards −Z) and how big
 * – all close round its middle, so none leaves a picture.
 */
const SPARKLES: [number, number, number, number][] = [
  [0.4, 0.3, -0.15, 0.11],
  [-0.48, -0.1, -0.3, 0.08],
  [0.12, -0.46, -0.2, 0.065],
  [-0.28, 0.4, -0.55, 0.085],
  [0.3, -0.1, -0.75, 0.06],
];

const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute float size;
attribute float phase;
uniform float time;
uniform float twinkle;
varying vec2 vUv;
void main() {
  vec4 at = modelViewMatrix * vec4(position, 1.0);
  float scale = length(modelViewMatrix[0].xyz);
  // Each in its own time: it swells, flashes and shrinks back, turning a
  // little.
  float beat = 0.5 + 0.5 * sin(time * (2.1 + phase) + phase * 6.2832);
  float s = size * scale * mix(1.0, 0.45 + 0.6 * beat * beat, twinkle);
  float a = twinkle * 0.25 * sin(time * 1.3 + phase * 9.0);
  at.xy += mat2(cos(a), sin(a), -sin(a), cos(a)) * corner * s;
  vUv = corner;
  gl_Position = projectionMatrix * at;
}
`;

/**
 * A sparkle on its quad (`vUv`, −1…1) – a gift unwrapped bursts with them
 * too (unwrap.tsx).
 */
export const SPARKLE_FRAGMENT = /* glsl */ `
uniform float line;
varying vec2 vUv;
// A four-pointed star with curved-in sides (after Inigo Quilez' sdStar).
float star(vec2 p, float r) {
  const float an = 3.141593 / 4.0;
  const float en = 3.141593 / 2.7;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}
void main() {
  // The star's points on the axes, as wide as the quad leaves room for.
  float step = length(fwidth(vUv)) * 0.7071;
  // Its outline as the stamp's, a little finer – and on a tiny one finer
  // still, or the ink would swallow it.
  float width = min(line * 0.8, 0.2 / step);
  float r = 1.0 - (width * 0.5 + 1.0) * step;
  float d = (star(vUv, r) + 0.04) / step;
  float outer = clamp(0.5 - (d - width * 0.5), 0.0, 1.0);
  float inner = clamp(0.5 - (d + width * 0.5), 0.0, 1.0);
  vec3 ink = vec3(0.067, 0.063, 0.078);
  vec3 fill = vec3(1.0, 0.98, 0.9);
  gl_FragColor = vec4(ink * (outer - inner) + fill * inner, outer);
}
`;

/** Whether a stamp glitters – read with care, the field may not be there. */
const isSpecial = (input: StickerInput) =>
  (input.drawing as { special?: unknown } | null)?.special === true;

/** Adds the sparkles to a stamp (build.ts) – if it is special. */
export const addGlitter = (
  THREE: typeof Three,
  sticker: Three.Object3D,
  input: StickerInput
) => {
  const stamp = sticker.children[0];
  if (!(stamp && isSpecial(input))) return;
  const position: number[] = [];
  const corner: number[] = [];
  const size: number[] = [];
  const phase: number[] = [];
  const index: number[] = [];
  SPARKLES.forEach(([x, y, z, s], n) => {
    for (const [cx, cy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      position.push(x, y, z);
      corner.push(cx, cy);
      size.push(s);
      phase.push((n * 0.618) % 1);
    }
    const i = n * 4;
    index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3)
  );
  geometry.setAttribute("corner", new THREE.Float32BufferAttribute(corner, 2));
  geometry.setAttribute("size", new THREE.Float32BufferAttribute(size, 1));
  geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phase, 1));
  geometry.setIndex(index);
  const glitter = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: SPARKLE_FRAGMENT,
      uniforms: {
        time: inkState.time,
        twinkle: inkState.twinkle,
        line: inkState.line,
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Premultiplied, like the ink pass' colors.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })
  );
  glitter.name = "glitter";
  glitter.frustumCulled = false;
  glitter.renderOrder = 10;
  glitter.layers.set(OVER);
  stamp.add(glitter);
};
