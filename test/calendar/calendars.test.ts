import { describe, expect, it } from "vitest";
import { mayLetGo } from "../../src/features/calendar/model";

describe("letting go of a calendar – deleting or leaving it", () => {
  it("is fine while the account is in another one", () => {
    expect(mayLetGo("first", ["first", "family"])).toBe(true);
    expect(mayLetGo("family", new Set(["first", "family"]))).toBe(true);
  });

  it("is refused for the last one", () => {
    expect(mayLetGo("first", ["first"])).toBe(false);
    expect(mayLetGo("first", new Set(["first"]))).toBe(false);
  });

  it("counts no calendar twice", () => {
    expect(mayLetGo("first", ["first", "first"])).toBe(false);
  });

  it("lets go of one the account isn't in, as long as it has any", () => {
    expect(mayLetGo("gone", ["first"])).toBe(true);
    expect(mayLetGo("gone", [])).toBe(false);
  });

  it("knows nothing of the first calendar – it is one like any other", () => {
    expect(mayLetGo("first", ["later"])).toBe(true);
  });
});
