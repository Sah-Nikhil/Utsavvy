/// <reference types="vite/client" />
import { createThread, saveMessage } from "@convex-dev/agent";
import agentTest from "@convex-dev/agent/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { referenceTableBasis } from "../lib/pricing";
import type { EntryFields } from "../lib/types/canvas";
import { api, components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { ToolResult } from "./assistant/tools/core";
import { runProposeQuote } from "./assistant/tools/quotes";
import type { AssistantToolCtx } from "./assistant/agent";
import { createStartingSections } from "./canvas";
import { stubCalls } from "./lib/models";
import { istDay } from "./lib/time";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

// S12 (issue #45) seams: Quotes on a Shortlisted Vendor's checklist links, a
// pasted WhatsApp Quote as a Proposal, and the Budget comparison. The worked
// example is docs/design/vendors.md, "A Quote pasted from WhatsApp": "Veg
// 950/plate for 300 pax, live counters extra" from the caterer is a ₹950 per
// plate Quote for 300 Guests at the sangeet, ₹2.85L.

type Name = "Meera" | "Rohan" | "Papa" | "Outsider";

const PASTE = "Veg 950/plate for 300 pax, live counters extra";

/** The sangeet catering line: 300 plates, Estimate ₹3L to ₹6L. */
function catering(quantity: number): EntryFields<"budget"> {
  return {
    label: "Catering",
    category: "catering_main",
    quantity,
    unit: "per_plate",
    estimate: {
      low: 300_000,
      high: 600_000,
      amount: 360_000,
      label: "Estimate",
      basis: referenceTableBasis({
        unit: "per_plate",
        unitLow: 1_000,
        unitHigh: 2_000,
        tier: "Y",
      }),
    },
    plannedAmount: null,
    role: "line",
    belowUsualRange: false,
    editedByMember: false,
  };
}

/**
 * The Jaipur wedding: a 300-Guest sangeet and a 400-Guest wedding, a catering
 * line for each, a caterer checklist Entry for the sangeet that pays for the
 * sangeet line, and its Timeline deadline. Meera owns, Rohan plans, Papa views;
 * the Outsider is in another Event.
 */
async function seedWedding(ctx: MutationCtx) {
  const eventId = await insertEvent(ctx, "Meera weds Rohan");
  await ctx.db.patch("events", eventId, {
    city: { name: "Jaipur", tier: "Y", centre: null },
    budgetTotal: 1_200_000,
    briefState: "planned",
  });
  const people = {} as Record<Name, Id<"memberships">>;
  for (const name of ["Meera", "Rohan", "Papa"] as const) {
    const { membershipId } = await seedMembership(ctx, {
      clerkId: name,
      eventId,
      role: name === "Papa" ? "viewer" : name === "Meera" ? "owner" : "member",
    });
    people[name] = membershipId;
  }
  people.Outsider = (
    await seedMembership(ctx, { clerkId: "Outsider", role: "owner" })
  ).membershipId;
  for (const [order, fn] of [
    { key: "sangeet", name: "Sangeet", guests: 300 },
    { key: "wedding", name: "Wedding", guests: 400 },
  ].entries()) {
    await ctx.db.insert("eventFunctions", {
      eventId,
      ...fn,
      date: null,
      assumed: [],
      order,
      version: 1,
    });
  }
  const actor = { kind: "member" as const, membershipId: people.Meera };
  const sections = await createStartingSections(ctx, eventId, actor);
  const planItem = (kind: "budget" | "timeline" | "checklist", y: number) =>
    ctx.db.insert("items", {
      eventId,
      sectionId: sections.money,
      kind,
      position: { x: 0, y },
      size: null,
      functionKey: null,
      data: { note: null },
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  const budget = await planItem("budget", 0);
  const timeline = await planItem("timeline", 600);
  const checklist = await planItem("checklist", 1200);
  const budgetLine = (
    order: number,
    functionKey: string,
    fields: EntryFields<"budget">,
  ) =>
    ctx.db.insert("entries", {
      eventId,
      itemId: budget,
      kind: "budget",
      order,
      functionKey,
      fields,
      assumed: [],
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  const sangeetCatering = await budgetLine(0, "sangeet", catering(300));
  const weddingCatering = await budgetLine(1, "wedding", catering(400));
  const deadline = await ctx.db.insert("entries", {
    eventId,
    itemId: timeline,
    kind: "timeline",
    order: 0,
    functionKey: "sangeet",
    fields: {
      title: "Book the caterer",
      date: "2026-12-01",
      time: null,
      leadKey: "book_caterer",
      priority: null,
      late: false,
      note: null,
      vendorCategory: "caterer",
      done: false,
    },
    assumed: [],
    createdBy: actor,
    version: 1,
    deletedAt: null,
  });
  const caterer = await ctx.db.insert("entries", {
    eventId,
    itemId: checklist,
    kind: "checklist",
    order: 0,
    functionKey: null,
    fields: {
      vendorCategory: "caterer",
      freeLabel: null,
      functionKeys: ["sangeet"],
      bookByEntryId: deadline,
      budgetEntryIds: [sangeetCatering],
    },
    assumed: [],
    createdBy: actor,
    version: 1,
    deletedAt: null,
  });
  return {
    eventId,
    people,
    budget,
    checklist,
    caterer,
    deadline,
    sangeetCatering,
    weddingCatering,
  };
}

async function setUp() {
  const t = newTest();
  agentTest.register(t);
  await t.mutation(internal.vendors.loadStarterSet, {});
  const w = await t.run(seedWedding);
  const as = (name: Name) => t.withIdentity(identityFor(name));
  const vinayak = await t.run(async (ctx) =>
    ctx.db
      .query("vendors")
      .withIndex("by_domain", (q) => q.eq("domain", "vinayakfoodsncatering.in"))
      .unique(),
  );
  const { linkId, itemId } = await as("Meera").mutation(api.vendors.shortlist, {
    eventId: w.eventId,
    vendorId: vinayak!._id,
    checklistEntryId: w.caterer,
  });
  return { t, ...w, as, linkId, itemId, vendor: vinayak! };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

const linkOf = (s: Setup) =>
  s.t.run(async (ctx) => (await ctx.db.get("vendorLinks", s.linkId))!);
const quotesOf = (s: Setup) =>
  s.t.run((ctx) =>
    ctx.db
      .query("quotes")
      .withIndex("by_link", (q) => q.eq("linkId", s.linkId))
      .collect(),
  );
const entryOf = (s: Setup, id: Id<"entries">) =>
  s.t.run(
    async (ctx) =>
      (await ctx.db.get("entries", id)) as Extract<
        Doc<"entries">,
        { kind: "budget" }
      >,
  );

const formQuote = {
  amount: 950,
  unit: "per_plate" as const,
  functionKeys: ["sangeet"],
  guests: 300,
  receivedAt: null,
  note: null,
};

async function setStatus(
  s: Setup,
  status: Doc<"vendorLinks">["status"],
  who: Name = "Meera",
) {
  await s.as(who).mutation(api.vendors.setLinkStatus, {
    linkId: s.linkId,
    status,
  });
}

/** A Chat request from Rohan (or `who`) with a running run, as the run queue would start it. */
async function pastedRequest(s: Setup, text = PASTE, who: Name = "Rohan") {
  const { runId } = await s.as(who).mutation(api.chat.send, {
    eventId: s.eventId,
    text,
    dontReply: false,
    pointing: [],
  });
  await s.t.run((ctx) =>
    ctx.db.patch("runs", runId!, { status: "running", startedAt: Date.now() }),
  );
  return runId!;
}

/** What the extraction model reads from the worked example. */
const EXTRACTED: {
  amount: number;
  unit: "per_plate" | "per_person" | "per_day" | "per_function" | "total";
  guests: number | null;
  functions: string[];
  note: string | null;
} = {
  amount: 950,
  unit: "per_plate",
  guests: 300,
  functions: [] as string[],
  note: "live counters extra",
};

let toolCalls = 0;
async function proposePasted(
  s: Setup,
  runId: Id<"runs">,
  extraction: typeof EXTRACTED = EXTRACTED,
  functionKey: string | null = null,
  pasteMessageId: string | null = null,
): Promise<ToolResult> {
  return (await s.t.mutation(internal.quotes.proposeForRun, {
    runId,
    eventId: s.eventId,
    forMembershipId: s.people.Rohan,
    // Each call is its own tool call, as the model's retries are.
    toolCallId: `call_quote_${++toolCalls}`,
    linkId: s.linkId,
    functionKey,
    pasteMessageId,
    extraction,
  })) as ToolResult;
}

/** The pasted message's ID a `whichFunction` refusal hands back for the retry. */
function pasteMessageIdIn(result: ToolResult): string {
  const id = /"pasteMessageId":"([^"]+)"/.exec(
    (result as { message: string }).message,
  )?.[1];
  if (!id) throw new Error(`No pasteMessageId in ${JSON.stringify(result)}`);
  return id;
}

/** The run is over, as the run queue leaves it once the reply ends. */
const endRun = (s: Setup, runId: Id<"runs">) =>
  s.t.run((ctx) =>
    ctx.db.patch("runs", runId, { status: "done", endedAt: Date.now() }),
  );

const proposalsOf = (s: Setup) =>
  s.t.run((ctx) =>
    ctx.db
      .query("proposals")
      .withIndex("by_event_status", (q) => q.eq("eventId", s.eventId))
      .collect(),
  );

/** The caterer Entry serves the sangeet and the wedding, paying for both lines; the wedding has `weddingGuests`. */
async function servingBoth(s: Setup, weddingGuests: number) {
  await s.t.run(async (ctx) => {
    const entry = (await ctx.db.get("entries", s.caterer))!;
    if (entry.kind !== "checklist") throw new Error("not a checklist Entry");
    await ctx.db.patch("entries", s.caterer, {
      fields: {
        ...entry.fields,
        functionKeys: ["sangeet", "wedding"],
        budgetEntryIds: [s.sangeetCatering, s.weddingCatering],
      },
    });
    const wedding = (
      await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect()
    ).find((fn) => fn.key === "wedding")!;
    await ctx.db.patch("eventFunctions", wedding._id, {
      guests: weddingGuests,
    });
  });
}

/** A 150-Guest haldi the caterer Entry serves as well. */
async function withHaldi(s: Setup) {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("eventFunctions", {
      eventId: s.eventId,
      key: "haldi",
      name: "Haldi",
      guests: 150,
      date: null,
      assumed: [],
      order: 2,
      version: 1,
    });
    const entry = (await ctx.db.get("entries", s.caterer))!;
    if (entry.kind !== "checklist") throw new Error("not a checklist Entry");
    await ctx.db.patch("entries", s.caterer, {
      fields: {
        ...entry.fields,
        functionKeys: [...entry.fields.functionKeys, "haldi"],
      },
    });
  });
}

// ---------------------------------------------------------------------------

describe("api.quotes.add", () => {
  it("moves a Considering link to Quoted and bumps its version", async () => {
    const s = await setUp();
    const before = await linkOf(s);
    expect(before.status).toBe("considering");

    const { quoteId } = await s
      .as("Rohan")
      .action(api.quotes.add, { linkId: s.linkId, ...formQuote });

    const after = await linkOf(s);
    expect(after.status).toBe("quoted");
    expect(after.version).toBe(before.version + 1);
    const [quote] = await quotesOf(s);
    expect(quote).toMatchObject({
      _id: quoteId,
      eventId: s.eventId,
      amount: 950,
      unit: "per_plate",
      functionKeys: ["sangeet"],
      guests: 300,
      fileId: null,
      source: "form",
      createdBy: { kind: "member", membershipId: s.people.Rohan },
      version: 1,
    });
  });

  it("moves a Contacted link to Quoted", async () => {
    const s = await setUp();
    await setStatus(s, "contacted");
    await s.as("Rohan").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
    });
    expect((await linkOf(s)).status).toBe("quoted");
  });

  it("leaves a Booked link Booked, still bumping its version", async () => {
    const s = await setUp();
    await setStatus(s, "booked");
    const before = await linkOf(s);
    await s.as("Rohan").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
    });
    const after = await linkOf(s);
    expect(after.status).toBe("booked");
    expect(after.version).toBe(before.version + 1);
  });

  it("keeps older Quotes; the newest is current", async () => {
    const s = await setUp();
    await s.as("Rohan").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
    });
    await s.as("Meera").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
      amount: 900,
    });
    const list = await s
      .as("Papa")
      .query(api.quotes.listForLink, { linkId: s.linkId });
    expect(list.quotes.map((q) => q.amount)).toEqual([900, 950]);
    expect(list.current?.amount).toBe(900);
    expect(list.current?.total).toBe(270_000);
    expect(list.canManage).toBe(false);
  });

  it("refuses a Viewer, another Event's person, a dropped link and an amount of nothing", async () => {
    const s = await setUp();
    await expect(
      s.as("Papa").action(api.quotes.add, { linkId: s.linkId, ...formQuote }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      s
        .as("Outsider")
        .action(api.quotes.add, { linkId: s.linkId, ...formQuote }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      s
        .as("Rohan")
        .action(api.quotes.add, { linkId: s.linkId, ...formQuote, amount: 0 }),
    ).rejects.toThrow(/amount/i);
    await expect(
      s.as("Rohan").action(api.quotes.add, {
        linkId: s.linkId,
        ...formQuote,
        functionKeys: ["haldi"],
      }),
    ).rejects.toThrow(/Function/);
    await setStatus(s, "dropped");
    await expect(
      s.as("Rohan").action(api.quotes.add, { linkId: s.linkId, ...formQuote }),
    ).rejects.toThrow(/dropped/i);
    expect(await quotesOf(s)).toEqual([]);
  });

  it("records the Quote and the link's move in the history as the Member's edit", async () => {
    const s = await setUp();
    await s.as("Rohan").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
    });
    const changes = await s.t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", s.eventId))
        .collect(),
    );
    // The shortlist made the link earlier; the Quote adds two rows.
    const mine = changes.filter(
      (c) =>
        c.table === "quotes" ||
        (c.table === "vendorLinks" && c.op !== "create"),
    );
    expect(mine.map((c) => [c.table, c.op]).sort()).toEqual([
      ["quotes", "create"],
      ["vendorLinks", "update"],
    ]);
    for (const change of mine)
      expect(change.actor).toEqual({
        kind: "member",
        membershipId: s.people.Rohan,
      });
  });
});

