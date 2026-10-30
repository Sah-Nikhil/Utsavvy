import { listMessages } from "@convex-dev/agent";
import agentTest from "@convex-dev/agent/test";
import presenceTest from "@convex-dev/presence/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetRollup } from "../components/items/budget/rollup";
import {
  DEMO_KEY,
  DEMO_QUOTE_PASTE,
  HALDI_PHOTOS_LABEL,
} from "../seed/demo/meera-weds-rohan";
import { api, components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { MAX_ROWS, seedInsert } from "./demo";
import { quoteChoiceKey } from "./quotes";
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
  vi.restoreAllMocks();
});

function setup() {
  const t = newTest();
  agentTest.register(t);
  presenceTest.register(t);
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
      .map((m) => ({
        messageId: m._id,
        role: m.message?.role,
        text: m.text ?? "",
      }))
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

describe("reset clears a pasted Quote's answered-Function rows", () => {
  it("deletes this Event's quoteChoice rows and leaves another Event's", async () => {
    const t = setup();
    const event = await reset(t);
    const other = await t.run((ctx) => insertEvent(ctx, "Another Event"));
    const [mine, theirs] = await t.run(async (ctx) => {
      const row = (eventId: Id<"events">) =>
        ctx.db.insert("toolCalls", {
          key: quoteChoiceKey(eventId, "msg_paste", "link_1", ["wedding"]),
          result: "proposal_1",
          at: Date.now(),
        });
      return [await row(event._id), await row(other)];
    });
    await reset(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.get("toolCalls", mine)).toBeNull();
      expect(await ctx.db.get("toolCalls", theirs)).not.toBeNull();
    });
  });
});

