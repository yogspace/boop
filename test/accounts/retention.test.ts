import { describe, expect, it } from "vitest";
import {
  deleteFrom,
  INACTIVE_MONTHS,
  type InactivityPorts,
  inactivityStep,
  type Kept,
  keptForGood,
  maybeInactiveBefore,
  notKeptForGood,
  RUN_LIMIT,
  type SeenPatch,
  seenPatch,
  tendInactive,
  UNVERIFIED_DAYS,
  unverifiedDue,
  WARNING_DAYS,
  warnFrom,
} from "../../src/features/accounts/retention";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-12T06:00:00.000Z");
const iso = (time: number) => new Date(time).toISOString();
/** So many months ago, same day and time. */
const monthsAgo = (months: number, from = NOW) => {
  const date = new Date(from);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.getTime();
};

describe("the deadlines", () => {
  it("are 30 days unconfirmed, 24 months unused, 30 days of warning", () => {
    expect(UNVERIFIED_DAYS).toBe(30);
    expect(INACTIVE_MONTHS).toBe(24);
    expect(WARNING_DAYS).toBe(30);
    expect(RUN_LIMIT).toBe(50);
  });

  it("warn 30 days before the 24 months are full", () => {
    const seen = Date.parse("2024-03-15T12:00:00.000Z");
    expect(iso(deleteFrom(seen))).toBe("2026-03-15T12:00:00.000Z");
    expect(deleteFrom(seen) - warnFrom(seen)).toBe(WARNING_DAYS * DAY);
  });
});

describe("a sign-up never confirmed", () => {
  it("goes after 30 days – not a moment before", () => {
    const made = (days: number) => ({
      _verified: false,
      createdAt: iso(NOW - days * DAY),
    });
    expect(unverifiedDue(made(29), NOW)).toBe(false);
    expect(unverifiedDue(made(30), NOW)).toBe(true);
    expect(unverifiedDue(made(400), NOW)).toBe(true);
  });

  it("stays when confirmed – or when anything is unclear", () => {
    const old = iso(NOW - 90 * DAY);
    expect(unverifiedDue({ _verified: true, createdAt: old }, NOW)).toBe(false);
    expect(unverifiedDue({ createdAt: old }, NOW)).toBe(false);
    expect(unverifiedDue({ _verified: null, createdAt: old }, NOW)).toBe(false);
    expect(unverifiedDue({ _verified: false }, NOW)).toBe(false);
    expect(unverifiedDue({ _verified: false, createdAt: "?" }, NOW)).toBe(
      false
    );
  });
});

describe("an account marked “never delete”", () => {
  const old = iso(NOW - 400 * DAY);

  it("is one whose box is ticked – nothing else counts as that", () => {
    expect(keptForGood({ neverDelete: true })).toBe(true);
    for (const not of [undefined, null, false, "true", 1, {}]) {
      expect(keptForGood({ neverDelete: not }), String(not)).toBe(false);
    }
    // The cleanup's query asks the same: all but the ticked ones.
    expect(notKeptForGood).toEqual({ neverDelete: { not_equals: true } });
  });

  it("stays, never confirmed or not – however old the sign-up", () => {
    const signUp = { _verified: false, createdAt: old };
    expect(unverifiedDue(signUp, NOW)).toBe(true);
    expect(unverifiedDue({ ...signUp, neverDelete: true }, NOW)).toBe(false);
    // Unticked again, the rule is back.
    expect(unverifiedDue({ ...signUp, neverDelete: false }, NOW)).toBe(true);
  });

  it("is nothing for the cleanup to do – no note, no warning, no deletion", () => {
    const long = iso(monthsAgo(60));
    const cases: Kept[] = [
      // Never noted when it was there.
      {},
      // Away for five years, not warned.
      { lastSeenAt: long },
      // Warned long ago, and away since.
      { lastSeenAt: long, deletionWarnedAt: iso(NOW - 90 * DAY) },
      // Warned, but there again.
      { lastSeenAt: iso(NOW - DAY), deletionWarnedAt: iso(NOW - 20 * DAY) },
    ];
    expect(cases.map((account) => inactivityStep(account, NOW))).toEqual([
      "note",
      "warn",
      "delete",
      "reset",
    ]);
    for (const account of cases) {
      expect(inactivityStep({ ...account, neverDelete: true }, NOW)).toBeNull();
    }
  });
});

