/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { referenceTableBasis } from "../lib/pricing";
import type { EntryFields } from "../lib/types/canvas";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import { rescaleEstimate } from "./entries";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

type Role = Doc<"memberships">["role"];
type T = ReturnType<typeof newTest>;

/**
 * An Event with its starting Sections, the empty Budget, Timeline and Vendor
 * checklist, two Functions, and Meera in the given role.
 */
async function setUpPlan(ctx: MutationCtx, role: Role = "member") {
  const { eventId, membershipId } = await seedMembership(ctx, {
    clerkId: "meera",
    role,
  });
  const actor = { kind: "member" as const, membershipId };
  const sections = await createStartingSections(ctx, eventId, actor);
  const items = {} as Record<"budget" | "timeline" | "checklist", Id<"items">>;
  for (const kind of ["budget", "timeline", "checklist"] as const) {
    items[kind] = await ctx.db.insert("items", {
      eventId,
      sectionId: kind === "checklist" ? sections.vendors : sections.money,
      kind,
      position: { x: 0, y: 0 },
      size: null,
      functionKey: null,
      data: { note: null },
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  }
  for (const [order, key] of ["haldi", "sangeet"].entries()) {
    await ctx.db.insert("eventFunctions", {
      eventId,
      key,
      name: key[0]!.toUpperCase() + key.slice(1),
      date: null,
      guests: null,
      assumed: [],
      order,
      version: 1,
    });
  }
  return { eventId, membershipId, actor, sections, items };
}

/** The sangeet catering line as the first plan writes it: an Estimate, guests assumed. */
function cateringFields(): EntryFields<"budget"> {
  const basis = referenceTableBasis({
    unit: "per_plate",
    unitLow: 1100,
    unitHigh: 1900,
    tier: "Y",
  });
  return {
    label: "Catering",
    category: "catering_main",
    quantity: 225,
    unit: "per_plate",
    estimate: {
      low: 247500,
      high: 427500,
      amount: 272250,
      label: "Estimate",
      basis,
    },
    plannedAmount: null,
    role: "line",
    belowUsualRange: false,
    editedByMember: false,
  };
}

async function insertBudgetEntry(
  t: T,
  plan: Awaited<ReturnType<typeof setUpPlan>>,
  fields: EntryFields<"budget"> = cateringFields(),
  assumed: string[] = ["quantity"],
): Promise<Id<"entries">> {
  return await t.run((ctx) =>
    ctx.db.insert("entries", {
      eventId: plan.eventId,
      itemId: plan.items.budget,
      kind: "budget",
      order: 0,
      functionKey: "sangeet",
      fields,
      assumed,
      createdBy: plan.actor,
      version: 1,
      deletedAt: null,
    }),
  );
}

async function setUp(role: Role = "member") {
  const t = newTest();
  const plan = await t.run((ctx) => setUpPlan(ctx, role));
  const meera = t.withIdentity(identityFor("meera"));
  return { t, plan, meera };
}

const entry = (t: T, id: Id<"entries">) =>
  t.run(async (ctx) => (await ctx.db.get("entries", id))!);

const changesFor = (t: T, id: Id<"entries">) =>
  t.run((ctx) =>
    ctx.db
      .query("changes")
      .withIndex("by_doc", (q) => q.eq("docId", id))
      .collect(),
  );

describe("entries.update", () => {
  it("a Member editing an Entry's amount sets editedByMember", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan);
    await meera.mutation(api.entries.update, {
      entryId: id,
      patch: { kind: "budget", plannedAmount: 245000 },
    });
    const after = await entry(t, id);
    if (after.kind !== "budget") throw new Error("not a budget Entry");
    expect(after.fields.plannedAmount).toBe(245000);
    expect(after.fields.editedByMember).toBe(true);
    // The Estimate stays as it was, beside the Member's amount.
    expect(after.fields.estimate).toEqual(cateringFields().estimate);
    expect(after.version).toBe(2);
  });

  it("renaming a line doesn't count as editing its amount", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan);
    await meera.mutation(api.entries.update, {
      entryId: id,
      patch: { kind: "budget", label: "Sangeet dinner" },
    });
    const after = await entry(t, id);
    if (after.kind !== "budget") throw new Error("not a budget Entry");
    expect(after.fields.label).toBe("Sangeet dinner");
    expect(after.fields.editedByMember).toBe(false);
  });

  it("changing an assumed quantity confirms it and keeps the Estimate's price per plate", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan, {
      ...cateringFields(),
      estimate: { ...cateringFields().estimate!, amount: 1210 * 225 },
    });
    await meera.mutation(api.entries.update, {
      entryId: id,
      patch: { kind: "budget", quantity: 300 },
    });
    const after = await entry(t, id);
    if (after.kind !== "budget") throw new Error("not a budget Entry");
    expect(after.assumed).toEqual([]);
    expect(after.fields.quantity).toBe(300);
    // ₹1,100-₹1,900 per plate for 300 plates; still ₹1,210 a plate.
    expect(after.fields.estimate).toMatchObject({
      low: 330000,
      high: 570000,
      amount: 363000,
    });
  });

  it("refuses a patch of another kind than the Entry", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan);
    await expect(
      meera.mutation(api.entries.update, {
        entryId: id,
        patch: { kind: "timeline", title: "Nope" },
      }),
    ).rejects.toThrow(/InvalidInput/);
  });

  it("refuses a Viewer", async () => {
    const { t, plan, meera } = await setUp("viewer");
    const id = await insertBudgetEntry(t, plan);
    await expect(
      meera.mutation(api.entries.update, {
        entryId: id,
        patch: { kind: "budget", plannedAmount: 1 },
      }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("entries.confirmAssumption", () => {
  it("removes the field from assumed and writes history", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan, cateringFields(), [
      "quantity",
      "label",
    ]);
    await meera.mutation(api.entries.confirmAssumption, {
      entryId: id,
      field: "quantity",
    });
    const after = await entry(t, id);
    expect(after.assumed).toEqual(["label"]);
    expect(after.fields).toEqual(cateringFields());
    const changes = await changesFor(t, id);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      op: "update",
      actor: { kind: "member", membershipId: plan.membershipId },
      before: { assumed: ["quantity", "label"] },
      after: { assumed: ["label"] },
    });
  });

  it("is a no-op when the field is already confirmed, so two Members tapping at once both succeed", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan, cateringFields(), ["quantity"]);
    const confirm = () =>
      meera.mutation(api.entries.confirmAssumption, {
        entryId: id,
        field: "quantity",
      });
    await confirm();
    await expect(confirm()).resolves.toBeNull();
    expect((await entry(t, id)).assumed).toEqual([]);
    expect(await changesFor(t, id)).toHaveLength(1);
  });
});

