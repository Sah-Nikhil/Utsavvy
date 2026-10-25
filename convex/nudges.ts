import { saveMessage } from "@convex-dev/agent";
import { ConvexError, v } from "convex/values";
import { can } from "../lib/access/permissions";
import { formatINR } from "../lib/format";
import type { SelectionTarget } from "../lib/types/canvas";
import type { WriteEvent } from "../lib/types/history";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { memberName } from "./chat";
import { budgetRollup } from "./entries";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { once } from "./lib/idempotency";
import { istDay } from "./lib/time";
import { memberWrite } from "./lib/write";
import { checkQueueRoom, enqueueRun } from "./runs";

/*
 * Nudges (S17; assistant-behavior.md rules 6 to 8, IMPLEMENTATION_PLAN.md
 * sections 4.4, 4.7 and 5.4). Plain code, never the model, watches three
 * triggers and posts a short line in the Chat as Utsavvy:
 *
 * - the Budget goes over its total,
 * - an unticked Timeline Entry is due within 3 days,
 * - a Member adds an Inspiration photo.
 *
 * At most one Nudge per trigger per target per IST day (the `nudges` index).
 * A Nudge never changes the Canvas: its one button (`act`) sends a ready-made
 * request as the Member who tapped it, and from there it is a request like
 * any other, answered by the run queue. The run's source is "nudge", so the
 * Assistant's tools treat it as not asked for and any change it suggests
 * arrives as a Proposal.
 */

export type NudgeTrigger = Doc<"nudges">["trigger"];

/** An unticked Entry due this many days ahead, or sooner, gets a Nudge. */
export const DUE_SOON_DAYS = 3;

/** The Nudge's one button. */
export const NUDGE_BUTTONS: Record<NudgeTrigger, string> = {
  budgetOver: "Suggest cuts",
  dueSoon: "Help me with this",
  newInspiration: "Update the Theme",
};

/**
 * The request a tap sends, as the tapping Member's message. Fixed words with
 * no Canvas text in them: what the request is about travels as pointing, so a
 * label or a photo description a Member wrote never becomes an instruction.
 */
export function nudgeRequest(trigger: NudgeTrigger): string {
  switch (trigger) {
    case "budgetOver":
      return "Suggest cuts to bring the Budget back within its total.";
    case "dueSoon":
      return "Help me with this. It's due soon and still open.";
    case "newInspiration":
      return "Update the Theme to match this photo.";
  }
}

// ---------------------------------------------------------------------------
// The lines