describe("being there", () => {
  it("is noted at once on an account without the note", () => {
    expect(seenPatch({}, NOW)).toEqual({
      lastSeenAt: iso(NOW),
      deletionWarnedAt: null,
    });
  });

  it("is noted once a day at most", () => {
    expect(seenPatch({ lastSeenAt: iso(NOW - 3_600_000) }, NOW)).toBeNull();
    expect(seenPatch({ lastSeenAt: iso(NOW - DAY) }, NOW)).toEqual({
      lastSeenAt: iso(NOW),
      deletionWarnedAt: null,
    });
  });

  it("takes a warning back at once, however fresh the note", () => {
    expect(
      seenPatch(
        { lastSeenAt: iso(NOW - 60_000), deletionWarnedAt: iso(NOW - DAY) },
        NOW
      )
    ).toEqual({ lastSeenAt: iso(NOW), deletionWarnedAt: null });
  });
});

describe("what the cleanup does with an account", () => {
  const seen = (months: number, days = 0) =>
    iso(monthsAgo(months) - days * DAY);

  it("notes one without `lastSeenAt` as there today – never warns or deletes it", () => {
    expect(inactivityStep({}, NOW)).toBe("note");
    expect(inactivityStep({ createdAt: iso(monthsAgo(60)) }, NOW)).toBe("note");
    // Even with a warning on it, somehow: noted, the warning gone.
    expect(inactivityStep({ deletionWarnedAt: iso(monthsAgo(2)) }, NOW)).toBe(
      "note"
    );
  });

  it("leaves one alone that was there lately", () => {
    expect(inactivityStep({ lastSeenAt: iso(NOW - DAY) }, NOW)).toBeNull();
    expect(inactivityStep({ lastSeenAt: seen(22) }, NOW)).toBeNull();
  });

  it("warns 30 days before the 24 months are full", () => {
    // Last there 24 months less 31 days ago: not yet; less 30: now.
    const lastSeen = (daysShort: number) => {
      const date = new Date(NOW + daysShort * DAY);
      date.setUTCMonth(date.getUTCMonth() - INACTIVE_MONTHS);
      return iso(date.getTime());
    };
    expect(inactivityStep({ lastSeenAt: lastSeen(31) }, NOW)).toBeNull();
    expect(inactivityStep({ lastSeenAt: lastSeen(30) }, NOW)).toBe("warn");
    expect(inactivityStep({ lastSeenAt: seen(30) }, NOW)).toBe("warn");
  });

  it("deletes only one warned that stayed away for the full 30 days", () => {
    const lastSeenAt = seen(25);
    const warned = (daysAgo: number) => ({
      lastSeenAt,
      deletionWarnedAt: iso(NOW - daysAgo * DAY),
    });
    expect(inactivityStep(warned(29), NOW)).toBeNull();
    expect(inactivityStep(warned(30), NOW)).toBe("delete");
    expect(inactivityStep(warned(90), NOW)).toBe("delete");
  });

  it("never deletes one that wasn't warned – however long it was away", () => {
    expect(inactivityStep({ lastSeenAt: seen(60) }, NOW)).toBe("warn");
  });

  it("keeps the 24 months even with an early warning", () => {
    // Warned (somehow) 40 days ago, but last there only 23 months ago.
    const early = {
      lastSeenAt: seen(23),
      deletionWarnedAt: iso(NOW - 40 * DAY),
    };
    expect(inactivityStep(early, NOW)).toBeNull();
  });

  it("takes the warning back once it was there again", () => {
    const back = {
      lastSeenAt: iso(NOW - 5 * DAY),
      deletionWarnedAt: iso(NOW - 20 * DAY),
    };
    expect(inactivityStep(back, NOW)).toBe("reset");
    // Even long after the 30 days: there since the warning – it stays.
    expect(
      inactivityStep(
        {
          lastSeenAt: iso(NOW - 5 * DAY),
          deletionWarnedAt: iso(NOW - 90 * DAY),
        },
        NOW
      )
    ).toBe("reset");
  });

  it("looks at every account the rules may warn", () => {
    const before = maybeInactiveBefore(NOW).getTime();
    for (let days = 0; days < 1200; days += 1) {
      const lastSeenAt = iso(NOW - days * DAY);
      if (inactivityStep({ lastSeenAt }, NOW) === "warn") {
        expect(Date.parse(lastSeenAt)).toBeLessThanOrEqual(before);
      }
    }
  });
});

