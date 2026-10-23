/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import type { UIMessage } from "@convex-dev/agent/react";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { setStubChunkDelayMs } from "../convex/lib/models";
import { ASSISTANT_TOOLS } from "../convex/assistant/tools";
import { createStartingSections } from "../convex/canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "../convex/lib/test.helpers";
import { referenceTableBasis } from "../lib/pricing";
import type { EntryFields } from "../lib/types/canvas";

/*
 * The scripted Assistant cases' harness (IMPLEMENTATION_PLAN.md section 8):
 * one Event in convex-test, Members sending Chat messages through
 * `api.chat.send`, and each queued run answered by the real reply action
 * (`internal.assistant.agent.respond`, started by the run queue) with the
 * real tools. What the case checks is what a Member would see afterwards:
 * the replies with their sources, and the Canvas.
 */

export type MemberName = "Meera" | "Rohan" | "Aditi";

/** A Chat message one of the Event's Members sends, in order. */
export type CaseMessage = {
  from: MemberName;
  text: string;
  dontReply?: boolean;
  /** Send with the previous message, without waiting for its reply (the "two asks" case). */
  together?: boolean;
};

export type Seeded = {
  eventId: Id<"events">;
  members: Record<MemberName, Id<"memberships">>;
  items: Record<"budget" | "timeline" | "checklist", Id<"items">>;
  sections: Record<
    "money" | "vendors" | "inspirations" | "notes",
    Id<"sections">
  >;
  /** The seeded budget Entries by label. */
  entries: Record<string, Id<"entries">>;
};

type T = ReturnType<typeof newTest>;

export type CaseReply = {
  runId: Id<"runs">;
  askedBy: MemberName;
  status: Doc<"runs">["status"];
  model: string;
  text: string;
  sources: { url: string; title: string | undefined }[];
};

export type CaseResult = {
  t: T;
  seeded: Seeded;
  replies: CaseReply[];
  /** Every live Entry of the Event after the case. */
  entries: Doc<"entries">[];
  /** Every live Item of the Event after the case. */
  items: Doc<"items">[];
  /** The history rows the Assistant wrote. */
  assistantChanges: Doc<"changes">[];
  highlights: Doc<"highlights">[];
  /** Notices the app posted in the Chat (`postSystem`). */
  notices: string[];
  ms: number;
};

export type SeedOptions = {
  city?: { name: string; tier: "X" | "Y" | "Z" };
  budgetTotal?: number;
  /** Budget lines to start with: label, Function, planned amount. */
  budget?: { label: string; functionKey: string | null; amount: number }[];
};

/**
 * The Jaipur wedding from assistant-behavior.md: Meera, Rohan and Aditi plan
 * it, with a ₹12,00,000 Budget, the Mehendi, Sangeet and Wedding Functions,
 * the starting Sections and the Budget, Timeline and Vendor checklist.
 */
