/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "../lib/test.helpers";
import { STUB_FALLBACK_MODEL, STUB_MODEL, STUB_REPLY } from "./agent";

// The streamed reply end to end on the stub model: no network, no credits.

afterEach(() => {
  vi.unstubAllEnvs();
});

async function setUp(defaultModel: string) {
  vi.stubEnv("DEFAULT_MODEL", defaultModel);
  const t = newTest();
  agentTest.register(t);
  const { eventId, rohan } = await t.run(async (ctx) => {
    const eventId = await insertEvent(ctx, "Meera weds Rohan");
    const rohan = await seedMembership(ctx, { clerkId: "Rohan", eventId });
    await seedMembership(ctx, { clerkId: "Aditi", eventId });
    return { eventId, rohan: rohan.membershipId };
  });
  const asRohan = t.withIdentity(identityFor("Rohan"));
  const asAditi = t.withIdentity(identityFor("Aditi"));
  return { t, eventId, rohan, asRohan, asAditi };
}

async function startRun(
  s: Awaited<ReturnType<typeof setUp>>,
  text: string,
): Promise<Id<"runs">> {
  const { runId } = await s.asRohan.mutation(api.chat.send, {
    eventId: s.eventId,
    text,
    dontReply: false,
    pointing: [],
  });
  return runId!;
}

const ENDED = ["done", "failed", "stopped", "cancelled"];

/** Waits for the scheduler to start the run and the reply to end. */
async function untilEnded(
  s: Awaited<ReturnType<typeof setUp>>,
  runId: Id<"runs">,
) {
  for (;;) {
    const status = await s.t.query(internal.runs.status, { runId });
    if (status !== null && ENDED.includes(status)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await s.t.finishInProgressScheduledFunctions();
}

async function untilStreaming(
  s: Awaited<ReturnType<typeof setUp>>,
  runId: Id<"runs">,
) {
  for (;;) {
    const run = await s.t.run((ctx) => ctx.db.get("runs", runId));
    if (run?.model) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function messages(s: Awaited<ReturnType<typeof setUp>>) {
  const details = await s.asAditi.query(api.chat.details, {
    eventId: s.eventId,
  });
  const page = await s.asAditi.query(api.chat.list, {
    eventId: s.eventId,
    threadId: details!.threadId!,
    paginationOpts: { numItems: 20, cursor: null },
  });
  return { details: details!, page: page.page };
}

describe("respond", { timeout: 20_000 }, () => {
  it("streams the reply into the Event's thread and records the model", async () => {
    const s = await setUp(STUB_MODEL);
    const runId = await startRun(s, "Plan the sangeet");
    await untilEnded(s, runId);

    const { details, page } = await messages(s);
    expect(details.runs.at(-1)).toMatchObject({
      _id: runId,
      status: "done",
      model: STUB_MODEL,
    });
    expect(details.latestModel).toEqual({ model: STUB_MODEL, fallback: false });
    expect(page.map((m) => [m.role, m.text])).toEqual([
      ["user", "Plan the sangeet"],
      ["assistant", STUB_REPLY],
    ]);
  });

  it("answers on the next model when the first fails before its first token", async () => {
    const s = await setUp(STUB_FALLBACK_MODEL);
    const runId = await startRun(s, "Plan the sangeet");
    await untilEnded(s, runId);

    const { details, page } = await messages(s);
    expect(details.runs.at(-1)).toMatchObject({
      status: "done",
      model: "stub-gemini",
    });
    expect(details.latestModel).toEqual({
      model: "stub-gemini",
      fallback: true,
    });
    expect(page.at(-1)?.text).toBe(STUB_REPLY);
  });

  it("fails with no model configured, leaving no reply", async () => {
    const s = await setUp("");
    const runId = await startRun(s, "Plan the sangeet");
    await untilEnded(s, runId);

    const { details, page } = await messages(s);
    expect(details.runs.at(-1)).toMatchObject({ status: "failed", model: "" });
    expect(page.filter((m) => m.role === "assistant" && m.text)).toEqual([]);
  });

  it("stops when the asker presses Stop mid-reply", async () => {
    const s = await setUp(STUB_MODEL);
    const runId = await startRun(s, "Plan the sangeet");
    await untilStreaming(s, runId);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await s.asRohan.mutation(api.runs.stop, { runId });
    await untilEnded(s, runId);

    const { details, page } = await messages(s);
    expect(details.runs.at(-1)).toMatchObject({
      status: "stopped",
      stoppedByName: "Rohan",
    });
    const replyText = page.find((m) => m.role === "assistant")?.text ?? "";
    // What streamed before the stop stays in the Chat.
    expect(replyText.length).toBeGreaterThan(0);
    expect(replyText.length).toBeLessThan(STUB_REPLY.length);
    expect(STUB_REPLY.startsWith(replyText)).toBe(true);
  });
});
