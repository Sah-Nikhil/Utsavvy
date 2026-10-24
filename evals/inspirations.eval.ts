import agentTest from "@convex-dev/agent/test";
import type { UIMessage } from "@convex-dev/agent/react";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { identityFor, newTest } from "../convex/lib/test.helpers";
import { findLibraryPhoto } from "../lib/inspirations/library";
import { parseStripCard } from "../lib/inspirations/strip";
import { runCase, wedding, type CaseResult, type Seeded } from "./harness";

/**
 * Scripted cases for Inspirations (S13, issue #46; the worked examples in
 * docs/design/inspirations.md). Each runs the real reply with the real tools
 * against an Event in convex-test. They call the real model and spend API
 * credits, so they run only when asked, with the key given in the shell:
 *
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval
 *
 * Replies vary, so a case checks what the Members would see (the strip, what
 * landed on the Canvas), not exact wording.
 */

const LIVE = process.env.EVAL_LIVE === "1";

/** The Jaipur wedding, with a haldi among its Functions. */
async function weddingWithHaldi(ctx: MutationCtx) {
  const seeded = await wedding()(ctx);
  await ctx.db.insert("eventFunctions", {
    eventId: seeded.eventId,
    key: "haldi",
    name: "Haldi",
    date: null,
    guests: null,
    assumed: [],
    order: 10,
    version: 1,
  });
  return seeded;
}

async function strips(result: CaseResult) {
  const annotations = await result.t.run((ctx) =>
    ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) => q.eq("eventId", result.seeded.eventId))
      .collect(),
  );
  return annotations
    .filter((a) => a.card?.kind === "stockStrip")
    .map((a) => parseStripCard(a.card!.id));
}

describe.skipIf(!LIVE)("scripted cases (live model)", () => {
  it("stock photos from the Chat: 6 haldi photos in a strip, tagged haldi, and nothing lands until a tap", async () => {
    await runCase({
      seed: weddingWithHaldi,
      messages: [{ from: "Rohan", text: "find some haldi decor ideas" }],
      expect: async (result) => {
        expect(result.replies[0]!.status).toBe("done");
        const [strip] = await strips(result);
        expect(strip, "a stock photo strip").toBeDefined();
        expect(strip!.pexelsIds).toHaveLength(6);
        expect(strip!.functionKey).toBe("haldi");
        for (const id of strip!.pexelsIds)
          expect(findLibraryPhoto(id)!.tags).toContain("haldi");
        expect(result.items.filter((i) => i.kind === "inspiration")).toEqual(
          [],
        );
      },
    });
  });

  it("nothing in the library: says so and offers an upload, with no strip", async () => {
    await runCase({
      messages: [
        { from: "Aditi", text: "show me some halloween pumpkin decor ideas" },
      ],
      expect: async (result) => {
        const [reply] = result.replies;
        expect(reply!.status).toBe("done");
        expect(await strips(result)).toEqual([]);
        expect(reply!.text).toMatch(/upload/i);
        expect(result.items.filter((i) => i.kind === "inspiration")).toEqual(
          [],
        );
      },
    });
  });

  // Rights setting off: an upload batch needs the tick. That is the upload
  // flow, not a reply, so convex/inspirations.test.ts ("with the rights
  // setting off, needs the tick") and e2e/inspirations.spec.ts cover it.
  it.todo("rights setting off (covered by the upload tests)");

  // Pointing at an image (the worked example "Pointing"). `runCase` sends no
  // pointing, so these cases send their one message themselves. That the
  // picture reaches the model, and only in its own turn, is checked on the
  // stub model in convex/assistant/pointing.test.ts; here the live model
  // answers the question about the photo it was shown.
  it("pointing at an upload: the reply answers about that stage", async () => {
    const { reply, inspirations } = await pointAt(
      "upload",
      "would this stage work for 300 Guests?",
    );
    expect(reply.status).toBe("done");
    expect(reply.text).toMatch(/300|guest/i);
    // A question changes nothing on the Canvas.
    expect(inspirations).toHaveLength(1);
  });

  it("pointing at a library photo: the reply answers from its alt text and tags", async () => {
    const { reply } = await pointAt(
      "libraryPhoto",
      "would this stage work for 300 Guests?",
    );
    expect(reply.status).toBe("done");
    expect(reply.text).toMatch(/300|guest/i);
  });
});

