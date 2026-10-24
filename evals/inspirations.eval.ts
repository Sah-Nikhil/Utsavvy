import { describe, expect, it } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import { findLibraryPhoto } from "../lib/inspirations/library";
import { parseStripCard } from "../lib/inspirations/strip";
import { runCase, wedding, type CaseResult } from "./harness";

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

  // Pointing at an image ("would this stage work for 300 Guests?"): the
  // harness sends no pointing yet, and the Agent's context (convex/assistant/
  // agent.ts, S5) doesn't yet attach `internal.inspirations.forPointing`.
  it.todo(
    "pointing at an upload gives the picture; at a library photo, its alt and tags",
  );
});
