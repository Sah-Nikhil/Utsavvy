/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseVendorCards } from "../../../components/vendors/cards";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { createStartingSections } from "../../canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "../../lib/test.helpers";

// S9's scripted case on the stub model (issue #42): "show me caterers for the
// sangeet" shows the starter caterers as Vendor cards in the Chat, and "add
// the second one" shortlists that card's Vendor. The stub is scripted to call
// the tools as a model would, so the whole path runs through real replies.

const script = vi.hoisted(() => ({
  steps: null as unknown[][] | null,
  call: 0,
}));

vi.mock("../../lib/models", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/models")>();
  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
  return {
    ...original,
    languageModel: (...args: Parameters<typeof original.languageModel>) => {
      const [id] = args;
      if (script.steps === null || id !== original.STUB_MODEL)
        return original.languageModel(...args);
      const steps = script.steps;
      const model: ReturnType<typeof original.languageModel> = {
        specificationVersion: "v4",
        provider: "stub",
        modelId: id,
        supportedUrls: {},
        doGenerate: () => {
          throw new Error("The scripted stub only streams");
        },
        doStream: async () => {
          const step = steps[Math.min(script.call++, steps.length - 1)]!;
          const toolCalls = step.some(
            (part) => (part as { type: string }).type === "tool-call",
          );
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: "stream-start", warnings: [] });
                for (const part of step) controller.enqueue(part);
                controller.enqueue({
                  type: "finish",
                  usage,
                  finishReason: toolCalls
                    ? { unified: "tool-calls", raw: "tool_use" }
                    : { unified: "stop", raw: "stop" },
                });
                controller.close();
              },
            }),
          } as never;
        },
      };
      return model;
    },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  script.steps = null;
  script.call = 0;
});

const ENDED = ["done", "failed", "stopped", "cancelled"];

const toolCall = (id: string, toolName: string, input: unknown) => [
  { type: "tool-call", toolCallId: id, toolName, input: JSON.stringify(input) },
];
const answer = (text: string) => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
];

describe("scripted case: caterers for the sangeet", { timeout: 30_000 }, () => {
  it('"show me caterers for the sangeet" shows starter caterer cards; "add the second one" shortlists it', async () => {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    script.steps = [
      toolCall("call_1", "findVendors", {
        category: "caterer",
        functionKey: "sangeet",
      }),
      answer("Here are four Jaipur caterers for the sangeet."),
      toolCall("call_2", "shortlistVendor", { cardPosition: 2 }),
      answer("Added it to the Vendors Section."),
    ];

    const t = newTest();
    agentTest.register(t);
    await t.mutation(internal.vendors.loadStarterSet, {});
    const { eventId, meera } = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Meera weds Rohan");
      await ctx.db.patch("events", eventId, {
        briefState: "planned",
        city: { name: "Jaipur", tier: "Y", centre: null },
      });
      const { membershipId } = await seedMembership(ctx, {
        clerkId: "Meera",
        eventId,
      });
      const actor = { kind: "member" as const, membershipId };
      const sections = await createStartingSections(ctx, eventId, actor);
      // A Vendor checklist with no caterer on it yet.
      await ctx.db.insert("items", {
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
      await ctx.db.insert("eventFunctions", {
        eventId,
        key: "sangeet",
        name: "Sangeet",
        date: null,
        guests: 300,
        assumed: [],
        order: 0,
        version: 1,
      });
      return { eventId, meera: membershipId };
    });
    const asMeera = t.withIdentity(identityFor("Meera"));

    async function say(text: string): Promise<Id<"runs">> {
      const { runId } = await asMeera.mutation(api.chat.send, {
        eventId,
        text,
        dontReply: false,
        pointing: [],
      });
      for (;;) {
        const status = await t.query(internal.runs.status, { runId: runId! });
        if (status !== null && ENDED.includes(status)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await t.finishInProgressScheduledFunctions();
      const run = await t.run((ctx) => ctx.db.get("runs", runId!));
      expect(run!.status).toBe("done");
      return runId!;
    }

    await say("show me caterers for the sangeet");
    const annotations = await t.run((ctx) =>
      ctx.db
        .query("chatAnnotations")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    const cards = annotations.filter((a) => a.card?.kind === "vendorCards");
    expect(cards).toHaveLength(1);
    const card = parseVendorCards(cards[0]!.card!.id)!;
    const vendors = await t.run(async (ctx) =>
      Promise.all(card.vendorIds.map((id) => ctx.db.get("vendors", id))),
    );
    expect(vendors.map((v) => [v!.category, v!.source])).toEqual(
      Array(4).fill(["caterer", "starterSet"]),
    );

    const runId = await say("add the second one");
    const items = await t.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", eventId).eq("kind", "shortlistedVendor"),
        )
        .collect(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      data: { vendorId: card.vendorIds[1] },
      createdBy: { kind: "assistant", forMembershipId: meera, runId },
    });
  });
});
