/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

// X7 (issue #62): hand-typed Vendors (vendors.md, "Adding a Vendor by hand").
// A Member types a Vendor with no website; it is private to the Event, holds
// only what the Member typed, has no Listed prices and no Marker.

type T = ReturnType<typeof newTest>;

const JAIPUR = {
  name: "Jaipur",
  tier: "Y" as const,
  centre: { lat: 26.9124, lng: 75.7873 },
};

type Seeded = {
  eventId: Id<"events">;
  clerkId: string;
  member: Id<"memberships">;
  entries: { caterer: Id<"entries">; mehendiArtist: Id<"entries"> };
};

async function seedEvent(ctx: MutationCtx, clerkId: string): Promise<Seeded> {
  const eventId = await insertEvent(ctx, `${clerkId}'s wedding`);
  await ctx.db.patch("events", eventId, {
    city: JAIPUR,
    briefState: "planned",
  });
  const { membershipId } = await seedMembership(ctx, { clerkId, eventId });
  const actor = { kind: "member" as const, membershipId };
  const sections = await createStartingSections(ctx, eventId, actor);
  const checklist = await ctx.db.insert("items", {
    eventId,
    sectionId: sections.money,
    kind: "checklist",
    position: { x: 0, y: 0 },
    size: null,
    functionKey: null,
    data: { note: null },
    createdBy: actor,
    version: 1,
    deletedAt: null,
  });
  const entry = (
    order: number,
    vendorCategory: string | null,
    freeLabel: string | null,
  ) =>
    ctx.db.insert("entries", {
      eventId,
      itemId: checklist,
      kind: "checklist",
      order,
      functionKey: null,
      fields: {
        vendorCategory,
        freeLabel,
        functionKeys: [],
        bookByEntryId: null,
        budgetEntryIds: [],
      },
      assumed: [],
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  return {
    eventId,
    clerkId,
    member: membershipId,
    entries: {
      caterer: await entry(0, "caterer", null),
      mehendiArtist: await entry(1, null, "Mehendi artist"),
    },
  };
}

const setup = (t: T, clerkId = "Meera") =>
  t.run((ctx) => seedEvent(ctx, clerkId));

const as = (t: T, seeded: { clerkId: string }) =>
  t.withIdentity(identityFor(seeded.clerkId));

const SHARMA = {
  name: "Sharma ji Caterers",
  phone: "+91 98290 12345",
  area: "Malviya Nagar",
};

describe("adding a hand-typed Vendor", () => {
  it("stores only what the Member typed, shortlists it onto the Vendors Section and links it as Considering", async () => {
    const t = newTest();
    const a = await setup(t);
    const added = await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.caterer,
      ...SHARMA,
    });

    const row = await t.run((ctx) =>
      ctx.db.get("privateVendors", added.privateVendorId),
    );
    expect(row).toMatchObject({
      eventId: a.eventId,
      name: "Sharma ji Caterers",
      vendorCategory: "caterer",
      freeLabel: null,
      phone: "+91 98290 12345",
      area: "Malviya Nagar",
      marker: null,
      createdBy: { kind: "member", membershipId: a.member },
      version: 1,
    });
    // Never a shared Vendor, and never a Listed price.
    expect(await t.run((ctx) => ctx.db.query("vendors").collect())).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("listedPrices").collect()),
    ).toEqual([]);

    const item = await t.run((ctx) => ctx.db.get("items", added.itemId));
    expect(item).toMatchObject({
      kind: "shortlistedVendor",
      data: { privateVendorId: added.privateVendorId },
    });
    const section = await t.run((ctx) =>
      ctx.db.get("sections", item!.sectionId),
    );
    expect(section?.kind).toBe("vendors");
    const link = await t.run((ctx) => ctx.db.get("vendorLinks", added.linkId));
    expect(link).toMatchObject({
      shortlistItemId: added.itemId,
      checklistEntryId: a.entries.caterer,
      status: "considering",
    });

    // The edit history names it.
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", added.privateVendorId))
        .collect(),
    );
    expect(changes).toHaveLength(1);
  });

  it("takes a free-label Entry's label as its category", async () => {
    const t = newTest();
    const a = await setup(t);
    const added = await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.mehendiArtist,
      name: "Rekha aunty",
      phone: null,
      area: null,
    });
    const row = await t.run((ctx) =>
      ctx.db.get("privateVendors", added.privateVendorId),
    );
    expect(row).toMatchObject({
      vendorCategory: null,
      freeLabel: "Mehendi artist",
      phone: null,
      area: null,
    });
  });

  it("trims what was typed and refuses an empty name or a phone with letters in it", async () => {
    const t = newTest();
    const a = await setup(t);
    const added = await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.caterer,
      name: "  Sharma ji Caterers  ",
      phone: "   ",
      area: " Malviya Nagar ",
    });
    expect(
      await t.run((ctx) => ctx.db.get("privateVendors", added.privateVendorId)),
    ).toMatchObject({
      name: "Sharma ji Caterers",
      phone: null,
      area: "Malviya Nagar",
    });
    await expect(
      as(t, a).mutation(api.vendors.addHandTyped, {
        eventId: a.eventId,
        checklistEntryId: a.entries.caterer,
        name: "   ",
        phone: null,
        area: null,
      }),
    ).rejects.toThrow(/name/);
    await expect(
      as(t, a).mutation(api.vendors.addHandTyped, {
        eventId: a.eventId,
        checklistEntryId: a.entries.caterer,
        name: "Sharma ji",
        phone: "call me",
        area: null,
      }),
    ).rejects.toThrow(/phone/);
  });

  it("refuses a Viewer, and an Entry from another Event", async () => {
    const t = newTest();
    const a = await setup(t);
    const b = await setup(t, "Kabir");
    await t.run((ctx) =>
      seedMembership(ctx, {
        clerkId: "Dadi",
        role: "viewer",
        eventId: a.eventId,
      }),
    );
    await expect(
      t.withIdentity(identityFor("Dadi")).mutation(api.vendors.addHandTyped, {
        eventId: a.eventId,
        checklistEntryId: a.entries.caterer,
        ...SHARMA,
      }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      as(t, a).mutation(api.vendors.addHandTyped, {
        eventId: a.eventId,
        checklistEntryId: b.entries.caterer,
        ...SHARMA,
      }),
    ).rejects.toThrow(/NotFound/);
    expect(
      await t.run((ctx) => ctx.db.query("privateVendors").collect()),
    ).toEqual([]);
  });
});

