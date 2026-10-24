/// <reference types="vite/client" />
/* eslint-disable no-restricted-syntax -- Theme colours here are data (the hex values a photo or a Member gives), not UI styling. */
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tableRange } from "../lib/pricing";
import type { Theme } from "../lib/types/brief";
import type { ItemData } from "../lib/types/canvas";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import { stubEstimateDeps } from "./estimates";
import { offerThemeSuggestions, type ThemeIdea } from "./inspirations";
import { DELETED_FILE_PURGE_AFTER_MS } from "./lib/settings";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

// S13 seams (issue #46): adding Inspirations from the stock library and from
// uploads, "Use for Theme", the Theme-driven decor Suggestions and the 30-day
// purge, on convex-test. No test calls a real model: the Suggestions' ideas
// are injected and their Estimates run on `stubEstimateDeps`.

const T0 = Date.UTC(2026, 9, 25, 6, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const JAIPUR: Theme = {
  palette: ["#C2185B", "#F4A300", "#F8C8DC"],
  styleWords: ["royal Rajputana"],
  decorKeywords: ["marigold", "pastel pink drapes", "brass urli"],
};

/** Naresh Babu's haldi urli, the first photo in the library. */
const HALDI_URLI = 31002035;

/** The Jaipur wedding: Meera and Aditi plan, Papa views; haldi and mehendi. */
async function seedWedding(ctx: MutationCtx) {
  const eventId = await insertEvent(ctx, "Meera weds Rohan");
  await ctx.db.patch("events", eventId, {
    city: { name: "Jaipur", tier: "Y", centre: null },
    tradition: "North Indian Hindu",
    budgetTotal: 2_500_000,
    theme: JAIPUR,
  });
  const meera = await seedMembership(ctx, { clerkId: "Meera", eventId });
  const aditi = await seedMembership(ctx, { clerkId: "Aditi", eventId });
  const papa = await seedMembership(ctx, {
    clerkId: "Papa",
    eventId,
    role: "viewer",
  });
  await ctx.db.patch("memberships", meera.membershipId, {
    displayName: "Meera",
  });
  const sections = await createStartingSections(ctx, eventId, {
    kind: "member",
    membershipId: meera.membershipId,
  });
  for (const [order, key] of ["haldi", "mehendi"].entries()) {
    await ctx.db.insert("eventFunctions", {
      eventId,
      key,
      name: key[0]!.toUpperCase() + key.slice(1),
      date: null,
      guests: 150,
      assumed: [],
      order,
      version: 1,
    });
  }
  return {
    eventId,
    meera: meera.membershipId,
    aditi: aditi.membershipId,
    papa: papa.membershipId,
    sections,
  };
}

async function setUp() {
  const t = newTest();
  agentTest.register(t);
  const w = await t.run(seedWedding);
  return {
    t,
    ...w,
    asMeera: t.withIdentity(identityFor("Meera")),
    asAditi: t.withIdentity(identityFor("Aditi")),
    asPapa: t.withIdentity(identityFor("Papa")),
  };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

const itemOf = (s: Setup, id: Id<"items">) =>
  s.t.run(async (ctx) => (await ctx.db.get("items", id))!);
const scheduled = (s: Setup) =>
  s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
const changeCount = (s: Setup) =>
  s.t.run(async (ctx) => (await ctx.db.query("changes").collect()).length);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const PDF = new TextEncoder().encode("%PDF-1.7 not a photo");

async function store(s: Setup, bytes: Uint8Array, type = "image/jpeg") {
  return await s.t.run((ctx) =>
    ctx.storage.store(new Blob([bytes as BlobPart], { type })),
  );
}

/** An upload already described, as `describe` leaves it. */
async function insertUpload(
  s: Setup,
  seen: ItemData<"inspiration">["seen"],
  deletedAt: number | null = null,
) {
  const fileId = await store(s, JPEG);
  const itemId = await s.t.run((ctx) =>
    ctx.db.insert("items", {
      eventId: s.eventId,
      sectionId: s.sections.inspirations,
      kind: "inspiration",
      position: { x: 0, y: 0 },
      size: { w: 300, h: 360 },
      functionKey: null,
      data: {
        source: {
          kind: "upload",
          fileId,
          fromReference: null,
          remixRightsTicked: false,
        },
        addedBy: s.meera,
        memberNote: null,
        seen,
      },
      createdBy: { kind: "member", membershipId: s.meera },
      version: 1,
      deletedAt,
    }),
  );
  return { fileId, itemId };
}

// ---------------------------------------------------------------------------

describe("addFromLibrary", () => {
  it("saves the seed record's credit, local path, alt, tags and palette, with no model call", async () => {
    const s = await setUp();
    const { itemId } = await s.asAditi.mutation(
      api.inspirations.addFromLibrary,
      { eventId: s.eventId, pexelsId: HALDI_URLI, functionKey: "haldi" },
    );
    const item = await itemOf(s, itemId);
    expect(item).toMatchObject({
      kind: "inspiration",
      sectionId: s.sections.inspirations,
      functionKey: "haldi",
      createdBy: { kind: "member", membershipId: s.aditi },
      data: {
        addedBy: s.aditi,
        memberNote: null,
        source: {
          kind: "pexels",
          pexelsId: HALDI_URLI,
          localPath: "/inspirations/wedding-north-indian-hindu/31002035.webp",
          photographer: "Naresh Babu",
          photographerUrl: "https://www.pexels.com/@naresh99/",
          pageUrl:
            "https://www.pexels.com/photo/traditional-indian-wedding-haldi-ceremony-decorations-31002035/",
          alt: "Marigold-filled urli and golden pots set out as haldi decor.",
          tags: [
            "wedding",
            "haldi",
            "yellow",
            "gold",
            "marigold",
            "urli",
            "pots",
          ],
        },
        seen: {
          description:
            "Marigold-filled urli and golden pots set out as haldi decor.",
          palette: ["#988b5c", "#b69b0a", "#afc5d0", "#405854", "#8a5e10"],
          decorKeywords: [
            "wedding",
            "haldi",
            "yellow",
            "gold",
            "marigold",
            "urli",
            "pots",
          ],
        },
      },
    });
    // Nothing describes a library photo: no helper job is scheduled.
    expect(await scheduled(s)).toEqual([]);
  });

  it("refuses an unknown pexelsId and writes nothing", async () => {
    const s = await setUp();
    const before = await changeCount(s);
    await expect(
      s.asMeera.mutation(api.inspirations.addFromLibrary, {
        eventId: s.eventId,
        pexelsId: 123,
      }),
    ).rejects.toThrow(/stock library has no photo/);
    expect(await changeCount(s)).toBe(before);
  });

  it("refuses a Viewer, and a Function the Event doesn't have", async () => {
    const s = await setUp();
    await expect(
      s.asPapa.mutation(api.inspirations.addFromLibrary, {
        eventId: s.eventId,
        pexelsId: HALDI_URLI,
      }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      s.asMeera.mutation(api.inspirations.addFromLibrary, {
        eventId: s.eventId,
        pexelsId: HALDI_URLI,
        functionKey: "sangeet",
      }),
    ).rejects.toThrow(/no Function "sangeet"/);
  });

  it("places two photos in free space, never on top of each other", async () => {
    const s = await setUp();
    const a = await s.asMeera.mutation(api.inspirations.addFromLibrary, {
      eventId: s.eventId,
      pexelsId: HALDI_URLI,
    });
    const b = await s.asMeera.mutation(api.inspirations.addFromLibrary, {
      eventId: s.eventId,
      pexelsId: 19569602,
    });
    const [first, second] = [
      await itemOf(s, a.itemId),
      await itemOf(s, b.itemId),
    ];
    expect(first.position).not.toEqual(second.position);
  });
});

describe("library search for the panel", () => {
  it("an empty Search shows the Event's own set", async () => {
    const s = await setUp();
    const result = await s.asPapa.query(api.inspirations.search, {
      eventId: s.eventId,
      query: "",
    });
    expect(result.photos.length).toBeGreaterThan(6);
    expect(
      result.photos.every((p) => p.setKey === "wedding-north-indian-hindu"),
    ).toBe(true);
  });

  it("a query returns at most 6 matching photos and marks the ones already added", async () => {
    const s = await setUp();
    await s.asMeera.mutation(api.inspirations.addFromLibrary, {
      eventId: s.eventId,
      pexelsId: HALDI_URLI,
    });
    const result = await s.asMeera.query(api.inspirations.search, {
      eventId: s.eventId,
      query: "find some haldi decor ideas",
    });
    expect(result.photos).toHaveLength(6);
    expect(result.photos.find((p) => p.pexelsId === HALDI_URLI)?.added).toBe(
      true,
    );
  });
});

describe("addUpload", () => {
  it("saves the upload and schedules describe exactly once", async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { uploadRightsOn: true }),
    );
    const fileId = await store(s, JPEG);
    const { itemId } = await s.asMeera.action(api.inspirations.addUpload, {
      eventId: s.eventId,
      fileId,
      rightsTicked: false,
      palette: ["#1f6f78", "#c9a23a"],
    });
    const item = await itemOf(s, itemId);
    expect(item).toMatchObject({
      kind: "inspiration",
      sectionId: s.sections.inspirations,
      data: {
        source: { kind: "upload", fileId, remixRightsTicked: false },
        addedBy: s.meera,
        seen: null,
      },
    });
    const jobs = (await scheduled(s)).filter((job) =>
      job.name.includes("inspirations:describe"),
    );
    expect(jobs).toHaveLength(1);
  });

  it("describe stores the palette and a description once it has run", async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { uploadRightsOn: true }),
    );
    const fileId = await store(s, JPEG);
    const { itemId } = await s.asMeera.action(api.inspirations.addUpload, {
      eventId: s.eventId,
      fileId,
      rightsTicked: false,
      palette: ["#1f6f78"],
    });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const item = await itemOf(s, itemId);
    if (item.kind !== "inspiration") throw new Error("not an Inspiration");
    expect(item.data.seen).toMatchObject({ palette: ["#1F6F78"] });
    expect(typeof item.data.seen?.description).toBe("string");
  });

  it("refuses a file that isn't a JPEG, PNG or WebP by its bytes, whatever it claims, and deletes it", async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { uploadRightsOn: true }),
    );
    const fileId = await store(s, PDF, "image/jpeg");
    await expect(
      s.asMeera.action(api.inspirations.addUpload, {
        eventId: s.eventId,
        fileId,
        rightsTicked: false,
        palette: [],
      }),
    ).rejects.toThrow(/JPEG, PNG or WebP/);
    expect(
      await s.t.run((ctx) => ctx.db.system.get("_storage", fileId)),
    ).toBeNull();
    const items = await s.t.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", s.eventId).eq("kind", "inspiration"),
        )
        .collect(),
    );
    expect(items).toEqual([]);
  });

  it("refuses a file over 10 MB", async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { uploadRightsOn: true }),
    );
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(JPEG);
    const fileId = await store(s, big);
    await expect(
      s.asMeera.action(api.inspirations.addUpload, {
        eventId: s.eventId,
        fileId,
        rightsTicked: false,
        palette: [],
      }),
    ).rejects.toThrow(/over 10 MB/);
  });

  it("with the rights setting off, needs the tick", async () => {
    const s = await setUp();
    const refused = await store(s, JPEG);
    await expect(
      s.asMeera.action(api.inspirations.addUpload, {
        eventId: s.eventId,
        fileId: refused,
        rightsTicked: false,
        palette: [],
      }),
    ).rejects.toThrow(/Tick the box/);
    const ticked = await store(s, JPEG);
    await expect(
      s.asMeera.action(api.inspirations.addUpload, {
        eventId: s.eventId,
        fileId: ticked,
        rightsTicked: true,
        palette: [],
      }),
    ).resolves.toMatchObject({ itemId: expect.any(String) });
  });

  it("a Viewer can't get an upload URL or upload", async () => {
    const s = await setUp();
    await expect(
      s.asPapa.mutation(api.inspirations.generateUploadUrl, {
        eventId: s.eventId,
      }),
    ).rejects.toThrow(/AccessDenied/);
    const fileId = await store(s, JPEG);
    await expect(
      s.asPapa.action(api.inspirations.addUpload, {
        eventId: s.eventId,
        fileId,
        rightsTicked: true,
        palette: [],
      }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("useForTheme", () => {
  async function chatLines(s: Setup): Promise<string[]> {
    return await s.t.run(async (ctx) => {
      const annotations = await ctx.db
        .query("chatAnnotations")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect();
      const messages = await ctx.runQuery(
        components.agent.messages.getMessagesByIds,
        { messageIds: annotations.map((a) => a.messageId) },
      );
      return messages.map((m) => m?.text ?? "");
    });
  }

  it("a Member's tap applies at once, with \"Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'\"", async () => {
    const s = await setUp();
    const { itemId } = await insertUpload(s, {
      description: "Teal drapes and brass lanterns hanging from a tree.",
      palette: ["#1F6F78"],
      decorKeywords: ["lantern-lit"],
    });
    const result = await s.asMeera.mutation(api.inspirations.useForTheme, {
      eventId: s.eventId,
      itemId,
    });
    expect(result).toEqual({ changed: true });
    const event = await s.t.run(
      async (ctx) => (await ctx.db.get("events", s.eventId))!,
    );
    expect(event.theme).toEqual({
      palette: ["#C2185B", "#F4A300", "#F8C8DC", "#1F6F78"],
      styleWords: ["royal Rajputana"],
      decorKeywords: [
        "marigold",
        "pastel pink drapes",
        "brass urli",
        "lantern-lit",
      ],
    });
    expect(event.version).toBe(2);
    expect(await chatLines(s)).toEqual([
      "Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'",
    ]);
    // History has it, so any co-planner can Restore the earlier Theme.
    const changes = await s.t.run((ctx) =>
      ctx.db
        .query("changes")
        .filter((q) => q.eq(q.field("docId"), s.eventId))
        .collect(),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.actor).toEqual({
      kind: "member",
      membershipId: s.meera,
    });
  });

  it("on a library photo it uses the seed palette and tags", async () => {
    const s = await setUp();
    const { itemId } = await s.asMeera.mutation(
      api.inspirations.addFromLibrary,
      { eventId: s.eventId, pexelsId: HALDI_URLI },
    );
    await s.asMeera.mutation(api.inspirations.useForTheme, {
      eventId: s.eventId,
      itemId,
    });
    const event = await s.t.run(
      async (ctx) => (await ctx.db.get("events", s.eventId))!,
    );
    expect(event.theme.palette.slice(-2)).toEqual(["#988B5C", "#B69B0A"]);
    expect(event.theme.decorKeywords).toContain("urli");
    expect(event.theme.decorKeywords).toContain("pots");
  });

  it("offers decor Suggestions after the change, scheduled once", async () => {
    const s = await setUp();
    const { itemId } = await insertUpload(s, {
      description: "Lanterns",
      palette: ["#1F6F78"],
      decorKeywords: ["lantern-lit"],
    });
    await s.asMeera.mutation(api.inspirations.useForTheme, {
      eventId: s.eventId,
      itemId,
    });
    const jobs = (await scheduled(s)).filter((job) =>
      job.name.includes("inspirations:suggestForTheme"),
    );
    expect(jobs).toHaveLength(1);
  });

  it("changes nothing when the image adds nothing new", async () => {
    const s = await setUp();
    const { itemId } = await insertUpload(s, {
      description: "Marigolds",
      palette: ["#F4A300"],
      decorKeywords: ["marigold"],
    });
    const before = await changeCount(s);
    expect(
      await s.asMeera.mutation(api.inspirations.useForTheme, {
        eventId: s.eventId,
        itemId,
      }),
    ).toEqual({ changed: false });
    expect(await changeCount(s)).toBe(before);
    expect(await chatLines(s)).toEqual([]);
  });

  it("refuses a Viewer", async () => {
    const s = await setUp();
    const { itemId } = await insertUpload(s, {
      description: "Lanterns",
      palette: ["#1F6F78"],
      decorKeywords: [],
    });
    await expect(
      s.asPapa.mutation(api.inspirations.useForTheme, {
        eventId: s.eventId,
        itemId,
      }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("tag and remove", () => {
  it("a Member sets or clears an Inspiration's Function", async () => {
    const s = await setUp();
    const { itemId } = await s.asMeera.mutation(
      api.inspirations.addFromLibrary,
      { eventId: s.eventId, pexelsId: HALDI_URLI },
    );
    await s.asAditi.mutation(api.inspirations.tag, {
      eventId: s.eventId,
      itemId,
      functionKey: "mehendi",
    });
    expect((await itemOf(s, itemId)).functionKey).toBe("mehendi");
    await s.asAditi.mutation(api.inspirations.tag, {
      eventId: s.eventId,
      itemId,
      functionKey: null,
    });
    expect((await itemOf(s, itemId)).functionKey).toBeNull();
    await expect(
      s.asPapa.mutation(api.inspirations.tag, {
        eventId: s.eventId,
        itemId,
        functionKey: "haldi",
      }),
    ).rejects.toThrow(/AccessDenied/);
  });

  it("any Member deletes any Inspiration, and it stays restorable", async () => {
    const s = await setUp();
    const { itemId } = await s.asMeera.mutation(
      api.inspirations.addFromLibrary,
      { eventId: s.eventId, pexelsId: HALDI_URLI },
    );
    await s.asAditi.mutation(api.inspirations.remove, {
      eventId: s.eventId,
      itemId,
    });
    expect((await itemOf(s, itemId)).deletedAt).toBeGreaterThanOrEqual(T0);
  });
});

describe("imageUrl", () => {
  it("gives an upload's URL only to people in its Event", async () => {
    const s = await setUp();
    const { itemId } = await insertUpload(s, null);
    expect(
      await s.asPapa.query(api.inspirations.imageUrl, {
        eventId: s.eventId,
        itemId,
      }),
    ).toEqual(expect.any(String));
    const stranger = await s.t.run(async (ctx) => {
      const other = await seedMembership(ctx, { clerkId: "Stranger" });
      return other.eventId;
    });
    await expect(
      s.t
        .withIdentity(identityFor("Stranger"))
        .query(api.inspirations.imageUrl, {
          eventId: stranger,
          itemId,
        }),
    ).rejects.toThrow(/wrong Event|AccessDenied/);
    await expect(
      s.t
        .withIdentity(identityFor("Stranger"))
        .query(api.inspirations.imageUrl, {
          eventId: s.eventId,
          itemId,
        }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("Theme-driven decor Suggestions", () => {
  async function entriesSnapshot(s: Setup) {
    return await s.t.run((ctx) =>
      ctx.db
        .query("entries")
        .filter((q) => q.eq(q.field("eventId"), s.eventId))
        .collect(),
    );
  }
  function actionCtx(s: Setup) {
    type Call = (ref: unknown, args: unknown) => Promise<unknown>;
    return {
      runQuery: s.t.query as Call,
      runMutation: s.t.mutation as Call,
      runAction: s.t.action as Call,
    } as unknown as Parameters<typeof offerThemeSuggestions>[0];
  }
  const ideas = (list: ThemeIdea[]) => async (): Promise<ThemeIdea[]> => list;
  const lanternWalk: ThemeIdea = {
    title: "Brass lantern walkway at the mehendi",
    body: "Line the path to the mehendi courtyard with brass lanterns and teal drapes.",
    functionKey: "mehendi",
  };

  async function suggestionsOf(s: Setup) {
    return await s.t.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", s.eventId).eq("kind", "suggestion"),
        )
        .collect(),
    );
  }

  it("never edits existing Entries, and offers decor Suggestions each with an Estimate from the table's decor range", async () => {
    const s = await setUp();
    const budget = await s.t.run((ctx) =>
      ctx.db.insert("items", {
        eventId: s.eventId,
        sectionId: s.sections.money,
        kind: "budget",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: { note: null },
        createdBy: { kind: "member", membershipId: s.meera },
        version: 1,
        deletedAt: null,
      }),
    );
    await s.t.run((ctx) =>
      ctx.db.insert("entries", {
        eventId: s.eventId,
        itemId: budget,
        kind: "budget",
        order: 0,
        functionKey: "mehendi",
        fields: {
          label: "Decor",
          category: "decor_small",
          quantity: 1,
          unit: "per_function",
          estimate: null,
          plannedAmount: 40_000,
          role: "line",
          belowUsualRange: false,
          editedByMember: true,
        },
        assumed: [],
        createdBy: { kind: "member", membershipId: s.meera },
        version: 1,
        deletedAt: null,
      }),
    );
    const before = await entriesSnapshot(s);

    await offerThemeSuggestions(
      actionCtx(s),
      { eventId: s.eventId, forMembershipId: s.meera, scope: null },
      {
        ideas: ideas([
          lanternWalk,
          {
            title: "Teal drapes at the haldi",
            body: "Teal and marigold.",
            functionKey: "haldi",
          },
        ]),
        estimateDeps: { ...stubEstimateDeps, now: () => T0 },
      },
    );

    expect(await entriesSnapshot(s)).toEqual(before);
    const suggestions = await suggestionsOf(s);
    expect(suggestions).toHaveLength(2);
    const range = tableRange("decor_small", "per_function", "Y")!;
    for (const suggestion of suggestions) {
      expect(suggestion.kind).toBe("suggestion");
      if (suggestion.kind !== "suggestion") continue;
      expect(suggestion.data).toMatchObject({
        status: "open",
        costCategory: "decor_small",
        quantity: 1,
        estimate: {
          low: range.unitLow,
          high: range.unitHigh,
          label: "Estimate",
          basis: { kind: "referenceTable" },
        },
      });
    }
    expect(suggestions.map((x) => x.functionKey).sort()).toEqual([
      "haldi",
      "mehendi",
    ]);
  });

  it("offers at most 3", async () => {
    const s = await setUp();
    await offerThemeSuggestions(
      actionCtx(s),
      { eventId: s.eventId, forMembershipId: s.meera, scope: null },
      {
        ideas: ideas(Array.from({ length: 5 }, () => lanternWalk)),
        estimateDeps: stubEstimateDeps,
      },
    );
    expect(await suggestionsOf(s)).toHaveLength(3);
  });

  it("offers one from the new decor keywords when the model gives no ideas", async () => {
    const s = await setUp();
    await offerThemeSuggestions(
      actionCtx(s),
      { eventId: s.eventId, forMembershipId: s.meera, scope: null },
      { ideas: ideas([]), estimateDeps: stubEstimateDeps },
    );
    const suggestions = await suggestionsOf(s);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.functionKey).toBeNull();
  });

  it("drops a Function the Event doesn't have", async () => {
    const s = await setUp();
    await offerThemeSuggestions(
      actionCtx(s),
      { eventId: s.eventId, forMembershipId: s.meera, scope: null },
      {
        ideas: ideas([{ ...lanternWalk, functionKey: "sangeet" }]),
        estimateDeps: stubEstimateDeps,
      },
    );
    expect((await suggestionsOf(s))[0]!.functionKey).toBeNull();
  });
});

describe("purgeDeletedFiles", () => {
  it("removes stored files 30 days after deletion and leaves library photos and newer deletions alone", async () => {
    const s = await setUp();
    const old = await insertUpload(
      s,
      null,
      T0 - DELETED_FILE_PURGE_AFTER_MS - DAY,
    );
    const recent = await insertUpload(s, null, T0 - 29 * DAY);
    const live = await insertUpload(s, null, null);
    const { itemId: library } = await s.asMeera.mutation(
      api.inspirations.addFromLibrary,
      { eventId: s.eventId, pexelsId: HALDI_URLI },
    );
    await s.t.run((ctx) =>
      ctx.db.patch("items", library, {
        deletedAt: T0 - DELETED_FILE_PURGE_AFTER_MS - DAY,
      }),
    );

    await s.t.mutation(internal.inspirations.purgeDeletedFiles, {});

    const file = (id: Id<"_storage">) =>
      s.t.run((ctx) => ctx.db.system.get("_storage", id));
    expect(await file(old.fileId)).toBeNull();
    expect(await file(recent.fileId)).not.toBeNull();
    expect(await file(live.fileId)).not.toBeNull();
    // The library photo's Item is untouched; it never had a stored file.
    expect((await itemOf(s, library)).kind).toBe("inspiration");
  });
});

describe("pointing", () => {
  it("gives the model a library photo's alt and tags, not the picture, and an upload's picture", async () => {
    const s = await setUp();
    const { itemId: library } = await s.asMeera.mutation(
      api.inspirations.addFromLibrary,
      { eventId: s.eventId, pexelsId: HALDI_URLI },
    );
    const { itemId: upload } = await insertUpload(s, {
      description: "A stage with marigold strings.",
      palette: ["#F4A300"],
      decorKeywords: ["stage"],
    });
    const seen = await s.t.query(internal.inspirations.forPointing, {
      eventId: s.eventId,
      pointing: [
        { kind: "item", itemId: library },
        { kind: "item", itemId: upload },
      ],
    });
    expect(seen).toEqual([
      {
        itemId: library,
        kind: "libraryPhoto",
        alt: "Marigold-filled urli and golden pots set out as haldi decor.",
        tags: [
          "wedding",
          "haldi",
          "yellow",
          "gold",
          "marigold",
          "urli",
          "pots",
        ],
      },
      {
        itemId: upload,
        kind: "upload",
        description: "A stage with marigold strings.",
        imageUrl: expect.any(String),
      },
    ]);
    expect(seen[0]).not.toHaveProperty("imageUrl");
  });
});
