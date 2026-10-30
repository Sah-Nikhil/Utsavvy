import { createThread, saveMessage } from "@convex-dev/agent";
import { ConvexError, v, type Infer } from "convex/values";
import { entryAmount } from "../components/items/budget/rollup";
import {
  attachmentKind,
  MAX_ATTACHMENT_BYTES,
  sniffAttachmentType,
} from "../components/quotes/attachments";
import {
  bookingQuestion,
  comparedEntries,
  listedForGuests,
  numbersIn,
  quoteForEntries,
  quoteLine,
  standaloneTotal,
} from "../components/quotes/quotes";
import { can } from "../lib/access/permissions";
import { formatINR } from "../lib/format";
import { referenceTableBasis } from "../lib/pricing";
import type { EntryFields } from "../lib/types/canvas";
import type { MemberActor } from "../lib/types/actors";
import type { ProposedChange } from "../lib/types/proposals";
import { quoteUnitValidator } from "../lib/types/estimates";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { AssistantToolCtx } from "./assistant/agent";
import {
  checklistEntryOf,
  cleanQuote,
  describeAddQuote,
  functionsOf,
  quoteFieldsObject,
  quoteFieldsValidator,
  quoteProblem,
  quoteRefused,
  runProposeQuote,
  saveQuote,
  WORKED_PASTE,
} from "./assistant/tools/quotes";
import type { ToolResult } from "./assistant/tools/core";
import { requireAccess, requireAccessFor } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { once } from "./lib/idempotency";
import { memberInsert, memberWrite } from "./lib/write";
import { planItemOf } from "./entries";
import { createProposal } from "./proposals";
import { linkStatusValidator } from "./vendors";

export { comparedEntries, quoteForEntries } from "../components/quotes/quotes";

/*
 * S12: Quotes and the Budget comparison (docs/design/vendors.md, "Quotes" and
 * "The Budget comparison"; IMPLEMENTATION_PLAN.md sections 3 and 4.8).
 *
 * A Quote belongs to one checklist link of a Shortlisted Vendor and is private
 * to its Event. A link can have several; the newest is current. Adding one
 * moves a Considering or Contacted link to Quoted and always bumps the link's
 * version, so a pasted Quote's Proposal waiting on that link goes out of date.
 * A Member adds one with the form (`add`); a pasted WhatsApp message becomes a
 * Proposal through the Assistant's `proposeQuote` tool and is saved by the
 * `addQuote` op handler on Accept (`convex/assistant/tools/quotes.ts`).
 *
 * Every budget line shows its Estimate, each linked Vendor's comparable Listed
 * price and current Quote side by side (`budgetComparison`); none is added into
 * another. A line's planned amount changes only when a Member says yes to
 * "Use the ₹2.85L Quote as this line's amount?" (`useAsAmount`).
 */

type Ctx = QueryCtx | MutationCtx;
type AddQuoteChange = Extract<ProposedChange, { op: "addQuote" }>;

/** Quotes one link shows at most; a link gets a handful in practice. */
const MAX_QUOTES_PER_LINK = 50;
const MAX_LINKS_PER_ENTRY = 50;
const MAX_PRICE_ROWS = 200;
const MAX_EVENT_ENTRIES = 2000;

function refusal(reason: string, message: string): ToolResult {
  return { ok: false, reason, message };
}

function notFound(what: string): never {
  throw new ConvexError({ kind: "NotFound", what });
}

// ---------------------------------------------------------------------------
// Adding a Quote with the form

async function loadLink(ctx: Ctx, linkId: Id<"vendorLinks">) {
  const link = await ctx.db.get("vendorLinks", linkId);
  if (link === null) notFound("link");
  return link;
}

/** The form's checks, run before any attachment is stored. */
export const checkAdd = internalQuery({
  args: { linkId: v.id("vendorLinks"), fields: quoteFieldsObject },
  returns: v.null(),
  handler: async (ctx, { linkId, fields }) => {
    const link = await loadLink(ctx, linkId);
    await requireAccess(ctx, link.eventId, "vendor.manage");
    const problem = await quoteProblem(ctx, link, cleanQuote(fields));
    if (problem !== null) quoteRefused(problem);
    return null;
  },
});