describe("entries.add", () => {
  it("adds a budget line with a typed amount and no Estimate, after the others", async () => {
    const { t, plan, meera } = await setUp();
    await insertBudgetEntry(t, plan);
    const id = await meera.mutation(api.entries.add, {
      itemId: plan.items.budget,
      functionKey: "haldi",
      input: { kind: "budget", label: "  Marigold strings ", amount: 18000 },
    });
    const row = await entry(t, id);
    expect(row).toMatchObject({
      kind: "budget",
      eventId: plan.eventId,
      itemId: plan.items.budget,
      order: 1,
      functionKey: "haldi",
      assumed: [],
      createdBy: { kind: "member", membershipId: plan.membershipId },
      fields: {
        label: "Marigold strings",
        estimate: null,
        plannedAmount: 18000,
        role: "line",
        editedByMember: true,
      },
    });
    expect(await changesFor(t, id)).toHaveLength(1);
  });

  it("adds a Timeline deadline and a run sheet Entry", async () => {
    const { t, plan, meera } = await setUp();
    const deadline = await meera.mutation(api.entries.add, {
      itemId: plan.items.timeline,
      functionKey: null,
      input: {
        kind: "timeline",
        title: "Send invitations",
        date: "2026-12-19",
        time: null,
        note: null,
      },
    });
    const run = await meera.mutation(api.entries.add, {
      itemId: plan.items.timeline,
      functionKey: "sangeet",
      input: {
        kind: "timeline",
        title: "Family performances",
        date: null,
        time: "19:30",
        note: null,
      },
    });
    expect((await entry(t, deadline)).fields).toMatchObject({
      title: "Send invitations",
      date: "2026-12-19",
      done: false,
      late: false,
    });
    expect((await entry(t, run)).fields).toMatchObject({ time: "19:30" });
  });

  it("adds a Vendor checklist Entry by its own label", async () => {
    const { t, plan, meera } = await setUp();
    const id = await meera.mutation(api.entries.add, {
      itemId: plan.items.checklist,
      functionKey: null,
      input: {
        kind: "checklist",
        label: "Safa tying",
        functionKeys: ["sangeet"],
      },
    });
    expect((await entry(t, id)).fields).toEqual({
      vendorCategory: null,
      freeLabel: "Safa tying",
      functionKeys: ["sangeet"],
      bookByEntryId: null,
      budgetEntryIds: [],
    });
  });

  it("refuses an Entry for another kind of Item, a Function the Event lacks, and bad dates", async () => {
    const { plan, meera } = await setUp();
    await expect(
      meera.mutation(api.entries.add, {
        itemId: plan.items.timeline,
        functionKey: null,
        input: { kind: "budget", label: "Hall", amount: null },
      }),
    ).rejects.toThrow(/InvalidInput/);
    await expect(
      meera.mutation(api.entries.add, {
        itemId: plan.items.budget,
        functionKey: "tilak",
        input: { kind: "budget", label: "Hall", amount: null },
      }),
    ).rejects.toThrow(/InvalidInput/);
    await expect(
      meera.mutation(api.entries.add, {
        itemId: plan.items.timeline,
        functionKey: null,
        input: {
          kind: "timeline",
          title: "x",
          date: "2026-02-31",
          time: null,
          note: null,
        },
      }),
    ).rejects.toThrow(/InvalidInput/);
    await expect(
      meera.mutation(api.entries.add, {
        itemId: plan.items.timeline,
        functionKey: "sangeet",
        input: {
          kind: "timeline",
          title: "x",
          date: null,
          time: "7:30 pm",
          note: null,
        },
      }),
    ).rejects.toThrow(/InvalidInput/);
    await expect(
      meera.mutation(api.entries.add, {
        itemId: plan.items.budget,
        functionKey: null,
        input: { kind: "budget", label: "   ", amount: null },
      }),
    ).rejects.toThrow(/InvalidInput/);
    await expect(
      meera.mutation(api.entries.add, {
        itemId: plan.items.budget,
        functionKey: null,
        input: { kind: "budget", label: "Hall", amount: -5 },
      }),
    ).rejects.toThrow(/InvalidInput/);
  });
});

