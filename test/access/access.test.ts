import type {
  CollectionConfig,
  Config,
  Field,
  GlobalConfig,
  PayloadRequest,
} from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Who may do what – for every collection and global of the real config, as
 * written (src/access). The CMS runs Boop; it doesn't read what people made:
 * their calendars, stamps, prints, notes, cards, invitations and
 * notification devices are closed to admins too – readable in support mode alone, and
 * written by nobody over the API. Accounts: the admin looks them up, deletes
 * and unlocks them and ticks two boxes – nothing else, a password least of
 * all (“accounts in the admin”, below).
 *
 * Every collection and global must be in the tables below, with its access
 * set by itself: Payload's default (“any logged-in user”) would let every
 * account in. A new one without a rule fails here at once.
 */

// The app's paths (@/…), which the tests don't resolve – each by its file.
// Every file goes through one door, by either name: a module asked for again
// while it is still loading (an import cycle, as between invites.ts and
// session.ts) gets a live view of itself, filled in once it is there – as
// ESM does it; waiting for it would wait forever.
const sources = import.meta.glob(["../../src/**/*.ts", "../../src/**/*.tsx"]);
for (const file of Object.keys(sources)) {
  let module: Record<PropertyKey, unknown> | undefined;
  let loading = false;
  const live = new Proxy(
    {},
    {
      get: (_, key) => (key === "then" ? undefined : module?.[key]),
      has: (_, key) => !module || key in module,
    }
  );
  const door = async () => {
    if (module) return module;
    if (loading) return live;
    loading = true;
    module = await vi.importActual<Record<PropertyKey, unknown>>(file);
    return module;
  };
  const alias = file.replace("../../src/", "@/").replace(/\.tsx?$/, "");
  vi.doMock(file, door);
  vi.doMock(alias, door);
  if (alias.endsWith("/index")) vi.doMock(alias.slice(0, -6), door);
}
// Only read at a request – never while the config is put together.
vi.doMock("@payload-config", () => ({ default: {} }));
// The config as written: Payload would fill in its defaults – exactly what
// this test is here to catch.
vi.doMock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  buildConfig: (config: Config) => config,
}));

// Typed as built (a promise) – here it is the object as written.
const config = (
  (await import("../../src/payload.config")) as unknown as { default: Config }
).default;

type Role = "anonymous" | "account" | "admin";
type Who = "nobody" | "anyone" | "visitors" | "admin" | "support";
type Op = "read" | "create" | "update" | "delete" | "unlock" | "admin";

const USERS: Record<Role, PayloadRequest["user"]> = {
  anonymous: null,
  account: { id: "acc-1", collection: "accounts" } as never,
  admin: { id: "admin-1", collection: "users" } as never,
};

/** Whether `who` lets a role in – with support mode on or off. */
const lets = (who: Who, role: Role, support: boolean) => {
  switch (who) {
    case "nobody":
      return false;
    case "anyone":
      return true;
    case "visitors":
      return role !== "admin";
    case "admin":
      return role === "admin";
    case "support":
      return role === "admin" && support;
  }
};

/** What people made: closed – an admin reads it in support mode only. */
const CONTENT = {
  read: "support",
  create: "nobody",
  update: "nobody",
  delete: "nobody",
} as const;

const COLLECTIONS: Record<string, Partial<Record<Op, Who>>> = {
  users: {
    admin: "admin",
    read: "admin",
    create: "admin",
    update: "admin",
    delete: "admin",
    unlock: "admin",
  },
  // Read, delete and unlock – and an update for the two boxes alone: no new
  // name, address or password (see “accounts in the admin”), and no account
  // made in the admin. The app goes through session.ts.
  accounts: {
    admin: "nobody",
    read: "admin",
    create: "visitors",
    update: "admin",
    delete: "admin",
    unlock: "admin",
  },
  calendars: CONTENT,
  stamps: CONTENT,
  placements: CONTENT,
  notes: CONTENT,
  // One's own color and start view for a calendar.
  "calendar-prefs": CONTENT,
  invites: CONTENT,
  // A card's id is its link – but what it shows is anyone's with the link,
  // and nothing an admin wouldn't see of the stamp in support mode anyway.
  cards: CONTENT,
  "push-subscriptions": CONTENT,
  "push-settings": CONTENT,
  // Feed addresses are keys – closed in support mode too.
  "calendar-feeds": {
    read: "nobody",
    create: "nobody",
    update: "nobody",
    delete: "nobody",
  },
  // Anonymous statistics – written by the server's routes alone.
  "page-views": {
    read: "admin",
    create: "nobody",
    update: "nobody",
    delete: "admin",
  },
  actions: {
    read: "admin",
    create: "nobody",
    update: "nobody",
    delete: "admin",
  },
  // Boop's gifts – the owner's own content, nobody's data.
  gifts: {
    read: "admin",
    create: "admin",
    update: "admin",
    delete: "admin",
  },
  // The stamp shapes and drawing templates – the owner's too. The pages get
  // them through the server's own reading (site/get-site.ts), not over REST.
  "stamp-shapes": {
    read: "admin",
    create: "admin",
    update: "admin",
    delete: "admin",
  },
  "drawing-templates": {
    read: "admin",
    create: "admin",
    update: "admin",
    delete: "admin",
  },
};

