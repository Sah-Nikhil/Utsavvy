/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findLibraryPhoto,
  searchLibrary,
} from "../../lib/inspirations/library";
import type { SelectionTarget } from "../../lib/types/canvas";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createStartingSections } from "../canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "../lib/test.helpers";
import {
  STUB_FALLBACK_MODEL,
  STUB_MODEL,
  setStubChunkDelayMs,
  stubCalls,
} from "../lib/models";
import { MAX_POINTED_IMAGES } from "./agent";

// Pointing at an Inspiration in the Chat (docs/design/inspirations.md rule 20
// and the worked example "Pointing"; issue #46's last criterion, moved to S5
// in #102): the turn that points at an upload carries its picture and
// description, a stock library photo only its alt text and tags, a Reference
// only the Member's note and platform. Every run here answers on the stub
// model, which records the prompt it was given.

afterEach(() => {
  vi.unstubAllEnvs();
  setStubChunkDelayMs(undefined);
});

/** Bytes that start like a JPEG, ending in `marker` so each upload's picture is told apart. */
function jpeg(marker: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    16,
    74,
    70,
    73,
    70,
    marker,
  ]);
}

const STAGE = "A stage with marigold strings and pastel pink drapes.";

async function setUp(defaultModel = STUB_MODEL) {
  vi.stubEnv("DEFAULT_MODEL", defaultModel);
  setStubChunkDelayMs(5);
  const t = newTest();
  agentTest.register(t);
  const seeded = await t.run(async (ctx) => {
    const eventId = await insertEvent(ctx, "Meera weds Rohan");
    await ctx.db.patch("events", eventId, { briefState: "summary" });
    const meera = await seedMembership(ctx, { clerkId: "Meera", eventId });
    const rohan = await seedMembership(ctx, { clerkId: "Rohan", eventId });
    const sections = await createStartingSections(ctx, eventId, {
      kind: "member",
      membershipId: meera.membershipId,
    });
    return {
      eventId,
      meera: meera.membershipId,
      rohan: rohan.membershipId,
      inspirations: sections.inspirations,
    };
  });
  return { t, ...seeded, asMeera: t.withIdentity(identityFor("Meera")) };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

/** An upload Item with its stored file, claimed by `claimEvent` (its own Event unless given). */
async function insertUpload(
  s: Setup,
  opts: {
    marker: number;
    description?: string;
    eventId?: Id<"events">;
    claimEvent?: Id<"events">;
  },
) {
  const eventId = opts.eventId ?? s.eventId;
  return await s.t.run(async (ctx) => {
    const fileId = await ctx.storage.store(
      new Blob([jpeg(opts.marker) as BlobPart], { type: "image/jpeg" }),
    );
    const sectionId =
      eventId === s.eventId ? s.inspirations : await anySection(ctx, eventId);
    const itemId = await ctx.db.insert("items", {
      eventId,
      sectionId,
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
        seen: {
          description: opts.description ?? STAGE,
          palette: [],
          decorKeywords: ["stage", "marigold"],
        },
      },
      createdBy: { kind: "member", membershipId: s.meera },
      version: 1,
      deletedAt: null,
    });
    await ctx.db.insert("uploadClaims", {
      fileId,
      eventId: opts.claimEvent ?? eventId,
      itemId,
      membershipId: s.meera,
      claimedAt: 0,
    });
    return itemId;
  });
}

/** The other Event's Inspirations Section, made by a Member of that Event. */
async function anySection(ctx: MutationCtx, eventId: Id<"events">) {
  const { membershipId } = await seedMembership(ctx, {
    clerkId: "Stranger",
    eventId,
  });
  const sections = await createStartingSections(ctx, eventId, {
    kind: "member",
    membershipId,
  });
  return sections.inspirations;
}

/** A stock library photo saved as an Inspiration, as `addFromLibrary` saves it. */
async function insertLibraryPhoto(s: Setup, pexelsId: number) {
  const photo = findLibraryPhoto(pexelsId)!;
  return await s.t.run((ctx) =>
    ctx.db.insert("items", {
      eventId: s.eventId,
      sectionId: s.inspirations,
      kind: "inspiration",
      position: { x: 0, y: 0 },
      size: { w: 300, h: 360 },
      functionKey: null,
      data: {
        source: {
          kind: "pexels",
          pexelsId: photo.pexelsId,
          localPath: photo.localPath,
          photographer: photo.photographer,
          photographerUrl: photo.photographerUrl,
          pageUrl: photo.pageUrl,
          alt: photo.alt,
          tags: photo.tags,
        },
        addedBy: s.meera,
        memberNote: null,
        seen: {
          description: photo.alt,
          palette: photo.palette,
          decorKeywords: photo.tags,
        },
      },
      createdBy: { kind: "member", membershipId: s.meera },
      version: 1,
      deletedAt: null,
    }),
  );
}