/** Only `add` calls this, with the file it has just stored (or none). */
export const saveForm = internalMutation({
  args: {
    linkId: v.id("vendorLinks"),
    fields: quoteFieldsObject,
    fileId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.object({ quoteId: v.id("quotes"), linkVersion: v.number() }),
  handler: async (ctx, { linkId, fields, fileId }) => {
    const link = await loadLink(ctx, linkId);
    const { membership } = await requireAccess(
      ctx,
      link.eventId,
      "vendor.manage",
    );
    const clean = cleanQuote(fields);
    const problem = await quoteProblem(ctx, link, clean);
    if (problem !== null) quoteRefused(problem);
    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    return await saveQuote(ctx, {
      link,
      fields: clean,
      fileId,
      source: "form",
      actor,
      insert: async (value) =>
        (await memberInsert(ctx, { table: "quotes", value, actor })).id,
      write: (current, status) =>
        memberWrite(ctx, {
          table: "vendorLinks",
          id: current._id,
          patch: { status },
          actor,
        }),
    });
  },
});

/**
 * "Add Quote" on a Shortlisted Vendor's card, for one of its links. `file` is
 * an optional photo or PDF of the quote, at most 10 MB, recognised by its own
 * first bytes. Access and every field are checked before anything is stored;
 * this function stores the file itself and saves the Quote with it, and
 * deletes the file again if saving fails, so no client ever hands in a
 * storage ID (IMPLEMENTATION_PLAN.md section 4.8).
 */
export const add = action({
  args: {
    linkId: v.id("vendorLinks"),
    ...quoteFieldsValidator,
    file: v.optional(v.union(v.bytes(), v.null())),
  },
  returns: v.object({ quoteId: v.id("quotes"), linkVersion: v.number() }),
  handler: async (
    ctx,
    { linkId, file, ...fields },
  ): Promise<{ quoteId: Id<"quotes">; linkVersion: number }> => {
    await ctx.runQuery(internal.quotes.checkAdd, { linkId, fields });
    let fileId: Id<"_storage"> | null = null;
    if (file) {
      if (file.byteLength > MAX_ATTACHMENT_BYTES)
        quoteRefused("That file is over 10 MB.");
      const type = sniffAttachmentType(new Uint8Array(file.slice(0, 16)));
      if (type === null)
        quoteRefused(
          "Attach a photo or a PDF of the quote (JPEG, PNG, WebP or PDF).",
        );
      fileId = await ctx.storage.store(new Blob([file], { type }));
    }
    try {
      return await ctx.runMutation(internal.quotes.saveForm, {
        linkId,
        fields,
        fileId,
      });
    } catch (error) {
      // Nothing holds the file: the save rolled back.
      if (fileId !== null) await ctx.storage.delete(fileId);
      throw error;
    }
  },
});

// ---------------------------------------------------------------------------
// Reading Quotes

type BudgetLine = Extract<Doc<"entries">, { kind: "budget" }>;

/** The live budget lines a checklist Entry pays for. */
async function linesPaidBy(
  ctx: Ctx,
  entry: Extract<Doc<"entries">, { kind: "checklist" }>,
): Promise<BudgetLine[]> {
  const lines: BudgetLine[] = [];
  for (const id of entry.fields.budgetEntryIds) {
    const line = await ctx.db.get("entries", id);
    if (
      line !== null &&
      line.kind === "budget" &&
      line.deletedAt === null &&
      line.eventId === entry.eventId
    )
      lines.push(line);
  }
  return lines;
}

async function quotesOfLink(ctx: Ctx, linkId: Id<"vendorLinks">) {
  return await ctx.db
    .query("quotes")
    .withIndex("by_link", (q) => q.eq("linkId", linkId))
    .order("desc")
    .take(MAX_QUOTES_PER_LINK);
}

/** The newest Quote on a link, which is its current one. */
export async function currentQuote(ctx: Ctx, linkId: Id<"vendorLinks">) {
  return await ctx.db
    .query("quotes")
    .withIndex("by_link", (q) => q.eq("linkId", linkId))
    .order("desc")
    .first();
}

const quoteViewValidator = v.object({
  _id: v.id("quotes"),
  amount: v.number(),
  unit: quoteUnitValidator,
  functionKeys: v.array(v.string()),
  guests: v.union(v.number(), v.null()),
  receivedAt: v.union(v.number(), v.null()),
  note: v.union(v.string(), v.null()),
  source: v.union(v.literal("form"), v.literal("chatPaste")),
  createdAt: v.number(),
  /** What it comes to for the lines it is compared with. */
  total: v.number(),
  /** "₹950/plate × 300 = ₹2.85L". */
  line: v.string(),
  attachment: v.union(v.literal("pdf"), v.literal("image"), v.null()),
});
export type QuoteView = Infer<typeof quoteViewValidator>;

async function quoteView(
  ctx: QueryCtx,
  quote: Doc<"quotes">,
  lines: readonly BudgetLine[],
): Promise<QuoteView> {
  // With no budget line to compare with yet, the Quote stands on its own.
  const total =
    lines.length > 0 ? quoteForEntries(quote, lines) : standaloneTotal(quote);
  const stored =
    quote.fileId === null
      ? null
      : await ctx.db.system.get("_storage", quote.fileId);
  return {
    _id: quote._id,
    amount: quote.amount,
    unit: quote.unit,
    functionKeys: quote.functionKeys,
    guests: quote.guests,
    receivedAt: quote.receivedAt,
    note: quote.note,
    source: quote.source,
    createdAt: quote.createdAt,
    total,
    line: quoteLine({ ...quote, total }),
    attachment: attachmentKind(stored?.contentType),
  };
}

const askValidator = v.object({
  question: v.string(),
  entryId: v.id("entries"),
  quoteId: v.id("quotes"),
  amount: v.number(),
});

/**
 * The booking question for a link, or null: once the Vendor is Booked, with a
 * current Quote that covers exactly one budget line whose amount isn't that
 * Quote's already, a Member is asked "Use the ₹2.85L Quote as this line's
 * amount?". Asking changes nothing.
 */
async function bookingAsk(
  ctx: QueryCtx,
  link: Doc<"vendorLinks">,
  current: Doc<"quotes"> | null,
  lines: readonly BudgetLine[],
): Promise<Infer<typeof askValidator> | null> {
  if (link.status !== "booked" || current === null) return null;
  const compared = comparedEntries(current, lines);
  if (compared.length !== 1) return null;
  const line = compared[0]!;
  const amount = quoteForEntries(current, lines);
  if (amount <= 0 || line.fields.plannedAmount === amount) return null;
  return {
    question: bookingQuestion(amount),
    entryId: line._id,
    quoteId: current._id,
    amount,
  };
}

/** A link's Quotes, newest first, its current one, the booking question and whether this person may add one. */
export const listForLink = query({
  args: { linkId: v.id("vendorLinks") },
  returns: v.object({
    quotes: v.array(quoteViewValidator),
    current: v.union(quoteViewValidator, v.null()),
    ask: v.union(askValidator, v.null()),
    canManage: v.boolean(),
    /** The Event's Functions, for the form; `served` are the ones the link's Entry serves. */
    functions: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        guests: v.union(v.number(), v.null()),
      }),
    ),
    served: v.array(v.string()),
  }),
  handler: async (ctx, { linkId }) => {
    const link = await loadLink(ctx, linkId);
    const { membership } = await requireAccess(
      ctx,
      link.eventId,
      "canvas.view",
    );
    const entry = await checklistEntryOf(ctx, link);
    const lines = entry === null ? [] : await linesPaidBy(ctx, entry);
    const rows = await quotesOfLink(ctx, linkId);
    const quotes: QuoteView[] = [];
    for (const row of rows) quotes.push(await quoteView(ctx, row, lines));
    const canManage = can(membership.role, "vendor.manage");
    const canEdit = can(membership.role, "canvas.edit");
    const functions = (await functionsOf(ctx, link.eventId))
      .sort((a, b) => a.order - b.order)
      .map((fn) => ({ key: fn.key, name: fn.name, guests: fn.guests }));
    return {
      quotes,
      current: quotes[0] ?? null,
      ask: canEdit ? await bookingAsk(ctx, link, rows[0] ?? null, lines) : null,
      canManage,
      functions,
      served: entry?.fields.functionKeys ?? [],
    };
  },
});

