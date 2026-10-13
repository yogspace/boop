import type { Payload } from "payload";

type Doc = Record<string, unknown>;

type Condition = {
  equals?: unknown;
  not_equals?: unknown;
  in?: unknown[];
  greater_than?: string;
  less_than_equal?: string;
};
type Where = { and?: Where[]; or?: Where[] } & Record<string, unknown>;

/** Nothing there and null are the same to a query. */
const same = (value: unknown, wanted: unknown) =>
  (value ?? null) === (wanted ?? null);

/** One value against one condition – a list (a calendar's members) by any. */
const holds = (value: unknown, condition: Condition) => {
  const values = Array.isArray(value) ? value : [value];
  return Object.entries(condition).every(([operator, wanted]) => {
    switch (operator) {
      case "equals":
        return values.some((one) => same(one, wanted));
      case "not_equals":
        return !values.some((one) => same(one, wanted));
      case "in":
        return values.some((one) => (wanted as unknown[]).includes(one));
      // Dates are kept as ISO strings – they sort as they read.
      case "greater_than":
        return typeof value === "string" && value > String(wanted);
      case "less_than_equal":
        return typeof value === "string" && value <= String(wanted);
      default:
        throw new Error(`The fake knows no “${operator}”.`);
    }
  });
};

/** A field's value – also one inside a group, by its path (“origin.card”). */
const valueAt = (doc: Doc, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object" ? (value as Doc)[key] : undefined,
      doc
    );

const matches = (doc: Doc, where: Where | undefined): boolean =>
  Object.entries(where ?? {}).every(([key, condition]) => {
    if (key === "and")
      return (condition as Where[]).every((w) => matches(doc, w));
    if (key === "or")
      return (condition as Where[]).some((w) => matches(doc, w));
    return holds(valueAt(doc, key), condition as Condition);
  });

/**
 * The database, in memory – what sharing a calendar asks of Payload: the
 * member and invitation endpoints, the sync's reading, a login – and what
 * cards and gifts ask of it (test/cards). No hooks, no access – the code
 * under test asks with full access anyway. `updates` notes every write to
 * a calendar with its context (who did it), `sent` every mail.
 */
export const fakeDatabase = () => {
  const db: Record<string, Map<string, Doc>> = {
    accounts: new Map(),
    calendars: new Map(),
    invites: new Map(),
    stamps: new Map(),
    placements: new Map(),
    notes: new Map(),
    cards: new Map(),
    gifts: new Map(),
    "push-subscriptions": new Map(),
    "push-settings": new Map(),
    "calendar-feeds": new Map(),
  };
  const passwords = new Map<string, string>();
  const sent: { to: string; subject: string; html: string }[] = [];
  const updates: {
    collection: string;
    id: string;
    data: Doc;
    context: unknown;
  }[] = [];
  let next = 1;
  const stamp = () => new Date(Date.now()).toISOString();

  const found = (collection: string, where?: Where) =>
    [...db[collection].values()].filter((doc) => matches(doc, where));

  const payload = {
    logger: { info: () => undefined, warn: () => undefined },
    find: async ({
      collection,
      where,
      limit,
      page = 1,
    }: {
      collection: string;
      where?: Where;
      limit?: number;
      page?: number;
    }) => {
      const all = found(collection, where);
      const from = limit ? (page - 1) * limit : 0;
      const until = limit ? from + limit : all.length;
      return {
        docs: all.slice(from, until).map((doc) => ({ ...doc })),
        totalDocs: all.length,
        hasNextPage: until < all.length,
      };
    },
    findByID: async ({
      collection,
      id,
    }: {
      collection: string;
      id: string;
    }) => {
      const doc = db[collection].get(String(id));
      return doc ? { ...doc } : null;
    },
    count: async ({
      collection,
      where,
    }: {
      collection: string;
      where?: Where;
    }) => ({
      totalDocs: found(collection, where).length,
    }),
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      // Mongo's ids where Payload makes them; the app's own where it has one.
      const id = String(data.id ?? (next++).toString(16).padStart(24, "0"));
      const doc = { ...data, id, createdAt: stamp(), updatedAt: stamp() };
      db[collection].set(id, doc);
      return { ...doc };
    },
    update: async ({
      collection,
      id,
      where,
      data,
      context,
    }: {
      collection: string;
      id?: string;
      where?: Where;
      data: Doc;
      context?: unknown;
    }) => {
      const one = (key: string) => {
        const doc = { ...db[collection].get(key), ...data, updatedAt: stamp() };
        db[collection].set(key, doc);
        updates.push({ collection, id: key, data, context });
        return { ...doc };
      };
      // One by its id – or, without one, all that match.
      if (id !== undefined) return one(String(id));
      return {
        docs: found(collection, where).map((doc) => one(String(doc.id))),
      };
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
      const docs = id === undefined ? found(collection, where) : [];
      if (id !== undefined && db[collection].has(String(id))) {
        docs.push(db[collection].get(String(id)) as Doc);
      }
      for (const doc of docs) db[collection].delete(String(doc.id));
      return id === undefined ? { docs } : docs[0];
    },
    sendEmail: async (mail: { to: string; subject: string; html: string }) => {
      sent.push(mail);
    },
    /** A login as Payload makes one – the password checked, or it throws. */
    login: async ({ data }: { data: { email: string; password: string } }) => {
      const [doc] = found("accounts", { email: { equals: data.email } });
      if (!doc || passwords.get(String(doc.id)) !== data.password) {
        throw Object.assign(new Error("Wrong."), { status: 401 });
      }
      return { user: { ...doc }, token: "head.e30.sign", exp: undefined };
    },
    // The account's own writes beside the local API (accounts/seen.ts).
    db: {
      updateOne: async ({ id, data }: { id: string; data: Doc }) => {
        const doc = db.accounts.get(String(id));
        if (doc) Object.assign(doc, data);
        return null;
      },
    },
  };

  /** An account as the database holds it – confirmed, with a password. */
  const account = (doc: Doc & { id: string }, password = "geheim-123") => {
    db.accounts.set(doc.id, {
      locale: "de",
      _verified: true,
      createdAt: "2026-01-05T12:00:00.000Z",
      ...doc,
    });
    passwords.set(doc.id, password);
  };

  const put = (collection: string, doc: Doc & { id: string }) =>
    db[collection].set(doc.id, { ...doc });

  return {
    db,
    sent,
    updates,
    account,
    put,
    /** A document as it is kept right now. */
    get: (collection: string, id: string) => db[collection].get(id),
    payload: payload as unknown as Payload,
  };
};