describe("entries.tick and entries.remove", () => {
  it("ticks a Timeline Entry done and back", async () => {
    const { t, plan, meera } = await setUp();
    const id = await meera.mutation(api.entries.add, {
      itemId: plan.items.timeline,
      functionKey: null,
      input: {
        kind: "timeline",
        title: "Book the caterer",
        date: "2026-10-28",
        time: null,
        note: null,
      },
    });
    await meera.mutation(api.entries.tick, { entryId: id, done: true });
    expect((await entry(t, id)).fields).toMatchObject({ done: true });
    await meera.mutation(api.entries.tick, { entryId: id, done: false });
    expect((await entry(t, id)).fields).toMatchObject({ done: false });
  });

  it("refuses to tick a budget Entry", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan);
    await expect(
      meera.mutation(api.entries.tick, { entryId: id, done: true }),
    ).rejects.toThrow(/InvalidInput/);
  });

  it("soft deletes, so Restore can bring the Entry back", async () => {
    const { t, plan, meera } = await setUp();
    const id = await insertBudgetEntry(t, plan);
    await meera.mutation(api.entries.remove, { entryId: id });
    expect((await entry(t, id)).deletedAt).not.toBeNull();
    const changes = await changesFor(t, id);
    expect(changes.map((c) => c.op)).toEqual(["delete"]);
    const view = await meera.query(api.entries.forItem, {
      itemId: plan.items.budget,
    });
    expect(view.entries).toEqual([]);
  });
});