/** Accounts in memory and a mail service that works – or doesn't. */
const world = (
  accounts: (Kept & { id: string })[],
  { mail = true }: { mail?: boolean | ((id: string) => boolean) } = {}
) => {
  const store = new Map(accounts.map((a) => [a.id, { ...a }]));
  const sent: string[] = [];
  const removed: string[] = [];
  const ports: InactivityPorts<Kept & { id: string }> = {
    read: async (account) => store.get(account.id) ?? null,
    write: async (account, patch: SeenPatch) => {
      const doc = store.get(account.id);
      if (doc) Object.assign(doc, patch);
    },
    warn: async (account) => {
      const ok = typeof mail === "function" ? mail(account.id) : mail;
      if (ok) sent.push(account.id);
      return ok;
    },
    remove: async (account) => {
      store.delete(account.id);
      removed.push(account.id);
    },
  };
  return { store, sent, removed, ports };
};

describe("a cleanup run", () => {
  const away = iso(monthsAgo(25));

  it("notes the accounts from before – nobody warned, nobody deleted", async () => {
    const { store, sent, removed, ports } = world([
      { id: "a" },
      { id: "b", createdAt: iso(monthsAgo(48)) },
    ]);
    const tally = await tendInactive([...store.values()], ports, { now: NOW });
    expect(tally).toMatchObject({ noted: 2, warned: 0, deleted: 0 });
    expect(sent).toEqual([]);
    expect(removed).toEqual([]);
    expect(store.get("b")?.lastSeenAt).toBe(iso(NOW));
  });

  it("warns by mail – and notes the warning only once the mail is out", async () => {
    const { store, sent, ports } = world([{ id: "a", lastSeenAt: away }]);
    const tally = await tendInactive([...store.values()], ports, { now: NOW });
    expect(tally).toMatchObject({ warned: 1, mailFailed: 0 });
    expect(sent).toEqual(["a"]);
    expect(store.get("a")?.deletionWarnedAt).toBe(iso(NOW));
  });

  it("doesn't count a warning whose mail failed – and so never deletes", async () => {
    const { store, sent, removed, ports } = world(
      [{ id: "a", lastSeenAt: away }],
      { mail: false }
    );
    let now = NOW;
    // Day after day, for months: the mail never goes out.
    for (let day = 0; day < 120; day++, now += DAY) {
      const tally = await tendInactive([...store.values()], ports, { now });
      expect(tally.mailFailed).toBe(1);
    }
    expect(sent).toEqual([]);
    expect(removed).toEqual([]);
    expect(store.get("a")?.deletionWarnedAt).toBeUndefined();
  });

  it("deletes 30 days after the mail – unless it was there again", async () => {
    const { store, removed, ports } = world([
      { id: "gone", lastSeenAt: away },
      { id: "back", lastSeenAt: away },
    ]);
    await tendInactive([...store.values()], ports, { now: NOW });
    // “back” logs in two weeks later (session.ts / seen.ts).
    const back = store.get("back");
    if (back) Object.assign(back, seenPatch(back, NOW + 14 * DAY));
    // 29 days on: nothing yet.
    let tally = await tendInactive([...store.values()], ports, {
      now: NOW + 29 * DAY,
    });
    expect(tally.deleted).toBe(0);
    // 30 days on: the one that stayed away goes.
    tally = await tendInactive([...store.values()], ports, {
      now: NOW + 30 * DAY,
    });
    expect(removed).toEqual(["gone"]);
    expect(store.get("back")?.deletionWarnedAt).toBeNull();
  });

  it("takes a warning back on its own if the note came without it", async () => {
    const { store, ports } = world([
      {
        id: "a",
        lastSeenAt: iso(NOW - DAY),
        deletionWarnedAt: iso(NOW - 10 * DAY),
      },
    ]);
    const tally = await tendInactive([...store.values()], ports, { now: NOW });
    expect(tally.reset).toBe(1);
    expect(store.get("a")?.deletionWarnedAt).toBeNull();
  });

  it("looks once more before it deletes – there meanwhile, it stays", async () => {
    const warned = {
      id: "a",
      lastSeenAt: away,
      deletionWarnedAt: iso(NOW - 31 * DAY),
    };
    const { store, removed, ports } = world([warned]);
    // The list was read before; the account logged in since.
    const stale = [{ ...warned }];
    const doc = store.get("a");
    if (doc) Object.assign(doc, seenPatch(doc, NOW));
    const tally = await tendInactive(stale, ports, { now: NOW });
    expect(tally.deleted).toBe(0);
    expect(removed).toEqual([]);
  });

  it("passes by the ones marked “never delete” – dry or not", async () => {
    const accounts = [
      { id: "kept-new", neverDelete: true },
      { id: "kept-away", lastSeenAt: away, neverDelete: true },
      {
        id: "kept-warned",
        lastSeenAt: away,
        deletionWarnedAt: iso(NOW - 40 * DAY),
        neverDelete: true,
      },
      { id: "gone", lastSeenAt: away, deletionWarnedAt: iso(NOW - 40 * DAY) },
    ];
    const none = {
      noted: 0,
      reset: 0,
      warned: 0,
      mailFailed: 0,
      left: 0,
      failed: 0,
    };
    for (const dry of [true, false]) {
      const { store, sent, removed, ports } = world(accounts);
      const tally = await tendInactive([...store.values()], ports, {
        now: NOW,
        dry,
      });
      // Only the one without the mark is counted – and, for real, goes.
      expect(tally).toEqual({ ...none, deleted: 1 });
      expect(sent).toEqual([]);
      expect(removed).toEqual(dry ? [] : ["gone"]);
      for (const kept of accounts.slice(0, 3)) {
        expect(store.get(kept.id)).toEqual(kept);
      }
    }
  });

  it("keeps one that was marked between the look and the deletion", async () => {
    const warned = {
      id: "a",
      lastSeenAt: away,
      deletionWarnedAt: iso(NOW - 31 * DAY),
    };
    const { store, removed, ports } = world([warned]);
    // The list was read before; an admin ticked the box since.
    const stale = [{ ...warned }];
    const doc = store.get("a");
    if (doc) doc.neverDelete = true;
    const tally = await tendInactive(stale, ports, { now: NOW });
    expect(tally.deleted).toBe(0);
    expect(removed).toEqual([]);
  });

  it("warns and deletes at most RUN_LIMIT a run – the rest next time", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `w${i}`,
      lastSeenAt: away,
    }));
    const { store, sent, ports } = world(many);
    const tally = await tendInactive([...store.values()], ports, {
      now: NOW,
      limit: 50,
    });
    expect(tally).toMatchObject({ warned: 50, left: 10 });
    expect(sent).toHaveLength(50);
    const next = await tendInactive([...store.values()], ports, {
      now: NOW + DAY,
      limit: 50,
    });
    expect(next.warned).toBe(10);
  });

  it("counts failed mails against the limit too", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `w${i}`,
      lastSeenAt: away,
    }));
    const { store, ports } = world(many, { mail: false });
    const tally = await tendInactive([...store.values()], ports, {
      now: NOW,
      limit: 3,
    });
    expect(tally).toMatchObject({ mailFailed: 3, left: 2 });
  });

  it("goes on past an account that fails", async () => {
    const { store, sent, ports } = world(
      [
        { id: "bad", lastSeenAt: away },
        { id: "ok", lastSeenAt: away },
      ],
      {
        mail: (id) => {
          if (id === "bad") throw new Error("Resend is down");
          return true;
        },
      }
    );
    const tally = await tendInactive([...store.values()], ports, { now: NOW });
    expect(tally).toMatchObject({ failed: 1, warned: 1 });
    expect(sent).toEqual(["ok"]);
    expect(store.get("bad")?.deletionWarnedAt).toBeUndefined();
  });

  it("changes nothing when dry", async () => {
    const accounts = [
      { id: "new" },
      { id: "warn", lastSeenAt: away },
      { id: "del", lastSeenAt: away, deletionWarnedAt: iso(NOW - 40 * DAY) },
    ];
    const { store, sent, removed, ports } = world(accounts);
    const tally = await tendInactive([...store.values()], ports, {
      now: NOW,
      dry: true,
    });
    expect(tally).toMatchObject({ noted: 1, warned: 1, deleted: 1 });
    expect(sent).toEqual([]);
    expect(removed).toEqual([]);
    expect([...store.values()]).toEqual(accounts);
  });
});
