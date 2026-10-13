import type { Payload } from "payload";

type Doc = Record<string, unknown>;

type Condition = {
  equals?: unknown;
  not_equals?: unknown;
  in?: unknown[];
  less_than_equal?: string;
  greater_than?: string;
};
type Where = { and?: Where[]; or?: Where[] } & Record<string, unknown>;

/** Nothing there and null are the same to a query. */
const same = (value: unknown, wanted: unknown) =>
  (value ?? null) === (wanted ?? null);

const holds = (value: unknown, condition: Condition) =>
  Object.entries(condition).every(([operator, wanted]) => {
    switch (operator) {
      case "equals":
        return same(value, wanted);
      case "not_equals":
        return !same(value, wanted);
      case "in":
        return (wanted as unknown[]).includes(value);
      // Dates are kept as ISO strings – they sort as they read.
      case "less_than_equal":
        return typeof value === "string" && value <= String(wanted);
      case "greater_than":
        return typeof value === "string" && value > String(wanted);
      default:
        throw new Error(`The fake knows no “${operator}”.`);
    }
  });

const matches = (doc: Doc, where: Where | undefined): boolean =>
  Object.entries(where ?? {}).every(([key, condition]) => {
    if (key === "and")
      return (condition as Where[]).every((w) => matches(doc, w));
    if (key === "or")
      return (condition as Where[]).some((w) => matches(doc, w));
    return holds(doc[key], condition as Condition);
  });

/** What the database says to a second account with an address (Payload's). */
const taken = () =>
  Object.assign(new Error("The following field is invalid: email"), {
    status: 400,
    data: { errors: [{ message: "Value must be unique", path: "email" }] },
  });

/**
 * The accounts, in memory – what the accounts' own code asks of Payload
 * (email-change.ts, cleanup.ts, session.ts), and no more: the database's
 * own writes (no hooks, one account per address, `updatedAt: null` leaves
 * the date alone), the reads and deletes of the local API, a login that
 * checks a password and leaves a session behind, and a mailbox.
 */
export const fakeAccounts = ({
  now = () => Date.parse("2026-10-13T10:00:00.000Z"),
}: {
  now?: () => number;
} = {}) => {
  const accounts = new Map<string, Doc>();
  /** The passwords, beside the accounts – no account holds one. */
  const passwords = new Map<string, string>();
  const sent: { to: string; subject: string; html: string }[] = [];
  const warnings: unknown[] = [];
  const deleted: string[] = [];
  let sessions = 0;

  const found = (where?: Where) =>
    [...accounts.values()].filter((doc) => matches(doc, where));

  const change = (doc: Doc, data: Doc) => {
    const { updatedAt, ...rest } = data;
    if (
      typeof rest.email === "string" &&
      found({ email: { equals: rest.email } }).some((other) => other !== doc)
    ) {
      throw taken();
    }
    Object.assign(doc, rest);
    // As the adapter has it: null leaves the date, nothing given moves it.
    if (updatedAt !== null) doc.updatedAt = new Date(now()).toISOString();
    return doc;
  };

  const db = {
    findOne: async ({ where }: { where?: Where }) => {
      const [doc] = found(where);
      return doc ? { ...doc } : null;
    },
    updateOne: async ({
      id,
      where,
      data,
      returning,
    }: {
      id?: string;
      where?: Where;
      data: Doc;
      returning?: boolean;
    }) => {
      const [doc] = found(id === undefined ? where : { id: { equals: id } });
      if (!doc) return null;
      // The adapter adds to what it is handed – so does this, to a copy.
      change(doc, { ...data });
      return returning === false ? null : { ...doc };
    },
    updateMany: async ({ where, data }: { where?: Where; data: Doc }) => {
      for (const doc of found(where)) change(doc, { ...data });
      return null;
    },
  };

  const payload = {
    db,
    logger: {
      info: () => undefined,
      warn: (warning: unknown) => {
        warnings.push(warning);
      },
    },
    // Only accounts are kept here – any other collection is empty.
    count: async ({
      collection,
      where,
    }: {
      collection: string;
      where?: Where;
    }) => ({
      totalDocs: collection === "accounts" ? found(where).length : 0,
    }),
    find: async ({
      collection,
      where,
      limit,
    }: {
      collection: string;
      where?: Where;
      limit?: number;
    }) => {
      const all = (collection === "accounts" ? found(where) : []).sort((a, b) =>
        String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))
      );
      return {
        docs: (limit ? all.slice(0, limit) : all).map((doc) => ({ ...doc })),
        totalDocs: all.length,
      };
    },
    findByID: async ({ id }: { id: string }) => {
      const doc = accounts.get(String(id));
      return doc ? { ...doc } : null;
    },
    delete: async ({ id }: { id: string }) => {
      accounts.delete(String(id));
      deleted.push(String(id));
      return {};
    },
    sendEmail: async (mail: { to: string; subject: string; html: string }) => {
      sent.push(mail);
    },
    /**
     * A login as Payload makes one: the password checked, a session noted
     * on the account, its id in the token. A wrong password throws.
     */
    login: async ({ data }: { data: { email: string; password: string } }) => {
      const [doc] = found({ email: { equals: data.email } });
      if (!doc || passwords.get(String(doc.id)) !== data.password) {
        throw Object.assign(new Error("Wrong."), { status: 401 });
      }
      const sid = `sid-${++sessions}`;
      doc.sessions = [...((doc.sessions as Doc[]) ?? []), { id: sid }];
      const claims = Buffer.from(
        JSON.stringify({ id: doc.id, collection: "accounts", sid })
      ).toString("base64url");
      return { user: { ...doc }, token: `head.${claims}.sign` };
    },
  };

  /** An account as the database holds it – confirmed, with a password. */
  const put = (doc: Doc & { id: string }, password = "geheim-123") => {
    accounts.set(doc.id, {
      name: "Anna",
      locale: "de",
      _verified: true,
      createdAt: "2026-01-05T12:00:00.000Z",
      updatedAt: "2026-10-01T08:00:00.000Z",
      ...doc,
    });
    passwords.set(doc.id, password);
  };

  return {
    accounts,
    sent,
    warnings,
    deleted,
    put,
    /** The account as it is kept right now. */
    get: (id: string) => accounts.get(id) ?? {},
    payload: payload as unknown as Payload,
  };
};
