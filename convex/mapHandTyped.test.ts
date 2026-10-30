/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";
import { MAX_FROM_CITY_KM } from "./map";

// Issue #136: a Member drops a Marker for a hand-typed Vendor (X7). The Marker
// is the Member's own knowledge, private to the Event like the Vendor, and
// held to the same area as a dragged shared Marker.

type T = ReturnType<typeof newTest>;

const JAIPUR = {
  name: "Jaipur",
  tier: "Y" as const,
  centre: { lat: 26.9124, lng: 75.7873 },
};
/** Malviya Nagar, about 7 km from Jaipur's centre. */
const MALVIYA_NAGAR = { lat: 26.8549, lng: 75.8243 };
/** Mansarovar, about 8 km from Malviya Nagar. */
const MANSAROVAR = { lat: 26.8682, lng: 75.7599 };
/** Ajmer, about 120 km away. */
const AJMER = { lat: 26.4499, lng: 74.6399 };

type Seeded = {
  eventId: Id<"events">;
  clerkId: string;
  member: Id<"memberships">;
  privateVendorId: Id<"privateVendors">;
  itemId: Id<"items">;
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
  const privateVendorId = await ctx.db.insert("privateVendors", {
    eventId,
    name: `${clerkId}'s family caterer`,
    vendorCategory: "caterer",
    freeLabel: null,
    phone: null,
    area: "Malviya Nagar",
    marker: null,
    createdBy: actor,
    createdAt: Date.now(),
    version: 1,
  });
  const itemId = await ctx.db.insert("items", {
    eventId,
    sectionId: sections.vendors,
    kind: "shortlistedVendor",
    position: { x: 0, y: 0 },
    size: null,
    functionKey: null,
    data: { privateVendorId },
    createdBy: actor,
    version: 1,
    deletedAt: null,
  });
  return { eventId, clerkId, member: membershipId, privateVendorId, itemId };
}

const setup = (t: T, clerkId = "Meera") =>
  t.run((ctx) => seedEvent(ctx, clerkId));
const as = (t: T, clerkId: string) => t.withIdentity(identityFor(clerkId));
const rowOf = (t: T, id: Id<"privateVendors">) =>
  t.run(async (ctx) => (await ctx.db.get("privateVendors", id))!);

describe("api.map.placeHandTypedMarker", () => {
  it("drops a Marker where the Member puts it, bumps the version and records it in the history", async () => {
    const t = newTest();
    const a = await setup(t);
    const { version } = await as(t, a.clerkId).mutation(
      api.map.placeHandTypedMarker,
      {
        eventId: a.eventId,
        privateVendorId: a.privateVendorId,
        expectedVersion: 1,
        ...MALVIYA_NAGAR,
      },
    );
    expect(version).toBe(2);
    expect((await rowOf(t, a.privateVendorId)).marker).toEqual(MALVIYA_NAGAR);
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", a.privateVendorId))
        .collect(),
    );
    expect(changes).toHaveLength(1);
  });

  it("moves it again within the move limit, and refuses a stale version", async () => {
    const t = newTest();
    const a = await setup(t);
    const place = (expectedVersion: number, at: { lat: number; lng: number }) =>
      as(t, a.clerkId).mutation(api.map.placeHandTypedMarker, {
        eventId: a.eventId,
        privateVendorId: a.privateVendorId,
        expectedVersion,
        ...at,
      });
    await place(1, MALVIYA_NAGAR);
    await place(2, MANSAROVAR);
    expect((await rowOf(t, a.privateVendorId)).marker).toEqual(MANSAROVAR);
    await expect(place(2, MALVIYA_NAGAR)).rejects.toThrow(/VersionConflict/);
    expect((await rowOf(t, a.privateVendorId)).version).toBe(3);
  });

  it(`refuses a point more than ${MAX_FROM_CITY_KM} km from the Event's city, or off the map`, async () => {
    const t = newTest();
    const a = await setup(t);
    const place = (at: { lat: number; lng: number }) =>
      as(t, a.clerkId).mutation(api.map.placeHandTypedMarker, {
        eventId: a.eventId,
        privateVendorId: a.privateVendorId,
        expectedVersion: 1,
        ...at,
      });
    await expect(place(AJMER)).rejects.toThrow(/outside Jaipur/);
    await expect(place({ lat: 95, lng: 75 })).rejects.toThrow(
      /isn't on the map/,
    );
    expect((await rowOf(t, a.privateVendorId)).marker).toBeNull();
  });

  it("refuses a Viewer, and another Event's hand-typed Vendor", async () => {
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
      as(t, "Dadi").mutation(api.map.placeHandTypedMarker, {
        eventId: a.eventId,
        privateVendorId: a.privateVendorId,
        expectedVersion: 1,
        ...MALVIYA_NAGAR,
      }),
    ).rejects.toThrow(/AccessDenied/);
    // Kabir through his own Event, naming Meera's Vendor.
    await expect(
      as(t, b.clerkId).mutation(api.map.placeHandTypedMarker, {
        eventId: b.eventId,
        privateVendorId: a.privateVendorId,
        expectedVersion: 1,
        ...MALVIYA_NAGAR,
      }),
    ).rejects.toThrow(/AccessDenied/);
    expect((await rowOf(t, a.privateVendorId)).marker).toBeNull();
  });
});

describe("hand-typed Vendors on the map", () => {
  it("lists the Event's own hand-typed Vendors, with a Marker once one is dropped, and never another Event's", async () => {
    const t = newTest();
    const a = await setup(t);
    const b = await setup(t, "Kabir");
    const before = await as(t, a.clerkId).query(api.map.view, {
      eventId: a.eventId,
    });
    expect(before.handTyped).toEqual([
      expect.objectContaining({
        _id: a.privateVendorId,
        itemId: a.itemId,
        name: "Meera's family caterer",
        marker: null,
        version: 1,
      }),
    ]);
    await as(t, a.clerkId).mutation(api.map.placeHandTypedMarker, {
      eventId: a.eventId,
      privateVendorId: a.privateVendorId,
      expectedVersion: 1,
      ...MALVIYA_NAGAR,
    });
    const after = await as(t, a.clerkId).query(api.map.view, {
      eventId: a.eventId,
    });
    expect(after.handTyped).toEqual([
      expect.objectContaining({ marker: MALVIYA_NAGAR, version: 2 }),
    ]);
    const kabirs = await as(t, b.clerkId).query(api.map.view, {
      eventId: b.eventId,
    });
    expect(kabirs.handTyped.map((v) => v.name)).toEqual([
      "Kabir's family caterer",
    ]);
  });
});