export function wedding(options: SeedOptions = {}) {
  return async (ctx: MutationCtx): Promise<Seeded> => {
    const eventId = await insertEvent(ctx, "Meera weds Rohan");
    await ctx.db.patch("events", eventId, {
      city: {
        name: options.city?.name ?? "Jaipur",
        tier: options.city?.tier ?? "Y",
        centre: null,
      },
      budgetTotal: options.budgetTotal ?? 1_200_000,
      briefState: "planned",
    });
    const members = {} as Record<MemberName, Id<"memberships">>;
    for (const name of ["Meera", "Rohan", "Aditi"] as const) {
      const { membershipId } = await seedMembership(ctx, {
        clerkId: name,
        eventId,
        role: name === "Meera" ? "owner" : "member",
      });
      await ctx.db.patch("memberships", membershipId, { displayName: name });
      members[name] = membershipId;
    }
    const actor = { kind: "member" as const, membershipId: members.Meera };
    const sections = await createStartingSections(ctx, eventId, actor);
    const items = {} as Seeded["items"];
    for (const kind of ["budget", "timeline", "checklist"] as const) {
      items[kind] = await ctx.db.insert("items", {
        eventId,
        sectionId: kind === "checklist" ? sections.vendors : sections.money,
        kind,
        position: { x: 0, y: kind === "timeline" ? 520 : 0 },
        size: null,
        functionKey: null,
        data: { note: null },
        createdBy: actor,
        version: 1,
        deletedAt: null,
      });
    }
    for (const [order, key] of ["mehendi", "sangeet", "wedding"].entries()) {
      await ctx.db.insert("eventFunctions", {
        eventId,
        key,
        name: key[0]!.toUpperCase() + key.slice(1),
        date: null,
        guests: key === "wedding" ? 300 : 150,
        assumed: [],
        order,
        version: 1,
      });
    }
    const entries: Record<string, Id<"entries">> = {};
    const lines = options.budget ?? [
      { label: "Caterer", functionKey: "sangeet", amount: 210_000 },
      { label: "Decor", functionKey: "wedding", amount: 300_000 },
    ];
    for (const [order, line] of lines.entries()) {
      const fields: EntryFields<"budget"> = {
        label: line.label,
        category: null,
        quantity: 1,
        unit: "per_event",
        estimate: {
          low: Math.round(line.amount * 0.8),
          high: Math.round(line.amount * 1.3),
          amount: line.amount,
          label: "Estimate",
          basis: referenceTableBasis({
            unit: "per_event",
            unitLow: Math.round(line.amount * 0.8),
            unitHigh: Math.round(line.amount * 1.3),
            tier: "Y",
          }),
        },
        plannedAmount: null,
        role: "line",
        belowUsualRange: false,
        editedByMember: false,
      };
      entries[line.label] = await ctx.db.insert("entries", {
        eventId,
        itemId: items.budget,
        kind: "budget",
        order,
        functionKey: line.functionKey,
        fields,
        assumed: [],
        createdBy: actor,
        version: 1,
        deletedAt: null,
      });
    }
    return { eventId, members, items, sections, entries };
  };
}

/** Something to do while a run is in its tool loop, after a named tool's first call returns. */
export type During = {
  afterTool: string;
  run: (t: T, seeded: Seeded) => Promise<void>;
};

const ENDED = ["done", "failed", "stopped", "cancelled"];
/** A case's replies end within this long, or the case fails. */
const RUN_LIMIT_MS = 150_000;

