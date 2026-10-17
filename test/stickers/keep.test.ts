import { describe, expect, it } from "vitest";
import { MOST, toForget } from "../../src/features/stickers/keep";

/**
 * Which stamp pictures kept on the device go (stickers/keep.ts): those of
 * another version, and beyond the most kept those not shown the longest.
 */

const fresh = (key: string) => key.startsWith("2-");

describe("toForget", () => {
  it("keeps everything while there are few, of this version", () => {
    const kept = [
      { key: "2-a", used: 1 },
      { key: "2-b", used: 2 },
    ];
    expect(toForget(kept, fresh)).toEqual([]);
  });

  it("forgets another version's pictures, however recent", () => {
    const kept = [
      { key: "1-a", used: 9 },
      { key: "2-a", used: 1 },
      { key: "3-a", used: 5 },
    ];
    expect(toForget(kept, fresh).sort()).toEqual(["1-a", "3-a"]);
  });

  it("beyond the most, forgets those not shown the longest", () => {
    const kept = [
      { key: "2-new", used: 30 },
      { key: "2-old", used: 10 },
      { key: "2-mid", used: 20 },
      { key: "2-oldest", used: 0 },
    ];
    expect(toForget(kept, fresh, 2).sort()).toEqual(["2-old", "2-oldest"]);
  });

  it("counts only this version's towards the most", () => {
    const kept = [
      { key: "1-x", used: 99 },
      { key: "2-a", used: 1 },
      { key: "2-b", used: 2 },
    ];
    expect(toForget(kept, fresh, 2)).toEqual(["1-x"]);
  });

  it("keeps MOST by default", () => {
    const kept = Array.from({ length: MOST + 3 }, (_, i) => ({
      key: `2-${i}`,
      used: i,
    }));
    expect(toForget(kept, fresh).sort()).toEqual(["2-0", "2-1", "2-2"]);
  });
});
