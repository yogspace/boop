import type { Payload } from "payload";

type Doc = Record<string, unknown>;

type Condition = { equals?: unknown; in?: unknown[] };
type Where = { and?: Where[]; or?: Where[] } & Record<string, unknown>;

const matches = (doc: Doc, where: Where | undefined): boolean =>
  Object.entries(where ?? {}).every(([key, condition]) => {
    if (key === "and")
      return (condition as Where[]).every((w) => matches(doc, w));
    if (key === "or")
      return (condition as Where[]).some((w) => matches(doc, w));
    const { equals, in: among } = condition as Condition;
    const value = doc[key];
    // A relationship with several (a calendar's members) matches any of them.
    const values = Array.isArray(value) ? value : [value];
    if (among) return values.some((one) => among.includes(one));
    return values.includes(equals);
  });

/**
 * The database, in memory – what the feeds ask of Payload (store.ts), and
 * no more. `calls` counts the reads, to see what never reached it.
 */
export const fakePayload = (
  now = () => new Date("2026-10-12T10:00:00.000Z")
) => {
  const db: Record<string, Map<string, Doc>> = {
    "calendar-feeds": new Map(),
    calendars: new Map(),
    accounts: new Map(),
    placements: new Map(),
    notes: new Map(),
    stamps: new Map(),
  };
  const calls = { find: 0, update: 0 };
  let next = 1;
  const payload = {
    find: async ({
      collection,
      where,
      limit,
    }: {
      collection: string;
      where?: Where;
      limit?: number;
    }) => {
      calls.find++;
      const docs = [...db[collection].values()].filter((doc) =>
        matches(doc, where)
      );
      return { docs: limit ? docs.slice(0, limit) : docs };
    },
    findByID: async ({ collection, id }: { collection: string; id: string }) =>
      db[collection].get(String(id)) ?? null,
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      const doc = {
        id: `${collection}-${next++}`,
        createdAt: now().toISOString(),
        ...data,
      };
      db[collection].set(String(doc.id), doc);
      return doc;
    },
    update: async ({
      collection,
      id,
      data,
    }: {
      collection: string;
      id: string;
      data: Doc;
    }) => {
      calls.update++;
      const doc = { ...db[collection].get(id), ...data };
      db[collection].set(id, doc);
      return doc;
    },
    delete: async ({
      collection,
      id,
      where,
    }: {
      collection: string;
      id?: string;
      where?: Where;
    }) => {
      const docs: Doc[] = [];
      for (const [key, doc] of db[collection]) {
        if (id === undefined ? matches(doc, where) : key === id) {
          db[collection].delete(key);
          docs.push(doc);
        }
      }
      return { docs };
    },
  };
  const put = (collection: string, doc: Doc) =>
    db[collection].set(String(doc.id), doc);
  return { db, calls, put, payload: payload as unknown as Payload };
};