describe("entries.forItem", () => {
  it("lists the live Entries in order with the Event's Functions and Budget facts", async () => {
    const { t, plan, meera } = await setUp("viewer");
    await t.run((ctx) =>
      ctx.db.patch("events", plan.eventId, {
        budgetTotal: 240000,
        households: 240,
      }),
    );
    const second = await insertBudgetEntry(t, plan);
    await t.run((ctx) => ctx.db.patch("entries", second, { order: 5 }));
    const first = await insertBudgetEntry(t, plan);
    const view = await meera.query(api.entries.forItem, {
      itemId: plan.items.budget,
    });
    expect(view.entries.map((e) => e._id)).toEqual([first, second]);
    expect(view.functions.map((f) => f.key)).toEqual(["haldi", "sangeet"]);
    expect(view.event).toMatchObject({
      budgetTotal: 240000,
      households: 240,
      budgetCheck: null,
    });
    expect(view.canEdit).toBe(false);
  });

  it("works out each checklist Entry's status from its Vendor links", async () => {
    const { t, plan, meera } = await setUp();
    const ids = await t.run(async (ctx) => {
      const make = (label: string, order: number) =>
        ctx.db.insert("entries", {
          eventId: plan.eventId,
          itemId: plan.items.checklist,
          kind: "checklist",
          order,
          functionKey: null,
          fields: {
            vendorCategory: null,
            freeLabel: label,
            functionKeys: [],
            bookByEntryId: null,
            budgetEntryIds: [],
          },
          assumed: [],
          createdBy: plan.actor,
          version: 1,
          deletedAt: null,
        });
      const toFind = await make("Dhol", 0);
      const shortlisted = await make("Caterer", 1);
      const booked = await make("Photographer", 2);
      const dropped = await make("Decorator", 3);
      const link = async (
        entryId: Id<"entries">,
        status: Doc<"vendorLinks">["status"],
      ) => {
        const vendorItem = await ctx.db.insert("items", {
          eventId: plan.eventId,
          sectionId: plan.sections.vendors,
          kind: "note",
          position: { x: 0, y: 0 },
          size: null,
          functionKey: null,
          data: { text: "stand-in for a Shortlisted Vendor", citations: [] },
          createdBy: plan.actor,
          version: 1,
          deletedAt: null,
        });
        await ctx.db.insert("vendorLinks", {
          eventId: plan.eventId,
          shortlistItemId: vendorItem,
          checklistEntryId: entryId,
          status,
          version: 1,
        });
      };
      await link(shortlisted, "contacted");
      await link(booked, "considering");
      await link(booked, "booked");
      await link(dropped, "dropped");
      return { toFind, shortlisted, booked, dropped };
    });
    const view = await meera.query(api.entries.forItem, {
      itemId: plan.items.checklist,
    });
    expect(view.checklistStatus).toEqual({
      [ids.toFind]: "toFind",
      [ids.shortlisted]: "shortlisted",
      [ids.booked]: "booked",
      [ids.dropped]: "toFind",
    });
  });

  it("refuses someone outside the Event", async () => {
    const { t, plan } = await setUp();
    await t.run((ctx) => seedMembership(ctx, { clerkId: "stranger" }));
    await expect(
      t
        .withIdentity(identityFor("stranger"))
        .query(api.entries.forItem, { itemId: plan.items.budget }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("rescaleEstimate at the high edge", () => {
  // A range whose high isn't on a rounding step (X tier ×1.25, or researched).
  const perDay = (amount: number, days: number) => ({
    low: 40_000 * days,
    high: 60_500 * days,
    amount,
    label: "Estimate" as const,
    basis: {
      ...referenceTableBasis({
        unit: "per_day",
        unitLow: 40_000,
        unitHigh: 60_500,
        tier: "X",
      }),
    },
  });

  it("a per-day line at its high, 2 → 3 days, rounds down to ₹1,81,000", () => {
    const after = rescaleEstimate(perDay(121_000, 2), "per_day", 2, 3);
    expect(after.high).toBe(181_500);
    expect(after.amount).toBe(181_000);
  });

  it("a per-plate line at its high rounds its plate price down to ₹10", () => {
    const estimate = {
      low: 1_375 * 200,
      high: 2_375 * 200,
      amount: 2_375 * 200,
      label: "Estimate" as const,
      basis: referenceTableBasis({
        unit: "per_plate",
        unitLow: 1_375,
        unitHigh: 2_375,
        tier: "X",
      }),
    };
    const after = rescaleEstimate(estimate, "per_plate", 200, 300);
    expect(after.high).toBe(712_500);
    // ₹2,375 a plate rounds to ₹2,380, above the high, so it floors to ₹2,370.
    expect(after.amount).toBe(2_370 * 300);
  });

  it("a line under ₹1,000 floors to ₹100, not to zero", () => {
    const estimate = {
      low: 450,
      high: 950,
      amount: 950,
      label: "Estimate" as const,
      basis: referenceTableBasis({
        unit: "per_card",
        unitLow: 45,
        unitHigh: 95,
        tier: "Y",
      }),
    };
    const after = rescaleEstimate(estimate, "per_card", 10, 9);
    expect(after.high).toBe(855);
    expect(after.amount).toBe(800);
  });
});

describe("every S4 write refuses Viewers and people outside the Event", () => {
  type Caller = ReturnType<T["withIdentity"]>;
  async function fixture() {
    const t = newTest();
    const plan = await t.run((ctx) => setUpPlan(ctx, "member"));
    const ids = await t.run(async (ctx) => {
      await seedMembership(ctx, {
        clerkId: "papa",
        role: "viewer",
        eventId: plan.eventId,
      });
      await seedMembership(ctx, { clerkId: "stranger" });
      const timelineEntry = await ctx.db.insert("entries", {
        eventId: plan.eventId,
        itemId: plan.items.timeline,
        kind: "timeline",
        order: 0,
        functionKey: null,
        fields: {
          title: "Book Venues",
          date: "2026-10-30",
          time: null,
          leadKey: null,
          priority: null,
          late: false,
          note: null,
          vendorCategory: null,
          done: false,
        },
        assumed: ["date"],
        createdBy: plan.actor,
        version: 1,
        deletedAt: null,
      });
      const suggestion = await ctx.db.insert("items", {
        eventId: plan.eventId,
        sectionId: plan.sections.notes,
        kind: "suggestion",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: {
          title: "Safa tying corner",
          body: "For the baraat.",
          costCategory: null,
          quantity: null,
          estimate: null,
          status: "open",
        },
        createdBy: plan.actor,
        version: 1,
        deletedAt: null,
      });
      const note = await ctx.db.insert("items", {
        eventId: plan.eventId,
        sectionId: plan.sections.notes,
        kind: "note",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: { text: "Ask about parking", citations: [] },
        createdBy: plan.actor,
        version: 1,
        deletedAt: null,
      });
      return { timelineEntry, suggestion, note };
    });
    const writes: [string, (who: Caller) => Promise<unknown>][] = [
      [
        "entries.add",
        (who) =>
          who.mutation(api.entries.add, {
            itemId: plan.items.budget,
            functionKey: null,
            input: { kind: "budget", label: "Hall", amount: null },
          }),
      ],
      [
        "entries.update",
        (who) =>
          who.mutation(api.entries.update, {
            entryId: ids.timelineEntry,
            patch: { kind: "timeline", title: "x" },
          }),
      ],
      [
        "entries.tick",
        (who) =>
          who.mutation(api.entries.tick, {
            entryId: ids.timelineEntry,
            done: true,
          }),
      ],
      [
        "entries.remove",
        (who) =>
          who.mutation(api.entries.remove, { entryId: ids.timelineEntry }),
      ],
      [
        "entries.confirmAssumption",
        (who) =>
          who.mutation(api.entries.confirmAssumption, {
            entryId: ids.timelineEntry,
            field: "date",
          }),
      ],
      [
        "suggestions.addToPlan",
        (who) =>
          who.mutation(api.suggestions.addToPlan, { itemId: ids.suggestion }),
      ],
      [
        "suggestions.dismiss",
        (who) =>
          who.mutation(api.suggestions.dismiss, { itemId: ids.suggestion }),
      ],
      [
        "notes.add",
        (who) =>
          who.mutation(api.notes.add, {
            eventId: plan.eventId,
            text: "Hi",
            functionKey: null,
          }),
      ],
      [
        "notes.update",
        (who) =>
          who.mutation(api.notes.update, { itemId: ids.note, text: "z" }),
      ],
    ];
    return { t, plan, ids, writes };
  }

  for (const who of ["papa", "stranger"] as const) {
    it(`refuses ${who === "papa" ? "a Viewer" : "someone outside the Event"} on every write and changes nothing`, async () => {
      const { t, plan, ids, writes } = await fixture();
      const caller = t.withIdentity(identityFor(who));
      for (const [name, write] of writes) {
        await expect(write(caller), name).rejects.toThrow(/AccessDenied/);
      }
      expect((await entry(t, ids.timelineEntry)).version).toBe(1);
      const changes = await t.run((ctx) =>
        ctx.db
          .query("changes")
          .withIndex("by_event_at", (q) => q.eq("eventId", plan.eventId))
          .collect(),
      );
      expect(changes.filter((c) => c.table !== "sections")).toEqual([]);
    });
  }
});