describe("reset runs no post-write hook and schedules no app work", () => {
  it("calls the hook zero times, schedules no app function and leaves the Chat exactly as seeded", async () => {
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
    // Member messages and the Proposal card carry an annotation; a plain
    // reply has none, like a real model reply.
    const annotated = new Set(annotations.map((a) => a.messageId));
    expect(chat.map((m) => annotated.has(m.messageId))).toEqual([
      true,
      false,
      true,
      true,
      true,
    ]);
    expect(
      annotations.find((a) => a.messageId === chat[3]!.messageId)?.card,
    ).toMatchObject({ kind: "proposal" });

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

describe("clearing stored files (uploads and Quote screenshots)", () => {
  async function anyMembership(t: T, eventId: Id<"events">) {
    return (await rowsOf(t, "memberships", eventId))[0]!;
  }

  /** An uploaded photo in the demo Event, as S13 stores it. */
  async function upload(
    t: T,
    eventId: Id<"events">,
    opts: { claimed: boolean; fileGone: boolean },
  ): Promise<Id<"_storage">> {
    const membership = await anyMembership(t, eventId);
    const sections = await rowsOf(t, "sections", eventId);
    const home = sections.find((s) => s.kind === "inspirations")!;
    return await t.run(async (ctx) => {
      const fileId = await ctx.storage.store(new Blob(["photo"]));
      const itemId = await ctx.db.insert("items", {
        eventId,
        sectionId: home._id,
        kind: "inspiration",
        position: { x: 0, y: 2000 },
        size: { w: 300, h: 400 },
        functionKey: null,
        createdBy: { kind: "member", membershipId: membership._id },
        version: 1,
        deletedAt: null,
        data: {
          source: {
            kind: "upload",
            fileId,
            fromReference: null,
            remixRightsTicked: false,
          },
          addedBy: membership._id,
          memberNote: null,
          seen: null,
        },
      });
      if (opts.claimed)
        await ctx.db.insert("uploadClaims", {
          fileId,
          eventId,
          itemId,
          membershipId: membership._id,
          claimedAt: 0,
        });
      if (opts.fileGone) await ctx.storage.delete(fileId);
      return fileId;
    });
  }

  const stored = (t: T, fileId: Id<"_storage">) =>
    t.run(
      async (ctx) => (await ctx.db.system.get("_storage", fileId)) !== null,
    );

  it("deletes an uploaded photo's file when this Item claimed it", async () => {
    const t = setup();
    const event = await reset(t);
    const fileId = await upload(t, event._id, {
      claimed: true,
      fileGone: false,
    });
    await reset(t);
    expect(await stored(t, fileId)).toBe(false);
  });

  it("resets anyway when the claimed file is already gone", async () => {
    const t = setup();
    const event = await reset(t);
    await upload(t, event._id, { claimed: true, fileGone: true });
    await expect(reset(t)).resolves.toMatchObject({ _id: event._id });
  });

  it("leaves a file that no claim of this Item covers", async () => {
    const t = setup();
    const event = await reset(t);
    const fileId = await upload(t, event._id, {
      claimed: false,
      fileGone: false,
    });
    await reset(t);
    expect(await stored(t, fileId)).toBe(true);
  });

  it("deletes a Quote's stored screenshot, and skips one already gone", async () => {
    const t = setup();
    const event = await reset(t);
    const membership = await anyMembership(t, event._id);
    const items = await rowsOf(t, "items", event._id);
    const entries = await rowsOf(t, "entries", event._id);
    const { kept, gone } = await t.run(async (ctx) => {
      const linkId = await ctx.db.insert("vendorLinks", {
        eventId: event._id,
        shortlistItemId: items[0]!._id,
        checklistEntryId: entries.find((e) => e.kind === "checklist")!._id,
        status: "quoted",
        version: 1,
      });
      const quote = async (fileId: Id<"_storage">) =>
        await ctx.db.insert("quotes", {
          eventId: event._id,
          linkId,
          amount: 285_000,
          unit: "total",
          functionKeys: ["sangeet"],
          guests: 300,
          receivedAt: null,
          note: null,
          fileId,
          source: "chatPaste",
          createdBy: { kind: "member", membershipId: membership._id },
          createdAt: 0,
          version: 1,
        });
      const kept = await ctx.storage.store(new Blob(["screenshot"]));
      const gone = await ctx.storage.store(new Blob(["screenshot"]));
      await quote(kept);
      await quote(gone);
      await ctx.storage.delete(gone);
      return { kept, gone };
    });
    await reset(t);
    expect(await stored(t, kept)).toBe(false);
    expect(await stored(t, gone)).toBe(false);
    // Only the seed's own Quote (the decorator's, with no file) is left.
    const quotes = await rowsOf(t, "quotes", event._id);
    expect(quotes.map((q) => [q.amount, q.fileId])).toEqual([[480_000, null]]);
  });
});

describe("reset size", () => {
  it("refuses to reset, writing nothing, when a table holds as many rows as one reset reads", async () => {
    const t = setup();
    const event = await reset(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_ROWS; i++)
        await ctx.db.insert("nudges", {
          eventId: event._id,
          trigger: "dueSoon",
          targetId: `entry-${i}`,
          dayIst: "2026-10-26",
          messageId: null,
        });
    });
    await expect(reset(t)).rejects.toThrow(/nudges/);
    expect(await rowsOf(t, "nudges", event._id)).toHaveLength(MAX_ROWS);
  });

  it("logs how many rows it deleted and inserted", async () => {
    const t = setup();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await reset(t);
    await reset(t);
    expect(log).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Demo reset: deleted \d+ rows, inserted \d+ rows/),
    );
    const [deleted, inserted] = (log.mock.lastCall![0] as string)
      .match(/\d+/g)!
      .map(Number);
    expect(deleted).toBeGreaterThan(200);
    expect(inserted).toBeGreaterThan(200);
  });
});

