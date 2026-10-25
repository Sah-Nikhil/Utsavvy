import { listMessages } from "@convex-dev/agent";
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetRollup } from "../components/items/budget/rollup";
import { DEMO_KEY } from "../seed/demo/meera-weds-rohan";
import { api, components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { seedInsert } from "./demo";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

/*
 * S19a: the demo Event's seed and reset (IMPLEMENTATION_PLAN.md sections 4.4,
 * 9.1 and 9.2). Expected values come from section 9.1 and from first-brief.md
 * worked example 1, not from the pricing code.
 */

// Every post-write hook runs through `afterWrite`; counting its calls is the
// test hook the issue asks for. The real hooks still run.
const hook = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./lib/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lib/hooks")>();
  return {
    ...original,
    afterWrite: async (...args: Parameters<typeof original.afterWrite>) => {
      hook.calls++;
      await original.afterWrite(...args);
    },
  };
});

const JUDGES = {
  owner: "user_demo_judge_owner",
  member: "user_demo_judge_member",
  viewer: "user_demo_judge_viewer",
};
const T0 = new Date("2026-10-26T06:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("DEMO_JUDGE_OWNER_ID", JUDGES.owner);
  vi.stubEnv("DEMO_JUDGE_MEMBER_ID", JUDGES.member);
  vi.stubEnv("DEMO_JUDGE_VIEWER_ID", JUDGES.viewer);
  hook.calls = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function setup() {
  const t = newTest();
  agentTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

async function demoEvent(t: T): Promise<Doc<"events">> {
  const event = await t.run((ctx) =>
    ctx.db
      .query("events")
      .withIndex("by_demoKey", (q) => q.eq("demoKey", DEMO_KEY))
      .unique(),
  );
  if (event === null) throw new Error("No demo Event");
  return event;
}

async function reset(t: T): Promise<Doc<"events">> {
  await t.mutation(internal.demo.reset, {});
  return await demoEvent(t);
}

/** Every Event-scoped table, read by `eventId`. */
const EVENT_TABLES = [
  "memberships",
  "inviteLinks",
  "viewPrefs",
  "emailInvites",
  "eventFunctions",
  "sections",
  "items",
  "entries",
  "comments",
  "highlights",
  "vendorLinks",
  "quotes",
  "chatAnnotations",
  "runs",
  "proposals",
  "nudges",
  "changes",
] as const;
type EventTable = (typeof EVENT_TABLES)[number];

async function rowsOf<K extends EventTable>(
  t: T,
  table: K,
  eventId: Id<"events">,
): Promise<Doc<K>[]> {
  return (await t.run(async (ctx) =>
    (await ctx.db.query(table).collect()).filter(
      (row) => (row as { eventId: Id<"events"> }).eventId === eventId,
    ),
  )) as Doc<K>[];
}

async function chatTexts(t: T, threadId: string) {
  return await t.run(async (ctx) => {
    const { page } = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { cursor: null, numItems: 100 },
    });
    return page
      .map((m) => ({ role: m.message?.role, text: m.text ?? "" }))
      .reverse();
  });
}

/**
 * The whole demo Event with every ID replaced by its order of first appearance,
 * and without `_id` and `_creationTime`, so two resets compare equal when they
 * built the same Event.
 */
async function snapshot(t: T) {
  const event = await demoEvent(t);
  const tables: Record<string, unknown[]> = {};
  for (const table of EVENT_TABLES) {
    tables[table] = await rowsOf(t, table, event._id);
  }
  const chat = await chatTexts(t, event.agentThreadId!);
  const ids = new Map<string, string>();
  // Convex IDs, and convex-test's own ("000000000000010021eventFunctions").
  const ID = /^(?:[a-z0-9]{31,32}|\d{12,}[A-Za-z_:]+)$/;
  const strip = (value: unknown): unknown => {
    if (typeof value === "string" && ID.test(value)) {
      if (!ids.has(value)) ids.set(value, `id#${ids.size}`);
      return ids.get(value);
    }
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([k]) => k !== "_id" && k !== "_creationTime")
          // Invite link tokens are secrets, new on every reset by design.
          .map(([k, v]) => [k, k === "token" ? "<token>" : strip(v)]),
      );
    }
    return value;
  };
  return strip({ event, tables, chat });
}