/** The signed URL of a Quote's attachment, only for the Event's people. */
export const attachmentUrl = query({
  args: { quoteId: v.id("quotes") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { quoteId }) => {
    const quote = await ctx.db.get("quotes", quoteId);
    if (quote === null) notFound("quote");
    await requireAccess(ctx, quote.eventId, "canvas.view");
    if (quote.fileId === null) return null;
    return await ctx.storage.getUrl(quote.fileId);
  },
});

// ---------------------------------------------------------------------------
// The booking question's yes

/**
 * A Member's yes to "Use the ₹2.85L Quote as this line's amount?": sets the
 * budget line's planned amount to what the Quote comes to for it. Only for a
 * line the Quote covers, alone; nothing else ever changes a planned amount
 * from a Quote. The post-write hooks run, so a Budget pushed over gets its
 * Nudge.
 */
export const useAsAmount = mutation({
  args: { entryId: v.id("entries"), quoteId: v.id("quotes") },
  returns: v.object({ plannedAmount: v.number() }),
  handler: async (ctx, { entryId, quoteId }) => {
    const entry = await ctx.db.get("entries", entryId);
    if (entry === null) notFound("entry");
    const { membership } = await requireAccess(
      ctx,
      entry.eventId,
      "canvas.edit",
    );
    const quote = await ctx.db.get("quotes", quoteId);
    if (quote === null || quote.eventId !== entry.eventId) notFound("quote");
    if (entry.kind !== "budget" || entry.deletedAt !== null)
      quoteRefused("That budget line was deleted.");
    const link = await loadLink(ctx, quote.linkId);
    // The yes answers an ask made for a Booked link's current Quote; refuse
    // it when either has moved on since, so an old price is never used.
    if (link.eventId !== entry.eventId) notFound("quote");
    if (link.status !== "booked")
      quoteRefused(
        "That Vendor is no longer Booked for this Entry, so its Quote wasn't used. Nothing changed.",
      );
    if ((await currentQuote(ctx, link._id))?._id !== quoteId)
      quoteRefused(
        "A newer Quote came in for this Vendor since you were asked, so nothing changed. Check the newer Quote first.",
      );
    const checklist = await checklistEntryOf(ctx, link);
    const lines = checklist === null ? [] : await linesPaidBy(ctx, checklist);
    const compared = comparedEntries(quote, lines);
    if (!compared.some((line) => line._id === entryId))
      quoteRefused("That Quote doesn't cover this budget line.");
    if (compared.length > 1)
      quoteRefused(
        `That Quote covers ${compared.length} budget lines. Type each line's amount yourself.`,
      );
    const plannedAmount = quoteForEntries(quote, lines);
    // Already that amount (a second tap, a retry): no write, no history row, no hook.
    if (entry.fields.plannedAmount === plannedAmount) return { plannedAmount };
    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    await memberWrite(ctx, {
      table: "entries",
      id: entry._id,
      patch: {
        fields: { ...entry.fields, plannedAmount, editedByMember: true },
        assumed: entry.assumed.filter((name) => name !== "plannedAmount"),
      } as never,
      actor,
      groupLabel: "Use the Quote as the line's amount",
    });
    return { plannedAmount };
  },
});