describe("editing a hand-typed Vendor", () => {
  it("changes what the Member typed and bumps the version; a Viewer is refused", async () => {
    const t = newTest();
    const a = await setup(t);
    const added = await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.caterer,
      ...SHARMA,
    });
    const { version } = await as(t, a).mutation(api.vendors.editHandTyped, {
      privateVendorId: added.privateVendorId,
      name: "Sharma ji Caterers & Sweets",
      phone: "0141 270 1234",
      area: null,
    });
    expect(version).toBe(2);
    expect(
      await t.run((ctx) => ctx.db.get("privateVendors", added.privateVendorId)),
    ).toMatchObject({
      name: "Sharma ji Caterers & Sweets",
      phone: "0141 270 1234",
      area: null,
      vendorCategory: "caterer",
    });

    await t.run((ctx) =>
      seedMembership(ctx, {
        clerkId: "Dadi",
        role: "viewer",
        eventId: a.eventId,
      }),
    );
    await expect(
      t.withIdentity(identityFor("Dadi")).mutation(api.vendors.editHandTyped, {
        privateVendorId: added.privateVendorId,
        name: "Changed",
        phone: null,
        area: null,
      }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("a hand-typed Vendor stays private to its Event", () => {
  it("shows on its own Event's Canvas and nowhere else", async () => {
    const t = newTest();
    const a = await setup(t);
    const b = await setup(t, "Kabir");
    const added = await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.caterer,
      ...SHARMA,
    });

    const seenByA = await as(t, a).query(api.vendors.forEvent, {
      eventId: a.eventId,
    });
    expect(seenByA).toEqual([
      expect.objectContaining({
        itemId: added.itemId,
        card: null,
        handTyped: expect.objectContaining({
          _id: added.privateVendorId,
          name: "Sharma ji Caterers",
          categoryLabel: "Caterer",
          phone: "+91 98290 12345",
          area: "Malviya Nagar",
        }),
        links: [
          expect.objectContaining({ _id: added.linkId, status: "considering" }),
        ],
      }),
    ]);

    // Kabir's Event has none, and Kabir can't read Meera's.
    expect(
      await as(t, b).query(api.vendors.forEvent, { eventId: b.eventId }),
    ).toEqual([]);
    await expect(
      as(t, b).query(api.vendors.forEvent, { eventId: a.eventId }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      as(t, b).query(api.vendors.forItem, { itemId: added.itemId }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      as(t, b).mutation(api.vendors.editHandTyped, {
        privateVendorId: added.privateVendorId,
        name: "Taken over",
        phone: null,
        area: null,
      }),
    ).rejects.toThrow(/AccessDenied/);

    // Known Vendors in Jaipur never include it, in either Event.
    for (const seeded of [a, b]) {
      const found = await as(t, seeded).query(api.vendors.findKnown, {
        eventId: seeded.eventId,
        category: "caterer",
        functionKey: null,
      });
      expect(found.vendors.map((v) => v.vendor.name)).not.toContain(
        "Sharma ji Caterers",
      );
    }
  });

  it("never reaches the Estimate research: its name, phone and area stay out", async () => {
    const t = newTest();
    const a = await setup(t);
    await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.caterer,
      ...SHARMA,
    });
    const prices = await t.query(internal.estimates.shortlistedListedPrices, {
      eventId: a.eventId,
    });
    expect(prices).toEqual([]);
    const text = JSON.stringify(prices);
    for (const typed of Object.values(SHARMA))
      expect(text).not.toContain(typed);
  });
});

describe("the hand-typed Vendor card", () => {
  it("shows a fixed category's Estimate from the reference table, labelled as an Estimate, and no Listed prices", async () => {
    const t = newTest();
    const a = await setup(t);
    const added = await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.caterer,
      ...SHARMA,
    });
    const view = await as(t, a).query(api.vendors.forItem, {
      itemId: added.itemId,
    });
    expect(view.view?.card).toBeNull();
    expect(view.view?.handTyped?.estimate).toMatchObject({
      basis: expect.objectContaining({ kind: "referenceTable" }),
    });
    expect(view.canManage).toBe(true);
  });

  it("has no Estimate yet for a free label with nothing researched", async () => {
    const t = newTest();
    const a = await setup(t);
    const added = await as(t, a).mutation(api.vendors.addHandTyped, {
      eventId: a.eventId,
      checklistEntryId: a.entries.mehendiArtist,
      name: "Rekha aunty",
      phone: null,
      area: null,
    });
    const view = await as(t, a).query(api.vendors.forItem, {
      itemId: added.itemId,
    });
    expect(view.view?.handTyped).toMatchObject({
      categoryLabel: "Mehendi artist",
      estimate: null,
    });
  });
});
