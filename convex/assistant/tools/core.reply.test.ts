/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { createStartingSections } from "../../canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "../../lib/test.helpers";

// S7 (issue #40): the tools inside a real reply. The stub model is scripted
// to call addEntry and then answer, so the whole path runs: the Agent injects
// the run's context into the tool, the tool writes as "Utsavvy for Meera",
// and the write lands in that reply's history group.

const script = vi.hoisted(() => ({
  steps: null as unknown[][] | null,
  call: 0,
}));

// The stub model from `convex/lib/models.ts`, scripted: each call streams the
// next step's parts (a tool call, then the answer).
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

describe("a reply that calls a tool", { timeout: 30_000 }, () => {
  it("adds the Member's ₹15,000 line as Utsavvy for Meera, in the reply's history group", async () => {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    script.steps = [
      [
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "addEntry",
          input: JSON.stringify({
            kind: "budget",
            label: "Mehendi artist",
            functionKey: null,
            amountSource: { memberStated: 15_000 },
          }),
        },
      ],
      [
        { type: "text-start", id: "t" },
        {
          type: "text-delta",
          id: "t",
          delta: "Added the mehendi artist at ₹15,000.",
        },
        { type: "text-end", id: "t" },
      ],
    ];

    const t = newTest();
    agentTest.register(t);
    const { eventId, meera, budget } = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Meera weds Rohan");
      const { membershipId } = await seedMembership(ctx, {
        clerkId: "Meera",
        eventId,
      });
      const actor = { kind: "member" as const, membershipId };
      const sections = await createStartingSections(ctx, eventId, actor);
      const budget = await ctx.db.insert("items", {
        eventId,
        sectionId: sections.money,
        kind: "budget",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: { note: null },
        createdBy: actor,
        version: 1,
        deletedAt: null,
      });
      return { eventId, meera: membershipId, budget };
    });

    const { runId } = await t
      .withIdentity(identityFor("Meera"))
      .mutation(api.chat.send, {
        eventId,
        text: "Add a mehendi artist, around ₹15,000",
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
    const entries = await t.run((ctx) =>
      ctx.db
        .query("entries")
        .withIndex("by_item", (q) => q.eq("itemId", budget as Id<"items">))
        .collect(),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      createdBy: { kind: "assistant", forMembershipId: meera, runId },
      fields: { label: "Mehendi artist", plannedAmount: 15_000 },
    });
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_group", (q) => q.eq("groupKey", runId!))
        .collect(),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      table: "entries",
      op: "create",
      groupLabel: "Add a mehendi artist, around ₹15,000",
    });
  });
});