/** "The Budget is now ₹40,000 over. Want me to suggest cuts?" */
export function budgetLine(overBy: number): string {
  return `The Budget is now ${formatINR(overBy)} over. Want me to suggest cuts?`;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Whole days from one ISO day to another ("2026-10-28" to "2026-10-30" is 2). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** "Book decorator is due Friday and still open." ("today", "tomorrow" when nearer). */
export function dueSoonLine(title: string, date: string, today: string) {
  const days = daysBetween(today, date);
  const when =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${title} is due ${when} and still open.`;
}

/** A description up to this many words reads as a phrase: "a pastel lehenga photo". */
const PHRASE_WORDS = 4;
/** A longer description is cut to this many characters. */
const MAX_DESCRIPTION = 90;
const THEME_QUESTION = "Want me to update the Theme to match?";

/** Lowercases a leading capital unless the next word is capitalised too ("Hawa Mahal"). */
function lowerFirst(text: string): string {
  const [first = "", second] = text.split(" ");
  if (second !== undefined && /^\p{Lu}/u.test(second)) return text;
  if (first.length > 1 && first === first.toUpperCase()) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * "Meera added a pastel lehenga photo. Want me to update the Theme to match?"
 * A short description reads as a phrase, a longer one as "a photo of ...",
 * and a photo not yet described as "a photo".
 */
export function inspirationLine(
  name: string,
  what: { description: string | null; kind: "photo" },
): string {
  const description = (what.description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!]+$/, "");
  if (description === "")
    return `${name} added a ${what.kind}. ${THEME_QUESTION}`;
  const words = description.split(" ");
  if (words.length <= PHRASE_WORDS && !/[.,;:!?]/.test(description)) {
    const phrase = lowerFirst(description);
    const article = /^[aeiou]/i.test(phrase) ? "an" : "a";
    return `${name} added ${article} ${phrase} ${what.kind}. ${THEME_QUESTION}`;
  }
  const cut =
    description.length > MAX_DESCRIPTION
      ? `${description.slice(0, MAX_DESCRIPTION - 1).replace(/\s+\S*$/, "")}…`
      : `${description}.`;
  return `${name} added a ${what.kind} of ${lowerFirst(cut)} ${THEME_QUESTION}`;
}

// ---------------------------------------------------------------------------
// The post-write hook

/** Whether a write can change what a Nudge watches. */
function watches(event: WriteEvent): boolean {
  const before = event.before as Record<string, unknown> | null;
  const after = event.after as Record<string, unknown> | null;
  switch (event.table) {
    case "entries": {
      const kind = (after ?? before)?.kind;
      return kind === "budget" || kind === "timeline";
    }
    case "events":
      return before?.budgetTotal !== after?.budgetTotal;
    case "items":
      return event.op === "create" && after?.kind === "inspiration";
    default:
      return false;
  }
}

/** Events whose check this mutation has already scheduled, by mutation. */
const scheduledIn = new WeakMap<object, Set<Id<"events">>>();

/**
 * Post-write hook (IMPLEMENTATION_PLAN.md section 4.4): after a write to a
 * budget or Timeline Entry, the Event's `budgetTotal`, or a new Inspiration
 * Item, schedules `internal.nudges.check` for the Event once per mutation.
 * Any other write does nothing.
 */
export async function nudgesAfterWrite(
  ctx: MutationCtx,
  event: WriteEvent,
): Promise<void> {
  if (!watches(event)) return;
  let scheduled = scheduledIn.get(ctx);
  if (scheduled === undefined) {
    scheduled = new Set();
    scheduledIn.set(ctx, scheduled);
  }
  if (scheduled.has(event.eventId)) return;
  scheduled.add(event.eventId);
  await ctx.scheduler.runAfter(0, internal.nudges.check, {
    eventId: event.eventId,
  });
}

// ---------------------------------------------------------------------------
// The check

/** Posts a Nudge unless one for this trigger and target is already out today. */
async function post(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    trigger: NudgeTrigger;
    targetId: string;
    dayIst: string;
    text: string;
  },
): Promise<void> {
  const { eventId, trigger, targetId, dayIst, text } = args;
  const already = await ctx.db
    .query("nudges")
    .withIndex("by_event_trigger_target_day", (q) =>
      q
        .eq("eventId", eventId)
        .eq("trigger", trigger)
        .eq("targetId", targetId)
        .eq("dayIst", dayIst),
    )
    .first();
  if (already !== null) return;
  const nudgeId = await ctx.db.insert("nudges", {
    eventId,
    trigger,
    targetId,
    dayIst,
    messageId: null,
  });
  const messageId = await ctx.runMutation(internal.chat.postSystem, {
    eventId,
    card: { kind: "nudge", id: nudgeId },
    text,
  });
  await ctx.db.patch("nudges", nudgeId, { messageId });
}

/** The live Items of the Event by ID, read once each. */
function liveItems(ctx: QueryCtx) {
  const known = new Map<Id<"items">, Doc<"items"> | null>();
  return async (itemId: Id<"items">) => {
    if (!known.has(itemId)) {
      const item = await ctx.db.get("items", itemId);
      known.set(itemId, item !== null && item.deletedAt === null ? item : null);
    }
    return known.get(itemId) ?? null;
  };
}

async function liveEntries<K extends "budget" | "timeline">(
  ctx: QueryCtx,
  eventId: Id<"events">,
  kind: K,
): Promise<Extract<Doc<"entries">, { kind: K }>[]> {
  const item = liveItems(ctx);
  const out: Extract<Doc<"entries">, { kind: K }>[] = [];
  for await (const entry of ctx.db
    .query("entries")
    .withIndex("by_event_kind", (q) =>
      q.eq("eventId", eventId).eq("kind", kind),
    )) {
    if (entry.deletedAt !== null || (await item(entry.itemId)) === null)
      continue;
    out.push(entry as Extract<Doc<"entries">, { kind: K }>);
  }
  return out;
}

async function checkBudget(
  ctx: MutationCtx,
  event: Doc<"events">,
  dayIst: string,
): Promise<void> {
  if (event.budgetTotal === null) return;
  const entries = await liveEntries(ctx, event._id, "budget");
  const { overBy } = budgetRollup(entries, event.budgetTotal);
  if (overBy <= 0) return;
  await post(ctx, {
    eventId: event._id,
    trigger: "budgetOver",
    // One Budget per Event: the Event is the target.
    targetId: event._id,
    dayIst,
    text: budgetLine(overBy),
  });
}

async function checkDueSoon(
  ctx: MutationCtx,
  event: Doc<"events">,
  dayIst: string,
): Promise<void> {
  for (const entry of await liveEntries(ctx, event._id, "timeline")) {
    const { done, date, title } = entry.fields;
    if (done || date === null) continue;
    const days = daysBetween(dayIst, date);
    if (days < 0 || days > DUE_SOON_DAYS) continue;
    await post(ctx, {
      eventId: event._id,
      trigger: "dueSoon",
      targetId: entry._id,
      dayIst,
      text: dueSoonLine(title, date, dayIst),
    });
  }
}

/** The moment an IST day begins. */
function istDayStart(dayIst: string): number {
  return Date.parse(`${dayIst}T00:00:00+05:30`);
}

/**
 * Photos a Member added today. References are left out: the Assistant can't
 * open Pinterest or Instagram (ADR 0014), so it couldn't match the Theme to
 * one. So are photos added in a labelled group, such as the vibe pick, which
 * set the Theme as they arrive.
 */
async function checkInspirations(
  ctx: MutationCtx,
  event: Doc<"events">,
  dayIst: string,
): Promise<void> {
  for await (const item of ctx.db
    .query("items")
    .withIndex("by_event", (q) =>
      q.eq("eventId", event._id).gte("_creationTime", istDayStart(dayIst)),
    )) {
    if (item.kind !== "inspiration" || item.deletedAt !== null) continue;
    if (item.createdBy.kind !== "member") continue;
    if (item.data.source.kind === "reference") continue;
    const creation = await ctx.db
      .query("changes")
      .withIndex("by_doc", (q) => q.eq("docId", item._id))
      .first();
    if (creation === null || creation.groupLabel !== null) continue;
    const adder = await ctx.db.get("memberships", item.data.addedBy);
    await post(ctx, {
      eventId: event._id,
      trigger: "newInspiration",
      targetId: item._id,
      dayIst,
      text: inspirationLine(memberName(adder?.displayName ?? "A Member"), {
        description: item.data.seen?.description ?? null,
        kind: "photo",
      }),
    });
  }
}

/**
 * Checks the three triggers for one Event and posts what is due, plain code
 * with no model call. Scheduled by the post-write hook and the daily sweep.
 * Quiet while the first plan is being written: its own Budget check covers
 * that moment.
 */
export const check = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("events", eventId);
    if (event === null || event.briefState === "planning") return null;
    const dayIst = istDay(Date.now());
    await checkBudget(ctx, event, dayIst);
    await checkDueSoon(ctx, event, dayIst);
    await checkInspirations(ctx, event, dayIst);
    return null;
  },
});

/**
 * The due-soon sweep, daily at 08:00 IST (convex/crons.ts): an Entry can
 * become due within 3 days without anyone writing to it, so every Event gets
 * its check.
 */
export const dueSoonSweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for await (const event of ctx.db.query("events")) {
      if (event.briefState === "intake") continue;
      await ctx.scheduler.runAfter(0, internal.nudges.check, {
        eventId: event._id,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// The button

/** The once-key of a Nudge's button, so it sends one request however many taps. */
const actKey = (nudgeId: Id<"nudges">) => `nudgeAct:${nudgeId}`;

type Acted = {
  runId: Id<"runs">;
  messageId: string;
  membershipId: Id<"memberships">;
};

/** What the request points at, when it is still on the Canvas. */
async function pointingFor(
  ctx: MutationCtx,
  nudge: Doc<"nudges">,
): Promise<SelectionTarget[]> {
  if (nudge.trigger === "budgetOver") {
    // An Event has one Budget; a deleted one may sit before it.
    const budgets = await ctx.db
      .query("items")
      .withIndex("by_event_kind", (q) =>
        q.eq("eventId", nudge.eventId).eq("kind", "budget"),
      )
      .take(10);
    const budget = budgets.find((item) => item.deletedAt === null);
    return budget === undefined ? [] : [{ kind: "item", itemId: budget._id }];
  }
  if (nudge.trigger === "dueSoon") {
    const entryId = ctx.db.normalizeId("entries", nudge.targetId);
    const entry =
      entryId === null ? null : await ctx.db.get("entries", entryId);
    if (entry === null || entry.deletedAt !== null) return [];
    const item = await ctx.db.get("items", entry.itemId);
    if (item === null || item.deletedAt !== null) return [];
    return [{ kind: "entry", itemId: entry.itemId, entryId: entry._id }];
  }
  const itemId = ctx.db.normalizeId("items", nudge.targetId);
  const item = itemId === null ? null : await ctx.db.get("items", itemId);
  if (
    item === null ||
    item.deletedAt !== null ||
    item.eventId !== nudge.eventId
  )
    return [];
  return [{ kind: "item", itemId: item._id }];
}

/**
 * A Member taps the Nudge's button: its ready-made request is sent as their
 * own Chat message and queued for the Assistant. The Nudge changes nothing on
 * the Canvas itself. One request per Nudge: a second tap, by anyone, gets the
 * first. Viewers can't ask the Assistant, so they can't tap.
 */
export const act = mutation({
  args: { nudgeId: v.id("nudges") },
  returns: v.object({ runId: v.id("runs"), messageId: v.string() }),
  handler: async (ctx, { nudgeId }) => {
    const nudge = await ctx.db.get("nudges", nudgeId);
    if (nudge === null)
      throw new ConvexError({ kind: "NotFound", what: "nudge" });
    const { membership } = await requireAccess(ctx, nudge.eventId, "chat.post");
    const acted = await once(ctx, actKey(nudgeId), async (): Promise<Acted> => {
      await checkQueueRoom(ctx, nudge.eventId, membership._id);
      const event = await ctx.db.get("events", nudge.eventId);
      // The Nudge's own line made the thread.
      if (event === null || event.agentThreadId === null)
        throw new AccessDenied("wrongEvent", "chat.post");
      const pointing = await pointingFor(ctx, nudge);
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId: event.agentThreadId,
        userId: membership._id,
        prompt: nudgeRequest(nudge.trigger),
      });
      await ctx.db.insert("chatAnnotations", {
        eventId: nudge.eventId,
        messageId,
        authorMembershipId: membership._id,
        dontReply: false,
        mentions: [],
        pointing,
        card: null,
      });
      const runId = await enqueueRun(ctx, {
        eventId: nudge.eventId,
        requestedBy: membership._id,
        source: "nudge",
        messageId,
        commentId: null,
      });
      return { runId, messageId, membershipId: membership._id };
    });
    return { runId: acted.runId, messageId: acted.messageId };
  },
});

/**
 * What the Nudge card shows beside its line: the button, who already tapped
 * it, and whether the caller may. Null without access.
 */
export const card = query({
  args: { nudgeId: v.id("nudges") },
  returns: v.union(
    v.null(),
    v.object({
      trigger: v.union(
        v.literal("budgetOver"),
        v.literal("dueSoon"),
        v.literal("newInspiration"),
      ),
      button: v.string(),
      /** The Member whose tap sent the request, once someone has. */
      askedBy: v.union(v.string(), v.null()),
      canAct: v.boolean(),
    }),
  ),
  handler: async (ctx, { nudgeId }) => {
    const nudge = await ctx.db.get("nudges", nudgeId);
    if (nudge === null) return null;
    let membership: Doc<"memberships">;
    try {
      ({ membership } = await requireAccess(ctx, nudge.eventId, "canvas.view"));
    } catch (error) {
      if (error instanceof AccessDenied) return null;
      throw error;
    }
    const tapped = await ctx.db
      .query("toolCalls")
      .withIndex("by_key", (q) => q.eq("key", actKey(nudgeId)))
      .unique();
    let askedBy: string | null = null;
    if (tapped !== null) {
      const asker = await ctx.db.get(
        "memberships",
        (tapped.result as Acted).membershipId,
      );
      askedBy = memberName(asker?.displayName ?? "A Member");
    }
    return {
      trigger: nudge.trigger,
      button: NUDGE_BUTTONS[nudge.trigger],
      askedBy,
      canAct: can(membership.role, "chat.post"),
    };
  },
});

// ---------------------------------------------------------------------------
// Local browser checks only

/**
 * Gives a new Event the Budget total a Nudge needs, for e2e/nudges.spec.ts
 * against `bun run dev`: Members set the total through the Brief, which the
 * browser test doesn't walk. Written as the Owner's edit, so the post-write
 * hook runs as it would. Refuses anything but a local deployment.
 */
export const budgetForLocalCheck = internalMutation({
  args: { eventId: v.id("events"), budgetTotal: v.number() },
  returns: v.null(),
  handler: async (ctx, { eventId, budgetTotal }) => {
    const url = env.CONVEX_CLOUD_URL ?? "";
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url))
      throw new Error("Only for a local Convex deployment");
    const owner = (
      await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).find((m) => m.role === "owner" && m.status === "active");
    if (owner === undefined) throw new Error("That Event has no Owner");
    // Past the first Brief, so the Chat reads as a planned Event's.
    await ctx.db.patch("events", eventId, { briefState: "planned" });
    await memberWrite(ctx, {
      table: "events",
      id: eventId,
      patch: { budgetTotal },
      actor: { kind: "member", membershipId: owner._id },
    });
    return null;
  },
});
