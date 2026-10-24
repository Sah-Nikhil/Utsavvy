import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { ASSISTANT_TOOLS } from "../convex/assistant/tools";
import { identityFor } from "../convex/lib/test.helpers";
import { amountOf, runCase, wedding, type CaseResult } from "./harness";

/**
 * Scripted cases for Proposals (S10, issue #43; the "Risky request" and
 * "Collision" worked examples in docs/design/assistant-behavior.md). Each
 * runs the real reply with the real tools against an Event in convex-test.
 *
 * The live cases call the real model and spend API credits, so they run only
 * when asked, with the key given in the shell (never in `.env.local`):
 *
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval evals/proposals.eval.ts
 *
 * Model replies vary, so a case checks what must hold (one Proposal with the
 * right changes, nothing applied before Accept, the history after it), not
 * the exact wording.
 */

const LIVE = process.env.EVAL_LIVE === "1";

/** Decor ₹3,00,000, a ₹60,000 Drone shoot and the Caterer, on a ₹25,00,000 Budget. */
const RISKY_SEED = wedding({
  budgetTotal: 2_500_000,
  budget: [
    { label: "Caterer", functionKey: "sangeet", amount: 210_000 },
    { label: "Decor", functionKey: "wedding", amount: 300_000 },
    { label: "Drone shoot", functionKey: "wedding", amount: 60_000 },
  ],
});

async function proposalsOf(result: CaseResult): Promise<Doc<"proposals">[]> {
  return await result.t.run((ctx) =>
    ctx.db
      .query("proposals")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", result.seeded.eventId),
      )
      .collect(),
  );
}

describe("the propose tool", () => {
  it("is registered with the Assistant, in place of the contract stub", () => {
    const tool = (
      ASSISTANT_TOOLS as unknown as Record<string, { description?: string }>
    ).propose;
    expect(tool?.description).toMatch(/^Post a Proposal/);
  });
});

describe.skipIf(!LIVE)("scripted cases (live model)", () => {
  it("risky request: the decor cut and deleting the Drone shoot arrive as one Proposal, applied only on Accept", async () => {
    const result = await runCase({
      seed: RISKY_SEED,
      messages: [
        {
          from: "Rohan",
          text: "Cut decor to ₹2,20,000 and drop the drone shoot.",
        },
      ],
      expect: async (r) => {
        expect(r.replies[0]!.status).toBe("done");
        // Nothing changed before a Member accepts.
        const decor = r.entries.find((e) => e._id === r.seeded.entries.Decor);
        expect(amountOf(decor!)).toBe(300_000);
        expect(
          r.entries.some((e) => e._id === r.seeded.entries["Drone shoot"]),
        ).toBe(true);

        const [proposal, ...others] = await proposalsOf(r);
        expect(others).toHaveLength(0);
        expect(proposal!.status).toBe("open");
        const ops = proposal!.changes.map((c) => `${c.op}:${c.docId}`);
        expect(ops).toContain(`updateEntry:${r.seeded.entries.Decor}`);
        expect(ops).toContain(`deleteEntry:${r.seeded.entries["Drone shoot"]}`);
        expect(r.notices.some((n) => n.startsWith("Proposal: "))).toBe(true);

        // Aditi accepts: the history names who asked and who accepted.
        const aditi = r.t.withIdentity(identityFor("Aditi"));
        expect(
          await aditi.mutation(api.proposals.accept, {
            eventId: r.seeded.eventId,
            proposalId: proposal!._id,
          }),
        ).toEqual({ ok: true });
        const history = await aditi.query(api.history.list, {
          eventId: r.seeded.eventId,
          paginationOpts: { numItems: 20, cursor: null },
        });
        expect(
          history.page.some((row) =>
            /^Utsavvy for Rohan, accepted by Aditi \(\d+ changes?\)$/.test(
              row.groupTitle ?? "",
            ),
          ),
        ).toBe(true);
        const after = await r.t.run((ctx) =>
          ctx.db.get("entries", r.seeded.entries.Decor!),
        );
        expect(after?.kind === "budget" && after.fields.plannedAmount).toBe(
          220_000,
        );
      },
    });
    expect(result.replies).toHaveLength(1);
  });

  it("collision: Meera edits Decor while the Proposal is open; Ask again starts from her ₹2,50,000", async () => {
    let proposalId: Id<"proposals"> | null = null;
    const result = await runCase({
      seed: RISKY_SEED,
      messages: [
        {
          from: "Rohan",
          text: "Cut decor to ₹2,20,000 and drop the drone shoot.",
        },
      ],
      expect: async (r) => {
        const [proposal] = await proposalsOf(r);
        proposalId = proposal!._id;
        await r.t
          .withIdentity(identityFor("Meera"))
          .mutation(api.entries.update, {
            entryId: r.seeded.entries.Decor!,
            patch: { kind: "budget", plannedAmount: 250_000 },
          });
        const card = await r.t
          .withIdentity(identityFor("Rohan"))
          .query(api.proposals.get, {
            eventId: r.seeded.eventId,
            proposalId,
          });
        expect(card.status).toEqual({
          kind: "outOfDate",
          text: "Out of date: Meera changed this since",
        });
      },
    });

    // Rohan taps "Ask again"; the new Proposal reads the Canvas fresh.
    const { runId } = await result.t
      .withIdentity(identityFor("Rohan"))
      .mutation(api.proposals.askAgain, {
        eventId: result.seeded.eventId,
        proposalId: proposalId!,
      });
    for (let i = 0; i < 750; i++) {
      const run = await result.t.run((ctx) => ctx.db.get("runs", runId));
      if (
        run &&
        ["done", "failed", "stopped", "cancelled"].includes(run.status)
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await result.t.finishInProgressScheduledFunctions();
    const fresh = (await proposalsOf(result)).find(
      (p) => p._id !== proposalId && p.status === "open",
    );
    expect(fresh, "a new Proposal").toBeDefined();
    const card = await result.t
      .withIdentity(identityFor("Rohan"))
      .query(api.proposals.get, {
        eventId: result.seeded.eventId,
        proposalId: fresh!._id,
      });
    expect(card.lines.some((line) => line.startsWith("Decor ₹2,50,000"))).toBe(
      true,
    );
  });
});