function membershipOf(
  rows: Doc<"memberships">[],
  name: string,
): Doc<"memberships"> {
  const found = rows.find((m) => m.displayName === name);
  if (!found) throw new Error(`No membership for ${name}`);
  return found;
}

describe("internal.demo.reset builds Meera weds Rohan (section 9.1)", () => {
  it("creates the demo Event once, found by its demoKey, with the Owner shown as Host", async () => {
    const t = setup();
    const event = await reset(t);
    expect(event.name).toBe("Meera weds Rohan");
    expect(event.ownerLabel).toBe("host");
    expect(event.eventType).toBe("wedding");
    expect(event.city?.name).toBe("Jaipur");
    expect(event.city?.tier).toBe("Y");
    expect(event.briefState).toBe("planned");
    expect(event.theme.styleWords).toEqual(["royal Rajputana"]);
    expect(event.theme.decorKeywords).toEqual(["marigold", "pastel pink"]);
    expect(event.theme.palette.length).toBeGreaterThanOrEqual(3);

    const again = await reset(t);
    expect(again._id).toBe(event._id);
    const all = await t.run((ctx) => ctx.db.query("events").collect());
    expect(all).toHaveLength(1);
  });

  it("gives judge-owner Owner (shown as Host), judge-member Member and judge-viewer Viewer, beside the seed personas", async () => {
    const t = setup();
    const event = await reset(t);
    const people = await rowsOf(t, "memberships", event._id);
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const roleOf = (clerkId: string) => {
      const user = users.find((u) => u.clerkId === clerkId)!;
      const m = people.find((p) => p.userId === user._id)!;
      return { role: m.role, status: m.status, blocked: m.blocked };
    };
    const active = { status: "active", blocked: false };
    expect(roleOf(JUDGES.owner)).toEqual({ role: "owner", ...active });
    expect(roleOf(JUDGES.member)).toEqual({ role: "member", ...active });
    expect(roleOf(JUDGES.viewer)).toEqual({ role: "viewer", ...active });
    expect(roleOf("seed:meera")).toEqual({ role: "coOwner", ...active });
    expect(roleOf("seed:rohan")).toEqual({ role: "member", ...active });
    expect(roleOf("seed:papa")).toEqual({ role: "viewer", ...active });
    expect(roleOf("seed:aditi")).toMatchObject({ status: "left" });
    expect(roleOf("seed:kabir")).toEqual({
      role: "member",
      status: "removed",
      blocked: true,
    });

    // judge-owner, signed in, finds it among their Events as its Owner.
    const mine = await t
      .withIdentity(identityFor(JUDGES.owner))
      .query(api.events.listMine, {});
    expect(mine).toEqual([
      expect.objectContaining({
        eventId: event._id,
        role: "owner",
        ownerLabel: "host",
        isDemo: true,
      }),
    ]);
  });

  it("gives the judges their roles again after they changed them", async () => {
    const t = setup();
    const event = await reset(t);
    await t.run(async (ctx) => {
      for (const m of await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect()) {
        await ctx.db.patch("memberships", m._id, {
          role: "viewer",
          status: "left",
        });
      }
    });
    await reset(t);
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const people = await rowsOf(t, "memberships", event._id);
    const judge = (clerkId: string) =>
      people.find(
        (p) => p.userId === users.find((u) => u.clerkId === clerkId)!._id,
      )!;
    expect(judge(JUDGES.owner).role).toBe("owner");
    expect(judge(JUDGES.member).role).toBe("member");
    expect(judge(JUDGES.viewer).role).toBe("viewer");
    expect(people.filter((p) => p.status === "active")).toHaveLength(6);
    // One users row per judge, linked again rather than duplicated.
    expect(users.filter((u) => u.clerkId === JUDGES.owner)).toHaveLength(1);
  });

  it("totals the Budget exactly ₹25,00,000, with the sangeet at 300 Guests and its catering line at ₹2,45,000", async () => {
    const t = setup();
    const event = await reset(t);
    const entries = (await rowsOf(t, "entries", event._id)).filter(
      (e): e is Extract<Doc<"entries">, { kind: "budget" }> =>
        e.kind === "budget" && e.deletedAt === null,
    );
    const rollup = budgetRollup(entries, event.budgetTotal);
    expect(event.budgetTotal).toBe(2_500_000);
    expect(rollup.total).toBe(2_500_000);
    expect(rollup.overBy).toBe(0);

    const functions = await rowsOf(t, "eventFunctions", event._id);
    const guests = Object.fromEntries(functions.map((f) => [f.key, f.guests]));
    expect(guests).toEqual({
      haldi: 60,
      mehendi: 120,
      sangeet: 300,
      wedding: 300,
      reception: 300,
    });

    const catering = entries.filter(
      (e) =>
        e.functionKey === "sangeet" && e.fields.category === "catering_main",
    );
    expect(catering).toHaveLength(1);
    expect(catering[0]!.fields.plannedAmount).toBe(245_000);
    expect(catering[0]!.fields.quantity).toBe(300);
    expect(catering[0]!.fields.editedByMember).toBe(true);

    // The WhatsApp Quote (₹950 × 300) as the line's amount puts it ₹40,000 over.
    const withQuote = entries.map((e) =>
      e._id === catering[0]!._id
        ? { ...e, fields: { ...e.fields, plannedAmount: 950 * 300 } }
        : e,
    );
    expect(budgetRollup(withQuote, event.budgetTotal).overBy).toBe(40_000);
  });

  it("prices the rest exactly as first-brief.md worked example 1, every Estimate on the reference table", async () => {
    const t = setup();
    const event = await reset(t);
    const entries = (await rowsOf(t, "entries", event._id)).filter(
      (e): e is Extract<Doc<"entries">, { kind: "budget" }> =>
        e.kind === "budget",
    );
    // "The wedding Function's Entries: catering ₹3,63,000 (₹1,210 per plate
    // × 300), Venue ₹1,01,000, decor ₹1,01,000, baraat band and ghodi
    // ₹40,000, pandit and puja items ₹14,000."
    const wedding = Object.fromEntries(
      entries
        .filter((e) => e.functionKey === "wedding")
        .map((e) => [e.fields.category, e.fields.estimate?.amount]),
    );
    expect(wedding).toEqual({
      catering_main: 363_000,
      venue_large: 101_000,
      decor_main: 101_000,
      baraat_band_ghodi: 40_000,
      pandit_puja: 14_000,
    });

    const lines = entries.filter((e) => e.fields.role === "line");
    expect(lines).toHaveLength(27);
    for (const e of lines) {
      expect(e.fields.estimate?.basis.kind).toBe("referenceTable");
      expect(e.fields.estimate?.basis.tableVersion).toBe("2026-10-22");
    }
    const items = await rowsOf(t, "items", event._id);
    const costed = items.flatMap((i) =>
      i.kind === "suggestion" && i.data.estimate ? [i.data.estimate] : [],
    );
    expect(costed.length).toBeGreaterThan(0);
    for (const estimate of costed)
      expect(estimate.basis.kind).toBe("referenceTable");

    const budget = items.find((i) => i.kind === "budget")!;
    expect(budget.kind === "budget" && budget.data.note).toContain(
      "Estimates sit near the low end",
    );
    expect(event.budgetCheck?.band).toBe("tight");
  });

  it("lays out the plan: run sheets, 14 checklist Entries, 7 Suggestions (two added, one dismissed), Inspirations and Aditi's Note", async () => {
    const t = setup();
    const event = await reset(t);
    const entries = await rowsOf(t, "entries", event._id);
    const items = await rowsOf(t, "items", event._id);

    expect(entries.filter((e) => e.kind === "checklist")).toHaveLength(14);
    const runSheet = (key: string) =>
      entries.filter(
        (e) =>
          e.kind === "timeline" &&
          e.functionKey === key &&
          e.fields.time !== null,
      );
    for (const key of ["haldi", "mehendi", "sangeet", "wedding", "reception"])
      expect(runSheet(key).length).toBeGreaterThanOrEqual(6);

    const suggestions = items.flatMap((i) =>
      i.kind === "suggestion" ? [i.data.status] : [],
    );
    expect(suggestions).toHaveLength(7);
    expect(suggestions.filter((s) => s === "added")).toHaveLength(2);
    expect(suggestions.filter((s) => s === "dismissed")).toHaveLength(1);

    const photos = items.flatMap((i) =>
      i.kind === "inspiration" && i.data.source.kind === "pexels"
        ? [i.data.source]
        : [],
    );
    expect(photos).toHaveLength(5);
    for (const photo of photos) {
      expect(photo.photographer).not.toBe("");
      expect(photo.pageUrl).toMatch(/^https:\/\/www\.pexels\.com\//);
    }
    const haldi = items.filter(
      (i) => i.kind === "inspiration" && i.functionKey === "haldi",
    );
    expect(haldi).toHaveLength(2);

    // Every Item has a starting size, so nothing draws at the fallback size.
    for (const item of items) expect(item.size).not.toBeNull();

    const people = await rowsOf(t, "memberships", event._id);
    const notes = items.filter((i) => i.kind === "note");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.createdBy).toEqual({
      kind: "member",
      membershipId: membershipOf(people, "Aditi")._id,
    });
  });

  it("shows the seeded history groups, the accepted Proposal and the Comment thread", async () => {
    const t = setup();
    const event = await reset(t);
    const { page } = await t
      .withIdentity(identityFor(JUDGES.member))
      .query(api.history.list, {
        eventId: event._id,
        paginationOpts: { cursor: null, numItems: 50 },
      });
    const titles = new Set(page.map((row) => row.groupTitle));
    expect(titles).toContain("Utsavvy for Meera: Plan the sangeet (8 changes)");
    expect(titles).toContain(
      "Utsavvy for Rohan, accepted by Meera (2 changes)",
    );

    const proposals = await rowsOf(t, "proposals", event._id);
    const people = await rowsOf(t, "memberships", event._id);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      status: "accepted",
      requestedBy: membershipOf(people, "Rohan")._id,
      decidedBy: membershipOf(people, "Meera")._id,
    });

    const comments = await rowsOf(t, "comments", event._id);
    const roots = comments.filter((c) => c.rootId === null);
    expect(roots.length).toBeGreaterThanOrEqual(1);
    const thread = comments.filter(
      (c) => c._id === roots[0]!._id || c.rootId === roots[0]!._id,
    );
    expect(thread).toHaveLength(2);

    // Aditi's Note is still hers, shown "(left)".
    const all = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", event._id))
        .collect(),
    );
    const aditi = membershipOf(people, "Aditi")._id;
    expect(
      all.some(
        (c) => c.actor.kind === "member" && c.actor.membershipId === aditi,
      ),
    ).toBe(true);
  });
});

