/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import starterSet from "../seed/jaipur-vendors.json";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

// S9 (issue #42): the starter set, shared Vendors with each Event's private
// layer, shortlisting onto the Vendors Section and checklist links.

type T = ReturnType<typeof newTest>;

const JAIPUR = {
  name: "Jaipur",
  tier: "Y" as const,
  centre: { lat: 26.9124, lng: 75.7873 },
};
const PUNE = {
  name: "Pune",
  tier: "X" as const,
  centre: { lat: 18.5204, lng: 73.8567 },
};

type Seeded = {
  eventId: Id<"events">;
  member: Id<"memberships">;
  clerkId: string;
  checklist: Id<"items">;
  /** Checklist Entries by name. */
  entries: { caterer: Id<"entries">; venue: Id<"entries"> };
  /** The caterer Entry's Timeline deadline. */
  deadline: Id<"entries">;
};

/** An Event with a sangeet (300 Guests), a Vendor checklist and a Timeline. */
async function seedEvent(
  ctx: MutationCtx,
  clerkId: string,
  city: typeof JAIPUR | typeof PUNE = JAIPUR,
  sangeetGuests = 300,
): Promise<Seeded> {
  const eventId = await insertEvent(ctx, `${clerkId}'s wedding`);
  await ctx.db.patch("events", eventId, { city, briefState: "planned" });
  const { membershipId } = await seedMembership(ctx, { clerkId, eventId });
  const actor = { kind: "member" as const, membershipId };
  const sections = await createStartingSections(ctx, eventId, actor);
  for (const [order, key] of ["sangeet", "wedding"].entries()) {
    await ctx.db.insert("eventFunctions", {
      eventId,
      key,
      name: key === "sangeet" ? "Sangeet" : "Wedding",
      date: null,
      guests: key === "sangeet" ? sangeetGuests : 400,
      assumed: [],
      order,
      version: 1,
    });
  }
  const planItem = (kind: "checklist" | "timeline") =>
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
  const checklist = await planItem("checklist");
  const timeline = await planItem("timeline");
  const deadline = await ctx.db.insert("entries", {
    eventId,
    itemId: timeline,
    kind: "timeline",
    order: 0,
    functionKey: null,
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
  const checklistEntry = (
    order: number,
    vendorCategory: string,
    bookByEntryId: Id<"entries"> | null,
  ) =>
    ctx.db.insert("entries", {
      eventId,
      itemId: checklist,
      kind: "checklist",
      order,
      functionKey: null,
      fields: {
        vendorCategory,
        freeLabel: null,
        functionKeys: ["sangeet", "wedding"],
        bookByEntryId,
        budgetEntryIds: [],
      },
      assumed: [],
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  const caterer = await checklistEntry(0, "caterer", deadline);
  const venue = await checklistEntry(1, "venue", null);
  return {
    eventId,
    member: membershipId,
    clerkId,
    checklist,
    entries: { caterer, venue },
    deadline,
  };
}

async function setup(
  t: T,
  clerkId = "Meera",
  city: typeof JAIPUR | typeof PUNE = JAIPUR,
  sangeetGuests = 300,
): Promise<Seeded> {
  await t.mutation(internal.vendors.loadStarterSet, {});
  return await t.run((ctx) => seedEvent(ctx, clerkId, city, sangeetGuests));
}

async function vendorByDomain(t: T, domain: string): Promise<Doc<"vendors">> {
  const vendor = await t.run((ctx) =>
    ctx.db
      .query("vendors")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique(),
  );
  if (vendor === null) throw new Error(`No Vendor ${domain}`);
  return vendor;
}

const as = (t: T, seeded: Seeded) =>
  t.withIdentity(identityFor(seeded.clerkId));

// ---------------------------------------------------------------------------

describe("internal.vendors.loadStarterSet", () => {
  it("inserts the 16 starter Vendors and their Listed prices", async () => {
    const t = newTest();
    const result = await t.mutation(internal.vendors.loadStarterSet, {});
    expect(result).toEqual({ inserted: 16, existing: 0 });
    const vendors = await t.run((ctx) => ctx.db.query("vendors").collect());
    expect(vendors).toHaveLength(16);
    expect(vendors.every((v) => v.source === "starterSet")).toBe(true);
    expect(vendors.every((v) => v.version === 1)).toBe(true);
    const prices = await t.run((ctx) => ctx.db.query("listedPrices").collect());
    expect(prices).toHaveLength(
      starterSet.reduce((n, v) => n + v.listedPrices.length, 0),
    );
    expect(prices.every((p) => p.supersededAt === null)).toBe(true);
  });

  it("is idempotent by domain and never rewrites an existing row, so a moved Marker stays moved", async () => {
    const t = newTest();
    await t.mutation(internal.vendors.loadStarterSet, {});
    const rood = await vendorByDomain(t, "roodmahal.com");
    await t.run((ctx) =>
      ctx.db.patch("vendors", rood._id, {
        marker: { ...rood.marker!, lat: 26.95, lng: 75.75, approximate: false },
        version: 2,
      }),
    );
    const parampara = await vendorByDomain(t, "virasatjaipur.com");
    await t.run((ctx) => ctx.db.delete("vendors", parampara._id));
    const before = await t.run((ctx) => ctx.db.query("vendors").collect());
    const pricesBefore = await t.run((ctx) =>
      ctx.db.query("listedPrices").collect(),
    );

    const result = await t.mutation(internal.vendors.loadStarterSet, {});

    expect(result).toEqual({ inserted: 1, existing: 15 });
    const after = await t.run((ctx) => ctx.db.query("vendors").collect());
    for (const vendor of before)
      expect(after.find((v) => v._id === vendor._id)).toEqual(vendor);
    const moved = await vendorByDomain(t, "roodmahal.com");
    expect(moved.marker).toMatchObject({ lat: 26.95, lng: 75.75 });
    // Only the missing Vendor's Listed price is added.
    const pricesAfter = await t.run((ctx) =>
      ctx.db.query("listedPrices").collect(),
    );
    expect(pricesAfter).toHaveLength(pricesBefore.length + 1);
  });
});

// ---------------------------------------------------------------------------

describe("api.vendors.findKnown", () => {
  it("shows the Event's city's starter caterers, including ones with only an area served", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const found = await as(t, seeded).query(api.vendors.findKnown, {
      eventId: seeded.eventId,
      category: "caterer",
      functionKey: "sangeet",
    });
    expect(found.vendors.map((v) => v.vendor.domain).sort()).toEqual([
      "ganeshdalbati.com",
      "gdcaterer.com",
      "mlcaterers.com",
      "vinayakfoodsncatering.in",
    ]);
  });

  it("filters Venues by the Function's Guests", async () => {
    const t = newTest();
    const seeded = await setup(t, "Meera", JAIPUR, 450);
    const found = await as(t, seeded).query(api.vendors.findKnown, {
      eventId: seeded.eventId,
      category: "venue",
      functionKey: "sangeet",
    });
    const domains = found.vendors.map((v) => v.vendor.domain);
    expect(domains).toHaveLength(5);
    // Parampara seats 200 to 400.
    expect(domains).not.toContain("virasatjaipur.com");
  });

  it("works out the comparable Listed price for the Function", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const found = await as(t, seeded).query(api.vendors.findKnown, {
      eventId: seeded.eventId,
      category: "venue",
      functionKey: "sangeet",
    });
    const parampara = found.vendors.find(
      (v) => v.vendor.domain === "virasatjaipur.com",
    )!;
    expect(parampara.listedPrices[0]!.comparable).toMatchObject({
      label: "₹3.6L to ₹10.5L, from Listed price",
    });
    // A comparable Listed price means no Estimate on the card.
    expect(parampara.estimate).toBeNull();
  });

  it("shows the Estimate on a card with no comparable Listed price", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const found = await as(t, seeded).query(api.vendors.findKnown, {
      eventId: seeded.eventId,
      category: "caterer",
      functionKey: "sangeet",
    });
    const gd = found.vendors.find((v) => v.vendor.domain === "gdcaterer.com")!;
    expect(gd.listedPrices).toEqual([]);
    expect(gd.estimate).toMatchObject({
      unit: "per_plate",
      unitLow: 1000,
      unitHigh: 2000,
      basis: { kind: "referenceTable" },
    });
  });

  it("finds none outside Jaipur", async () => {
    const t = newTest();
    const seeded = await setup(t, "Meera", PUNE);
    const found = await as(t, seeded).query(api.vendors.findKnown, {
      eventId: seeded.eventId,
      category: "caterer",
      functionKey: null,
    });
    expect(found).toMatchObject({ city: "Pune", vendors: [] });
  });
});

// ---------------------------------------------------------------------------

describe("api.vendors.shortlist", () => {
  it("makes one Shortlisted Vendor per Event even when it serves two Entries; each link has its own status", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const ml = await vendorByDomain(t, "mlcaterers.com");
    const member = as(t, seeded);

    const first = await member.mutation(api.vendors.shortlist, {
      eventId: seeded.eventId,
      vendorId: ml._id,
      checklistEntryId: seeded.entries.caterer,
    });
    const second = await member.mutation(api.vendors.shortlist, {
      eventId: seeded.eventId,
      vendorId: ml._id,
      checklistEntryId: seeded.entries.venue,
    });

    expect(second.itemId).toBe(first.itemId);
    expect(second.linkId).not.toBe(first.linkId);
    const items = await t.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", seeded.eventId).eq("kind", "shortlistedVendor"),
        )
        .collect(),
    );
    expect(items).toHaveLength(1);
    const vendorsSection = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("sections")
          .withIndex("by_event", (q) => q.eq("eventId", seeded.eventId))
          .collect()
      ).find((s) => s.kind === "vendors"),
    );
    expect(items[0]).toMatchObject({
      sectionId: vendorsSection!._id,
      data: { vendorId: ml._id },
      createdBy: { kind: "member", membershipId: seeded.member },
    });

    await member.mutation(api.vendors.setLinkStatus, {
      linkId: first.linkId,
      status: "contacted",
    });
    const shortlisted = await member.query(api.vendors.forEvent, {
      eventId: seeded.eventId,
    });
    expect(shortlisted).toHaveLength(1);
    expect(
      shortlisted[0]!.links.map((l) => [l.checklistEntryId, l.status]),
    ).toEqual(
      expect.arrayContaining([
        [seeded.entries.caterer, "contacted"],
        [seeded.entries.venue, "considering"],
      ]),
    );
  });

  it("shortlisting the same pair again changes nothing", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const ml = await vendorByDomain(t, "mlcaterers.com");
    const args = {
      eventId: seeded.eventId,
      vendorId: ml._id,
      checklistEntryId: seeded.entries.caterer,
    };
    const first = await as(t, seeded).mutation(api.vendors.shortlist, args);
    const again = await as(t, seeded).mutation(api.vendors.shortlist, args);
    expect(again).toEqual(first);
    const links = await t.run((ctx) => ctx.db.query("vendorLinks").collect());
    expect(links).toHaveLength(1);
  });

  it("records the shortlist in the Event's history as the Member's own edit", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const ml = await vendorByDomain(t, "mlcaterers.com");
    const { itemId, linkId } = await as(t, seeded).mutation(
      api.vendors.shortlist,
      {
        eventId: seeded.eventId,
        vendorId: ml._id,
        checklistEntryId: seeded.entries.caterer,
      },
    );
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", seeded.eventId))
        .collect(),
    );
    expect(changes.map((c) => [c.table, c.docId, c.op])).toEqual(
      expect.arrayContaining([
        ["items", itemId, "create"],
        ["vendorLinks", linkId, "create"],
      ]),
    );
  });

  it("links to the checklist Entry for the Vendor's category when none is given, creating one if needed", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const ml = await vendorByDomain(t, "mlcaterers.com");
    const viresh = await vendorByDomain(t, "vireshstudio.com");
    const member = as(t, seeded);
    const toCaterer = await member.mutation(api.vendors.shortlist, {
      eventId: seeded.eventId,
      vendorId: ml._id,
      checklistEntryId: null,
    });
    const link = await t.run((ctx) =>
      ctx.db.get("vendorLinks", toCaterer.linkId),
    );
    expect(link!.checklistEntryId).toBe(seeded.entries.caterer);

    // No photographer on the checklist yet: one is added.
    const toPhotographer = await member.mutation(api.vendors.shortlist, {
      eventId: seeded.eventId,
      vendorId: viresh._id,
      checklistEntryId: null,
    });
    const newLink = await t.run((ctx) =>
      ctx.db.get("vendorLinks", toPhotographer.linkId),
    );
    const entry = await t.run((ctx) =>
      ctx.db.get("entries", newLink!.checklistEntryId),
    );
    expect(entry).toMatchObject({
      kind: "checklist",
      itemId: seeded.checklist,
      fields: { vendorCategory: "photographer" },
    });
  });

  it("refuses a Viewer and a checklist Entry from another Event", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const other = await t.run((ctx) => seedEvent(ctx, "Kabir"));
    const viewer = await t.run((ctx) =>
      seedMembership(ctx, {
        clerkId: "Papa",
        eventId: seeded.eventId,
        role: "viewer",
      }),
    );
    expect(viewer).toBeDefined();
    const ml = await vendorByDomain(t, "mlcaterers.com");
    await expect(
      t.withIdentity(identityFor("Papa")).mutation(api.vendors.shortlist, {
        eventId: seeded.eventId,
        vendorId: ml._id,
        checklistEntryId: seeded.entries.caterer,
      }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      as(t, seeded).mutation(api.vendors.shortlist, {
        eventId: seeded.eventId,
        vendorId: ml._id,
        checklistEntryId: other.entries.caterer,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe("each Event's private layer", () => {
  it("two Events shortlist the same Vendor; each sees only its own links, statuses and Quotes", async () => {
    const t = newTest();
    const a = await setup(t, "Meera");
    const b = await t.run((ctx) => seedEvent(ctx, "Kabir"));
    const ml = await vendorByDomain(t, "mlcaterers.com");

    const inA = await as(t, a).mutation(api.vendors.shortlist, {
      eventId: a.eventId,
      vendorId: ml._id,
      checklistEntryId: a.entries.caterer,
    });
    const inB = await as(t, b).mutation(api.vendors.shortlist, {
      eventId: b.eventId,
      vendorId: ml._id,
      checklistEntryId: b.entries.caterer,
    });
    await as(t, a).mutation(api.vendors.setLinkStatus, {
      linkId: inA.linkId,
      status: "quoted",
    });
    await t.run((ctx) =>
      ctx.db.insert("quotes", {
        eventId: a.eventId,
        linkId: inA.linkId,
        amount: 950,
        unit: "per_plate",
        functionKeys: ["sangeet"],
        guests: 300,
        receivedAt: null,
        note: "live counters extra",
        fileId: null,
        source: "form",
        createdBy: { kind: "member", membershipId: a.member },
        createdAt: 1,
        version: 1,
      }),
    );

    const seenByA = await as(t, a).query(api.vendors.forEvent, {
      eventId: a.eventId,
    });
    const seenByB = await as(t, b).query(api.vendors.forEvent, {
      eventId: b.eventId,
    });
    expect(seenByA[0]!.links).toEqual([
      expect.objectContaining({
        _id: inA.linkId,
        status: "quoted",
        quote: expect.objectContaining({ amount: 950 }),
      }),
    ]);
    expect(seenByB[0]!.links).toEqual([
      expect.objectContaining({
        _id: inB.linkId,
        status: "considering",
        quote: null,
      }),
    ]);

    // The shared card in B's Chat carries only B's layer too.
    const found = await as(t, b).query(api.vendors.findKnown, {
      eventId: b.eventId,
      category: "caterer",
      functionKey: "sangeet",
    });
    const card = found.vendors.find((v) => v.vendor._id === ml._id)!;
    expect(card.eventLayer).toEqual({
      itemId: inB.itemId,
      links: [
        expect.objectContaining({ _id: inB.linkId, status: "considering" }),
      ],
    });

    // And B can't read A's layer.
    await expect(
      as(t, b).query(api.vendors.forEvent, { eventId: a.eventId }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      as(t, b).mutation(api.vendors.setLinkStatus, {
        linkId: inA.linkId,
        status: "dropped",
      }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

// ---------------------------------------------------------------------------

describe("the checklist status", () => {
  async function statusOf(t: T, seeded: Seeded) {
    const view = await as(t, seeded).query(api.entries.forItem, {
      itemId: seeded.checklist,
    });
    return view.checklistStatus[seeded.entries.caterer];
  }

  it("is to find with no active link, shortlisted once one is active, booked once one link is Booked; Booking marks the Entry done", async () => {
    const t = newTest();
    const seeded = await setup(t);
    const member = as(t, seeded);
    const ml = await vendorByDomain(t, "mlcaterers.com");
    const gd = await vendorByDomain(t, "gdcaterer.com");
    expect(await statusOf(t, seeded)).toBe("toFind");

    const mlLink = await member.mutation(api.vendors.shortlist, {
      eventId: seeded.eventId,
      vendorId: ml._id,
      checklistEntryId: seeded.entries.caterer,
    });
    expect(await statusOf(t, seeded)).toBe("shortlisted");

    await member.mutation(api.vendors.setLinkStatus, {
      linkId: mlLink.linkId,
      status: "dropped",
    });
    expect(await statusOf(t, seeded)).toBe("toFind");

    const gdLink = await member.mutation(api.vendors.shortlist, {
      eventId: seeded.eventId,
      vendorId: gd._id,
      checklistEntryId: seeded.entries.caterer,
    });
    expect(await statusOf(t, seeded)).toBe("shortlisted");
    const deadlineBefore = await t.run((ctx) =>
      ctx.db.get("entries", seeded.deadline),
    );
    expect(deadlineBefore).toMatchObject({ fields: { done: false } });

    await member.mutation(api.vendors.setLinkStatus, {
      linkId: gdLink.linkId,
      status: "booked",
    });
    expect(await statusOf(t, seeded)).toBe("booked");
    const deadline = await t.run((ctx) =>
      ctx.db.get("entries", seeded.deadline),
    );
    expect(deadline).toMatchObject({ fields: { done: true } });
  });
});
