import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

// apply.ts speaks in the app's paths (@/…), which the tests don't resolve –
// the same modules, by their relative ones. Membership only lends `idOf`.
vi.mock(
  "@/features/calendar/model",
  () => import("../../src/features/calendar/model")
);
vi.mock(
  "@/features/calendar/note",
  () => import("../../src/features/calendar/note")
);
vi.mock(
  "@/features/calendar/palette",
  () => import("../../src/features/calendar/palette")
);
vi.mock("@/features/calendar/membership", () => ({
  idOf: (value: unknown) =>
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "id" in value
        ? String((value as { id: unknown }).id)
        : null,
}));

const { applyChange, purgeCalendar } = await import(
  "../../src/features/sync/apply"
);
const { noteId } = await import("../../src/features/calendar/note");

type Doc = Record<string, unknown>;

const ME = "acc-me";
const ANNA = "acc-anna";
const HOME = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const ELSEWHERE = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const DAY = "2026-10-12";
const ID = noteId(HOME, DAY);

/** The database, in memory – what apply.ts asks of Payload, and no more. */
const fake = () => {
  const db: Record<string, Map<string, Doc>> = {
    notes: new Map(),
    placements: new Map(),
    stamps: new Map(),
    invites: new Map(),
  };
  const payload = {
    findByID: async ({ collection, id }: { collection: string; id: string }) =>
      db[collection].get(id) ?? null,
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      db[collection].set(String(data.id), { ...data });
      return data;
    },
    update: async ({
      collection,
      id,
      data,
    }: {
      collection: string;
      id?: string;
      data: Doc;
    }) => {
      if (!id) return { docs: [] };
      const doc = { ...db[collection].get(id), ...data };
      db[collection].set(id, doc);
      return doc;
    },
    delete: async ({
      collection,
      where,
    }: {
      collection: string;
      where: { calendar: { equals: string } };
    }) => {
      for (const [id, doc] of db[collection]) {
        if (doc.calendar === where.calendar.equals) db[collection].delete(id);
      }
    },
    find: async () => ({ docs: [] }),
  };
  return { db, req: { payload } as unknown as PayloadRequest };
};

let db: ReturnType<typeof fake>["db"];
let req: PayloadRequest;

beforeEach(() => {
  ({ db, req } = fake());
});

const ctx = (me = ME, mine = [HOME]) => ({
  req,
  me,
  mine: new Set(mine),
  unshared: new Set<string>(),
});

const hi = { v: 1, lines: [[{ text: "Zoo!", b: true }]] };
const at = (minute: number) =>
  new Date(Date.UTC(2026, 9, 12, 8, minute)).toISOString();

const write = (
  content: unknown,
  changedAt: string,
  extra: { id?: string; calendar?: string; date?: string; me?: string } = {}
) =>
  applyChange(ctx(extra.me ?? ME), {
    type: "note",
    id: extra.id ?? ID,
    changedAt,
    data: {
      calendar: extra.calendar ?? HOME,
      date: extra.date ?? DAY,
      content,
    },
  });

const empty = (changedAt: string, me = ME) =>
  applyChange(ctx(me), { type: "note", id: ID, changedAt, deleted: true });