describe("reset is repeatable", () => {
  it("gives the same Event twice in a row: totals, people, history groups and changes rows", async () => {
    const t = setup();
    await reset(t);
    const first = await snapshot(t);
    await reset(t);
    const second = await snapshot(t);
    expect(second).toEqual(first);
  });

  it("puts back what Members changed during the day", async () => {
    const t = setup();
    const event = await reset(t);
    const before = await snapshot(t);
    const member = t.withIdentity(identityFor(JUDGES.member));
    const items = await rowsOf(t, "items", event._id);
    const open = items.find(
      (i) => i.kind === "suggestion" && i.data.status === "open",
    )!;
    await member.mutation(api.suggestions.dismiss, { itemId: open._id });
    await member.mutation(api.chat.send, {
      eventId: event._id,
      text: "A note to ourselves",
      dontReply: true,
      pointing: [],
    });
    await reset(t);
    expect(await snapshot(t)).toEqual(before);
  });
});

describe("reset runs no post-write hook and schedules nothing", () => {
  it("calls the hook zero times, schedules nothing and leaves the Chat exactly as seeded", async () => {
    const t = setup();
    const event = await reset(t);
    await reset(t);
    expect(hook.calls).toBe(0);
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.filter((s) => s.state.kind === "pending")).toEqual([]);

    const annotations = await rowsOf(t, "chatAnnotations", event._id);
    expect(annotations.some((a) => a.card?.kind === "nudge")).toBe(false);
    expect(await rowsOf(t, "nudges", event._id)).toEqual([]);

    const chat = await chatTexts(t, (await demoEvent(t)).agentThreadId!);
    expect(chat.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
    expect(chat[0]!.text).toMatch(/^Plan the sangeet/);
    expect(chat[2]!.text).toContain("300 Guests");
    expect(annotations).toHaveLength(chat.length);

    // The hook is wired: a Member's own edit afterwards calls it.
    const items = await rowsOf(t, "items", event._id);
    const open = items.find(
      (i) => i.kind === "suggestion" && i.data.status === "open",
    )!;
    await t
      .withIdentity(identityFor(JUDGES.member))
      .mutation(api.suggestions.dismiss, { itemId: open._id });
    expect(hook.calls).toBe(1);
  });
});

