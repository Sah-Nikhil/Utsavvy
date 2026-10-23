/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { researchedBasis } from "../lib/pricing";
import type { ItemData } from "../lib/types/canvas";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { createStartingSections } from "./canvas";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

type Role = Doc<"memberships">["role"];
type T = ReturnType<typeof newTest>;

/** The Suggestion from the Jaipur wedding's first plan, costed by research. */
function folkMusicians(): ItemData<"suggestion"> {
  return {
    title: "Rajasthani folk musicians at the sangeet dinner",
    body: "A Manganiyar group playing through dinner, in the courtyard.",
    costCategory: "folk_musicians",
    quantity: 1,
    estimate: {
      low: 25000,
      high: 60000,
      amount: 32000,
      label: "Estimate",
      basis: researchedBasis({
        unit: "per_function",
        unitLow: 25000,
        unitHigh: 60000,
        sourceUrls: [
          "https://example-folk.in/rates",
          "https://example-events.in/manganiyar",
          "https://example-jaipur.in/sangeet",
        ],
        searchedAt: Date.UTC(2026, 9, 22, 6, 0),
        reasoning: "Three Jaipur troupes list ₹25,000 to ₹60,000 an evening.",
      }),
    },
    status: "open",
  };
}

async function setUp(role: Role = "member", data = folkMusicians()) {
  const t = newTest();
  const ids = await t.run(async (ctx) => {
    const { eventId, membershipId } = await seedMembership(ctx, {
      clerkId: "meera",
      role,
    });
    const actor = { kind: "member" as const, membershipId };
    const sections = await createStartingSections(ctx, eventId, actor);
    const planItem = (kind: "budget" | "timeline") =>
      ctx.db.insert("items", {
        eventId,
        sectionId: sections.money,
        kind,
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: { note: null },
        createdBy: actor,
        version: 1,
        deletedAt: null,
      });
    const budget = await planItem("budget");
    const timeline = await planItem("timeline");
    await ctx.db.insert("eventFunctions", {
      eventId,
      key: "sangeet",
      name: "Sangeet",
      date: { kind: "day", value: "2027-02-14" },
      guests: 300,
      assumed: [],
      order: 0,
      version: 1,
    });
    const suggestion = await ctx.db.insert("items", {
      eventId,
      sectionId: sections.notes,
      kind: "suggestion",
      position: { x: 0, y: 0 },
      size: null,
      functionKey: "sangeet",
      data,
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
    return { eventId, membershipId, budget, timeline, suggestion };
  });
  return { t, ids, meera: t.withIdentity(identityFor("meera")) };
}

const entriesOf = (t: T, itemId: Id<"items">) =>
  t.run((ctx) =>
    ctx.db
      .query("entries")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect(),
  );

const itemData = (t: T, id: Id<"items">) =>
  t.run(async (ctx) => {
    const item = (await ctx.db.get("items", id))!;
    if (item.kind !== "suggestion") throw new Error("not a Suggestion");
    return item.data;
  });

describe("suggestions.addToPlan", () => {
  it("makes one budget Entry with the Suggestion's own Estimate and basis, unchanged, and one Timeline Entry", async () => {
    const { t, ids, meera } = await setUp();
    const result = await meera.mutation(api.suggestions.addToPlan, {
      itemId: ids.suggestion,
    });

    const budget = await entriesOf(t, ids.budget);
    expect(budget).toHaveLength(1);
    expect(budget[0]).toMatchObject({
      _id: result.budgetEntryId,
      kind: "budget",
      functionKey: "sangeet",
      assumed: [],
      createdBy: { kind: "member", membershipId: ids.membershipId },
      fields: {
        label: "Rajasthani folk musicians at the sangeet dinner",
        category: "folk_musicians",
        quantity: 1,
        unit: "per_function",
        estimate: folkMusicians().estimate,
        plannedAmount: null,
        role: "line",
        belowUsualRange: false,
        editedByMember: false,
      },
    });

    const timeline = await entriesOf(t, ids.timeline);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      _id: result.timelineEntryId,
      kind: "timeline",
      functionKey: "sangeet",
      fields: {
        title: "Rajasthani folk musicians at the sangeet dinner",
        note: "Added from a Suggestion",
        done: false,
        late: false,
      },
    });

    expect((await itemData(t, ids.suggestion)).status).toBe("added");
  });

  it("records all three writes in the history", async () => {
    const { t, ids, meera } = await setUp();
    await meera.mutation(api.suggestions.addToPlan, { itemId: ids.suggestion });
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", ids.eventId))
        .collect(),
    );
    expect(
      changes
        .filter((c) => c.table !== "sections")
        .map((c) => [c.table, c.op]),
    ).toEqual([
      ["entries", "create"],
      ["entries", "create"],
      ["items", "update"],
    ]);
  });

  it("a Suggestion with no cost becomes only a Timeline Entry", async () => {
    const { t, ids, meera } = await setUp("member", {
      title: "Ask the family pandit for February muhurat dates",
      body: "Before booking Venues.",
      costCategory: null,
      quantity: null,
      estimate: null,
      status: "open",
    });
    const result = await meera.mutation(api.suggestions.addToPlan, {
      itemId: ids.suggestion,
    });
    expect(result.budgetEntryId).toBeNull();
    expect(await entriesOf(t, ids.budget)).toHaveLength(0);
    expect(await entriesOf(t, ids.timeline)).toHaveLength(1);
  });

  it("refuses a Suggestion already added, so a double tap adds nothing twice", async () => {
    const { t, ids, meera } = await setUp();
    await meera.mutation(api.suggestions.addToPlan, { itemId: ids.suggestion });
    await expect(
      meera.mutation(api.suggestions.addToPlan, { itemId: ids.suggestion }),
    ).rejects.toThrow(/notOpen/);
    expect(await entriesOf(t, ids.budget)).toHaveLength(1);
  });

  it("refuses a Viewer", async () => {
    const { ids, meera } = await setUp("viewer");
    await expect(
      meera.mutation(api.suggestions.addToPlan, { itemId: ids.suggestion }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("suggestions.dismiss", () => {
  it("marks it Not for us and adds nothing to the plan", async () => {
    const { t, ids, meera } = await setUp();
    await meera.mutation(api.suggestions.dismiss, { itemId: ids.suggestion });
    expect((await itemData(t, ids.suggestion)).status).toBe("dismissed");
    expect(await entriesOf(t, ids.budget)).toHaveLength(0);
    expect(await entriesOf(t, ids.timeline)).toHaveLength(0);
  });

  it("refuses a Suggestion already added", async () => {
    const { ids, meera } = await setUp();
    await meera.mutation(api.suggestions.addToPlan, { itemId: ids.suggestion });
    await expect(
      meera.mutation(api.suggestions.dismiss, { itemId: ids.suggestion }),
    ).rejects.toThrow(/notOpen/);
  });
});
