import type * as Three from "three";

/**
 * The spring a stamp turns on – for the one being made (sticker-view.tsx)
 * and for the pictures that look at the pointer (look.ts). `three` is passed
 * in, like build.ts.
 */

/** A spring's pull and damping, from its frequency (rad/s) and damping ratio. */
export const spring = (frequency: number, ratio: number) => ({
  pull: frequency * frequency,
  damping: 2 * ratio * frequency,
});

export type Spring = ReturnType<typeof spring>;

/**
 * One small step of such a spring, `h` seconds: `turn` is pulled towards
 * `target` – the shortest way, never unwinding whole turns – and `spin`, how
 * fast it turns and about what (rad/s), is carried along. Returns how far
 * off it was (rad).
 */
export const createSwing = (THREE: typeof Three) => {
  const error = new THREE.Quaternion();
  const step = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  return (
    turn: Three.Quaternion,
    spin: Three.Vector3,
    target: Three.Quaternion,
    { pull, damping }: Spring,
    h: number
  ) => {
    error.copy(turn).invert().premultiply(target);
    if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w);
    const sin = Math.hypot(error.x, error.y, error.z);
    const angle = 2 * Math.atan2(sin, error.w);
    const force = sin > 1e-6 ? (pull * angle) / sin : 0;
    spin.x += (error.x * force - damping * spin.x) * h;
    spin.y += (error.y * force - damping * spin.y) * h;
    spin.z += (error.z * force - damping * spin.z) * h;
    const speed = spin.length();
    if (speed > 1e-6) {
      step.setFromAxisAngle(axis.copy(spin).divideScalar(speed), speed * h);
      turn.premultiply(step).normalize();
    }
    return angle;
  };
};