// ---------------------------------------------------------------------------
// The Budget comparison

const listedViewValidator = v.object({
  label: v.string(),
  low: v.number(),
  high: v.union(v.number(), v.null()),
  sourceUrl: v.string(),
  /** The exact, quote-checked sentence it was read from. */
  sentence: v.string(),
  seenAt: v.string(),
});

const vendorComparisonValidator = v.object({
  linkId: v.id("vendorLinks"),
  vendorName: v.string(),
  status: linkStatusValidator,
  /** Comparable Listed prices worked out for the line's Function's Guests. */
  listed: v.array(listedViewValidator),
  /** The current Quote, when it covers this line. */
  quote: v.union(
    v.object({
      quoteId: v.id("quotes"),
      total: v.number(),
      line: v.string(),
      /** How many budget lines it is compared with together. */
      covers: v.number(),
      /** Their amounts added up: what the Quote is over or under. */
      comparedWith: v.number(),
      receivedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
});
export type VendorComparison = Infer<typeof vendorComparisonValidator>;

const lineComparisonValidator = v.object({
  entryId: v.id("entries"),
  estimate: v.union(v.object({ low: v.number(), high: v.number() }), v.null()),
  vendors: v.array(vendorComparisonValidator),
});
export type LineComparison = Infer<typeof lineComparisonValidator>;

async function currentListedPrices(ctx: QueryCtx, vendorId: Id<"vendors">) {
  const rows = await ctx.db
    .query("listedPrices")
    .withIndex("by_vendor", (q) => q.eq("vendorId", vendorId))
    .order("desc")
    .take(MAX_PRICE_ROWS);
  return rows.filter((row) => row.supersededAt === null).reverse();
}

/**
 * Every budget line of the Event with what stands beside its planned amount,
 * never mixed into it: its Estimate, and for each Vendor linked through a
 * checklist Entry that pays for it (Dropped ones left out) the comparable
 * Listed prices for the line's Function's Guests and the current Quote, when
 * that Quote covers the line.
 */
export const budgetComparison = query({
  args: { eventId: v.id("events") },
  returns: v.object({ entries: v.array(lineComparisonValidator) }),
  handler: async (ctx, { eventId }) => {
    await requireAccess(ctx, eventId, "canvas.view");
    const guests = new Map(
      (await functionsOf(ctx, eventId)).map((fn) => [fn.key, fn.guests]),
    );
    const live = (kind: "budget" | "checklist") =>
      ctx.db
        .query("entries")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", eventId).eq("kind", kind),
        )
        .take(MAX_EVENT_ENTRIES);
    const budget = (await live("budget")).filter(
      (e): e is BudgetLine =>
        e.kind === "budget" && e.deletedAt === null && e.fields.role === "line",
    );
    const byLine = new Map<string, VendorComparison[]>(
      budget.map((line) => [line._id, []]),
    );
    const vendors = new Map<Id<"vendors">, Doc<"vendors"> | null>();
    const prices = new Map<Id<"vendors">, Doc<"listedPrices">[]>();

    for (const checklist of await live("checklist")) {
      if (checklist.kind !== "checklist" || checklist.deletedAt !== null)
        continue;
      const lines = budget.filter((line) =>
        checklist.fields.budgetEntryIds.includes(line._id),
      );
      if (lines.length === 0) continue;
      const links = await ctx.db
        .query("vendorLinks")
        .withIndex("by_entry", (q) => q.eq("checklistEntryId", checklist._id))
        .take(MAX_LINKS_PER_ENTRY);
      for (const link of links) {
        if (link.status === "dropped") continue;
        const item = await ctx.db.get("items", link.shortlistItemId);
        if (
          item === null ||
          item.kind !== "shortlistedVendor" ||
          item.deletedAt !== null
        )
          continue;
        const vendorId = item.data.vendorId;
        if (!vendors.has(vendorId)) {
          vendors.set(vendorId, await ctx.db.get("vendors", vendorId));
          prices.set(vendorId, await currentListedPrices(ctx, vendorId));
        }
        const vendor = vendors.get(vendorId);
        if (!vendor) continue;
        const quote = await currentQuote(ctx, link._id);
        const compared = quote === null ? [] : comparedEntries(quote, lines);
        const total = quote === null ? 0 : quoteForEntries(quote, lines);
        for (const line of lines) {
          const lineGuests =
            line.functionKey === null
              ? null
              : (guests.get(line.functionKey) ?? null);
          const listed = prices.get(vendorId)!.flatMap((price) => {
            const comparable = listedForGuests(price, lineGuests);
            return comparable === null
              ? []
              : [
                  {
                    label: comparable.label,
                    low: comparable.low,
                    high: comparable.high,
                    sourceUrl: price.sourceUrl,
                    sentence: price.sentence,
                    seenAt: price.seenAt,
                  },
                ];
          });
          const covers =
            quote !== null && compared.some((c) => c._id === line._id);
          byLine.get(line._id)!.push({
            linkId: link._id,
            vendorName: vendor.name,
            status: link.status,
            listed,
            quote: covers
              ? {
                  quoteId: quote._id,
                  total,
                  line: quoteLine({ ...quote, total }),
                  covers: compared.length,
                  comparedWith: compared.reduce(
                    (sum, c) => sum + entryAmount(c.fields),
                    0,
                  ),
                  receivedAt: quote.receivedAt,
                }
              : null,
          });
        }
      }
    }

    return {
      entries: budget.map((line) => ({
        entryId: line._id,
        estimate: line.fields.estimate
          ? { low: line.fields.estimate.low, high: line.fields.estimate.high }
          : null,
        vendors: byLine.get(line._id) ?? [],
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// The tool's server side

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

/** The run must be this Event's, still running, answering a Member who may still manage Vendors. */
async function gate(ctx: Ctx, ref: CallRef) {
  const run = await ctx.db.get("runs", ref.runId);
  if (
    run === null ||
    run.eventId !== ref.eventId ||
    run.requestedBy !== ref.forMembershipId
  )
    throw new AccessDenied("wrongEvent", "vendor.manage");
  if (run.status !== "running")
    throw new ConvexError({
      kind: "RunStopped",
      message:
        "This reply was stopped. Read and change nothing more; end your reply in one short line.",
    });
  const { membership } = await requireAccessFor(
    ctx,
    ref.forMembershipId,
    ref.eventId,
    "chat.post",
  );
  await requireAccessFor(
    ctx,
    ref.forMembershipId,
    ref.eventId,
    "vendor.manage",
  );
  return { run, membership };
}

/** The words of the message this run answers: the pasted Quote. */
async function requestText(ctx: Ctx, run: Doc<"runs">): Promise<string> {
  if (run.source === "comment" && run.commentId !== null)
    return (await ctx.db.get("comments", run.commentId))?.body ?? "";
  if (run.messageId === null) return "";
  const [doc] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
    messageIds: [run.messageId],
  });
  return doc?.text ?? "";
}

type LinkChoice = {
  link: Doc<"vendorLinks">;
  vendorName: string;
  category: string;
  entryLabel: string;
  entryFunctionKeys: string[];
};

/** The Event's live, not Dropped links, with their Vendor and checklist Entry. */
async function linkChoices(
  ctx: Ctx,
  eventId: Id<"events">,
): Promise<LinkChoice[]> {
  const links = await ctx.db
    .query("vendorLinks")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(200);
  const choices: LinkChoice[] = [];
  for (const link of links) {
    if (link.status === "dropped") continue;
    const item = await ctx.db.get("items", link.shortlistItemId);
    if (item?.kind !== "shortlistedVendor" || item.deletedAt !== null) continue;
    const vendor = await ctx.db.get("vendors", item.data.vendorId);
    const entry = await ctx.db.get("entries", link.checklistEntryId);
    if (!vendor || entry?.kind !== "checklist" || entry.deletedAt !== null)
      continue;
    choices.push({
      link,
      vendorName: vendor.name,
      category: vendor.category,
      entryLabel: entry.fields.freeLabel ?? entry.fields.vendorCategory ?? "",
      entryFunctionKeys: entry.fields.functionKeys,
    });
  }
  return choices;
}

/**
 * The link a pasted Quote is for: the one named, else the only live link of
 * the category (serving the Function, when one is named). Several or none
 * come back as a refusal listing the choices, so the model can ask or pick.
 */
async function chooseLink(
  ctx: Ctx,
  eventId: Id<"events">,
  want: {
    linkId: string | null;
    category: string | null;
    functionKey: string | null;
  },
): Promise<{ chosen: LinkChoice } | { refused: ToolResult }> {
  const choices = await linkChoices(ctx, eventId);
  if (want.linkId !== null) {
    const chosen = choices.find((c) => c.link._id === want.linkId);
    return chosen
      ? { chosen }
      : {
          refused: refusal(
            "noLink",
            "That link isn't a Shortlisted Vendor of this Event, or it was dropped. Use a linkId from findVendors with showInChat false.",
          ),
        };
  }
  let candidates = choices.filter(
    (c) => want.category === null || c.category === want.category,
  );
  if (want.functionKey !== null) {
    const serving = candidates.filter((c) =>
      c.entryFunctionKeys.includes(want.functionKey!),
    );
    if (serving.length > 0) candidates = serving;
  }
  if (candidates.length === 1) return { chosen: candidates[0]! };
  if (candidates.length === 0)
    return {
      refused: refusal(
        "noLink",
        "No Shortlisted Vendor matches. A Quote is saved on a Shortlisted Vendor: ask the Member which Vendor sent it, and suggest shortlisting it first.",
      ),
    };
  const listed = candidates.map((c) => ({
    linkId: c.link._id,
    vendor: c.vendorName,
    entry: c.entryLabel,
    status: c.link.status,
  }));
  return {
    refused: {
      ok: false,
      reason: "whichVendor",
      message: `Several Shortlisted Vendors could have sent this. Ask the Member which one, or call proposeQuote again with its linkId: ${JSON.stringify(listed)}`,
    },
  };
}

/** What the tool needs before the extraction call: the pasted text and the chosen link. */
export const pasteContext = internalQuery({
  args: {
    ...callRef,
    linkId: v.union(v.string(), v.null()),
    category: v.union(v.string(), v.null()),
    functionKey: v.union(v.string(), v.null()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; text: string; addedBy: string; linkId: Id<"vendorLinks"> }
    | ToolResult
  > => {
    const { run, membership } = await gate(ctx, args);
    if (run.source !== "chat" && run.source !== "comment")
      return refusal(
        "notAsked",
        "Only a Member's own pasted message becomes a Quote. Change nothing.",
      );
    const text = (await requestText(ctx, run)).trim();
    if (text === "")
      return refusal("noText", "There is no pasted message to read.");
    const choice = await chooseLink(ctx, args.eventId, args);
    if ("refused" in choice) return choice.refused;
    return {
      ok: true,
      text,
      addedBy: membership.displayName,
      linkId: choice.chosen.link._id,
    };
  },
});

const extractionValidator = v.object({
  amount: v.number(),
  unit: v.union(
    v.literal("per_plate"),
    v.literal("per_person"),
    v.literal("per_day"),
    v.literal("per_function"),
    v.literal("total"),
  ),
  guests: v.union(v.number(), v.null()),
  functions: v.array(v.string()),
  note: v.union(v.string(), v.null()),
});

/**
 * Which Functions the Quote covers: those the message names, else the one the
 * model was told about, else the only one the link's Entry serves, else the
 * one of those whose Guests match the Quote's. None means the whole Entry.
 * When several of the Entry's Functions have the Quote's Guests, it could be
 * for any of them, so they come back as `ask` and the Member says which one:
 * matching Guests never picks one of several (#127).
 */
function functionKeysFor(
  functions: readonly Doc<"eventFunctions">[],
  named: readonly string[],
  hint: string | null,
  entryKeys: readonly string[],
  guests: number | null,
): { keys: string[] } | { ask: Doc<"eventFunctions">[] } {
  const byWord = (word: string) => {
    const w = word.trim().toLowerCase();
    return functions.find(
      (fn) => fn.key.toLowerCase() === w || fn.name.toLowerCase() === w,
    )?.key;
  };
  const fromText = [
    ...new Set(named.map(byWord).filter((k): k is string => !!k)),
  ];
  if (fromText.length > 0) return { keys: fromText };
  if (hint !== null && functions.some((fn) => fn.key === hint))
    return { keys: [hint] };
  if (entryKeys.length === 1) return { keys: [...entryKeys] };
  if (guests !== null) {
    const matching = functions.filter(
      (fn) => entryKeys.includes(fn.key) && fn.guests === guests,
    );
    if (matching.length === 1) return { keys: [matching[0]!.key] };
    if (matching.length > 1)
      return { ask: [...matching].sort((a, b) => a.order - b.order) };
  }
  return { keys: [] };
}

/**
 * Turns what the helper model read into one Proposal with one `addQuote`
 * change. The price and the Guests must be numbers the pasted message writes;
 * code works out the Function and the rest, and the change guards the link
 * and its checklist Entry at their current versions.
 */
export const proposeForRun = internalMutation({
  args: {
    ...callRef,
    linkId: v.id("vendorLinks"),
    functionKey: v.union(v.string(), v.null()),
    extraction: extractionValidator,
  },
  handler: async (ctx, args): Promise<ToolResult> => {
    const { run, membership } = await gate(ctx, args);
    return await once(
      ctx,
      `${args.runId}:${args.toolCallId}`,
      async (): Promise<ToolResult> => {
        if (run.source !== "chat" && run.source !== "comment")
          return refusal(
            "notAsked",
            "Only a Member's own pasted message becomes a Quote. Change nothing.",
          );
        const { extraction } = args;
        const text = await requestText(ctx, run);
        const written = numbersIn(text);
        if (!written.includes(Math.round(extraction.amount)))
          return refusal(
            "notInPaste",
            `The pasted message doesn't write ${formatINR(extraction.amount)}. A Quote's price must be read exactly as written; tell the Member you couldn't read the price.`,
          );
        if (extraction.guests !== null && !written.includes(extraction.guests))
          return refusal(
            "notInPaste",
            `The pasted message doesn't write ${extraction.guests} Guests. Tell the Member you couldn't read the Guest count.`,
          );

        const link = await ctx.db.get("vendorLinks", args.linkId);
        if (link === null || link.eventId !== args.eventId)
          throw new AccessDenied("wrongEvent", "vendor.manage");
        const entry = await ctx.db.get("entries", link.checklistEntryId);
        if (entry?.kind !== "checklist" || entry.deletedAt !== null)
          return refusal("deleted", "That checklist Entry was deleted.");
        const functions = await ctx.db
          .query("eventFunctions")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .take(50);
        const covered = functionKeysFor(
          functions,
          extraction.functions,
          args.functionKey,
          entry.fields.functionKeys,
          extraction.guests,
        );
        if ("ask" in covered) {
          const listed = covered.ask.map((fn) => ({
            functionKey: fn.key,
            name: fn.name,
            guests: fn.guests,
          }));
          return {
            ok: false,
            reason: "whichFunction",
            message: `This Quote could be for more than one Function: ${covered.ask.map((fn) => fn.name).join(" or ")} each have ${extraction.guests} Guests. Ask the Member which Function it is for, then call proposeQuote again with linkId ${link._id} and that functionKey. Don't pick one yourself: ${JSON.stringify(listed)}`,
          };
        }
        const fields = cleanQuote({
          amount: extraction.amount,
          unit: extraction.unit,
          guests: extraction.guests,
          functionKeys: covered.keys,
          // Received today: the Member pasted it now.
          receivedAt: Date.now(),
          note: extraction.note,
        });
        const problem = await quoteProblem(ctx, link, fields);
        if (problem !== null) return refusal("refused", problem);

        const change: AddQuoteChange = {
          op: "addQuote",
          table: "quotes",
          docId: null,
          expectedVersion: null,
          guards: [
            { table: "vendorLinks", docId: link._id, version: link.version },
            { table: "entries", docId: entry._id, version: entry.version },
          ],
          values: { linkId: link._id, ...fields, fileId: null },
        };
        const line = await describeAddQuote(ctx, change);
        const fromComment = run.source === "comment" && run.commentId !== null;
        try {
          const proposalId = await createProposal(ctx, {
            eventId: args.eventId,
            runId: args.runId,
            requestedBy: membership._id,
            origin:
              fromComment && run.commentId !== null
                ? { kind: "comment", commentId: run.commentId }
                : { kind: "chat" },
            summary: line.split(":")[0]!,
            changes: [change],
          });
          return {
            ok: true,
            proposalId,
            changes: [line],
            note: "The Proposal card is in the Chat. Nothing is saved until a Member accepts it: say in one line what the Quote is and that a Member needs to Accept it. Don't repeat the price differently.",
          };
        } catch (error) {
          if (
            error instanceof ConvexError &&
            error.data?.kind === "ProposalRefused"
          )
            return refusal("refused", String(error.data.message));
          throw error;
        }
      },
    );
  },
});

// ---------------------------------------------------------------------------
// Local browser checks only

function refuseOutsideLocal() {
  const url = env.CONVEX_CLOUD_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Only for a local Convex deployment");
  }
}

/**
 * The "Quote pasted from WhatsApp" worked example without a chat model, for
 * e2e/quotes.spec.ts against `bun run dev`: a Chat request from the person
 * with `email` holding the pasted text, a running run answering it, and the
 * real tool path (the extraction on the stub model, then `proposeForRun`).
 * Refuses anything but a local deployment.
 */
export const pasteForLocalCheck = internalAction({
  args: {
    eventId: v.id("events"),
    email: v.string(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, email, text }): Promise<ToolResult> => {
    refuseOutsideLocal();
    const ref: { runId: Id<"runs">; forMembershipId: Id<"memberships"> } =
      await ctx.runMutation(internal.quotes.pastedRequestForLocalCheck, {
        eventId,
        email,
        text: text ?? WORKED_PASTE,
      });
    const toolCtx = Object.assign({}, ctx, { ...ref, eventId });
    const result = await runProposeQuote(
      toolCtx as unknown as AssistantToolCtx,
      { category: "caterer" },
      `local_${Date.now()}`,
    );
    await ctx.runMutation(internal.quotes.endRunForLocalCheck, {
      runId: ref.runId,
    });
    return result;
  },
});

/** The Member's pasted message in the Chat and its run, already running, with no reply started. */
export const pastedRequestForLocalCheck = internalMutation({
  args: { eventId: v.id("events"), email: v.string(), text: v.string() },
  handler: async (ctx, { eventId, email, text }) => {
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
    const event = (await ctx.db.get("events", eventId))!;
    let threadId = event.agentThreadId;
    if (threadId === null) {
      threadId = await createThread(ctx, components.agent, {
        title: event.name,
      });
      await ctx.db.patch("events", eventId, { agentThreadId: threadId });
    }
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: membership._id,
      prompt: text,
    });
    await ctx.db.insert("chatAnnotations", {
      eventId,
      messageId,
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
      messageId,
      commentId: null,
      status: "running",
      stoppedBy: null,
      model: "stub-utsavvy",
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: null,
    });
    return { runId, forMembershipId: membership._id };
  },
});

export const endRunForLocalCheck = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    refuseOutsideLocal();
    await ctx.db.patch("runs", runId, { status: "done", endedAt: Date.now() });
    return null;
  },
});

/**
 * The Budget for e2e/quotes.spec.ts, on an Event that
 * `assistant/tools/vendors:cardsForLocalCheck` has given a 300-Guest sangeet
 * and a caterer checklist Entry: a ₹12L total, a ₹9,55,000 Venue line and the
 * sangeet catering line (300 plates, Estimate ₹3L to ₹6L, planned ₹2,45,000)
 * that the caterer Entry pays for. Using the ₹2.85L Quote then puts the Budget
 * ₹40,000 over, as in the demo. Refuses anything but a local deployment.
 */
export const budgetForLocalCheck = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    refuseOutsideLocal();
    const owner = (
      await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).find((m) => m.role === "owner" && m.status === "active");
    if (owner === undefined) throw new Error("That Event has no Owner");
    const budget = await planItemOf(ctx, eventId, "budget");
    const checklist = await planItemOf(ctx, eventId, "checklist");
    if (!budget || !checklist) throw new Error("That Event has no plan Items");
    const caterer = (
      await ctx.db
        .query("entries")
        .withIndex("by_item", (q) => q.eq("itemId", checklist._id))
        .take(100)
    ).find(
      (row) =>
        row.kind === "checklist" &&
        row.deletedAt === null &&
        row.fields.vendorCategory === "caterer",
    );
    if (!caterer || caterer.kind !== "checklist")
      throw new Error("Run assistant/tools/vendors:cardsForLocalCheck first");

    await ctx.db.patch("events", eventId, {
      budgetTotal: 1_200_000,
      briefState: "planned",
    });
    const createdBy = { kind: "member" as const, membershipId: owner._id };
    const line = (
      order: number,
      functionKey: string | null,
      fields: EntryFields<"budget">,
    ) =>
      ctx.db.insert("entries", {
        eventId,
        itemId: budget._id,
        kind: "budget",
        order,
        functionKey,
        fields,
        assumed: [],
        createdBy,
        version: 1,
        deletedAt: null,
      });
    const base = {
      role: "line" as const,
      belowUsualRange: false,
      editedByMember: true,
    };
    await line(0, null, {
      ...base,
      label: "Venue",
      category: null,
      quantity: 1,
      unit: "per_event",
      estimate: null,
      plannedAmount: 955_000,
    });
    const catering = await line(1, "sangeet", {
      ...base,
      label: "Catering",
      category: "catering_main",
      quantity: 300,
      unit: "per_plate",
      estimate: {
        low: 300_000,
        high: 600_000,
        amount: 360_000,
        label: "Estimate",
        basis: referenceTableBasis({
          unit: "per_plate",
          unitLow: 1_000,
          unitHigh: 2_000,
          tier: "Y",
        }),
      },
      plannedAmount: 245_000,
    });
    await ctx.db.patch("entries", caterer._id, {
      fields: {
        ...caterer.fields,
        functionKeys: ["sangeet"],
        budgetEntryIds: [catering],
      },
      version: caterer.version + 1,
    });
    return null;
  },
});
