import { describe, expect, it } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import { loadStarterSetRows } from "../convex/vendors";
import { parseVendorCards } from "../components/vendors/cards";
import { runCase, wedding, type CaseResult, type SeedOptions } from "./harness";

/**
 * Scripted cases for Vendors (S9, issue #42; docs/design/vendors.md). Each
 * runs the real reply with the real tools against an Event in convex-test,
 * with the Jaipur starter set loaded. They call the real model and spend API
 * credits, so they run only when asked, with the key given in the shell:
 *
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval
 *
 * Replies vary, so a case checks what the Members would see (the Vendor
 * cards, what landed on the Canvas), not exact wording. The same path on the
 * stub model, with scripted tool calls, is in
 * convex/assistant/tools/vendors.reply.test.ts.
 */

const LIVE = process.env.EVAL_LIVE === "1";

function weddingWithVendors(options: SeedOptions = {}) {
  return async (ctx: MutationCtx) => {
    const seeded = await wedding(options)(ctx);
    await loadStarterSetRows(ctx);
    return seeded;
  };
}

async function vendorCards(result: CaseResult) {
  const annotations = await result.t.run((ctx) =>
    ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) => q.eq("eventId", result.seeded.eventId))
      .collect(),
  );
  return annotations
    .filter((a) => a.card?.kind === "vendorCards")
    .map((a) => parseVendorCards(a.card!.id));
}

const shortlistedIn = (result: CaseResult) =>
  result.items.filter((item) => item.kind === "shortlistedVendor");

describe.skipIf(!LIVE)("scripted cases (live model)", () => {
  it('"show me caterers for the sangeet" shows starter caterer cards; "add the second one" shortlists it', async () => {
    await runCase({
      seed: weddingWithVendors(),
      messages: [
        { from: "Meera", text: "show me caterers for the sangeet" },
        { from: "Meera", text: "add the second one" },
      ],
      expect: async (result) => {
        for (const reply of result.replies) expect(reply.status).toBe("done");
        const [card] = await vendorCards(result);
        expect(card, "Vendor cards in the Chat").toBeDefined();
        expect(card!.category).toBe("caterer");
        expect(card!.functionKey).toBe("sangeet");
        expect(card!.vendorIds.length).toBeGreaterThanOrEqual(2);
        const items = shortlistedIn(result);
        expect(items).toHaveLength(1);
        const item = items[0]!;
        if (item.kind !== "shortlistedVendor") throw new Error("kind");
        expect(item.data).toEqual({ vendorId: card!.vendorIds[1] });
      },
    });
  });

  it('a question ("which caterer is cheapest?") shortlists nothing', async () => {
    await runCase({
      seed: weddingWithVendors(),
      messages: [
        { from: "Meera", text: "show me caterers for the sangeet" },
        { from: "Rohan", text: "which caterer is cheapest?" },
      ],
      expect: async (result) => {
        for (const reply of result.replies) expect(reply.status).toBe("done");
        expect(shortlistedIn(result)).toEqual([]);
        // It answers from the Listed prices it was given.
        expect(result.replies[1]!.text).toMatch(/₹|Listed price/);
      },
    });
  });

  it("outside Jaipur: no Vendor cards, and it offers Chat web search", async () => {
    await runCase({
      seed: weddingWithVendors({ city: { name: "Lucknow", tier: "Y" } }),
      messages: [{ from: "Aditi", text: "find caterers for the wedding" }],
      expect: async (result) => {
        const [reply] = result.replies;
        expect(reply!.status).toBe("done");
        expect(await vendorCards(result)).toEqual([]);
        expect(reply!.text).toMatch(/search|look (it |them )?up/i);
        expect(shortlistedIn(result)).toEqual([]);
      },
    });
  });
});
