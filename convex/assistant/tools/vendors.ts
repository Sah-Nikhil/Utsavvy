import { createThread, createTool, saveMessage } from "@convex-dev/agent";
import type { Tool } from "ai";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import {
  asksForStatus,
  asksToShortlist,
  type AskTarget,
} from "../../../components/vendors/asks";
import {
  CATEGORY_PLURALS,
  isVendorCategory,
  parseVendorCards,
  vendorCardsId,
  type VendorCards,
} from "../../../components/vendors/cards";
import { functionsNamedIn } from "../../../lib/inspirations/functions";
import type { AssistantActor } from "../../../lib/types/actors";
import type { Action } from "../../../lib/types/roles";
import { components, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  env,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { requireAccessFor } from "../../lib/access";
import { AccessDenied } from "../../lib/errors";
import { once } from "../../lib/idempotency";
import { assistantInsert, assistantWrite } from "../../lib/write";
import {
  findKnownFor,
  linkStatusValidator,
  loadStarterSetRows,
  markBooked,
  shortlistIn,
  type Insert,
  type VendorCardView,
} from "../../vendors";
import { inert, wrapOutside } from "../outside";
import type { AssistantToolCtx } from "../agent";
import type { ToolResult } from "./core";

// S9 (Vendors) owns this file: findVendors, shortlistVendor and
// setVendorStatus (IMPLEMENTATION_PLAN.md section 6). As in S7's and S13's
// tools, each call checks its run and Member fresh, refusals come back as
// results the model can explain, and writes are version-checked and
// idempotent per toolCallId. shortlistVendor and setVendorStatus have no
// Proposal op: they run only when the Member's own message asked for that
// change, and otherwise the model suggests it in its reply.

type Ctx = QueryCtx | MutationCtx;

function refusal(reason: string, message: string): ToolResult {
  return { ok: false, reason, message };
}

/** A thrown Convex error as a result the model can read. */
function errorResult(error: unknown): ToolResult {
  const data =
    error instanceof ConvexError
      ? (error.data as Record<string, unknown> | string)
      : typeof error === "object" && error !== null && "data" in error
        ? (error as { data: unknown }).data
        : null;
  if (typeof data === "object" && data !== null && "kind" in data) {
    const kind = String((data as { kind: unknown }).kind);
    if (kind === "AccessDenied")
      return {
        ok: false,
        reason: "accessDenied",
        error: "AccessDenied",
        message:
          (data as { reason?: unknown }).reason === "wrongEvent"
            ? "That isn't in this Event. Use IDs from findVendors or readCanvas."
            : "The Member you are answering can no longer change this Event. Change nothing more; end your reply in one short line.",
      };
    if (kind === "VersionConflict")
      return {
        ok: false,
        reason: "VersionConflict",
        error: "VersionConflict",
        message:
          "It changed since you read it. Call findVendors with showInChat false and retry once with the new version.",
      };
    const message = (data as { message?: unknown }).message;
    return {
      ok: false,
      reason: kind,
      error: kind,
      message: typeof message === "string" ? message : `Refused (${kind}).`,
    };
  }
  console.error("Assistant Vendor tool failed", error);
  return {
    ok: false,
    reason: "failed",
    message: "That didn't work. Tell the Member briefly and don't retry it.",
  };
}

async function guarded(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return errorResult(error);
  }
}

// ---------------------------------------------------------------------------
// The run's gate (the same rules as S7's tools)

const callRef = {
  runId: v.id("runs"),
  eventId: v.id("events"),
  forMembershipId: v.id("memberships"),
  toolCallId: v.string(),
};
type CallRef = {
  runId: Id<"runs">;
  eventId: Id<"events">;
  forMembershipId: Id<"memberships">;
  toolCallId: string;
};

type Gate = {
  run: Doc<"runs">;
  membership: Doc<"memberships">;
  event: Doc<"events">;
};

async function gate(ctx: Ctx, ref: CallRef, action: Action): Promise<Gate> {
  const run = await ctx.db.get("runs", ref.runId);
  if (
    run === null ||
    run.eventId !== ref.eventId ||
    run.requestedBy !== ref.forMembershipId
  )
    throw new AccessDenied("wrongEvent", action);
  if (run.status !== "running")
    throw new ConvexError({
      kind: "RunStopped",
      message:
        "This reply was stopped. Read and change nothing more; end your reply in one short line.",
    });
  await requireAccessFor(ctx, ref.forMembershipId, ref.eventId, "chat.post");
  const { membership } = await requireAccessFor(
    ctx,
    ref.forMembershipId,
    ref.eventId,
    action,
  );
  const event = await ctx.db.get("events", ref.eventId);
  if (event === null) throw new AccessDenied("wrongEvent", action);
  return { run, membership, event };
}