async function untilEnded(t: T, runId: Id<"runs">): Promise<void> {
  const started = Date.now();
  for (;;) {
    const status = await t.query(internal.runs.status, { runId });
    if (status !== null && ENDED.includes(status)) break;
    if (Date.now() - started > RUN_LIMIT_MS)
      throw new Error(`Run ${runId} didn't end within ${RUN_LIMIT_MS} ms`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await t.finishInProgressScheduledFunctions();
}

/** Calls `during.run` once, right after the named tool first returns, then puts the tool back. */
function hookTool(t: T, seeded: () => Seeded, during: During | undefined) {
  if (!during) return () => {};
  const tool = (
    ASSISTANT_TOOLS as unknown as Record<
      string,
      { execute: (...args: unknown[]) => Promise<unknown> }
    >
  )[during.afterTool];
  if (!tool) throw new Error(`No tool named ${during.afterTool}`);
  const original = tool.execute;
  let done = false;
  tool.execute = async function (this: unknown, ...args: unknown[]) {
    const result = await original.apply(this, args);
    if (!done) {
      done = true;
      await during.run(t, seeded());
    }
    return result;
  };
  return () => {
    tool.execute = original;
  };
}

function textOf(message: UIMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();
}

/**
 * Runs one scripted case: seeds the Event, sends each message as its Member,
 * lets every run answer, and returns what the Members would see. `expect`
 * makes the case's assertions on the result.
 */
export async function runCase(args: {
  seed?: (ctx: MutationCtx) => Promise<Seeded>;
  messages: CaseMessage[];
  during?: During;
  expect: (result: CaseResult) => void | Promise<void>;
}): Promise<CaseResult> {
  const started = Date.now();
  setStubChunkDelayMs(5);
  const t = newTest();
  agentTest.register(t);
  const seeded = await t.run(args.seed ?? wedding());
  const unhook = hookTool(t, () => seeded, args.during);
  const asked: { runId: Id<"runs">; from: MemberName }[] = [];
  try {
    let pending: { runId: Id<"runs">; from: MemberName }[] = [];
    for (const message of args.messages) {
      if (!message.together) {
        for (const run of pending) await untilEnded(t, run.runId);
        pending = [];
      }
      const { runId } = await t
        .withIdentity(identityFor(message.from))
        .mutation(api.chat.send, {
          eventId: seeded.eventId,
          text: message.text,
          dontReply: message.dontReply ?? false,
          pointing: [],
        });
      if (runId) {
        pending.push({ runId, from: message.from });
        asked.push({ runId, from: message.from });
      }
    }
    for (const run of pending) await untilEnded(t, run.runId);
  } finally {
    unhook();
    setStubChunkDelayMs(undefined);
  }

  const asMeera = t.withIdentity(identityFor("Meera"));
  const details = await asMeera.query(api.chat.details, {
    eventId: seeded.eventId,
  });
  const page =
    details?.threadId != null
      ? await asMeera.query(api.chat.list, {
          eventId: seeded.eventId,
          threadId: details.threadId,
          paginationOpts: { numItems: 100, cursor: null },
        })
      : { page: [] as UIMessage[] };
  const messages = page.page as UIMessage[];
  const annotations = new Map(
    (details?.annotations ?? []).map((a) => [a.messageId, a]),
  );

  const replies: CaseReply[] = [];
  for (const { runId, from } of asked) {
    const run = (await t.run((ctx) => ctx.db.get("runs", runId)))!;
    const prompt = messages.find((m) => m.id === run.messageId);
    const reply = prompt
      ? messages.find(
          (m) =>
            m.role === "assistant" &&
            m.order === prompt.order &&
            !annotations.has(m.id),
        )
      : undefined;
    replies.push({
      runId,
      askedBy: from,
      status: run.status,
      model: run.model,
      text: reply ? textOf(reply) : "",
      sources: reply
        ? reply.parts.flatMap((part) =>
            part.type === "source-url"
              ? [{ url: part.url, title: part.title }]
              : [],
          )
        : [],
    });
  }

  const result = await t.run(async (ctx) => {
    const entries = (
      await ctx.db
        .query("entries")
        .withIndex("by_event_kind", (q) => q.eq("eventId", seeded.eventId))
        .collect()
    ).filter((e) => e.deletedAt === null);
    const items = (
      await ctx.db
        .query("items")
        .withIndex("by_event", (q) => q.eq("eventId", seeded.eventId))
        .collect()
    ).filter((i) => i.deletedAt === null);
    const assistantChanges = (
      await ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", seeded.eventId))
        .collect()
    ).filter((c) => c.actor.kind === "assistant");
    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_event", (q) => q.eq("eventId", seeded.eventId))
      .collect();
    return { entries, items, assistantChanges, highlights };
  });

  const notices = messages
    .filter((m) => annotations.get(m.id)?.authorMembershipId === null)
    .map(textOf);

  const caseResult: CaseResult = {
    t,
    seeded,
    replies,
    ...result,
    notices,
    ms: Date.now() - started,
  };
  await args.expect(caseResult);
  return caseResult;
}

/** The amount a budget Entry counts for: the Member's amount, else its Estimate's. */
export function amountOf(entry: Doc<"entries">): number | null {
  if (entry.kind !== "budget") return null;
  return entry.fields.plannedAmount ?? entry.fields.estimate?.amount ?? null;
}

/** Devanagari letters in a text. */
export function hasDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}
