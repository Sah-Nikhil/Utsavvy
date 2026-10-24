import { describe, expect, it } from "vitest";
import { extractBrief } from "../convex/brief";
import { BRIEF_EXAMPLES } from "../lib/brief/examples";
import { NO_PROGRESS, nextQuestion } from "../lib/brief/questions";

/**
 * Scripted cases for the first Brief's extraction (IMPLEMENTATION_PLAN.md
 * section 8; S11's "Extraction cases"). Each first-brief.md Brief, plus a
 * Hinglish and a Hindi one, goes to the real helper model chain, and the
 * result must match the extraction listed in first-brief.md, with every field
 * the Brief doesn't give left null. They spend API credits, so they run only
 * when you ask, with the key given in the shell:
 *
 *   EVAL_LIVE=1 GOOGLE_GENERATIVE_AI_API_KEY=... bun run eval evals/brief.eval.ts
 *
 * (add ANTHROPIC_API_KEY to run on Claude's helper model first). Never in CI.
 */

const LIVE = process.env.EVAL_LIVE === "1";
const KEYED = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
);
// Today is 2026-10-21 in all three first-brief.md worked examples.
const TODAY = "2026-10-21";

describe.skipIf(!LIVE || !KEYED)("the first Brief's extraction, live", () => {
  for (const example of BRIEF_EXAMPLES) {
    it(`reads "${example.text.slice(0, 40)}…"`, async () => {
      const started = Date.now();
      const { cleaned, model } = await extractBrief(example.text, TODAY, {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      console.log(`${model}, ${Date.now() - started} ms`);
      const want = example.extraction;
      const got = cleaned.extraction;
      expect(got.eventType).toBe(want.eventType);
      expect(got.city?.toLowerCase()).toBe(want.city?.toLowerCase());
      expect(got.date).toEqual(want.date);
      expect(got.guests).toBe(want.guests);
      expect(got.budget).toBe(want.budget);
      expect(got.households).toBe(want.households);
      expect(got.honoree?.who ?? null).toBe(want.honoree?.who ?? null);
      expect(got.honoree?.age ?? null).toBe(want.honoree?.age ?? null);
      // Tradition and kind are free text; the chips depend only on whether they're there.
      expect(got.tradition === null).toBe(want.tradition === null);
      expect(got.communityKind === null).toBe(want.communityKind === null);
      // And so the same questions follow.
      expect(nextQuestion(got, NO_PROGRESS, TODAY)?.id).toBe(
        nextQuestion(want, NO_PROGRESS, TODAY)?.id,
      );
    });
  }
});
