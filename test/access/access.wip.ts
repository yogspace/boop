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
 * their calendars, stamps, prints, notes, invitations and notification
 * devices are closed to admins too – readable in support mode alone, and
 * written by nobody over the API. Accounts: the admin looks them up, deletes
 * and unlocks them, nothing else.
 *
 * Every collection and global must be in the tables below, with its access
 * set by itself: Payload's default (“any logged-in user”) would let every
 * account in. A new one without a rule fails here at once.
 */

// The app's paths (@/…), which the tests don't resolve – each by its file.
// A module asked for again while it is still loading (an import cycle, as
// between invites.ts and session.ts) gets a live view of it, filled in once
// it is there – what ESM itself does; waiting for it would wait forever.
const sources = import.meta.glob(["../../src/**/*.ts", "../../src/**/*.tsx"]);
for (const [file, load] of Object.entries(sources)) {
  let module: Record<PropertyKey, unknown> | undefined;
  let loading = false;
  const live = new Proxy(
    {},
    {
      get: (_, key) => (key === "then" ? undefined : module?.[key]),
      has: (_, key) => !module || key in module,
    }
  );
  const factory = async () => {
    if (module) return module;
    if (loading) return live;
    loading = true;
    module = (await load()) as Record<PropertyKey, unknown>;
    return module;
  };
  const path = file.replace("../../src/", "@/").replace(/\.tsx?$/, "");
  vi.doMock(path, factory);
  if (path.endsWith("/index")) vi.doMock(path.slice(0, -6), factory);
}
// Only read at a request – never while the config is put together.
vi.doMock("@payload-config", () => ({ default: {} }));
// The config as written: Payload would fill in its defaults – exactly what
// this test is here to catch.
vi.doMock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  buildConfig: (config: Config) => config,
}));

const config = ((await import("../../src/payload.config")) as { default: Config })
  .default;

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
  // Read, delete and unlock – no new name, address or password, and no
  // account made in the admin. The app goes through session.ts.
  accounts: {
    admin: "nobody",
    read: "admin",
    create: "visitors",
    update: "nobody",
    delete: "admin",
    unlock: "admin",
  },
  calendars: CONTENT,
  stamps: CONTENT,
  placements: CONTENT,
  notes: CONTENT,
  invites: CONTENT,
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
  it("has its rules here", () => {
    expect(
      collections.map((c) => c.slug).filter((slug) => !COLLECTIONS[slug])
    ).toEqual([]);
    expect(
      globals.map((g) => g.slug).filter((slug) => !GLOBALS[slug])
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

describe("secrets", () => {
  const field = (slug: string, name: string) =>
    collections
      .find((c) => c.slug === slug)
      ?.fields.find((f: Field) => "name" in f && f.name === name);

  it.each([
    ["invites", "token"],
    ["push-subscriptions", "keys"],
    ["push-subscriptions", "session"],
  ])("%s.%s is never read over the API – support mode neither", async (slug, name) => {
    support(true);
    const read = (field(slug, name) as { access?: { read?: unknown } })?.access
      ?.read;
    expect(typeof read).toBe("function");
    expect(await ask(read, "admin")).toBe(false);
  });

  it("GraphQL stays off", () => {
    expect(config.graphQL?.disable).toBe(true);
  });
});