/** A sangeet stage from the stock library, used as the "upload" too. */
const STAGE_PHOTO = 35328204;

/**
 * Meera points at one stage photo, saved as an upload (the photo's bytes in
 * storage, described as `describe` would) or as a library photo, and asks
 * `text`. Returns the reply and the Event's Inspirations afterwards.
 */
async function pointAt(as: "upload" | "libraryPhoto", text: string) {
  const t = newTest();
  agentTest.register(t);
  const seeded: Seeded = await t.run(wedding());
  const photo = findLibraryPhoto(STAGE_PHOTO)!;
  const { readFile } = await import("node:fs/promises");
  const bytes = new Uint8Array(
    await readFile(new URL(`../public${photo.localPath}`, import.meta.url)),
  );
  const itemId = await t.run(async (ctx) => {
    const fileId =
      as === "upload"
        ? await ctx.storage.store(
            new Blob([bytes as BlobPart], { type: "image/webp" }),
          )
        : null;
    const itemId = await ctx.db.insert("items", {
      eventId: seeded.eventId,
      sectionId: seeded.sections.inspirations,
      kind: "inspiration",
      position: { x: 0, y: 0 },
      size: { w: 300, h: 360 },
      functionKey: null,
      data: {
        source:
          fileId === null
            ? {
                kind: "pexels",
                pexelsId: photo.pexelsId,
                localPath: photo.localPath,
                photographer: photo.photographer,
                photographerUrl: photo.photographerUrl,
                pageUrl: photo.pageUrl,
                alt: photo.alt,
                tags: photo.tags,
              }
            : {
                kind: "upload",
                fileId,
                fromReference: null,
                remixRightsTicked: false,
              },
        addedBy: seeded.members.Meera,
        memberNote: null,
        seen: {
          description: photo.alt,
          palette: photo.palette,
          decorKeywords: photo.tags,
        },
      },
      createdBy: { kind: "member", membershipId: seeded.members.Meera },
      version: 1,
      deletedAt: null,
    });
    if (fileId !== null)
      await ctx.db.insert("uploadClaims", {
        fileId,
        eventId: seeded.eventId,
        itemId,
        membershipId: seeded.members.Meera,
        claimedAt: Date.now(),
      });
    return itemId;
  });

  const asMeera = t.withIdentity(identityFor("Meera"));
  const { runId, messageId } = await asMeera.mutation(api.chat.send, {
    eventId: seeded.eventId,
    text,
    dontReply: false,
    pointing: [{ kind: "item", itemId }],
  });
  await untilEnded(t, runId!);

  const details = await asMeera.query(api.chat.details, {
    eventId: seeded.eventId,
  });
  const page = await asMeera.query(api.chat.list, {
    eventId: seeded.eventId,
    threadId: details!.threadId!,
    paginationOpts: { numItems: 20, cursor: null },
  });
  const messages = page.page as UIMessage[];
  const asked = messages.find((m) => m.id === messageId);
  const answer = messages.find(
    (m) => m.role === "assistant" && m.order === asked?.order,
  );
  const run = (await t.run((ctx) => ctx.db.get("runs", runId!)))!;
  const inspirations = await t.run(async (ctx) =>
    (
      await ctx.db
        .query("items")
        .withIndex("by_event", (q) => q.eq("eventId", seeded.eventId))
        .collect()
    ).filter((i) => i.kind === "inspiration" && i.deletedAt === null),
  );
  return {
    reply: {
      status: run.status,
      text: (answer?.parts ?? [])
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(""),
    },
    inspirations,
  };
}

async function untilEnded(t: ReturnType<typeof newTest>, runId: Id<"runs">) {
  const started = Date.now();
  for (;;) {
    const status = await t.query(internal.runs.status, { runId });
    if (
      status === "done" ||
      status === "failed" ||
      status === "stopped" ||
      status === "cancelled"
    )
      break;
    if (Date.now() - started > 150_000)
      throw new Error(`Run ${runId} didn't end within 150 s`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await t.finishInProgressScheduledFunctions();
}