const GLOBALS: Record<string, Partial<Record<"read" | "update", Who>>> = {
  site: { read: "anyone", update: "admin" },
  legal: { read: "anyone", update: "admin" },
  translations: { read: "anyone", update: "admin" },
  analytics: { read: "admin", update: "admin" },
};

const collections = (config.collections ?? []) as CollectionConfig[];
const globals = (config.globals ?? []) as GlobalConfig[];
const contentSlugs = Object.entries(COLLECTIONS)
  .filter(([, rules]) => rules === CONTENT)
  .map(([slug]) => slug);

type AccessFn = (args: { req: PayloadRequest }) => unknown;

const ask = async (fn: unknown, role: Role) =>
  (fn as AccessFn)({ req: { user: USERS[role] } as PayloadRequest });

const support = (on: boolean) => {
  if (on) vi.stubEnv("ADMIN_SUPPORT", "1");
  else vi.stubEnv("ADMIN_SUPPORT", "");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("every collection and global", () => {
  it("has its rules here – and every rule its collection", () => {
    const slugs = collections.map((c) => c.slug);
    const globalSlugs = globals.map((g) => g.slug);
    expect(slugs.filter((slug) => !COLLECTIONS[slug])).toEqual([]);
    expect(globalSlugs.filter((slug) => !GLOBALS[slug])).toEqual([]);
    // Also: the config as written was read, not an empty one.
    expect(Object.keys(COLLECTIONS).filter((s) => !slugs.includes(s))).toEqual(
      []
    );
    expect(
      Object.keys(GLOBALS).filter((s) => !globalSlugs.includes(s))
    ).toEqual([]);
  });

  it.each(collections.map((c) => [c.slug, c] as const))(
    "%s sets its access itself",
    (_, collection) => {
      const ops: Op[] = ["read", "create", "update", "delete"];
      if (collection.auth) ops.push("unlock", "admin");
      for (const op of ops) {
        expect(typeof collection.access?.[op], op).toBe("function");
      }
      if (collection.versions) {
        expect(typeof collection.access?.readVersions).toBe("function");
      }
    }
  );

  it.each(globals.map((g) => [g.slug, g] as const))(
    "global %s sets its access itself",
    (_, global) => {
      for (const op of ["read", "update"] as const) {
        expect(typeof global.access?.[op], op).toBe("function");
      }
      if (global.versions) {
        expect(typeof global.access?.readVersions).toBe("function");
      }
    }
  );
});

describe.each([false, true])("support mode %s", (on) => {
  it.each(collections.map((c) => [c.slug, c] as const))(
    "%s lets in whom it should",
    async (slug, collection) => {
      support(on);
      for (const [op, who] of Object.entries(COLLECTIONS[slug] ?? {})) {
        for (const role of Object.keys(USERS) as Role[]) {
          const answer = await ask(collection.access?.[op as Op], role);
          expect(answer, `${op} for ${role}`).toBe(lets(who, role, on));
        }
      }
    }
  );

  it.each(globals.map((g) => [g.slug, g] as const))(
    "global %s lets in whom it should",
    async (slug, global) => {
      support(on);
      for (const [op, who] of Object.entries(GLOBALS[slug] ?? {})) {
        for (const role of Object.keys(USERS) as Role[]) {
          const answer = await ask(global.access?.[op as "read"], role);
          expect(answer, `${op} for ${role}`).toBe(lets(who, role, on));
        }
      }
    }
  );

  it("shows people's content in the admin only then", () => {
    support(on);
    const hidden = (collection?: CollectionConfig) => {
      const value = collection?.admin?.hidden;
      return typeof value === "function"
        ? value({ user: USERS.admin as never })
        : value === true;
    };
    const bySlug = (slug: string) => collections.find((c) => c.slug === slug);
    for (const slug of contentSlugs) {
      expect(hidden(bySlug(slug)), slug).toBe(!on);
    }
    expect(hidden(bySlug("accounts"))).toBe(false);
    expect(hidden(bySlug("users"))).toBe(false);
  });
});

/**
 * What an admin may change of an account: the boxes “Admin” and “Never
 * delete”, and nothing else – asked of the collection's own hooks and
 * fields, the way Payload runs them (accounts/collection.ts). With a new
 * password, address or confirmation an admin could log in as that person
 * and read what is sealed above.
 */
describe.each([false, true])(
  "accounts in the admin – support mode %s",
  (on) => {
    const accounts = collections.find(
      (c) => c.slug === "accounts"
    ) as CollectionConfig;
    const BOXES = ["admin", "neverDelete"];

    /** An account as it is kept – what a change is made on. */
    const KEPT = {
      id: "acc-1",
      name: "Anna",
      email: "anna@example.com",
      locale: "de",
      _verified: true,
      admin: false,
      neverDelete: false,
      deletionWarnedAt: "2026-10-01T06:00:00.000Z",
    };

    /** All an admin might try to slip in beside a box. */
    const SMUGGLED = {
      id: "acc-2",
      name: "Hacked",
      email: "evil@example.com",
      locale: "en",
      _verified: false,
      _verificationToken: null,
      loginAttempts: 0,
      lockUntil: null,
      hash: "a-hash",
      salt: "a-salt",
      resetPasswordToken: "known",
      resetPasswordExpiration: "2030-01-01T00:00:00.000Z",
      sessions: [],
      pendingEmail: "evil@example.com",
      pendingEmailToken: "known",
      pendingEmailExpiresAt: "2030-01-01T00:00:00.000Z",
      lastSeenAt: "2020-01-01T00:00:00.000Z",
      deletionWarnedAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      "confirm-password": "ein-neues-1",
    };

    const request = (user: PayloadRequest["user"]) =>
      ({ user, headers: new Headers(), context: {} }) as PayloadRequest;

    /**
     * A change's data as Payload takes it up – after the collection's
     * `beforeOperation` hooks, each handing its result to the next. This is
     * where Payload reads a new password from.
     */
    const takenUp = async (
      role: Role,
      data: Record<string, unknown>,
      operation = "update"
    ) => {
      let args = { data } as { data: Record<string, unknown> };
      for (const hook of accounts.hooks?.beforeOperation ?? []) {
        const result = await hook({
          args,
          operation,
          collection: accounts,
          context: {},
          req: request(USERS[role]),
        } as never);
        if (result !== undefined) args = result as typeof args;
      }
      return args.data;
    };

    /** … and as it is written – after the `beforeChange` hooks. */
    const written = async (
      user: PayloadRequest["user"],
      data: Record<string, unknown>,
      operation: "create" | "update" = "update"
    ) => {
      let next = data;
      for (const hook of accounts.hooks?.beforeChange ?? []) {
        next =
          ((await hook({
            data: next,
            operation,
            originalDoc: KEPT,
            collection: accounts,
            context: {},
            req: request(user),
          } as never)) as Record<string, unknown>) ?? next;
      }
      return next;
    };

    /** An admin's change, all the way: taken up, then written. */
    const byAdmin = async (data: Record<string, unknown>) =>
      written(USERS.admin, await takenUp("admin", data));

    it("lets an admin tick the two boxes – and untick them", async () => {
      support(on);
      expect(await byAdmin({ admin: true, neverDelete: true })).toEqual({
        admin: true,
        neverDelete: true,
        // “Never delete” takes a standing warning back with it.
        deletionWarnedAt: null,
      });
      expect(await byAdmin({ admin: false, neverDelete: false })).toEqual({
        admin: false,
        neverDelete: false,
      });
      expect(await byAdmin({ admin: true })).toEqual({ admin: true });
    });

    it("drops everything else an admin sends along – name, address, the lot", async () => {
      support(on);
      expect(
        await takenUp("admin", { ...SMUGGLED, neverDelete: true })
      ).toEqual({
        neverDelete: true,
      });
      expect(await byAdmin(SMUGGLED)).toEqual({});
      // A box is a box: anything but true or false is no tick.
      expect(await byAdmin({ admin: "true", neverDelete: 1 })).toEqual({});
      expect(
        await byAdmin({ admin: null, neverDelete: { $ne: false } })
      ).toEqual({});
    });

    it("refuses an admin's new password – before Payload reads it", async () => {
      support(on);
      for (const data of [
        { password: "ein-neues-1" },
        { password: "ein-neues-1", admin: true },
        { ...SMUGGLED, password: "x" },
      ]) {
        await expect(takenUp("admin", data)).rejects.toMatchObject({
          status: 403,
        });
      }
      // What the admin's page sends without a new one changes nothing.
      expect(await takenUp("admin", { password: "", admin: true })).toEqual({
        admin: true,
      });
      expect(await takenUp("admin", { password: null })).toEqual({});
    });

    it("holds the same for many accounts at once – one hook for every update", () => {
      // Payload runs `beforeOperation` for an update by id and by query alike
      // (both arrive as “update”), and nothing here asks which.
      expect(accounts.hooks?.beforeOperation).toHaveLength(2);
      expect(accounts.hooks?.beforeChange).toHaveLength(1);
    });

    it("never lets an account tick its own boxes – whichever way the change comes", async () => {
      support(on);
      const mine = { admin: true, neverDelete: true, name: "Anna B." };
      // Over the API it isn't let in at all (the table above). The app's own
      // endpoints write with full access and no user – or, were the account
      // itself the request's user:
      for (const user of [USERS.anonymous, USERS.account]) {
        expect(await written(user, mine)).toEqual({ name: "Anna B." });
      }
      // An account whose box is ticked is no admin for that.
      const ticked = {
        ...USERS.account,
        admin: true,
      } as PayloadRequest["user"];
      expect(await written(ticked, mine)).toEqual({ name: "Anna B." });
    });

    it("starts every sign-up unticked and unconfirmed – whatever it says", async () => {
      support(on);
      const signUp = {
        name: "Anna",
        email: "anna@example.com",
        admin: true,
        neverDelete: true,
        _verified: true,
      };
      for (const user of [USERS.anonymous, USERS.account, USERS.admin]) {
        expect(await written(user, signUp, "create")).toEqual({
          name: "Anna",
          email: "anna@example.com",
          admin: false,
          neverDelete: false,
          _verified: false,
        });
      }
    });

    it("closes every field for a change but the boxes – and those to admins alone", async () => {
      support(on);
      const named = accounts.fields.filter(
        (field): field is Field & { name: string } => "name" in field
      );
      // The login's own are named too, to be closed: address and password.
      expect(named.map((field) => field.name)).toEqual(
        expect.arrayContaining([
          "name",
          "locale",
          "email",
          "password",
          ...BOXES,
        ])
      );
      for (const field of named) {
        const { update, create } = ((field as { access?: unknown }).access ??
          {}) as Record<string, unknown>;
        expect(typeof update, field.name).toBe("function");
        for (const role of Object.keys(USERS) as Role[]) {
          expect(await ask(update, role), `${field.name} for ${role}`).toBe(
            BOXES.includes(field.name) && role === "admin"
          );
        }
        // Never set at sign-up: the boxes.
        if (BOXES.includes(field.name)) {
          for (const role of Object.keys(USERS) as Role[]) {
            expect(await ask(create, role), `${field.name} for ${role}`).toBe(
              false
            );
          }
        }
      }
    });

    it("gives no rights with the “Admin” box – nothing here looks at it", async () => {
      support(on);
      const ticked = { ...USERS.account, admin: true, neverDelete: true };
      const as = (fn: unknown, user: unknown) =>
        (fn as AccessFn)({ req: { user } as PayloadRequest });
      for (const collection of collections) {
        for (const [op, fn] of Object.entries(collection.access ?? {})) {
          expect(await as(fn, ticked), `${collection.slug}.${op}`).toBe(
            await as(fn, USERS.account)
          );
        }
      }
      for (const global of globals) {
        for (const [op, fn] of Object.entries(global.access ?? {})) {
          expect(await as(fn, ticked), `${global.slug}.${op}`).toBe(
            await as(fn, USERS.account)
          );
        }
      }
      // And no way into the CMS: that is for `users`.
      const users = collections.find((c) => c.slug === "users");
      expect(await as(users?.access?.admin, ticked)).toBe(false);
      expect(await as(accounts.access?.admin, ticked)).toBe(false);
    });
  }
);

describe("secrets", () => {
  const field = (slug: string, name: string) =>
    collections
      .find((c) => c.slug === slug)
      ?.fields.find((f: Field) => "name" in f && f.name === name);

  it.each([
    ["accounts", "pendingEmailToken"],
    ["invites", "token"],
    ["push-subscriptions", "keys"],
    ["push-subscriptions", "session"],
  ])(
    "%s.%s is never read over the API – support mode neither",
    async (slug, name) => {
      support(true);
      const read = (field(slug, name) as { access?: { read?: unknown } })
        ?.access?.read;
      expect(typeof read).toBe("function");
      expect(await ask(read, "admin")).toBe(false);
    }
  );

  it("GraphQL stays off", () => {
    expect(config.graphQL?.disable).toBe(true);
  });
});