describe("seedInsert", () => {
  async function demoAndOther(t: T) {
    const event = await reset(t);
    const other = await t.run((ctx) => insertEvent(ctx, "Another Event"));
    return { demoId: event._id, otherId: other };
  }

  const functionRow = (eventId: Id<"events">) => ({
    eventId,
    key: "haldi",
    name: "Haldi",
    date: null,
    guests: 10,
    assumed: [],
    order: 9,
    version: 1,
  });

  it("inserts a row of the demo Event directly", async () => {
    const t = setup();
    const { demoId } = await demoAndOther(t);
    const id = await t.run((ctx: MutationCtx) =>
      seedInsert(ctx, demoId, "eventFunctions", functionRow(demoId)),
    );
    expect(
      await t.run((ctx) => ctx.db.get("eventFunctions", id)),
    ).toMatchObject({ eventId: demoId, guests: 10 });
  });

  it("throws for a row whose eventId is another Event's", async () => {
    const t = setup();
    const { demoId, otherId } = await demoAndOther(t);
    await expect(
      t.run((ctx: MutationCtx) =>
        seedInsert(ctx, demoId, "eventFunctions", functionRow(otherId)),
      ),
    ).rejects.toThrow(/demo Event/);
    expect(await rowsOf(t, "eventFunctions", otherId)).toEqual([]);
  });

  it("throws when the Event it is given isn't the one found by the demoKey", async () => {
    const t = setup();
    const { otherId } = await demoAndOther(t);
    await expect(
      t.run((ctx: MutationCtx) =>
        seedInsert(ctx, otherId, "eventFunctions", functionRow(otherId)),
      ),
    ).rejects.toThrow(/demo Event/);
  });
});

