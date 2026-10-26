/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
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

// S15 (issue #48): the Vendor map. `api.map.moveMarker` drags a Marker into
// place on the shared Vendor record; `api.map.view` is what the map draws.

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
  membershipId: Id<"memberships">;
  clerkId: string;
  vendorsSection: Id<"sections">;
};

async function seedEvent(
  ctx: MutationCtx,
  clerkId: string,
  city: typeof JAIPUR | typeof PUNE,
): Promise<Seeded> {
  const eventId = await insertEvent(ctx, `${clerkId}'s wedding`);
  await ctx.db.patch("events", eventId, { city, briefState: "planned" });
  const { membershipId } = await seedMembership(ctx, { clerkId, eventId });
  const sections = await createStartingSections(ctx, eventId, {
    kind: "member",
    membershipId,
  });
  return { eventId, membershipId, clerkId, vendorsSection: sections.vendors };
}

async function setup(
  t: T,
  clerkId = "Meera",
  city: typeof JAIPUR | typeof PUNE = JAIPUR,
): Promise<Seeded> {
  await t.mutation(internal.vendors.loadStarterSet, {});
  return await t.run((ctx) => seedEvent(ctx, clerkId, city));
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

/** Puts a Shortlisted Vendor Item for `vendorId` in the Event, linked with each status given. */
async function shortlist(
  t: T,
  seeded: Seeded,
  vendorId: Id<"vendors">,
  statuses: Doc<"vendorLinks">["status"][] = ["considering"],
): Promise<Id<"items">> {
  return await t.run(async (ctx) => {
    const actor = {
      kind: "member" as const,
      membershipId: seeded.membershipId,
    };
    const itemId = await ctx.db.insert("items", {
      eventId: seeded.eventId,
      sectionId: seeded.vendorsSection,
      kind: "shortlistedVendor",
      position: { x: 0, y: 0 },
      size: null,
      functionKey: null,
      data: { vendorId },
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
    for (const [order, status] of statuses.entries()) {
      const entryId = await ctx.db.insert("entries", {
        eventId: seeded.eventId,
        itemId,
        kind: "checklist",
        order,
        functionKey: null,
        fields: {
          vendorCategory: "venue",
          freeLabel: null,
          functionKeys: [],
          bookByEntryId: null,
          budgetEntryIds: [],
        },
        assumed: [],
        createdBy: actor,
        version: 1,
        deletedAt: null,
      });
      await ctx.db.insert("vendorLinks", {
        eventId: seeded.eventId,
        shortlistItemId: itemId,
        checklistEntryId: entryId,
        status,
        version: 1,
      });
    }
    return itemId;
  });
}

const as = (t: T, clerkId: string) => t.withIdentity(identityFor(clerkId));

async function vendorChanges(t: T) {
  return await t.run((ctx) =>
    ctx.db
      .query("changes")
      .collect()
      .then((rows) => rows.filter((row) => row.table === "vendors")),
  );
}

// ---------------------------------------------------------------------------

describe("api.map.moveMarker", () => {
  it("moves an approximate Marker on the shared record and clears approximate", async () => {
    const t = newTest();
    const meera = await setup(t);
    const rood = await vendorByDomain(t, "roodmahal.com");
    expect(rood.marker?.approximate).toBe(true);

    await as(t, "Meera").mutation(api.map.moveMarker, {
      eventId: meera.eventId,
      vendorId: rood._id,
      lat: 26.9301,
      lng: 75.7712,
    });

    const after = await vendorByDomain(t, "roodmahal.com");
    expect(after.marker).toMatchObject({
      lat: 26.9301,
      lng: 75.7712,
      approximate: false,
    });
    expect(after.version).toBe(rood.version + 1);
  });

  it("writes one history row, in the moving Event only", async () => {
    const t = newTest();
    const meera = await setup(t);
    const kabir = await t.run((ctx) => seedEvent(ctx, "Kabir", JAIPUR));
    const rood = await vendorByDomain(t, "roodmahal.com");

    await as(t, "Meera").mutation(api.map.moveMarker, {
      eventId: meera.eventId,
      vendorId: rood._id,
      lat: 26.9301,
      lng: 75.7712,
    });

    const changes = await vendorChanges(t);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      eventId: meera.eventId,
      docId: rood._id,
      op: "update",
      actor: { kind: "member", membershipId: meera.membershipId },
    });
    expect((changes[0]!.before as Doc<"vendors">).marker?.approximate).toBe(
      true,
    );
    expect((changes[0]!.after as Doc<"vendors">).marker).toMatchObject({
      lat: 26.9301,
      lng: 75.7712,
      approximate: false,
    });
    expect(changes.some((c) => c.eventId === kabir.eventId)).toBe(false);
  });

  it("lets an Event in another city move a Vendor it shortlisted", async () => {
    const t = newTest();
    const pune = await setup(t, "Asha", PUNE);
    const rood = await vendorByDomain(t, "roodmahal.com");
    await shortlist(t, pune, rood._id);

    await as(t, "Asha").mutation(api.map.moveMarker, {
      eventId: pune.eventId,
      vendorId: rood._id,
      lat: 26.93,
      lng: 75.77,
    });

    expect((await vendorByDomain(t, "roodmahal.com")).marker?.approximate).toBe(
      false,
    );
  });

  async function expectRefused(
    t: T,
    call: () => Promise<unknown>,
    error: RegExp,
  ) {
    const vendorsBefore = await t.run((ctx) =>
      ctx.db.query("vendors").collect(),
    );
    await expect(call()).rejects.toThrow(error);
    expect(await t.run((ctx) => ctx.db.query("vendors").collect())).toEqual(
      vendorsBefore,
    );
    expect(await vendorChanges(t)).toEqual([]);
  }

  it("refuses a Viewer and changes nothing", async () => {
    const t = newTest();
    const meera = await setup(t);
    await t.run((ctx) =>
      seedMembership(ctx, {
        clerkId: "Papa",
        eventId: meera.eventId,
        role: "viewer",
      }),
    );
    const rood = await vendorByDomain(t, "roodmahal.com");
    await expectRefused(
      t,
      () =>
        as(t, "Papa").mutation(api.map.moveMarker, {
          eventId: meera.eventId,
          vendorId: rood._id,
          lat: 26.93,
          lng: 75.77,
        }),
      /AccessDenied/,
    );
  });

  it("refuses someone with no membership in the Event and changes nothing", async () => {
    const t = newTest();
    const meera = await setup(t);
    // Kabir is a Member of his own Jaipur Event, not of Meera's.
    await t.run((ctx) => seedEvent(ctx, "Kabir", JAIPUR));
    const rood = await vendorByDomain(t, "roodmahal.com");
    await expectRefused(
      t,
      () =>
        as(t, "Kabir").mutation(api.map.moveMarker, {
          eventId: meera.eventId,
          vendorId: rood._id,
          lat: 26.93,
          lng: 75.77,
        }),
      /AccessDenied/,
    );
  });

  it("refuses a Vendor outside the Event's city that it hasn't shortlisted, and changes nothing", async () => {
    const t = newTest();
    await setup(t, "Asha", PUNE);
    const pune = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .collect()
        .then((rows) => rows[0]!),
    );
    const rood = await vendorByDomain(t, "roodmahal.com");
    await expectRefused(
      t,
      () =>
        as(t, "Asha").mutation(api.map.moveMarker, {
          eventId: pune.eventId,
          vendorId: rood._id,
          lat: 26.93,
          lng: 75.77,
        }),
      /AccessDenied/,
    );
  });

  it("refuses a Vendor that has no Marker to move, and a point off the globe", async () => {
    const t = newTest();
    const meera = await setup(t);
    const vinayak = await vendorByDomain(t, "vinayakfoodsncatering.in");
    expect(vinayak.marker).toBeUndefined();
    await expectRefused(
      t,
      () =>
        as(t, "Meera").mutation(api.map.moveMarker, {
          eventId: meera.eventId,
          vendorId: vinayak._id,
          lat: 26.93,
          lng: 75.77,
        }),
      /Invalid/,
    );
    const rood = await vendorByDomain(t, "roodmahal.com");
    await expectRefused(
      t,
      () =>
        as(t, "Meera").mutation(api.map.moveMarker, {
          eventId: meera.eventId,
          vendorId: rood._id,
          lat: 126.93,
          lng: 75.77,
        }),
      /Invalid/,
    );
  });

  // Review of #123, finding 1: the Marker is shared by every Event, so a
  // point far from the Vendor's city must never reach the shared row.
  it("refuses a point outside the Vendor's city, on the globe or not, and changes nothing", async () => {
    const t = newTest();
    const meera = await setup(t);
    const rood = await vendorByDomain(t, "roodmahal.com");
    for (const [lat, lng] of [
      [19.076, 72.8777], // Mumbai
      [0, 0],
      [27.25, 75.79], // ~38 km north of Jaipur's centre
    ] as const) {
      await expectRefused(
        t,
        () =>
          as(t, "Meera").mutation(api.map.moveMarker, {
            eventId: meera.eventId,
            vendorId: rood._id,
            lat,
            lng,
          }),
        /Invalid/,
      );
    }
  });

  it("refuses a point too far from the Marker for a Vendor shortlisted from another city", async () => {
    const t = newTest();
    const pune = await setup(t, "Asha", PUNE);
    const rood = await vendorByDomain(t, "roodmahal.com");
    await shortlist(t, pune, rood._id);
    // Pune's centre is no help for a Jaipur Vendor; Rood Mahal's own Marker is.
    await expectRefused(
      t,
      () =>
        as(t, "Asha").mutation(api.map.moveMarker, {
          eventId: pune.eventId,
          vendorId: rood._id,
          lat: PUNE.centre.lat,
          lng: PUNE.centre.lng,
        }),
      /Invalid/,
    );
    await expectRefused(
      t,
      () =>
        as(t, "Asha").mutation(api.map.moveMarker, {
          eventId: pune.eventId,
          vendorId: rood._id,
          lat: 27.1,
          lng: 75.76,
        }),
      /Invalid/,
    );
  });

  // Review of #123, finding 2: only an approximate Marker is dragged into place.
  it("refuses to move an exact Marker and changes nothing", async () => {
    const t = newTest();
    const meera = await setup(t);
    const velvet = await vendorByDomain(t, "weddingvelvet.com");
    expect(velvet.marker?.approximate).toBe(false);
    await expectRefused(
      t,
      () =>
        as(t, "Meera").mutation(api.map.moveMarker, {
          eventId: meera.eventId,
          vendorId: velvet._id,
          lat: velvet.marker!.lat + 0.005,
          lng: velvet.marker!.lng,
        }),
      /Invalid/,
    );
  });

  it("can't move the same Marker twice, so moves never chain away from the city", async () => {
    const t = newTest();
    const meera = await setup(t);
    const rood = await vendorByDomain(t, "roodmahal.com");
    const move = (lat: number) =>
      as(t, "Meera").mutation(api.map.moveMarker, {
        eventId: meera.eventId,
        vendorId: rood._id,
        lat,
        lng: rood.marker!.lng,
      });
    await move(rood.marker!.lat + 0.02);
    await expect(move(rood.marker!.lat + 0.04)).rejects.toThrow(/Invalid/);
    expect((await vendorByDomain(t, "roodmahal.com")).marker?.lat).toBe(
      rood.marker!.lat + 0.02,
    );
  });

  it("Restore puts the shared Marker back where it was, approximate again, and Restore again puts the move back", async () => {
    const t = newTest();
    const meera = await setup(t);
    const rood = await vendorByDomain(t, "roodmahal.com");
    await as(t, "Meera").mutation(api.map.moveMarker, {
      eventId: meera.eventId,
      vendorId: rood._id,
      lat: 26.9301,
      lng: 75.7712,
    });
    const [moved] = await vendorChanges(t);

    await as(t, "Meera").mutation(api.history.restore, {
      changeId: moved!._id,
    });
    expect((await vendorByDomain(t, "roodmahal.com")).marker).toEqual(
      rood.marker,
    );

    const restored = (await vendorChanges(t)).find((c) => c.op === "restore");
    expect(restored?.eventId).toBe(meera.eventId);
    await as(t, "Meera").mutation(api.history.restore, {
      changeId: restored!._id,
    });
    expect((await vendorByDomain(t, "roodmahal.com")).marker).toMatchObject({
      lat: 26.9301,
      lng: 75.7712,
      approximate: false,
    });
  });
});