/** Only a Member's own message (or @Utsavvy in a Comment) asks for a change; a Nudge or Brief run doesn't. */
function asked(run: Doc<"runs">): boolean {
  return run.source === "chat" || run.source === "comment";
}

/** The text of the message this run answers. */
async function requestText(ctx: Ctx, run: Doc<"runs">): Promise<string> {
  if (run.source === "comment" && run.commentId !== null)
    return (await ctx.db.get("comments", run.commentId))?.body ?? "";
  if (run.messageId === null) return "";
  const [doc] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
    messageIds: [run.messageId],
  });
  return doc?.text ?? "";
}

/** The history group's label: the request's first line, short. */
function groupLabelOf(text: string): string | null {
  const line = text.split("\n")[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (line === "") return null;
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

const callKey = (ref: CallRef) => `${ref.runId}:${ref.toolCallId}`;

function assistantActor(g: Gate): AssistantActor {
  return {
    kind: "assistant",
    forMembershipId: g.membership._id,
    runId: g.run._id,
    proposalId: null,
    acceptedBy: null,
  };
}

// ---------------------------------------------------------------------------
// What the model reads about a Vendor

/** Where a Vendor's fact came from: its provenance page, else its own site. */
function sourceOf(vendor: Doc<"vendors">, field: string): string {
  return (
    vendor.provenance.find((p) => p.field === field)?.url ??
    vendor.website ??
    vendor.profileUrl ??
    vendor.domain
  );
}

/** Text from a Vendor's site, as a labelled outside-content block. */
function fromSite(text: string, source: string): string {
  return wrapOutside(text, { source, addedBy: null });
}

/**
 * One card as the model reads it. Every text that came from the Vendor's own
 * site (its name, locality, summary, each Listed price and its sentence)
 * reaches the model inside a labelled outside-content block, so an
 * instruction planted in any of them stays data.
 */
function forModel(card: VendorCardView, position: number) {
  const { vendor } = card;
  const locality = vendor.address
    ? fromSite(vendor.address.locality, sourceOf(vendor, "address"))
    : vendor.areaServed
      ? fromSite(vendor.areaServed, sourceOf(vendor, "areaServed"))
      : null;
  return {
    position,
    vendorId: vendor._id,
    name: fromSite(vendor.name, sourceOf(vendor, "name")),
    category: vendor.category,
    locality,
    capacity: vendor.capacity ?? null,
    summary: fromSite(
      vendor.summary,
      vendor.website ?? sourceOf(vendor, "name"),
    ),
    listedPrices: card.listedPrices.map((price) => ({
      shownAs: fromSite(price.text, price.sourceUrl),
      comparable: price.comparable?.label ?? "not comparable",
      sentence: fromSite(price.sentence, price.sourceUrl),
    })),
    estimate: card.estimate
      ? {
          unit: card.estimate.unit,
          unitLow: card.estimate.unitLow,
          unitHigh: card.estimate.unitHigh,
          basis: card.estimate.basis.text,
        }
      : null,
    shortlisted:
      card.eventLayer === null
        ? null
        : card.eventLayer.links.map((link) => ({
            linkId: link._id,
            version: link.version,
            status: link.status,
            entry: inert(link.entryLabel),
            quote: link.quote
              ? { amount: link.quote.amount, unit: link.quote.unit }
              : null,
          })),
  };
}

// ---------------------------------------------------------------------------
// findVendors

export const findForRun = internalMutation({
  args: {
    ...callRef,
    category: v.string(),
    functionKey: v.union(v.string(), v.null()),
    minCapacity: v.union(v.number(), v.null()),
    maxPrice: v.union(v.number(), v.null()),
    showInChat: v.boolean(),
  },
  handler: async (ctx, args): Promise<ToolResult> => {
    const g = await gate(ctx, args, "chat.post");
    return await once(ctx, callKey(args), async (): Promise<ToolResult> => {
      const city = g.event.city?.name ?? null;
      if (!isVendorCategory(args.category))
        return refusal(
          "invalid",
          "Vendors come in four categories for now: venue, caterer, decorator and photographer.",
        );
      const functions = await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .take(50);
      const functionKey =
        args.functionKey !== null &&
        functions.some((fn) => fn.key === args.functionKey)
          ? args.functionKey
          : null;
      const found = await findKnownFor(
        ctx,
        g.event,
        args.category,
        functionKey,
        { minCapacity: args.minCapacity, maxPrice: args.maxPrice },
        null,
      );
      if (found.vendors.length === 0) {
        const where = city ?? "this Event's city";
        return {
          ok: true,
          found: 0,
          message:
            city !== null && city.toLowerCase() !== "jaipur"
              ? `Utsavvy has no Vendors in ${where} yet; its Vendors are a hand-checked set in Jaipur. Say so in one line, and offer to look it up with Chat web search instead. Don't name Vendors from memory.`
              : `No ${CATEGORY_PLURALS[args.category]} in ${where} match. Say so in one line and offer Chat web search, or loosening the filters. Don't name Vendors from memory.`,
        };
      }
      const vendors = found.vendors.map((card, i) => forModel(card, i + 1));
      if (!args.showInChat)
        return { ok: true, found: vendors.length, shownInChat: false, vendors };
      const card: VendorCards = {
        vendorIds: found.vendors.map((c) => c.vendor._id),
        category: args.category,
        functionKey,
      };
      await ctx.runMutation(internal.chat.postSystem, {
        eventId: args.eventId,
        card: { kind: "vendorCards", id: vendorCardsId(card) },
        ...(g.run.messageId ? { promptMessageId: g.run.messageId } : {}),
      });
      return {
        ok: true,
        found: vendors.length,
        shownInChat: true,
        vendors,
        message:
          'The Chat now shows these as Vendor cards, numbered by position. Members tap "Add to Canvas" on the ones they want. Give a short take on them; never present an Estimate as a Listed price, and don\'t list every field.',
      };
    });
  },
});

// ---------------------------------------------------------------------------
// shortlistVendor

const NOT_ASKED_SHORTLIST =
  'No Member asked to shortlist a Vendor in this message. Don\'t shortlist it: suggest it in your reply instead; a Member can tap "Add to Canvas" on the Vendor card.';

/** The Event's newest Vendor cards in the Chat, for "add the second one". */
async function latestCards(
  ctx: Ctx,
  eventId: Id<"events">,
): Promise<VendorCards | null> {
  for await (const annotation of ctx.db
    .query("chatAnnotations")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .order("desc")) {
    if (annotation.card?.kind !== "vendorCards") continue;
    return parseVendorCards(annotation.card.id);
  }
  return null;
}

/** What a request must be about to change this Vendor: see `components/vendors/asks.ts`. */
function targetOf(
  vendor: Doc<"vendors">,
  cards: VendorCards | null,
  entryLabel: string | null,
): AskTarget {
  const index = cards?.vendorIds.indexOf(vendor._id) ?? -1;
  return {
    name: vendor.name,
    category: vendor.category,
    cardPosition: index === -1 ? null : index + 1,
    cardCount: cards?.vendorIds.length ?? 0,
    entryLabel,
  };
}

function assistantInserter(
  ctx: MutationCtx,
  g: Gate,
  toolCallId: string,
  groupLabel: string | null,
): Insert {
  let n = 0;
  return async (table, value) =>
    (
      await assistantInsert(ctx, {
        table,
        value,
        runId: g.run._id,
        forMembershipId: g.membership._id,
        toolCallId: `${toolCallId}#${++n}`,
        fromComment: g.run.source === "comment",
        groupLabel,
      })
    ).id;
}

export const shortlistForRun = internalMutation({
  args: {
    ...callRef,
    vendorId: v.union(v.id("vendors"), v.null()),
    cardPosition: v.union(v.number(), v.null()),
    checklistEntryId: v.union(v.id("entries"), v.null()),
  },
  handler: async (ctx, args): Promise<ToolResult> => {
    const g = await gate(ctx, args, "vendor.manage");
    return await once(ctx, callKey(args), async (): Promise<ToolResult> => {
      if (!asked(g.run)) return refusal("notAsked", NOT_ASKED_SHORTLIST);
      const text = await requestText(ctx, g.run);

      let vendorId = args.vendorId;
      const cards = await latestCards(ctx, args.eventId);
      if (args.cardPosition !== null) {
        const fromCard = cards?.vendorIds[args.cardPosition - 1];
        if (fromCard === undefined)
          return refusal(
            "invalid",
            "There's no Vendor card at that position in the Chat. Call findVendors first, or pass vendorId.",
          );
        vendorId = fromCard;
      }
      if (vendorId === null)
        return refusal("invalid", "Pass vendorId or cardPosition.");
      const vendor = await ctx.db.get("vendors", vendorId);
      if (vendor === null)
        return refusal(
          "invalid",
          "That isn't a Vendor. Use a vendorId from findVendors.",
        );
      if (!asksToShortlist(text, targetOf(vendor, cards, null)))
        return refusal("notAsked", NOT_ASKED_SHORTLIST);

      const functions = await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .take(50);
      const named = functionsNamedIn(text, functions)[0] ?? null;
      const fromCards =
        cards !== null && cards.vendorIds.includes(vendorId)
          ? cards.functionKey
          : null;
      const { itemId, linkId } = await shortlistIn(ctx, {
        eventId: args.eventId,
        vendorId,
        checklistEntryId: args.checklistEntryId,
        functionKey: named ?? fromCards,
        actor: assistantActor(g),
        insert: assistantInserter(ctx, g, args.toolCallId, groupLabelOf(text)),
      });
      const link = await ctx.db.get("vendorLinks", linkId);
      return {
        ok: true,
        itemId,
        linkId,
        version: link?.version ?? 1,
        status: link?.status ?? "considering",
        name: fromSite(vendor.name, sourceOf(vendor, "name")),
        message:
          "Shortlisted on the Vendors Section, linked to its Vendor checklist Entry as Considering. Say so in one line.",
      };
    });
  },
});

// ---------------------------------------------------------------------------
// setVendorStatus

const NOT_ASKED_STATUS =
  "No Member asked for that status in this message. Don't change it: suggest it in your reply instead; a Member can change it from the status menu on the Shortlisted Vendor's card.";

export const setStatusForRun = internalMutation({
  args: {
    ...callRef,
    linkId: v.id("vendorLinks"),
    expectedVersion: v.union(v.number(), v.null()),
    status: linkStatusValidator,
  },
  handler: async (ctx, args): Promise<ToolResult> => {
    const g = await gate(ctx, args, "vendor.manage");
    return await once(ctx, callKey(args), async (): Promise<ToolResult> => {
      if (!asked(g.run)) return refusal("notAsked", NOT_ASKED_STATUS);
      const link = await ctx.db.get("vendorLinks", args.linkId);
      if (link === null || link.eventId !== args.eventId)
        throw new AccessDenied("wrongEvent", "vendor.manage");
      const item = await ctx.db.get("items", link.shortlistItemId);
      const vendor =
        item?.kind === "shortlistedVendor"
          ? await ctx.db.get("vendors", item.data.vendorId)
          : null;
      const entry = await ctx.db.get("entries", link.checklistEntryId);
      const text = await requestText(ctx, g.run);
      if (
        vendor === null ||
        !asksForStatus(
          text,
          args.status,
          targetOf(
            vendor,
            await latestCards(ctx, args.eventId),
            entry?.kind === "checklist" ? entry.fields.freeLabel : null,
          ),
        )
      )
        return refusal("notAsked", NOT_ASKED_STATUS);
      const opts = {
        runId: g.run._id,
        forMembershipId: g.membership._id,
        fromComment: g.run.source === "comment",
        groupLabel: groupLabelOf(text),
      };
      const { version } = await assistantWrite(ctx, {
        table: "vendorLinks",
        id: link._id,
        expectedVersion: args.expectedVersion ?? link.version,
        patch: { status: args.status },
        toolCallId: `${args.toolCallId}#1`,
        ...opts,
      });
      let doneEntryId: Id<"entries"> | null = null;
      if (args.status === "booked") {
        doneEntryId = await markBooked(ctx, link, (id, patch, expected) =>
          assistantWrite(ctx, {
            table: "entries",
            id,
            expectedVersion: expected,
            patch,
            toolCallId: `${args.toolCallId}#2`,
            ...opts,
          }),
        );
      }
      return {
        ok: true,
        linkId: link._id,
        version,
        status: args.status,
        ...(doneEntryId ? { deadlineDone: doneEntryId } : {}),
      };
    });
  },
});

// ---------------------------------------------------------------------------
// The tools

function refOf(ctx: AssistantToolCtx, toolCallId: string): CallRef {
  return {
    runId: ctx.runId,
    eventId: ctx.eventId,
    forMembershipId: ctx.forMembershipId,
    toolCallId,
  };
}

export type VendorToolName =
  "findVendors" | "shortlistVendor" | "setVendorStatus";

/**
 * Typed loosely on purpose, as S7's are: `convex/_generated/api.d.ts` walks
 * every export of this module, and the zod-typed tools make that walk too deep.
 */
export type VendorTools = Record<
  VendorToolName,
  Tool<Record<string, never>, ToolResult>
>;

const category = z.enum(["venue", "caterer", "decorator", "photographer"]);

const tools = {
  findVendors: createTool<
    {
      category: "venue" | "caterer" | "decorator" | "photographer";
      functionKey: string | null;
      minCapacity?: number | null | undefined;
      maxPrice?: number | null | undefined;
      showInChat?: boolean | undefined;
    },
    ToolResult,
    AssistantToolCtx
  >({
    description:
      "Find Vendors Utsavvy already knows (a hand-checked set in Jaipur only, for now) in the Event's city, for one category and optionally one Function (its key, from readCanvas). They appear in the Chat as Vendor cards numbered by position, each with its Listed prices from the Vendor's own site, or an Estimate when it has none, and whether this Event has shortlisted it (with linkId, version and status). minCapacity is Guests (Venues); maxPrice is per the price's own unit, such as per plate. Pass showInChat false only to look up this Event's links before setVendorStatus. Outside Jaipur it finds none: then offer Chat web search.",
    inputSchema: z.strictObject({
      category,
      functionKey: z.string().min(1).nullable(),
      minCapacity: z.number().int().positive().nullable().optional(),
      maxPrice: z.number().positive().nullable().optional(),
      showInChat: z.boolean().optional(),
    }),
    execute: async (ctx, input, { toolCallId }): Promise<ToolResult> =>
      guarded(() =>
        ctx.runMutation(internal.assistant.tools.vendors.findForRun, {
          ...refOf(ctx, toolCallId),
          category: input.category,
          functionKey: input.functionKey,
          minCapacity: input.minCapacity ?? null,
          maxPrice: input.maxPrice ?? null,
          showInChat: input.showInChat ?? true,
        }),
      ),
  }),

  shortlistVendor: createTool<
    {
      vendorId?: string | undefined;
      cardPosition?: number | undefined;
      checklistEntryId?: string | undefined;
    },
    ToolResult,
    AssistantToolCtx
  >({
    description:
      "Shortlist a Vendor onto the Event's Vendors Section, linked to a Vendor checklist Entry as Considering. Only when the Member's message asks for it (\"add the second one\"); otherwise suggest it in your reply. Name the Vendor by vendorId (from findVendors), or by cardPosition, its number on the newest Vendor cards in the Chat. checklistEntryId (from readCanvas) is optional: without it the Vendor links to the checklist Entry for its category, which is added if the checklist has none.",
    inputSchema: z
      .strictObject({
        vendorId: z.string().min(1).optional(),
        cardPosition: z.number().int().min(1).max(12).optional(),
        checklistEntryId: z.string().min(1).optional(),
      })
      .refine(
        (input) =>
          (input.vendorId === undefined) !== (input.cardPosition === undefined),
        { message: "Pass exactly one of vendorId and cardPosition." },
      ),
    execute: async (ctx, input, { toolCallId }): Promise<ToolResult> =>
      guarded(() =>
        ctx.runMutation(internal.assistant.tools.vendors.shortlistForRun, {
          ...refOf(ctx, toolCallId),
          vendorId: (input.vendorId ?? null) as Id<"vendors"> | null,
          cardPosition: input.cardPosition ?? null,
          checklistEntryId: (input.checklistEntryId ??
            null) as Id<"entries"> | null,
        }),
      ),
  }),

  setVendorStatus: createTool<
    {
      linkId: string;
      expectedVersion: number;
      status: "considering" | "contacted" | "quoted" | "booked" | "dropped";
    },
    ToolResult,
    AssistantToolCtx
  >({
    description:
      'Set one Vendor link\'s status (Considering, Contacted, Quoted, Booked or Dropped). Only when the Member\'s message asks for that status ("we called them", "mark it booked"); otherwise suggest it in your reply. linkId and expectedVersion come from findVendors (showInChat false) or shortlistVendor. Booked also ticks the Entry\'s Timeline deadline. It records a status; it never books or pays anyone.',
    inputSchema: z.strictObject({
      linkId: z.string().min(1),
      expectedVersion: z.number().int(),
      status: z.enum([
        "considering",
        "contacted",
        "quoted",
        "booked",
        "dropped",
      ]),
    }),
    execute: async (ctx, input, { toolCallId }): Promise<ToolResult> =>
      guarded(() =>
        ctx.runMutation(internal.assistant.tools.vendors.setStatusForRun, {
          ...refOf(ctx, toolCallId),
          linkId: input.linkId as Id<"vendorLinks">,
          expectedVersion: input.expectedVersion,
          status: input.status,
        }),
      ),
  }),
};

export const vendorTools: VendorTools = tools as unknown as VendorTools;

// ---------------------------------------------------------------------------
// Local browser checks only

function refuseOutsideLocal() {
  const url = env.CONVEX_CLOUD_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Only for a local Convex deployment");
  }
}

/**
 * What "show me caterers for the sangeet" leaves behind, without a model: the
 * starter set loaded, the Event in Jaipur with a 300-Guest sangeet, the
 * request from the person with `email`, and the real `findVendors` mutation's
 * Vendor cards. For e2e/vendors.spec.ts against `bun run dev`; refuses
 * anything but a local deployment.
 */
export const cardsForLocalCheck = internalMutation({
  args: {
    eventId: v.id("events"),
    email: v.string(),
    /** Another city than Jaipur, for the "none here yet" case. */
    city: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, email, city }): Promise<ToolResult> => {
    refuseOutsideLocal();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .first();
    const membership =
      user &&
      (await ctx.db
        .query("memberships")
        .withIndex("by_event_user", (q) =>
          q.eq("eventId", eventId).eq("userId", user._id),
        )
        .unique());
    if (!membership) throw new Error(`${email} is not in that Event`);
    await loadStarterSetRows(ctx);
    const event = (await ctx.db.get("events", eventId))!;
    if (event.city === null || city !== undefined) {
      await ctx.db.patch("events", eventId, {
        city: { name: city ?? "Jaipur", tier: "Y", centre: null },
      });
    }
    const functions = await ctx.db
      .query("eventFunctions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(50);
    if (!functions.some((f) => f.key === "sangeet")) {
      await ctx.db.insert("eventFunctions", {
        eventId,
        key: "sangeet",
        name: "Sangeet",
        date: null,
        guests: 300,
        assumed: [],
        order: functions.length,
        version: 1,
      });
    }
    // A caterer Entry on the Vendor checklist, for "Find Vendors".
    const checklist = (
      await ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", eventId).eq("kind", "checklist"),
        )
        .take(5)
    ).find((item) => item.deletedAt === null);
    if (checklist) {
      const rows = await ctx.db
        .query("entries")
        .withIndex("by_item", (q) => q.eq("itemId", checklist._id))
        .take(100);
      if (
        !rows.some(
          (row) =>
            row.kind === "checklist" &&
            row.deletedAt === null &&
            row.fields.vendorCategory === "caterer",
        )
      )
        await ctx.db.insert("entries", {
          eventId,
          itemId: checklist._id,
          kind: "checklist",
          order: rows.length,
          functionKey: null,
          fields: {
            vendorCategory: "caterer",
            freeLabel: null,
            functionKeys: ["sangeet"],
            bookByEntryId: null,
            budgetEntryIds: [],
          },
          assumed: [],
          createdBy: { kind: "member", membershipId: membership._id },
          version: 1,
          deletedAt: null,
        });
    }
    let threadId = event.agentThreadId;
    if (threadId === null) {
      threadId = await createThread(ctx, components.agent, {
        title: event.name,
      });
      await ctx.db.patch("events", eventId, { agentThreadId: threadId });
    }
    const request = await saveMessage(ctx, components.agent, {
      threadId,
      userId: membership._id,
      prompt: "show me caterers for the sangeet",
    });
    await ctx.db.insert("chatAnnotations", {
      eventId,
      messageId: request.messageId,
      authorMembershipId: membership._id,
      dontReply: false,
      mentions: [],
      pointing: [],
      card: null,
    });
    const runId = await ctx.db.insert("runs", {
      eventId,
      requestedBy: membership._id,
      source: "chat",
      messageId: request.messageId,
      commentId: null,
      status: "running",
      stoppedBy: null,
      model: "check",
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: null,
    });
    const result: ToolResult = await ctx.runMutation(
      internal.assistant.tools.vendors.findForRun,
      {
        runId,
        eventId,
        forMembershipId: membership._id,
        toolCallId: "check_vendor_cards",
        category: "caterer",
        functionKey: "sangeet",
        minCapacity: null,
        maxPrice: null,
        showInChat: true,
      },
    );
    await ctx.db.patch("runs", runId, { status: "done", endedAt: Date.now() });
    return result;
  },
});