describe("isolation: reset never touches other Events", () => {
  it("leaves another Event's people, Canvas, Chat and history exactly as they were", async () => {
    const t = setup();
    const { eventId: otherId } = await t.run((ctx) =>
      seedMembership(ctx, { clerkId: "user_someone_else", role: "owner" }),
    );
    await t.run(async (ctx) => {
      await seedMembership(ctx, {
        clerkId: JUDGES.member,
        role: "owner",
        eventId: otherId,
      });
    });
    // A judge's own Event, with real content in it.
    const owner = t.withIdentity(identityFor(JUDGES.owner));
    const ownId = await owner.mutation(api.events.create, {
      name: "Judge's own wedding",
      eventType: "wedding",
    });
    const read = async () => {
      const out: Record<string, unknown> = {};
      for (const id of [otherId, ownId]) {
        out[id] = {
          event: await t.run((ctx) => ctx.db.get("events", id)),
          ...Object.fromEntries(
            await Promise.all(
              EVENT_TABLES.map(async (table) => [
                table,
                await rowsOf(t, table, id),
              ]),
            ),
          ),
        };
      }
      return out;
    };
    const before = await read();
    await reset(t);
    await reset(t);
    expect(await read()).toEqual(before);
  });
});

describe("Vendors (S9): the starter set and the shortlist", () => {
  // Until S9 (#42) merges, `seedVendors` does nothing and these stay skipped.
  // After it merges: remove `.skip`, fill in `seedVendors`, and run them.
  it.skip("loads the starter set through internal.vendors.loadStarterSet, so the 16 starter Vendors exist", async () => {
    const t = setup();
    await reset(t);
    const vendors = await t.run((ctx) => ctx.db.query("vendors").collect());
    expect(vendors.filter((v) => v.source === "starterSet")).toHaveLength(16);
  });

  it.skip("shortlists 5 starter Vendors: two Venues (Considering, Contacted), a caterer (Contacted), a decorator (Quoted, one Quote), a photographer (Booked)", async () => {
    const t = setup();
    const event = await reset(t);
    const links = await rowsOf(t, "vendorLinks", event._id);
    const statuses = links.map((l) => l.status).sort();
    expect(statuses).toEqual(
      expect.arrayContaining([
        "booked",
        "considering",
        "contacted",
        "contacted",
        "quoted",
      ]),
    );
    expect(await rowsOf(t, "quotes", event._id)).toHaveLength(1);
    const comments = await rowsOf(t, "comments", event._id);
    expect(comments.map((c) => c.body)).toContain(
      "Is this hall big enough for our relatives from Kota?",
    );
  });

  it.skip("isolation: another Event's shortlist of a starter Vendor and a Marker a Member moved stay unchanged; no vendors or listedPrices row is rewritten", async () => {
    const t = setup();
    await reset(t);
    const vendorsBefore = await t.run((ctx) =>
      ctx.db.query("vendors").collect(),
    );
    const pricesBefore = await t.run((ctx) =>
      ctx.db.query("listedPrices").collect(),
    );
    // Another Event shortlists the first starter Vendor and a Member moves its Marker.
    const { eventId: otherId } = await t.run((ctx) =>
      seedMembership(ctx, { clerkId: "user_other_owner", role: "owner" }),
    );
    const moved = vendorsBefore[0]!;
    await t.run((ctx) =>
      ctx.db.patch("vendors", moved._id, {
        marker: { ...moved.marker!, lat: moved.marker!.lat + 0.01 },
        version: moved.version + 1,
      }),
    );
    const otherLinks = await rowsOf(t, "vendorLinks", otherId);
    await reset(t);
    const after = await t.run((ctx) => ctx.db.get("vendors", moved._id));
    expect(after!.marker!.lat).toBe(moved.marker!.lat + 0.01);
    expect(await rowsOf(t, "vendorLinks", otherId)).toEqual(otherLinks);
    const vendorsAfter = await t.run((ctx) =>
      ctx.db.query("vendors").collect(),
    );
    expect(vendorsAfter).toHaveLength(vendorsBefore.length);
    expect(
      await t.run((ctx) => ctx.db.query("listedPrices").collect()),
    ).toEqual(pricesBefore);
  });

  it.skip("only inserts a starter Vendor that is missing", async () => {
    const t = setup();
    await reset(t);
    const vendors = await t.run((ctx) => ctx.db.query("vendors").collect());
    await t.run((ctx) => ctx.db.delete("vendors", vendors[0]!._id));
    await reset(t);
    const again = await t.run((ctx) => ctx.db.query("vendors").collect());
    expect(again).toHaveLength(vendors.length);
    for (const v of vendors.slice(1))
      expect(again.find((a) => a._id === v._id)).toEqual(v);
  });
});

describe("api.demo.isDemo, for the banner", () => {
  it("is true on the demo Event and false on any other Event", async () => {
    const t = setup();
    const event = await reset(t);
    const viewer = t.withIdentity(identityFor(JUDGES.viewer));
    expect(await viewer.query(api.demo.isDemo, { eventId: event._id })).toBe(
      true,
    );
    const ownId = await viewer.mutation(api.events.create, {
      name: "Not the demo",
      eventType: "birthday",
    });
    expect(await viewer.query(api.demo.isDemo, { eventId: ownId })).toBe(false);
  });

  it("is false for someone outside the Event and for an ID that isn't one", async () => {
    const t = setup();
    const event = await reset(t);
    const stranger = t.withIdentity(identityFor("user_stranger"));
    await stranger.mutation(api.users.ensureMe, {});
    expect(await stranger.query(api.demo.isDemo, { eventId: event._id })).toBe(
      false,
    );
    expect(
      await stranger.query(api.demo.isDemo, { eventId: "not-an-id" }),
    ).toBe(false);
  });
});