describe("judges' settings", () => {
  it("names the judges judge-owner, judge-member and judge-viewer, whatever their Clerk name", async () => {
    const t = setup();
    await reset(t);
    await t.run(async (ctx) => {
      const user = (await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", JUDGES.member))
        .unique())!;
      await ctx.db.patch("users", user._id, { name: "Priya Sharma" });
    });
    const event = await reset(t);
    const names = (await rowsOf(t, "memberships", event._id)).map(
      (m) => m.displayName,
    );
    expect(names).toEqual(
      expect.arrayContaining(["judge-owner", "judge-member", "judge-viewer"]),
    );
    expect(names).not.toContain("Priya Sharma");
  });

  it("fails loudly on a cloud deployment without DEMO_JUDGE_OWNER_ID", async () => {
    const t = setup();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://example-cloud-123.convex.cloud");
    vi.stubEnv("DEMO_JUDGE_OWNER_ID", "");
    await expect(t.mutation(internal.demo.reset, {})).rejects.toThrow(
      /DEMO_JUDGE_OWNER_ID/,
    );
  });

  it("warns and leaves a judge out on a local deployment", async () => {
    const t = setup();
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("DEMO_JUDGE_OWNER_ID", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = await reset(t);
    const roles = (await rowsOf(t, "memberships", event._id)).map(
      (m) => m.role,
    );
    expect(roles).not.toContain("owner");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("DEMO_JUDGE_OWNER_ID"),
    );
  });

  it("warns and leaves judge-viewer out on a cloud deployment, which still has its Owner", async () => {
    const t = setup();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://example-cloud-123.convex.cloud");
    vi.stubEnv("DEMO_JUDGE_VIEWER_ID", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = await reset(t);
    const people = await rowsOf(t, "memberships", event._id);
    expect(people.map((m) => m.displayName)).not.toContain("judge-viewer");
    expect(people.map((m) => m.role)).toContain("owner");
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
  /** Every row of a shared table, for "nothing rewritten or added". */
  const all = <K extends "vendors" | "listedPrices">(t: T, table: K) =>
    t.run((ctx) => ctx.db.query(table).collect()) as Promise<Doc<K>[]>;

  it("loads the starter set through internal.vendors.loadStarterSet, so the 16 starter Vendors exist", async () => {
    const t = setup();
    await reset(t);
    const vendors = await all(t, "vendors");
    expect(vendors).toHaveLength(16);
    expect(vendors.every((v) => v.source === "starterSet")).toBe(true);
    expect((await all(t, "listedPrices")).length).toBeGreaterThan(0);
  });

  it("shortlists 5 starter Vendors: two Venues (Considering, Contacted), a caterer (Contacted), a decorator (Quoted, one Quote), a photographer (Booked)", async () => {
    const t = setup();
    const event = await reset(t);
    const vendors = await all(t, "vendors");
    const items = (await rowsOf(t, "items", event._id)).filter(
      (item) => item.kind === "shortlistedVendor",
    );
    const entries = await rowsOf(t, "entries", event._id);
    const links = await rowsOf(t, "vendorLinks", event._id);

    // One Shortlisted Vendor Item per Vendor, each with one link; the picks
    // are the first Venues, caterer, decorator and photographer in
    // seed/jaipur-vendors.json.
    const shortlist = items.map((item) => {
      if (item.kind !== "shortlistedVendor") throw new Error("not a Vendor");
      const vendor = vendors.find((v) => v._id === item.data.vendorId)!;
      const itemLinks = links.filter((l) => l.shortlistItemId === item._id);
      expect(itemLinks).toHaveLength(1);
      const link = itemLinks[0]!;
      const entry = entries.find((e) => e._id === link.checklistEntryId)!;
      if (entry.kind !== "checklist") throw new Error("not a checklist Entry");
      return { vendor, item, link, entry };
    });
    expect(shortlist).toHaveLength(5);
    expect(links).toHaveLength(5);
    expect(
      shortlist.map(({ vendor, link }) => [vendor.domain, link.status]),
    ).toEqual(
      expect.arrayContaining([
        ["umaidhaveli.com", "considering"],
        ["roodmahal.com", "contacted"],
        ["mlcaterers.com", "contacted"],
        ["jmdeventsandflowers.com", "quoted"],
        ["candidlifephotography.in", "booked"],
      ]),
    );

    // Each link goes to the checklist Entry for its Vendor's category: the
    // Venues to the wedding's and the sangeet's, the caterer to the one that
    // serves the sangeet and the wedding.
    for (const { vendor, entry } of shortlist) {
      expect(entry.fields.vendorCategory).toBe(vendor.category);
      expect(entry.deletedAt).toBeNull();
    }
    const byDomain = new Map(shortlist.map((s) => [s.vendor.domain, s]));
    expect(byDomain.get("umaidhaveli.com")!.entry.fields.functionKeys).toEqual([
      "wedding",
    ]);
    expect(byDomain.get("roodmahal.com")!.entry.fields.functionKeys).toEqual([
      "sangeet",
    ]);
    expect(byDomain.get("mlcaterers.com")!.entry.fields.functionKeys).toEqual(
      expect.arrayContaining(["sangeet", "wedding"]),
    );

    // Booked ticks the photographer's Timeline deadline, as S9's booking does.
    const photographer = byDomain.get("candidlifephotography.in")!.entry;
    const deadline = entries.find(
      (e) => e._id === photographer.fields.bookByEntryId,
    );
    expect(deadline?.kind).toBe("timeline");
    expect(deadline?.kind === "timeline" && deadline.fields.done).toBe(true);

    // One Quote, on the decorator's link.
    const quotes = await rowsOf(t, "quotes", event._id);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]!.linkId).toBe(
      byDomain.get("jmdeventsandflowers.com")!.link._id,
    );
    expect(quotes[0]!.fileId).toBeNull();

    // Papa's Comment on the first Venue's card.
    const people = await rowsOf(t, "memberships", event._id);
    const comments = await rowsOf(t, "comments", event._id);
    const papas = comments.filter(
      (c) => c.body === "Is this hall big enough for our relatives from Kota?",
    );
    expect(papas).toHaveLength(1);
    const venueItem = byDomain.get("umaidhaveli.com")!.item._id;
    expect(papas[0]).toMatchObject({
      itemId: venueItem,
      target: { kind: "item", itemId: venueItem },
      rootId: null,
      author: {
        kind: "member",
        membershipId: membershipOf(people, "Papa")._id,
      },
    });
  });

  it("isolation: another Event's shortlist of a starter Vendor and a Marker a Member moved stay unchanged; no vendors or listedPrices row is rewritten", async () => {
    const t = setup();
    await reset(t);

    // Another Event, whose own Member shortlists Rood Mahal (a starter Vendor
    // the demo shortlists too) and drags its approximate Marker a few km,
    // both through the public mutations.
    const other = t.withIdentity(identityFor("user_other_host"));
    const otherId = await other.mutation(api.events.create, {
      name: "Another wedding",
      eventType: "wedding",
    });
    const rood = (await all(t, "vendors")).find(
      (v) => v.domain === "roodmahal.com",
    )!;
    expect(rood.marker?.approximate).toBe(true);
    await other.mutation(api.vendors.shortlist, {
      eventId: otherId,
      vendorId: rood._id,
      checklistEntryId: null,
    });
    const moved = { lat: rood.marker!.lat + 0.02, lng: rood.marker!.lng };
    await other.mutation(api.map.moveMarker, {
      eventId: otherId,
      vendorId: rood._id,
      ...moved,
    });

    const read = async () => ({
      links: await rowsOf(t, "vendorLinks", otherId),
      items: await rowsOf(t, "items", otherId),
      changes: await rowsOf(t, "changes", otherId),
      vendors: await all(t, "vendors"),
      listedPrices: await all(t, "listedPrices"),
    });
    const before = await read();
    expect(before.links).toHaveLength(1);
    expect(
      before.items.filter((i) => i.kind === "shortlistedVendor"),
    ).toHaveLength(1);
    expect(before.changes.some((c) => c.table === "vendors")).toBe(true);

    await reset(t);
    await reset(t);

    const after = await read();
    expect(after).toEqual(before);
    const roodAfter = after.vendors.find((v) => v._id === rood._id)!;
    expect(roodAfter.marker).toMatchObject({ ...moved, approximate: false });
  });

  it("only inserts a starter Vendor that is missing", async () => {
    const t = setup();
    await reset(t);
    const vendors = await all(t, "vendors");
    // A Vendor the demo doesn't shortlist, so no demo link points at it.
    const gone = vendors.find((v) => v.domain === "sapphireinnjaipur.com")!;
    await t.run((ctx) => ctx.db.delete("vendors", gone._id));
    await reset(t);
    const again = await all(t, "vendors");
    expect(again).toHaveLength(vendors.length);
    for (const v of vendors.filter((v) => v._id !== gone._id))
      expect(again.find((a) => a._id === v._id)).toEqual(v);
    expect(again.some((a) => a.domain === gone.domain)).toBe(true);
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

describe("presence after a reset (S19b)", () => {
  it("keeps the Canvas open for whoever was in the room before the reset", async () => {
    const t = setup();
    const event = await reset(t);
    const member = t.withIdentity(identityFor(JUDGES.member));
    const heartbeat = (sessionId: string) =>
      member.mutation(api.canvas.heartbeat, {
        roomId: event._id,
        userId: "ignored",
        sessionId,
        interval: 10_000,
      });
    await heartbeat("open-tab");

    // The reset gives judge-member a new membership; the room must not still
    // list the old one, or the Canvas's presence query refuses everyone, and
    // a tab left open must be able to heartbeat as the new membership.
    await reset(t);
    await heartbeat("open-tab");
    const { roomToken } = await heartbeat("after-a-reload");
    const rows = await member.query(api.canvas.list, { roomToken });
    const membership = (await rowsOf(t, "memberships", event._id)).find(
      (m) => m.displayName === "judge-member",
    )!;
    expect(rows.map((r) => r.userId)).toEqual([membership._id]);
  });
});

describe("the 0:50 WhatsApp Quote (S19b)", () => {
  it("names the sangeet, so its Quote is for the sangeet alone", async () => {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    const t = setup();
    const event = await reset(t);
    await t
      .withIdentity(identityFor(JUDGES.member))
      .mutation(api.users.ensureMe, {});
    const result = await t.action(internal.quotes.pasteForLocalCheck, {
      eventId: event._id,
      email: `${JUDGES.member}@example.com`,
      text: DEMO_QUOTE_PASTE,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const open = (await rowsOf(t, "proposals", event._id)).filter(
      (p) => p.status === "open",
    );
    expect(open).toHaveLength(1);
    expect(open[0]!.changes[0]!.values).toMatchObject({
      amount: 950,
      unit: "per_plate",
      guests: 300,
      functionKeys: ["sangeet"],
      note: "live counters extra",
    });
  });
});

describe("afterResetForLocalCheck (S19b)", () => {
  const LATER = 60 * 60 * 1000;

  it("counts only the demo Event's pending Nudge checks, past any number of other scheduled calls", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    const t = setup();
    const event = await reset(t);
    const otherId = await t
      .withIdentity(identityFor(JUDGES.viewer))
      .mutation(api.events.create, {
        name: "Not the demo",
        eventType: "birthday",
      });
    await t.run(async (ctx) => {
      await ctx.scheduler.runAfter(LATER, internal.nudges.check, {
        eventId: otherId,
      });
    });
    const check = () => t.action(internal.demo.afterResetForLocalCheck, {});
    expect((await check()).pendingNudgeChecks).toBe(0);

    // One for the demo Event, then more than a page of others after it.
    await t.run(async (ctx) => {
      await ctx.scheduler.runAfter(LATER, internal.nudges.check, {
        eventId: event._id,
      });
      for (let i = 0; i < 600; i++)
        await ctx.scheduler.runAfter(LATER, internal.nudges.check, {
          eventId: otherId,
        });
    });
    expect((await check()).pendingNudgeChecks).toBe(1);
  });
});

describe("Rohan's haldi photos in the history (S19b)", () => {
  it("are one group with its label", async () => {
    const t = setup();
    const event = await reset(t);
    const member = t.withIdentity(identityFor(JUDGES.member));
    const titles: (string | null)[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: {
        page: { groupTitle: string | null }[];
        isDone: boolean;
        continueCursor: string;
      } = await member.query(api.history.list, {
        eventId: event._id,
        paginationOpts: { cursor, numItems: 50 },
      });
      titles.push(...page.page.map((row) => row.groupTitle));
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(
      titles.filter((title) => title?.includes(HALDI_PHOTOS_LABEL)),
    ).toEqual([
      `Rohan: ${HALDI_PHOTOS_LABEL} (2 changes)`,
      `Rohan: ${HALDI_PHOTOS_LABEL} (2 changes)`,
    ]);
  });

  it("bring no new-photo Nudge after a reset, because their history dates them days back", async () => {
    const t = setup();
    const event = await reset(t);
    // A Nudge check runs as any later write would trigger it. The photos'
    // rows were written today, but their creation changes say four days ago.
    await t.mutation(internal.nudges.check, { eventId: event._id });
    const nudges = await rowsOf(t, "nudges", event._id);
    expect(nudges.filter((n) => n.trigger === "newInspiration")).toEqual([]);
  });
});