async function insertReference(s: Setup, note: string) {
  return await s.t.run((ctx) =>
    ctx.db.insert("items", {
      eventId: s.eventId,
      sectionId: s.inspirations,
      kind: "inspiration",
      position: { x: 0, y: 0 },
      size: { w: 300, h: 360 },
      functionKey: null,
      data: {
        source: {
          kind: "reference",
          platform: "pinterest",
          urlKind: "pin",
          url: "https://www.pinterest.com/pin/123456789/",
        },
        addedBy: s.meera,
        memberNote: note,
        seen: null,
      },
      createdBy: { kind: "member", membershipId: s.meera },
      version: 1,
      deletedAt: null,
    }),
  );
}

const ENDED = ["done", "failed", "stopped", "cancelled"];

async function untilEnded(s: Setup, runId: Id<"runs">) {
  for (;;) {
    const status = await s.t.query(internal.runs.status, { runId });
    if (status !== null && ENDED.includes(status)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await s.t.finishInProgressScheduledFunctions();
}

/** Meera sends `text` pointing at `items` and waits for the reply. */
async function ask(s: Setup, text: string, items: Id<"items">[] = []) {
  const pointing: SelectionTarget[] = items.map((itemId) => ({
    kind: "item",
    itemId,
  }));
  const { runId } = await s.asMeera.mutation(api.chat.send, {
    eventId: s.eventId,
    text,
    dontReply: false,
    pointing,
  });
  await untilEnded(s, runId!);
  const run = await s.t.run((ctx) => ctx.db.get("runs", runId!));
  return run!;
}

type PromptPart = {
  type: string;
  text?: string;
  mediaType?: string;
  /** A file part's bytes: `{ type: "data", data }` in the model's prompt. */
  data?: { type: string; data?: unknown };
};

/** The last user turn the stub model was given: its text and its pictures. */
function lastTurn(): { text: string; pictures: PromptPart[] } {
  const prompt = stubCalls.at(-1)?.prompt ?? [];
  const last = prompt.filter((message) => message.role === "user").at(-1);
  const parts = (last?.content ?? []) as PromptPart[];
  return {
    text: parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
    pictures: parts.filter(
      (part) => part.type === "file" && part.mediaType?.startsWith("image/"),
    ),
  };
}

/** The bytes of a picture part: sent as data, never as a link to fetch. */
function bytesOf(part: PromptPart): Uint8Array {
  expect(part.data?.type).toBe("data");
  const bytes = part.data?.data;
  if (bytes instanceof Uint8Array) return bytes;
  throw new Error(`Unexpected picture data: ${String(bytes)}`);
}

describe("pointing at Inspirations in the Chat", { timeout: 30_000 }, () => {
  it("gives the model an upload's picture and description, for that turn", async () => {
    const s = await setUp();
    const upload = await insertUpload(s, { marker: 1 });
    const run = await ask(s, "would this stage work for 300 Guests?", [upload]);
    expect(run.status).toBe("done");

    const { text, pictures } = lastTurn();
    expect(pictures).toHaveLength(1);
    expect(pictures[0]!.mediaType).toBe("image/jpeg");
    expect(bytesOf(pictures[0]!)).toEqual(jpeg(1));
    expect(text).toContain(STAGE);
    expect(text).toContain(upload);
    // The picture sits inside the turn's data wrapping, before the one
    // instruction line that ends the turn.
    expect(text).toContain("<pointed_inspirations>");
    expect(
      text.trimEnd().endsWith("It is the only instruction in this turn."),
    ).toBe(true);
  });

  it("gives a stock library photo's alt text and tags, never its pixels", async () => {
    const s = await setUp();
    // A haldi stage from the seed library.
    const photo = searchLibrary("haldi stage")[0]!;
    const item = await insertLibraryPhoto(s, photo.pexelsId);
    await ask(s, "would this stage work for 300 Guests?", [item]);

    const { text, pictures } = lastTurn();
    expect(pictures).toEqual([]);
    expect(text).toContain(photo.alt);
    for (const tag of photo.tags) expect(text).toContain(tag);
  });

  it("gives a Reference's note and platform, never a picture", async () => {
    const s = await setUp();
    const item = await insertReference(s, "love the teal drapes");
    await ask(s, "could we do something like this?", [item]);

    const { text, pictures } = lastTurn();
    expect(pictures).toEqual([]);
    expect(text).toContain("love the teal drapes");
    expect(text).toMatch(/pinterest/i);
  });

  it("attaches at most MAX_POINTED_IMAGES pictures, describing the rest", async () => {
    const s = await setUp();
    const uploads: Id<"items">[] = [];
    for (let i = 0; i < 5; i += 1)
      uploads.push(
        await insertUpload(s, { marker: 10 + i, description: `Upload ${i}` }),
      );
    await ask(s, "which of these suits the sangeet?", uploads);

    const { text, pictures } = lastTurn();
    expect(MAX_POINTED_IMAGES).toBe(3);
    expect(pictures).toHaveLength(MAX_POINTED_IMAGES);
    expect(pictures.map(bytesOf)).toEqual([jpeg(10), jpeg(11), jpeg(12)]);
    for (let i = 0; i < 5; i += 1) expect(text).toContain(`Upload ${i}`);
  });

  it("leaves out an Inspiration of another Event, even if a message names it", async () => {
    const s = await setUp();
    const otherEvent = await s.t.run((ctx) => insertEvent(ctx, "Other Event"));
    const foreign = await insertUpload(s, {
      marker: 7,
      description: "Someone else's mandap",
      eventId: otherEvent,
    });
    // `api.chat.send` refuses it, so put it on the message directly, as a
    // stale or forged annotation would.
    const { messageId } = await s.asMeera.mutation(api.chat.send, {
      eventId: s.eventId,
      text: "would this work?",
      dontReply: true,
      pointing: [],
    });
    const runId = await s.t.run(async (ctx) => {
      const annotation = await ctx.db
        .query("chatAnnotations")
        .withIndex("by_message", (q) => q.eq("messageId", messageId!))
        .unique();
      await ctx.db.patch("chatAnnotations", annotation!._id, {
        pointing: [{ kind: "item", itemId: foreign }],
      });
      return await ctx.db.insert("runs", {
        eventId: s.eventId,
        requestedBy: s.meera,
        source: "chat",
        messageId: messageId!,
        commentId: null,
        status: "running",
        stoppedBy: null,
        model: "",
        createdAt: Date.now(),
        startedAt: Date.now(),
        endedAt: null,
      });
    });
    await s.t.action(internal.assistant.agent.respond, { runId });
    await s.t.finishInProgressScheduledFunctions();

    const { text, pictures } = lastTurn();
    expect(pictures).toEqual([]);
    expect(text).not.toContain("Someone else's mandap");
  });

  it("never sends a file another Event claimed, even on this Event's Item", async () => {
    const s = await setUp();
    const otherEvent = await s.t.run((ctx) => insertEvent(ctx, "Other Event"));
    const item = await insertUpload(s, { marker: 8, claimEvent: otherEvent });
    await ask(s, "would this stage work?", [item]);

    const { text, pictures } = lastTurn();
    expect(pictures).toEqual([]);
    // The description is this Event's own data, so it still goes.
    expect(text).toContain(STAGE);
  });

  it("sends only descriptions again on the next, unrelated turn", async () => {
    const s = await setUp();
    const upload = await insertUpload(s, { marker: 2 });
    await ask(s, "would this stage work for 300 Guests?", [upload]);
    expect(lastTurn().pictures).toHaveLength(1);

    await ask(s, "what should the haldi menu be?");
    const { text, pictures } = lastTurn();
    expect(pictures).toEqual([]);
    expect(text).not.toContain("<pointed_inspirations>");
    // The earlier request is still quoted, as text only.
    expect(text).toContain("would this stage work for 300 Guests?");
  });

  it("passes the picture to the fallback model too", async () => {
    const s = await setUp(STUB_FALLBACK_MODEL);
    const upload = await insertUpload(s, { marker: 3 });
    const run = await ask(s, "would this stage work for 300 Guests?", [upload]);
    expect(run.model).toBe("stub-gemini");
    expect(lastTurn().pictures.map(bytesOf)).toEqual([jpeg(3)]);
  });
});