describe("api.map.view", () => {
  it("centres on the Event's city and draws its Shortlisted Vendors by status, the other city Vendors faint", async () => {
    const t = newTest();
    const meera = await setup(t);
    const rood = await vendorByDomain(t, "roodmahal.com");
    const ml = await vendorByDomain(t, "mlcaterers.com");
    const velvet = await vendorByDomain(t, "weddingvelvet.com");
    await shortlist(t, meera, rood._id, ["dropped", "quoted", "contacted"]);
    await shortlist(t, meera, ml._id, ["booked", "considering"]);
    await shortlist(t, meera, velvet._id, ["dropped"]);

    const view = await as(t, "Meera").query(api.map.view, {
      eventId: meera.eventId,
    });

    expect(view.city).toEqual({ name: "Jaipur", centre: JAIPUR.centre });
    expect(view.canMove).toBe(true);
    expect(view.vendors).toHaveLength(16);
    const byName = new Map(view.vendors.map((v) => [v.name, v]));
    // The furthest-along status of a Shortlisted Vendor's links colours it.
    expect(byName.get("Rood Mahal")?.shortlist?.status).toBe("quoted");
    expect(byName.get("M L Caterers")?.shortlist?.status).toBe("booked");
    expect(byName.get("Wedding Velvet")?.shortlist?.status).toBe("dropped");
    expect(byName.get("Harika Bagh")?.shortlist).toBeNull();
    expect(byName.get("Rood Mahal")?.marker).toMatchObject({
      approximate: true,
    });
    expect(byName.get("Wedding Velvet")?.marker).toMatchObject({
      approximate: false,
    });
    // No address, no Marker: listed beside the map.
    expect(byName.get("Vinayak Foods & Catering")?.marker).toBeNull();
    // Listed prices come along for the price filter.
    expect(byName.get("M L Caterers")?.prices).toHaveLength(3);
  });

  it("shows a Vendor shortlisted from another city, and none of that city's others", async () => {
    const t = newTest();
    const pune = await setup(t, "Asha", PUNE);
    const rood = await vendorByDomain(t, "roodmahal.com");
    await shortlist(t, pune, rood._id);

    const view = await as(t, "Asha").query(api.map.view, {
      eventId: pune.eventId,
    });

    expect(view.city?.name).toBe("Pune");
    expect(view.vendors.map((v) => v.name)).toEqual(["Rood Mahal"]);
    // Review of #123, finding 3: it's listed as outside Pune, not drawn.
    expect(view.vendors[0]?.inCity).toBe(false);
  });

  it("marks the Vendors in the Event's city as in it", async () => {
    const t = newTest();
    const meera = await setup(t);
    const view = await as(t, "Meera").query(api.map.view, {
      eventId: meera.eventId,
    });
    expect(view.vendors.every((v) => v.inCity)).toBe(true);
  });

  it("lets a Viewer see the map but not move Markers, and refuses a non-member", async () => {
    const t = newTest();
    const meera = await setup(t);
    await t.run((ctx) =>
      seedMembership(ctx, {
        clerkId: "Papa",
        eventId: meera.eventId,
        role: "viewer",
      }),
    );
    const view = await as(t, "Papa").query(api.map.view, {
      eventId: meera.eventId,
    });
    expect(view.canMove).toBe(false);
    expect(view.vendors).toHaveLength(16);

    await t.run((ctx) => seedEvent(ctx, "Kabir", JAIPUR));
    await expect(
      as(t, "Kabir").query(api.map.view, { eventId: meera.eventId }),
    ).rejects.toThrow(/AccessDenied/);
  });

  it("leaves out a Shortlisted Vendor whose Item was deleted", async () => {
    const t = newTest();
    const meera = await setup(t);
    const rood = await vendorByDomain(t, "roodmahal.com");
    const itemId = await shortlist(t, meera, rood._id);
    await t.run((ctx) => ctx.db.patch("items", itemId, { deletedAt: 1 }));

    const view = await as(t, "Meera").query(api.map.view, {
      eventId: meera.eventId,
    });
    expect(view.vendors.find((v) => v.name === "Rood Mahal")?.shortlist).toBe(
      null,
    );
  });
});