describe("a day's note, written through the sync", () => {
  it("is made by a member, under its day's id – checked, and theirs", async () => {
    expect(await write(hi, at(1))).toEqual({ ok: true });
    expect(db.notes.get(ID)).toMatchObject({
      id: ID,
      calendar: HOME,
      date: DAY,
      content: hi,
      editedBy: ME,
      deleted: false,
      changedAt: at(1),
    });
  });

  it("keeps nothing of what a device sends but text, bold and underline", async () => {
    await write(
      {
        v: 1,
        lines: [[{ text: "<script>x</script>", b: "yes", onclick: "x()" }]],
        html: "<img>",
      },
      at(1)
    );
    expect(db.notes.get(ID)?.content).toEqual({
      v: 1,
      lines: [[{ text: "<script>x</script>" }]],
    });
  });

  it("is refused to anyone not in the calendar", async () => {
    expect(
      await write(hi, at(1), {
        calendar: ELSEWHERE,
        id: noteId(ELSEWHERE, DAY),
      })
    ).toEqual({ ok: false, reason: "not a member" });
    await write(hi, at(1));
    // Someone outside can't touch one that is there either.
    expect(
      await applyChange(ctx("acc-eve", [ELSEWHERE]), {
        type: "note",
        id: ID,
        changedAt: at(2),
        data: { content: { v: 1, lines: [[{ text: "mine now" }]] } },
      })
    ).toEqual({ ok: false, reason: "not a member" });
    expect(db.notes.get(ID)?.content).toEqual(hi);
  });

  it("must have its day's id – no second note for a day", async () => {
    expect(
      await write(hi, at(1), { id: "11111111-2222-4333-8444-555555555555" })
    ).toEqual({ ok: false, reason: "not its day's" });
    expect(await write(hi, at(1), { date: "2026-10-13" })).toEqual({
      ok: false,
      reason: "not its day's",
    });
    expect(await write(hi, at(1), { date: "12.10.2026" })).toEqual({
      ok: false,
      reason: "no day",
    });
    expect(db.notes.size).toBe(0);
  });

  it("stays in its calendar and on its day", async () => {
    await write(hi, at(1));
    await write({ v: 1, lines: [[{ text: "later" }]] }, at(2), {
      calendar: ELSEWHERE,
      date: "2026-01-01",
    });
    expect(db.notes.get(ID)).toMatchObject({ calendar: HOME, date: DAY });
  });

  it("goes to whoever wrote last – an older change stays out", async () => {
    await write(hi, at(5));
    const older = { v: 1, lines: [[{ text: "older" }]] };
    expect(await write(older, at(3), { me: ANNA })).toEqual({ ok: true });
    expect(db.notes.get(ID)).toMatchObject({ content: hi, editedBy: ME });
    const newer = { v: 1, lines: [[{ text: "newer" }]] };
    await applyChange(ctx(ANNA), {
      type: "note",
      id: ID,
      changedAt: at(7),
      data: { content: newer },
    });
    expect(db.notes.get(ID)).toMatchObject({
      content: newer,
      editedBy: ANNA,
      changedAt: at(7),
    });
  });

  it("emptied, is a marker without its text – and may be written again", async () => {
    await write(hi, at(1));
    expect(await empty(at(2))).toEqual({ ok: true });
    expect(db.notes.get(ID)).toMatchObject({
      content: null,
      editedBy: null,
      deleted: true,
    });
    // Nothing but blanks is empty too.
    await write(hi, at(3));
    await write({ v: 1, lines: [[{ text: "  " }], []] }, at(4));
    expect(db.notes.get(ID)).toMatchObject({ content: null, deleted: true });
    // And written again: the same note, back.
    expect(await write(hi, at(5), { me: ANNA })).toEqual({ ok: true });
    expect(db.notes.get(ID)).toMatchObject({
      content: hi,
      editedBy: ANNA,
      deleted: false,
    });
  });

  it("makes nothing of an empty one never written", async () => {
    expect(await write({ v: 1, lines: [[]] }, at(1))).toEqual({ ok: true });
    expect(await empty(at(2))).toEqual({ ok: true });
    expect(db.notes.size).toBe(0);
  });

  it("goes with its calendar – and so do its open invitations", async () => {
    await write(hi, at(1));
    db.notes.set("other", { id: "other", calendar: ELSEWHERE });
    db.invites.set("invite", { id: "invite", calendar: HOME });
    db.invites.set("invite-other", { id: "invite-other", calendar: ELSEWHERE });
    await purgeCalendar(req, HOME);
    expect([...db.notes.keys()]).toEqual(["other"]);
    expect([...db.invites.keys()]).toEqual(["invite-other"]);
  });
});

describe("other kinds stay as they were", () => {
  it("a deleted placement is never brought back", async () => {
    db.placements.set("p1", {
      id: "p1",
      calendar: HOME,
      deleted: true,
      changedAt: at(1),
    });
    expect(
      await applyChange(ctx(), {
        type: "placement",
        id: "p1",
        changedAt: at(2),
        data: { x: 0.2 },
      })
    ).toEqual({ ok: false, reason: "deleted" });
  });
});