// ---------------------------------------------------------------------------

describe("Quote attachments", () => {
  const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n")
    .buffer as ArrayBuffer;
  const storageRows = (s: Setup) =>
    s.t.run((ctx) => ctx.db.system.query("_storage").collect());

  it("stores an image or PDF with its Quote, and opens it only for the Event's people", async () => {
    const s = await setUp();
    const { quoteId } = await s.as("Rohan").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
      file: PDF,
    });
    const [quote] = await quotesOf(s);
    expect(quote!.fileId).not.toBeNull();
    const file = await s.t.run((ctx) =>
      ctx.db.system.get("_storage", quote!.fileId!),
    );
    expect(file?.contentType).toBe("application/pdf");

    // A Viewer of the Event may open it; someone outside it may not.
    await expect(
      s.as("Papa").query(api.quotes.attachmentUrl, { quoteId }),
    ).resolves.toEqual(expect.any(String));
    await expect(
      s.as("Outsider").query(api.quotes.attachmentUrl, { quoteId }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      s.t.query(api.quotes.attachmentUrl, { quoteId }),
    ).rejects.toThrow(/AccessDenied/);
    const list = await s
      .as("Papa")
      .query(api.quotes.listForLink, { linkId: s.linkId });
    expect(list.current?.attachment).toBe("pdf");
  });

  it("checks access, type and size before storing anything", async () => {
    const s = await setUp();
    await expect(
      s
        .as("Outsider")
        .action(api.quotes.add, { linkId: s.linkId, ...formQuote, file: PDF }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      s.as("Papa").action(api.quotes.add, {
        linkId: s.linkId,
        ...formQuote,
        file: PDF,
      }),
    ).rejects.toThrow(/AccessDenied/);
    const text = new TextEncoder().encode("just some text")
      .buffer as ArrayBuffer;
    await expect(
      s.as("Rohan").action(api.quotes.add, {
        linkId: s.linkId,
        ...formQuote,
        file: text,
      }),
    ).rejects.toThrow(/photo or a PDF/);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    await expect(
      s.as("Rohan").action(api.quotes.add, {
        linkId: s.linkId,
        ...formQuote,
        file: big.buffer as ArrayBuffer,
      }),
    ).rejects.toThrow(/10 MB/);
    expect(await storageRows(s)).toEqual([]);
    expect(await quotesOf(s)).toEqual([]);
  });

  it("deletes the stored file again when saving the Quote is refused", async () => {
    const s = await setUp();
    await setStatus(s, "dropped");
    await expect(
      s
        .as("Rohan")
        .action(api.quotes.add, { linkId: s.linkId, ...formQuote, file: PDF }),
    ).rejects.toThrow(/dropped/i);
    expect(await storageRows(s)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("a Quote pasted from WhatsApp", () => {
  it("becomes one Proposal: ₹950 per plate, 300 Guests, the sangeet, the note, received today", async () => {
    const s = await setUp();
    await setStatus(s, "contacted");
    const link = await linkOf(s);
    const entry = await s.t.run(
      async (ctx) => (await ctx.db.get("entries", s.caterer))!,
    );
    const runId = await pastedRequest(s);
    const result = await proposePasted(s, runId);
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const proposals = await proposalsOf(s);
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(proposal!.status).toBe("open");
    expect(proposal!.changes).toHaveLength(1);
    const change = proposal!.changes[0]!;
    expect(change).toMatchObject({
      op: "addQuote",
      table: "quotes",
      docId: null,
      expectedVersion: null,
      values: {
        linkId: s.linkId,
        amount: 950,
        unit: "per_plate",
        guests: 300,
        functionKeys: ["sangeet"],
        note: "live counters extra",
        fileId: null,
      },
    });
    expect(change.guards).toEqual(
      expect.arrayContaining([
        { table: "vendorLinks", docId: s.linkId, version: link.version },
        { table: "entries", docId: s.caterer, version: entry.version },
      ]),
    );
    expect(change.guards).toHaveLength(2);
    const receivedAt = (change.values as { receivedAt: number }).receivedAt;
    expect(istDay(receivedAt)).toBe(istDay(Date.now()));

    // Nothing is saved until a Member accepts.
    expect(await quotesOf(s)).toEqual([]);
    const card = await s.as("Papa").query(api.proposals.get, {
      eventId: s.eventId,
      proposalId: proposal!._id,
    });
    expect(card.lines).toEqual([
      "Quote from Vinayak Foods & Catering: ₹950/plate for 300 Guests at the Sangeet (₹2,85,000), live counters extra",
    ]);
  });

  it("is saved on Accept; the line shows Estimate ₹3L to ₹6L, the Listed price and Quote ₹2.85L side by side", async () => {
    const s = await setUp();
    await setStatus(s, "contacted");
    const runId = await pastedRequest(s);
    await proposePasted(s, runId);
    const [proposal] = await proposalsOf(s);
    const accepted = await s.as("Meera").mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal!._id,
    });
    expect(accepted).toEqual({ ok: true });

    const [quote] = await quotesOf(s);
    expect(quote).toMatchObject({
      amount: 950,
      unit: "per_plate",
      guests: 300,
      functionKeys: ["sangeet"],
      note: "live counters extra",
      source: "chatPaste",
      createdBy: {
        kind: "assistant",
        forMembershipId: s.people.Rohan,
        proposalId: proposal!._id,
        acceptedBy: s.people.Meera,
      },
    });
    expect((await linkOf(s)).status).toBe("quoted");

    const comparison = await s
      .as("Papa")
      .query(api.quotes.budgetComparison, { eventId: s.eventId });
    const line = comparison.entries.find(
      (e) => e.entryId === s.sangeetCatering,
    )!;
    expect(line.estimate).toEqual({ low: 300_000, high: 600_000 });
    expect(line.vendors).toHaveLength(1);
    const [vendor] = line.vendors;
    expect(vendor!.vendorName).toBe("Vinayak Foods & Catering");
    expect(vendor!.listed.map((p) => p.label)).toContain(
      "from ₹250/plate × 300 = from ₹75,000 (starting price)",
    );
    expect(vendor!.quote).toMatchObject({
      total: 285_000,
      line: "₹950/plate × 300 = ₹2.85L",
    });
    // The wedding line has no Quote: the Quote names the sangeet only.
    expect(
      comparison.entries.find((e) => e.entryId === s.weddingCatering)!.vendors,
    ).toEqual([]);
    // Estimate, Listed price and Quote stay apart: the line's own amount is untouched.
    const entry = await entryOf(s, s.sangeetCatering);
    expect(entry.fields.plannedAmount).toBeNull();
    expect(entry.fields.estimate?.amount).toBe(360_000);
  });

  it("is refused as out of date, saving no Quote, when the link is dropped while it is open", async () => {
    const s = await setUp();
    const runId = await pastedRequest(s);
    await proposePasted(s, runId);
    const [proposal] = await proposalsOf(s);
    await setStatus(s, "dropped", "Meera");
    const result = await s.as("Rohan").mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal!._id,
    });
    expect(result).toMatchObject({ ok: false, reason: "outOfDate" });
    expect(await quotesOf(s)).toEqual([]);
    expect((await linkOf(s)).status).toBe("dropped");
  });

  it("is refused as out of date when the link gets another Quote while it is open", async () => {
    const s = await setUp();
    const runId = await pastedRequest(s);
    await proposePasted(s, runId);
    const [proposal] = await proposalsOf(s);
    await s.as("Meera").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
      amount: 1_000,
    });
    const result = await s.as("Rohan").mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal!._id,
    });
    expect(result).toMatchObject({ ok: false, reason: "outOfDate" });
    expect((await quotesOf(s)).map((q) => q.amount)).toEqual([1_000]);
  });

  it("refuses an amount or Guest count the pasted text doesn't write", async () => {
    const s = await setUp();
    const runId = await pastedRequest(s);
    const made = await proposePasted(s, runId, { ...EXTRACTED, amount: 1_200 });
    expect(made).toMatchObject({ ok: false, reason: "notInPaste" });
    const guests = await proposePasted(s, runId, {
      ...EXTRACTED,
      guests: 350,
    });
    expect(guests).toMatchObject({ ok: false, reason: "notInPaste" });
    expect(await proposalsOf(s)).toEqual([]);
  });

  it("names the Function the text names, else the one the link's Entry serves", async () => {
    const s = await setUp();
    // The caterer Entry serves the sangeet and the wedding now.
    await s.t.run(async (ctx) => {
      const entry = (await ctx.db.get("entries", s.caterer))!;
      if (entry.kind !== "checklist") throw new Error("not a checklist Entry");
      await ctx.db.patch("entries", s.caterer, {
        fields: { ...entry.fields, functionKeys: ["sangeet", "wedding"] },
      });
    });
    const runId = await pastedRequest(
      s,
      "Wedding dinner veg 1100 per plate, 400 guests",
    );
    await proposePasted(s, runId, {
      amount: 1_100,
      unit: "per_plate",
      guests: 400,
      functions: ["Wedding"],
      note: "",
    });
    const [proposal] = await proposalsOf(s);
    expect(proposal!.changes[0]!.values).toMatchObject({
      functionKeys: ["wedding"],
      note: null,
    });
  });

  describe("when the link's Entry serves several Functions (issue 127)", () => {
    /** Rohan pastes, the first run asks which Function and ends, then `who` answers `answer` in the Chat. */
    async function answered(s: Setup, answer: string, who: Name = "Rohan") {
      const pasteRun = await pastedRequest(s);
      const asked = await proposePasted(s, pasteRun);
      expect(asked).toMatchObject({ ok: false, reason: "whichFunction" });
      await endRun(s, pasteRun);
      const answerRun = await pastedRequest(s, answer, who);
      return { pasteRun, answerRun, pasteMessageId: pasteMessageIdIn(asked) };
    }

    it("asks which Function when two 300-Guest Functions fit, and proposes nothing", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      const runId = await pastedRequest(s);
      const result = await proposePasted(s, runId);
      expect(result).toMatchObject({ ok: false, reason: "whichFunction" });
      const message = (result as { message: string }).message;
      expect(message).toContain("Sangeet or Wedding");
      expect(message).toContain('"functionKey":"sangeet"');
      expect(message).toContain('"functionKey":"wedding"');
      expect(await proposalsOf(s)).toEqual([]);
    });

    it("proposes for the Function the Member names in their next message, reading the price from the paste", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      const { answerRun, pasteMessageId } = await answered(
        s,
        "It's for the wedding",
      );
      const result = await proposePasted(
        s,
        answerRun,
        EXTRACTED,
        "wedding",
        pasteMessageId,
      );
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      const proposals = await proposalsOf(s);
      expect(proposals).toHaveLength(1);
      expect(proposals[0]!.changes[0]!.values).toMatchObject({
        amount: 950,
        unit: "per_plate",
        guests: 300,
        functionKeys: ["wedding"],
        note: "live counters extra",
      });
    });

    it("refuses a retry in the same run, where no Member has named a Function", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      const runId = await pastedRequest(s);
      const asked = await proposePasted(s, runId);
      const pasteMessageId = pasteMessageIdIn(asked);
      // The model picks a Function itself, with or without the paste's ID.
      const picked = await proposePasted(s, runId, EXTRACTED, "wedding");
      expect(picked).toMatchObject({ ok: false, reason: "notNamed" });
      const again = await proposePasted(
        s,
        runId,
        EXTRACTED,
        "wedding",
        pasteMessageId,
      );
      expect(again).toMatchObject({ ok: false, reason: "noPaste" });
      expect(await proposalsOf(s)).toEqual([]);
    });

    it("refuses a Function the Member's answer doesn't name", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      const { answerRun, pasteMessageId } = await answered(s, "Sangeet");
      const result = await proposePasted(
        s,
        answerRun,
        EXTRACTED,
        "wedding",
        pasteMessageId,
      );
      expect(result).toMatchObject({ ok: false, reason: "notNamed" });
      expect(await proposalsOf(s)).toEqual([]);
    });

    it("refuses a Function the Member names that wasn't one of the choices", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      await withHaldi(s);
      const { answerRun, pasteMessageId } = await answered(s, "Haldi");
      const result = await proposePasted(
        s,
        answerRun,
        EXTRACTED,
        "haldi",
        pasteMessageId,
      );
      expect(result).toMatchObject({ ok: false, reason: "notAChoice" });
      expect(await proposalsOf(s)).toEqual([]);
    });

    it("takes no answer from a Viewer", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      await expect(pastedRequest(s, "Wedding", "Papa")).rejects.toThrow();
      // A Member who answered and became a Viewer before the retry ran.
      const { answerRun, pasteMessageId } = await answered(s, "Wedding");
      await s.t.run((ctx) =>
        ctx.db.patch("memberships", s.people.Rohan, { role: "viewer" }),
      );
      await expect(
        proposePasted(s, answerRun, EXTRACTED, "wedding", pasteMessageId),
      ).rejects.toThrow(/AccessDenied/);
      expect(await proposalsOf(s)).toEqual([]);
    });

    describe("reads the answer as one clear choice", () => {
      for (const [answer, functionKey] of [
        ["Not the wedding", "wedding"],
        ["It's not for the wedding", "wedding"],
        ["Sangeet, not Wedding", "sangeet"],
        ["Sangeet or Wedding", "sangeet"],
        ["shaadi nahi", "wedding"],
        ["शादी नहीं", "wedding"],
        ["maybe the sangeet", "sangeet"],
      ] as const) {
        it(`asks again, directly, after "${answer}"`, async () => {
          const s = await setUp();
          await servingBoth(s, 300);
          const { answerRun, pasteMessageId } = await answered(s, answer);
          const result = await proposePasted(
            s,
            answerRun,
            EXTRACTED,
            functionKey,
            pasteMessageId,
          );
          expect(result).toMatchObject({ ok: false, reason: "unclearAnswer" });
          expect((result as { message: string }).message).toContain(
            '"Sangeet or Wedding?"',
          );
          expect(await proposalsOf(s)).toEqual([]);
        });
      }

      for (const [answer, functionKey] of [
        ["शादी", "wedding"],
        ["shaadi", "wedding"],
        ["vivah", "wedding"],
        ["sangeet wala", "sangeet"],
        ["संगीत", "sangeet"],
      ] as const) {
        it(`takes "${answer}" as the ${functionKey}`, async () => {
          const s = await setUp();
          await servingBoth(s, 300);
          const { answerRun, pasteMessageId } = await answered(s, answer);
          const result = await proposePasted(
            s,
            answerRun,
            EXTRACTED,
            functionKey,
            pasteMessageId,
          );
          expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
          const proposals = await proposalsOf(s);
          expect(proposals).toHaveLength(1);
          expect(proposals[0]!.changes[0]!.values).toMatchObject({
            functionKeys: [functionKey],
          });
        });
      }
    });

    it("makes one Proposal for one answer, however often the tool is called or the Member repeats it", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      const { answerRun, pasteMessageId } = await answered(s, "Wedding");
      const first = await proposePasted(
        s,
        answerRun,
        EXTRACTED,
        "wedding",
        pasteMessageId,
      );
      const second = await proposePasted(
        s,
        answerRun,
        EXTRACTED,
        "wedding",
        pasteMessageId,
      );
      expect(first).toMatchObject({ ok: true });
      expect(second).toMatchObject({
        ok: true,
        proposalId: (first as unknown as { proposalId: string }).proposalId,
      });
      // The Member says it again in a later message.
      await endRun(s, answerRun);
      const again = await pastedRequest(s, "The wedding, I said");
      const third = await proposePasted(
        s,
        again,
        EXTRACTED,
        "wedding",
        pasteMessageId,
      );
      expect(third).toMatchObject({
        ok: true,
        proposalId: (first as unknown as { proposalId: string }).proposalId,
      });
      const open = (await proposalsOf(s)).filter((p) => p.status === "open");
      expect(open).toHaveLength(1);
    });

    describe("refuses a pasteMessageId that isn't an earlier Member paste in this Event's Chat", () => {
      async function refusedFor(
        s: Setup,
        answerRun: Id<"runs">,
        pasteMessageId: string,
      ) {
        const result = await proposePasted(
          s,
          answerRun,
          EXTRACTED,
          "wedding",
          pasteMessageId,
        );
        expect(result).toMatchObject({ ok: false, reason: "noPaste" });
        expect(await proposalsOf(s)).toEqual([]);
      }

      it("another Event's message", async () => {
        const s = await setUp();
        await servingBoth(s, 300);
        const { answerRun } = await answered(s, "Wedding");
        const otherEvent = await s.t.run(
          async (ctx) =>
            (await ctx.db.get("memberships", s.people.Outsider))!.eventId,
        );
        const { messageId } = await s.as("Outsider").mutation(api.chat.send, {
          eventId: otherEvent,
          text: PASTE,
          dontReply: true,
          pointing: [],
        });
        await refusedFor(s, answerRun, messageId!);
      });

      it("a message that isn't a Member's", async () => {
        const s = await setUp();
        await servingBoth(s, 300);
        const { answerRun } = await answered(s, "Wedding");
        const reply = await s.t.run(async (ctx) => {
          const event = (await ctx.db.get("events", s.eventId))!;
          const { messageId } = await saveMessage(ctx, components.agent, {
            threadId: event.agentThreadId!,
            message: { role: "assistant", content: PASTE },
          });
          return messageId;
        });
        await refusedFor(s, answerRun, reply);
      });

      it("a later message", async () => {
        const s = await setUp();
        await servingBoth(s, 300);
        const { answerRun } = await answered(s, "Wedding");
        const { messageId } = await s.as("Rohan").mutation(api.chat.send, {
          eventId: s.eventId,
          text: PASTE,
          dontReply: true,
          pointing: [],
        });
        await refusedFor(s, answerRun, messageId!);
      });

      it("a deleted message", async () => {
        const s = await setUp();
        await servingBoth(s, 300);
        const { answerRun, pasteMessageId } = await answered(s, "Wedding");
        await s.t.run((ctx) =>
          ctx.runMutation(components.agent.messages.deleteByIds, {
            messageIds: [pasteMessageId],
          }),
        );
        await refusedFor(s, answerRun, pasteMessageId);
      });

      it("a message in another thread", async () => {
        const s = await setUp();
        await servingBoth(s, 300);
        const { answerRun } = await answered(s, "Wedding");
        const elsewhere = await s.t.run(async (ctx) => {
          const threadId = await createThread(ctx, components.agent, {
            title: "Another thread",
          });
          const { messageId } = await saveMessage(ctx, components.agent, {
            threadId,
            userId: s.people.Rohan,
            prompt: PASTE,
          });
          // Even with a Chat note claiming it for this Event.
          await ctx.db.insert("chatAnnotations", {
            eventId: s.eventId,
            messageId,
            authorMembershipId: s.people.Rohan,
            dontReply: false,
            mentions: [],
            pointing: [],
            card: null,
          });
          return messageId;
        });
        await refusedFor(s, answerRun, elsewhere);
      });
    });

    it("asks with the paste's own price unit too, such as a price per Function", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      const runId = await pastedRequest(
        s,
        "Dhol and DJ 35000 per function, for 300 pax",
      );
      const result = await proposePasted(s, runId, {
        amount: 35_000,
        unit: "per_function",
        guests: 300,
        functions: [],
        note: null,
      });
      expect(result).toMatchObject({ ok: false, reason: "whichFunction" });
      expect(await proposalsOf(s)).toEqual([]);
    });

    it("proposes for the Function the pasted text names, whatever its case", async () => {
      const s = await setUp();
      await servingBoth(s, 300);
      const runId = await pastedRequest(s, `SANGEET: ${PASTE}`);
      await proposePasted(s, runId, { ...EXTRACTED, functions: ["SANGEET"] });
      const [proposal] = await proposalsOf(s);
      expect(proposal!.changes[0]!.values).toMatchObject({
        functionKeys: ["sangeet"],
      });
    });

    it("asks, rather than going by Guests, when the paste names a Function it can't place", async () => {
      const s = await setUp();
      // Only the sangeet has 300 Guests, so the Guests alone would pick it.
      await servingBoth(s, 400);
      const runId = await pastedRequest(s, `Reception: ${PASTE}`);
      const result = await proposePasted(s, runId, {
        ...EXTRACTED,
        functions: ["Reception"],
      });
      expect(result).toMatchObject({ ok: false, reason: "whichFunction" });
      expect((result as { message: string }).message).toContain("Reception");
      expect(await proposalsOf(s)).toEqual([]);
    });

    it("still picks the one Function whose Guests match when only one does", async () => {
      const s = await setUp();
      await servingBoth(s, 400);
      const runId = await pastedRequest(s);
      await proposePasted(s, runId);
      const [proposal] = await proposalsOf(s);
      expect(proposal!.changes[0]!.values).toMatchObject({
        functionKeys: ["sangeet"],
      });
    });
  });

  describe("a Function the link's Entry doesn't serve", () => {
    it("is refused when the paste names it, listing the Functions the Entry serves", async () => {
      const s = await setUp();
      const runId = await pastedRequest(s, `Wedding: ${PASTE}`);
      const result = await proposePasted(s, runId, {
        ...EXTRACTED,
        functions: ["Wedding"],
      });
      expect(result).toMatchObject({ ok: false, reason: "notServed" });
      expect((result as { message: string }).message).toContain("Sangeet");
      expect(await proposalsOf(s)).toEqual([]);
    });

    it("is refused when the tool is given its key", async () => {
      const s = await setUp();
      const runId = await pastedRequest(s, `Wedding: ${PASTE}`);
      const result = await proposePasted(s, runId, EXTRACTED, "wedding");
      expect(result).toMatchObject({ ok: false, reason: "notServed" });
      expect(await proposalsOf(s)).toEqual([]);
    });
  });

  it("names none and asks nothing when the link's Entry serves a single Function", async () => {
    const s = await setUp();
    const runId = await pastedRequest(s);
    const result = await proposePasted(s, runId);
    expect(result).toMatchObject({ ok: true });
    const [proposal] = await proposalsOf(s);
    expect(proposal!.changes[0]!.values).toMatchObject({
      functionKeys: ["sangeet"],
    });
  });

  it("is never made for a Nudge run, and asks a Viewer for nothing", async () => {
    const s = await setUp();
    const runId = await pastedRequest(s);
    await s.t.run((ctx) => ctx.db.patch("runs", runId, { source: "nudge" }));
    const result = await proposePasted(s, runId);
    expect(result).toMatchObject({ ok: false, reason: "notAsked" });
    expect(await proposalsOf(s)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("booking with a Quote", () => {
  async function quoted(s: Setup) {
    await s.as("Rohan").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
    });
  }

  it('asks "Use the ₹2.85L Quote as this line\'s amount?" once the Vendor is Booked', async () => {
    const s = await setUp();
    await quoted(s);
    const before = await s
      .as("Meera")
      .query(api.quotes.listForLink, { linkId: s.linkId });
    expect(before.ask).toBeNull();

    await setStatus(s, "booked");
    const list = await s
      .as("Meera")
      .query(api.quotes.listForLink, { linkId: s.linkId });
    expect(list.ask).toEqual({
      question: "Use the ₹2.85L Quote as this line's amount?",
      entryId: s.sangeetCatering,
      quoteId: list.current!._id,
      amount: 285_000,
    });
    // Asking changes nothing: the planned amount is still the Estimate's.
    expect((await entryOf(s, s.sangeetCatering)).fields.plannedAmount).toBe(
      null,
    );
  });

  it("only a Member's yes changes the planned amount", async () => {
    const s = await setUp();
    await quoted(s);
    await setStatus(s, "booked");
    const { current } = await s
      .as("Meera")
      .query(api.quotes.listForLink, { linkId: s.linkId });

    await expect(
      s.as("Papa").mutation(api.quotes.useAsAmount, {
        entryId: s.sangeetCatering,
        quoteId: current!._id,
      }),
    ).rejects.toThrow(/AccessDenied/);
    // The Quote names the sangeet, not the wedding line.
    await expect(
      s.as("Rohan").mutation(api.quotes.useAsAmount, {
        entryId: s.weddingCatering,
        quoteId: current!._id,
      }),
    ).rejects.toThrow(/doesn't cover/);
    expect((await entryOf(s, s.sangeetCatering)).fields.plannedAmount).toBe(
      null,
    );

    const result = await s.as("Rohan").mutation(api.quotes.useAsAmount, {
      entryId: s.sangeetCatering,
      quoteId: current!._id,
    });
    expect(result).toEqual({ plannedAmount: 285_000 });
    const entry = await entryOf(s, s.sangeetCatering);
    expect(entry.fields.plannedAmount).toBe(285_000);
    expect(entry.fields.editedByMember).toBe(true);
    // The Estimate stays beside it, unmixed.
    expect(entry.fields.estimate?.amount).toBe(360_000);
    const list = await s
      .as("Meera")
      .query(api.quotes.listForLink, { linkId: s.linkId });
    expect(list.ask).toBeNull();
  });

  async function askedFor(s: Setup) {
    await quoted(s);
    await setStatus(s, "booked");
    const { ask } = await s
      .as("Meera")
      .query(api.quotes.listForLink, { linkId: s.linkId });
    return ask!;
  }

  it("refuses a stale yes when a newer Quote arrived after the ask, writing nothing", async () => {
    const s = await setUp();
    const ask = await askedFor(s);
    await s.as("Rohan").action(api.quotes.add, {
      linkId: s.linkId,
      ...formQuote,
      amount: 900,
    });
    await expect(
      s.as("Meera").mutation(api.quotes.useAsAmount, {
        entryId: ask.entryId,
        quoteId: ask.quoteId,
      }),
    ).rejects.toThrow(/newer Quote/);
    const entry = await entryOf(s, s.sangeetCatering);
    expect(entry.fields.plannedAmount).toBeNull();
    expect(entry.version).toBe(1);
  });

  it("refuses a stale yes when the Vendor was dropped (or is no longer Booked) after the ask", async () => {
    const s = await setUp();
    const ask = await askedFor(s);
    await setStatus(s, "dropped", "Rohan");
    await expect(
      s.as("Meera").mutation(api.quotes.useAsAmount, {
        entryId: ask.entryId,
        quoteId: ask.quoteId,
      }),
    ).rejects.toThrow(/no longer Booked/);
    await setStatus(s, "quoted", "Rohan");
    await expect(
      s.as("Meera").mutation(api.quotes.useAsAmount, {
        entryId: ask.entryId,
        quoteId: ask.quoteId,
      }),
    ).rejects.toThrow(/no longer Booked/);
    expect((await entryOf(s, s.sangeetCatering)).version).toBe(1);
  });

  it("writes once: a second yes leaves the version, the history and the Nudge check as they were", async () => {
    const s = await setUp();
    const ask = await askedFor(s);
    const yes = () =>
      s.as("Meera").mutation(api.quotes.useAsAmount, {
        entryId: ask.entryId,
        quoteId: ask.quoteId,
      });
    const changesOf = () =>
      s.t.run(
        async (ctx) =>
          (
            await ctx.db
              .query("changes")
              .withIndex("by_doc", (q) => q.eq("docId", s.sangeetCatering))
              .collect()
          ).length,
      );
    const checks = () =>
      s.t.run(
        async (ctx) =>
          (await ctx.db.system.query("_scheduled_functions").collect()).filter(
            (job) => job.name === "nudges:check",
          ).length,
      );
    expect(await yes()).toEqual({ plannedAmount: 285_000 });
    const after = await entryOf(s, s.sangeetCatering);
    const changes = await changesOf();
    const scheduled = await checks();
    expect(await yes()).toEqual({ plannedAmount: 285_000 });
    expect((await entryOf(s, s.sangeetCatering)).version).toBe(after.version);
    expect(await changesOf()).toBe(changes);
    expect(await checks()).toBe(scheduled);
  });

  it("never changes the planned amount on its own: adding, pasting, accepting and booking leave it as it was", async () => {
    const s = await setUp();
    await s.t.run(async (ctx) => {
      const entry = (await ctx.db.get("entries", s.sangeetCatering))!;
      if (entry.kind !== "budget") throw new Error("not a budget line");
      await ctx.db.patch("entries", s.sangeetCatering, {
        fields: { ...entry.fields, plannedAmount: 245_000 },
      });
    });
    await quoted(s);
    const runId = await pastedRequest(s);
    await proposePasted(s, runId);
    const [proposal] = await proposalsOf(s);
    await s.as("Meera").mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal!._id,
    });
    await setStatus(s, "booked");
    await s.t.finishAllScheduledFunctions(() => {});
    const entry = await entryOf(s, s.sangeetCatering);
    expect(entry.fields.plannedAmount).toBe(245_000);
    expect(entry.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe("api.quotes.budgetComparison", () => {
  it("shows a comparable Listed price worked out for the Function's Guests, and a dropped Vendor not at all", async () => {
    const s = await setUp();
    const comparison = await s
      .as("Meera")
      .query(api.quotes.budgetComparison, { eventId: s.eventId });
    const line = comparison.entries.find(
      (e) => e.entryId === s.sangeetCatering,
    )!;
    expect(line.vendors).toHaveLength(1);
    expect(line.vendors[0]!.quote).toBeNull();
    expect(line.vendors[0]!.listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "from ₹250/plate × 300 = from ₹75,000 (starting price)",
          low: 75_000,
        }),
      ]),
    );
    await setStatus(s, "dropped");
    const after = await s
      .as("Meera")
      .query(api.quotes.budgetComparison, { eventId: s.eventId });
    expect(
      after.entries.find((e) => e.entryId === s.sangeetCatering)!.vendors,
    ).toEqual([]);
  });

  it("is only for the Event's people", async () => {
    const s = await setUp();
    await expect(
      s
        .as("Outsider")
        .query(api.quotes.budgetComparison, { eventId: s.eventId }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

// ---------------------------------------------------------------------------

describe("the proposeQuote tool", () => {
  afterEach(() => vi.unstubAllEnvs());

  function toolCtx(s: Setup, runId: Id<"runs">) {
    return {
      runQuery: s.t.query,
      runMutation: s.t.mutation,
      runAction: s.t.action,
      runId,
      eventId: s.eventId,
      forMembershipId: s.people.Rohan,
    } as unknown as AssistantToolCtx;
  }

  it("reads the pasted message on the helper model only as outside content, and finds the only caterer", async () => {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    const s = await setUp();
    const runId = await pastedRequest(s);
    const result = await runProposeQuote(
      toolCtx(s, runId),
      { category: "caterer" },
      "call_tool",
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const [proposal] = await proposalsOf(s);
    expect(proposal!.changes[0]!.values).toMatchObject({
      amount: 950,
      unit: "per_plate",
      guests: 300,
      functionKeys: ["sangeet"],
      note: "live counters extra",
    });
    // The extraction call saw the paste inside a labelled block, never bare.
    const call = stubCalls.at(-1)!;
    const user = call.prompt
      .filter((message) => message.role === "user")
      .flatMap((message) =>
        typeof message.content === "string"
          ? [message.content]
          : message.content.map((part) =>
              part.type === "text" ? part.text : "",
            ),
      )
      .join("\n");
    expect(user).toBe(
      '<outside_content source="pasted text" added_by="Rohan">\nVeg 950/plate for 300 pax, live counters extra\n</outside_content>',
    );
    expect(call.responseFormat).toMatchObject({
      type: "json",
      name: "QuoteExtraction",
    });
  });

  it("asks which Vendor when several could have sent it, and proposes nothing", async () => {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    const s = await setUp();
    const ml = await s.t.run((ctx) =>
      ctx.db
        .query("vendors")
        .withIndex("by_domain", (q) => q.eq("domain", "mlcaterers.com"))
        .unique(),
    );
    await s.as("Meera").mutation(api.vendors.shortlist, {
      eventId: s.eventId,
      vendorId: ml!._id,
      checklistEntryId: s.caterer,
    });
    const runId = await pastedRequest(s);
    const result = await runProposeQuote(
      toolCtx(s, runId),
      { category: "caterer" },
      "call_tool",
    );
    expect(result).toMatchObject({ ok: false, reason: "whichVendor" });
    expect((result as { message: string }).message).toContain("M L Caterers");
    expect(await proposalsOf(s)).toEqual([]);
  });

  it("asks which Function when two Functions the Entry serves both have 300 Guests, then proposes for the one the Member names next", async () => {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    const s = await setUp();
    await servingBoth(s, 300);
    const pasteRun = await pastedRequest(s);
    const asked = await runProposeQuote(
      toolCtx(s, pasteRun),
      { category: "caterer" },
      "call_tool",
    );
    expect(asked).toMatchObject({ ok: false, reason: "whichFunction" });
    expect(await proposalsOf(s)).toEqual([]);
    await endRun(s, pasteRun);

    // Rohan's answer is a new Chat message with its own run.
    const answerRun = await pastedRequest(s, "wedding");
    const answered = await runProposeQuote(
      toolCtx(s, answerRun),
      {
        linkId: s.linkId,
        functionKey: "wedding",
        pasteMessageId: pasteMessageIdIn(asked),
      },
      "call_tool",
    );
    expect(answered.ok, JSON.stringify(answered)).toBe(true);
    const proposals = await proposalsOf(s);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.changes[0]!.values).toMatchObject({
      amount: 950,
      guests: 300,
      functionKeys: ["wedding"],
    });
    // The helper model read the pasted Quote again, not the answer.
    expect(JSON.stringify(stubCalls.at(-1)!.prompt)).toContain(PASTE);
  });

  it("proposes nothing when the message gives no price", async () => {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    const s = await setUp();
    const runId = await pastedRequest(s, "Will confirm the menu tomorrow");
    const result = await runProposeQuote(
      toolCtx(s, runId),
      { linkId: s.linkId },
      "call_tool",
    );
    expect(result).toMatchObject({ ok: false, reason: "noPrice" });
    expect(await proposalsOf(s)).toEqual([]);
  });
});
