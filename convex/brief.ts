import { createThread, saveMessage } from "@convex-dev/agent";
import { generateText, Output } from "ai";
import { ConvexError, v } from "convex/values";
import { can } from "../lib/access/permissions";
import {
  aboutAmount,
  basisLine,
  budgetFlag,
  raiseBudgetTo,
} from "../lib/brief/budgetCheck";
import { formatBriefDate, formatFunctionDate } from "../lib/brief/dates";
import { BRIEF_EXAMPLES } from "../lib/brief/examples";
import {
  BRIEF_EXTRACTION_NAME,
  briefExtractionSchema,
  cleanExtraction,
  EXTRACTION_SYSTEM,
  extractionPrompt,
} from "../lib/brief/extraction";
import {
  assumeFunctionDetails,
  briefLines,
  cityAssumption,
  functionName,
} from "../lib/brief/functions";
import { assumptionLabel } from "../lib/brief/labels";
import {
  answerChip as applyAnswer,
  BriefAnswerError,
  type BriefProgress,
  type BriefState,
  type ChipQuestion,
  nextQuestion,
  OPENING_LINE,
} from "../lib/brief/questions";
import { planLines, pricePlan } from "../lib/pricing";
import { cityTier } from "../lib/pricing/table";
import {
  type Assumption,
  assumptionValidator,
  briefDateValidator,
  briefExtractionValidator,
  budgetCheckValidator,
  cityTierValidator,
  draftBudgetLineValidator,
  eventTypeValidator,
  functionDateValidator,
  honoreeValidator,
  type Brief,
  type BriefExtraction,
  type EssentialChange,
  type EventType,
  type MemberActor,
} from "../lib/types";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import {
  type EstimateCtx,
  type EstimateDeps,
  estimateLines,
} from "./estimates";
import { requireAccess, requireAccessFor } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import {
  languageModel,
  type ModelEnv,
  modelChain,
  registerStubObject,
  withModelFallback,
} from "./lib/models";
import { istDay } from "./lib/time";
import { memberInsert, memberWrite } from "./lib/write";
import { proposeEssentialChange } from "./plan";
import schema from "./schema";

/**
 * The first Brief (S11; IMPLEMENTATION_PLAN.md section 4.6, steps 1 to 3 and
 * 5; docs/design/first-brief.md "Question flow"):
 *
 * 1. A new Event's Chat opens with the first-brief line (`openBrief`, called
 *    by `api.events.create`). The Member answers in their own words
 *    (`api.brief.submitText`), and the helper model extracts a
 *    `BriefExtraction` with structured output (`internal.brief.extract`).
 * 2. Code asks the missing essentials as chip questions, one at a time
 *    (`nextQuestion`), and applies each answer (`api.brief.answerChip`).
 * 3. With the essentials complete, the Brief's Functions and Assumptions are
 *    filled in, the Brief summary card shows "Checking current prices in <city>", and
 *    `internal.brief.checkBudget` prices the Brief's budget lines through the
 *    estimate cascade (which fills the cache the first plan reads) and stores
 *    the `BudgetCheck`. The card then shows the summary.
 * 4. Members edit any field in place (`api.brief.editField`), which re-runs the
 *    Budget check; after the first plan an essential goes through
 *    `proposeEssentialChange` instead (S14).
 *
 * "Make my plan" is S14's; the summary card leaves it a hook.
 */

// The stub model's canned extractions (#98): previews and e2e walk the
// worked examples without a real model. Never consulted off the stub.
for (const example of BRIEF_EXAMPLES) {
  registerStubObject({
    promptIncludes: example.text,
    object: {
      ...example.extraction,
      functions: example.functions,
      assumed: example.assumed.map(({ field, value, reason }) => ({
        field,
        value,
        reason,
      })),
    },
  });
}

/** A Brief longer than this is refused; it goes into the prompt. */
export const MAX_BRIEF_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Reading the Brief

async function loadEvent(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<Doc<"events">> {
  const event = await ctx.db.get("events", eventId);
  if (event === null)
    throw new ConvexError({ kind: "NotFound", what: "event" });
  return event;
}

/** The Event's Functions in order. An Event has a handful, so a small cap is plenty. */
async function functionRows(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<Doc<"eventFunctions">[]> {
  const rows = await ctx.db
    .query("eventFunctions")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(40);
  return rows.sort((a, b) => a.order - b.order);
}

function emptyExtraction(eventType: EventType | null): BriefExtraction {
  return {
    eventType,
    city: null,
    date: null,
    guests: null,
    budget: null,
    tradition: null,
    honoree: null,
    communityKind: null,
    households: null,
    notes: [],
  };
}

const has = (assumptions: Assumption[], field: string) =>
  assumptions.some((a) => a.field === field);

/**
 * What the Brief has settled beyond its extraction. "Not decided yet", "Help
 * me set one" and a skipped household count are Assumptions on the summary,
 * so they are read back from there; Q7's Functions are the Event's rows.
 */
function progressOf(
  brief: Brief | null,
  rows: Doc<"eventFunctions">[],
): BriefProgress {
  const assumptions = brief?.assumptions ?? [];
  return {
    functionKeys: rows.length > 0 ? rows.map((row) => row.key) : null,
    householdsSkipped: has(assumptions, "households"),
    budgetHelp: has(assumptions, "budget"),
    dateUndecided: brief?.extraction.date === null && has(assumptions, "date"),
  };
}

function stateOf(
  event: Doc<"events">,
  rows: Doc<"eventFunctions">[],
): BriefState {
  return {
    extraction: event.brief?.extraction ?? emptyExtraction(event.eventType),
    progress: progressOf(event.brief, rows),
  };
}

/** The newest card of a kind in the Event's Chat. */
async function latestCard(
  ctx: QueryCtx,
  eventId: Id<"events">,
  kind: "briefChips" | "briefSummary",
): Promise<Doc<"chatAnnotations"> | null> {
  for await (const annotation of ctx.db
    .query("chatAnnotations")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .order("desc")) {
    if (annotation.card?.kind === kind) return annotation;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Posting to the Chat

/** A line from Utsavvy with a card, through `internal.chat.postSystem` (never as the Assistant's own words). */
async function postCard(
  ctx: MutationCtx,
  eventId: Id<"events">,
  card: Doc<"chatAnnotations">["card"],
  text: string,
): Promise<void> {
  await ctx.runMutation(internal.chat.postSystem, { eventId, card, text });
}

/**
 * The Member's own answer in the Chat, so every Member sees what was said.
 * It isn't a request, so no run starts; the Assistant reads it as context.
 */
async function postMemberLine(
  ctx: MutationCtx,
  event: Doc<"events">,
  membershipId: Id<"memberships">,
  text: string,
): Promise<void> {
  let threadId = event.agentThreadId;
  if (threadId === null) {
    threadId = await createThread(ctx, components.agent, { title: event.name });
    await ctx.db.patch("events", event._id, { agentThreadId: threadId });
  }
  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId,
    userId: membershipId,
    prompt: text,
  });
  await ctx.db.insert("chatAnnotations", {
    eventId: event._id,
    messageId,
    authorMembershipId: membershipId,
    dontReply: false,
    mentions: [],
    pointing: [],
    card: null,
  });
}

/**
 * Opens a new Event's Brief with the first-brief line and the box for the
 * Member's own words. Called by `api.events.create` in the same mutation;
 * does nothing if the Event already has it.
 */
export async function openBrief(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  if ((await latestCard(ctx, eventId, "briefChips")) !== null) return;
  await postCard(
    ctx,
    eventId,
    { kind: "briefChips", id: "opening" },
    OPENING_LINE,
  );
}

// ---------------------------------------------------------------------------
// Writing the Brief

const member = (membershipId: Id<"memberships">): MemberActor => ({
  kind: "member",
  membershipId,
});

/** Assumptions `assumeFunctionDetails` works out, replaced whenever the Brief changes. */
function isDerived(field: string): boolean {
  return (
    field.startsWith("function.") ||
    [
      "date",
      "menu",
      "jewellery",
      "invitations",
      "photography",
      "cake",
      "children",
    ].includes(field)
  );
}

/**
 * Saves the Brief and mirrors its fields onto the Event, where the Canvas and
 * the first plan read them. The city's tier comes from the government's list;
 * a city on neither list gets the "treated as a smaller city" Assumption.
 */
async function saveBrief(
  ctx: MutationCtx,
  event: Doc<"events">,
  actor: MemberActor,
  brief: Brief,
): Promise<void> {
  const { extraction } = brief;
  const tierAssumption = extraction.city
    ? cityAssumption(extraction.city)
    : null;
  const assumptions = [
    ...brief.assumptions.filter((a) => a.field !== "city.tier"),
    ...(tierAssumption ? [tierAssumption] : []),
  ];
  const cityName = extraction.city;
  const sameCity = event.city !== null && event.city.name === cityName;
  const city =
    cityName === null
      ? null
      : {
          name: cityName,
          tier: cityTier(cityName),
          centre: sameCity ? event.city!.centre : null,
        };
  await memberWrite(ctx, {
    table: "events",
    id: event._id,
    actor,
    groupLabel: "The Brief",
    patch: {
      brief: { extraction, assumptions },
      eventType: extraction.eventType ?? event.eventType,
      city,
      tradition: extraction.tradition,
      communityKind: extraction.communityKind,
      honoree: extraction.honoree,
      households: extraction.households,
      // "Help me set one" leaves the budget to the Budget check.
      budgetTotal:
        extraction.budget ??
        (has(assumptions, "budget") ? event.budgetTotal : null),
    },
  });
  if (cityName !== null && !sameCity) {
    await ctx.scheduler.runAfter(0, internal.brief.locateCity, {
      eventId: event._id,
      city: cityName,
    });
  }
}

/**
 * Fills in every Function's date and Guest count from the Brief and refreshes
 * the Assumptions. A value a Member set stays; only assumed values follow the
 * Brief. The Event's own Function (the wedding itself, a birthday party)
 * always follows the Brief's date and Guests.
 */
async function syncFunctions(
  ctx: MutationCtx,
  eventId: Id<"events">,
  actor: MemberActor,
): Promise<void> {
  const event = await loadEvent(ctx, eventId);
  if (event.brief === null) return;
  const rows = await functionRows(ctx, eventId);
  const { extraction } = event.brief;
  const childrenMatch = event.brief.assumptions
    .find((a) => a.field === "children")
    ?.value.match(/\d+/);
  const { functions, assumptions: derived } = assumeFunctionDetails({
    eventType: event.eventType,
    date: extraction.date,
    guests: extraction.guests,
    tradition: extraction.tradition,
    honoree: extraction.honoree,
    communityKind: extraction.communityKind,
    functionKeys: rows.length > 0 ? rows.map((row) => row.key) : null,
    children: childrenMatch ? Number(childrenMatch[0]) : null,
    today: istDay(Date.now()),
  });

  const keptAssumed = new Map<string, Set<string>>();
  for (const [order, fn] of functions.entries()) {
    const row = rows.find((r) => r.key === fn.key);
    if (row === undefined) {
      await memberInsert(ctx, {
        table: "eventFunctions",
        actor,
        groupLabel: "The Brief",
        value: {
          eventId,
          key: fn.key,
          name: fn.name,
          date: fn.date,
          guests: fn.guests,
          assumed: fn.assumed,
          order,
        },
      });
      keptAssumed.set(fn.key, new Set(fn.assumed));
      continue;
    }
    // A field follows the Brief while it is assumed, unset, or the Brief's own value.
    const follows = (field: "date" | "guests") =>
      row[field] === null ||
      row.assumed.includes(field) ||
      !fn.assumed.includes(field);
    const assumed = fn.assumed.filter((f) => follows(f));
    keptAssumed.set(fn.key, new Set(assumed));
    const patch = {
      date: follows("date") ? fn.date : row.date,
      guests: follows("guests") ? fn.guests : row.guests,
      assumed,
      order,
    };
    const same =
      JSON.stringify([row.date, row.guests, row.assumed, row.order]) ===
      JSON.stringify([patch.date, patch.guests, patch.assumed, patch.order]);
    if (!same) {
      await memberWrite(ctx, {
        table: "eventFunctions",
        id: row._id,
        actor,
        groupLabel: "The Brief",
        patch,
      });
    }
  }

  const stillAssumed = (field: string) => {
    const fn = field.match(/^function\.([^.]+)\.(date|guests)$/);
    return fn ? (keptAssumed.get(fn[1]!)?.has(fn[2]!) ?? false) : true;
  };
  const assumptions = [
    ...event.brief.assumptions.filter((a) => !isDerived(a.field)),
    ...derived.filter((a) => stillAssumed(a.field)),
  ];
  // "Not decided yet" stays an Assumption until a date is given.
  if (
    extraction.date === null &&
    has(event.brief.assumptions, "date") &&
    !has(assumptions, "date")
  ) {
    assumptions.push(event.brief.assumptions.find((a) => a.field === "date")!);
  }
  if (JSON.stringify(assumptions) !== JSON.stringify(event.brief.assumptions)) {
    await memberWrite(ctx, {
      table: "events",
      id: eventId,
      actor,
      groupLabel: "The Brief",
      patch: { brief: { extraction, assumptions } },
    });
  }
}

/** Starts a Budget check: the summary shows "Checking current prices" until it lands. */
async function startBudgetCheck(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  // The check is derived from the Brief, not a Member's edit, so it is set
  // directly, without a version bump or a history row.
  await ctx.db.patch("events", eventId, { budgetCheck: null });
  await ctx.scheduler.runAfter(0, internal.brief.checkBudget, { eventId });
}

/** Asks the next question, or, with the essentials complete, moves to the summary. */
async function advance(
  ctx: MutationCtx,
  eventId: Id<"events">,
  actor: MemberActor,
  /** A line said before the next question, in the same message. */
  lead: string | null = null,
): Promise<void> {
  const event = await loadEvent(ctx, eventId);
  const rows = await functionRows(ctx, eventId);
  const state = stateOf(event, rows);
  const question = nextQuestion(
    state.extraction,
    state.progress,
    istDay(Date.now()),
  );
  if (question !== null) {
    const last = await latestCard(ctx, eventId, "briefChips");
    if (last?.card?.id !== question.id) {
      await postCard(
        ctx,
        eventId,
        { kind: "briefChips", id: question.id },
        lead ? `${lead} ${question.prompt}` : question.prompt,
      );
    }
    return;
  }
  await syncFunctions(ctx, eventId, actor);
  await memberWrite(ctx, {
    table: "events",
    id: eventId,
    actor,
    groupLabel: "The Brief",
    patch: { briefState: "summary" },
  });
  // The summary card arrives at once and shows "Checking current prices in
  // <city>" until the check lands. One message, not a notice and then the
  // card: the Agent component would merge two Utsavvy lines in a row.
  if ((await latestCard(ctx, eventId, "briefSummary")) === null) {
    await postCard(ctx, eventId, { kind: "briefSummary", id: null }, "");
  }
  await startBudgetCheck(ctx, eventId);
}

// ---------------------------------------------------------------------------
// Public functions

/** The Member describes the Event in their own words; the extraction runs next. */
export const submitText = mutation({
  args: { eventId: v.id("events"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, text }) => {
    const { membership } = await requireAccess(ctx, eventId, "canvas.edit");
    const event = await loadEvent(ctx, eventId);
    if (event.briefState !== "intake" || event.brief !== null) {
      throw new ConvexError({ kind: "BriefAlreadyGiven" });
    }
    const body = text.trim();
    if (body.length === 0) throw new ConvexError({ kind: "EmptyBrief" });
    if (body.length > MAX_BRIEF_LENGTH) {
      throw new ConvexError({ kind: "BriefTooLong", max: MAX_BRIEF_LENGTH });
    }
    await postMemberLine(ctx, event, membership._id, body);
    await ctx.scheduler.runAfter(0, internal.brief.extract, {
      eventId,
      membershipId: membership._id,
      text: body,
    });
    return null;
  },
});

/**
 * One extraction call on the helper model chain, with structured output for
 * `BriefExtraction`. Returns the checked result and the model that answered.
 * The scripted cases (`evals/brief.eval.ts`) call it with the real models.
 */
export async function extractBrief(
  text: string,
  today: string,
  source: ModelEnv,
): Promise<{ cleaned: ReturnType<typeof cleanExtraction>; model: string }> {
  const { result, model } = await withModelFallback(
    modelChain("helper", source),
    (id) =>
      generateText({
        model: languageModel(id, source),
        system: EXTRACTION_SYSTEM,
        prompt: extractionPrompt(text, today),
        output: Output.object({
          name: BRIEF_EXTRACTION_NAME,
          schema: briefExtractionSchema,
        }),
        maxOutputTokens: 1200,
      }),
  );
  return { cleaned: cleanExtraction(result.output), model };
}

/**
 * The extraction step: the helper model chain (falling back to Gemini, or the
 * stub on previews) with structured output for `BriefExtraction`. If no model
 * can answer, the Brief starts empty and the chips ask for everything.
 */
export const extract = internalAction({
  args: {
    eventId: v.id("events"),
    membershipId: v.id("memberships"),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, membershipId, text }) => {
    let cleaned: ReturnType<typeof cleanExtraction> | null = null;
    try {
      ({ cleaned } = await extractBrief(text, istDay(Date.now()), env));
    } catch (error) {
      console.warn(
        `The Brief's extraction failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`,
      );
    }
    await ctx.runMutation(internal.brief.applyExtraction, {
      eventId,
      membershipId,
      extraction: cleaned?.extraction ?? null,
      functionKeys: cleaned?.functionKeys ?? [],
      assumptions: cleaned?.assumptions ?? [],
    });
    return null;
  },
});

export const applyExtraction = internalMutation({
  args: {
    eventId: v.id("events"),
    membershipId: v.id("memberships"),
    extraction: v.union(briefExtractionValidator, v.null()),
    functionKeys: v.array(v.string()),
    assumptions: v.array(assumptionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await loadEvent(ctx, args.eventId);
    if (event.briefState !== "intake" || event.brief !== null) return null;
    try {
      await requireAccessFor(
        ctx,
        args.membershipId,
        args.eventId,
        "canvas.edit",
      );
    } catch (error) {
      if (error instanceof AccessDenied) return null;
      throw error;
    }
    const actor = member(args.membershipId);
    const extraction = args.extraction ?? emptyExtraction(event.eventType);
    extraction.eventType ??= event.eventType;
    for (const [order, key] of args.functionKeys.entries()) {
      await memberInsert(ctx, {
        table: "eventFunctions",
        actor,
        groupLabel: "The Brief",
        value: {
          eventId: args.eventId,
          key,
          name: functionName(key),
          date: null,
          guests: null,
          assumed: ["date", "guests"],
          order,
        },
      });
    }
    await saveBrief(ctx, event, actor, {
      extraction,
      assumptions: args.assumptions,
    });
    await advance(
      ctx,
      args.eventId,
      actor,
      args.extraction === null
        ? "I couldn't read that just now, so I'll ask a few quick questions instead."
        : null,
    );
    return null;
  },
});

const questionIdValidator = v.union(
  v.literal("eventType"),
  v.literal("city"),
  v.literal("date"),
  v.literal("guests"),
  v.literal("budget"),
  v.literal("tradition"),
  v.literal("functions"),
  v.literal("honoreeWho"),
  v.literal("honoreeAge"),
  v.literal("communityKind"),
  v.literal("households"),
);

/** The text a chip answer shows as the Member's line. */
function answerText(question: ChipQuestion, answer: string[]): string {
  const labels = answer.map(
    (value) =>
      question.chips.find((chip) => chip.value === value)?.label ??
      (question.id === "functions" ? functionName(value) : value),
  );
  return labels.join(", ");
}

/**
 * Answers the chip question being asked: a chip's value, typed text, or for
 * Q7 the chosen Functions. Any Member can answer; an answer to a question
 * that is no longer being asked is refused.
 */
export const answerChip = mutation({
  args: {
    eventId: v.id("events"),
    question: questionIdValidator,
    answer: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, question: questionId, answer }) => {
    const { membership } = await requireAccess(ctx, eventId, "canvas.edit");
    const event = await loadEvent(ctx, eventId);
    const rows = await functionRows(ctx, eventId);
    const state = stateOf(event, rows);
    const today = istDay(Date.now());
    const question =
      event.briefState === "intake" && event.brief !== null
        ? nextQuestion(state.extraction, state.progress, today)
        : null;
    if (question === null || question.id !== questionId) {
      throw new ConvexError({ kind: "QuestionNotAsked", question: questionId });
    }
    if (answer.length === 0 || answer.some((a) => a.length > 200)) {
      throw new ConvexError({
        kind: "BadAnswer",
        message: "Choose or type an answer.",
      });
    }

    let next: BriefState;
    try {
      next = applyAnswer(
        state,
        question,
        question.multi ? answer : answer[0]!,
        today,
      );
    } catch (error) {
      if (error instanceof BriefAnswerError) {
        throw new ConvexError({ kind: "BadAnswer", message: error.message });
      }
      throw error;
    }

    const actor = member(membership._id);
    await postMemberLine(
      ctx,
      event,
      membership._id,
      answerText(question, answer),
    );

    // Settled choices with no field of their own are Assumptions.
    const assumptions = [...(event.brief?.assumptions ?? [])];
    if (question.id === "date" && next.progress.dateUndecided) {
      assumptions.push({
        field: "date",
        value: "Not decided yet",
        reason: "No date yet",
      });
    }
    if (question.id === "budget" && next.progress.budgetHelp) {
      assumptions.push({
        field: "budget",
        value: "Set to the typical Estimate",
        reason: "You asked me to help set one",
      });
    }
    if (question.id === "households" && next.progress.householdsSkipped) {
      assumptions.push({
        field: "households",
        value: "Not counted",
        reason: "Skipped, so the Budget shows no per-household share",
      });
    }
    if (question.id === "functions") {
      for (const [order, key] of (next.progress.functionKeys ?? []).entries()) {
        await memberInsert(ctx, {
          table: "eventFunctions",
          actor,
          groupLabel: "The Brief",
          value: {
            eventId,
            key,
            name: functionName(key),
            date: null,
            guests: null,
            assumed: ["date", "guests"],
            order,
          },
        });
      }
    }
    await saveBrief(ctx, event, actor, {
      extraction: next.extraction,
      assumptions,
    });
    await advance(ctx, eventId, actor);
    return null;
  },
});

const ESSENTIALS = new Set(["date", "city", "guests", "budget"]);

const briefChangeValidator = v.union(
  v.object({ field: v.literal("date"), date: briefDateValidator }),
  v.object({ field: v.literal("city"), city: v.string() }),
  v.object({
    field: v.literal("guests"),
    functionKey: v.union(v.string(), v.null()),
    guests: v.number(),
  }),
  v.object({ field: v.literal("budget"), budget: v.number() }),
  v.object({ field: v.literal("tradition"), tradition: v.string() }),
  v.object({ field: v.literal("honoree"), honoree: honoreeValidator }),
  v.object({ field: v.literal("communityKind"), communityKind: v.string() }),
  v.object({
    field: v.literal("households"),
    households: v.union(v.number(), v.null()),
  }),
  v.object({
    field: v.literal("functionDate"),
    functionKey: v.string(),
    date: functionDateValidator,
  }),
  v.object({ field: v.literal("styleWords"), styleWords: v.array(v.string()) }),
  v.object({ field: v.literal("assumptionConfirmed"), assumption: v.string() }),
);

const positiveWhole = (n: number, what: string) => {
  if (!Number.isInteger(n) || n <= 0 || n > 100_000_000_000) {
    throw new ConvexError({
      kind: "BadAnswer",
      message: `Type a whole number of ${what}.`,
    });
  }
};

/**
 * Changes one field of the Brief in place (IMPLEMENTATION_PLAN.md section
 * 4.6, step 5). Before the first plan every edit applies directly and the
 * Budget check runs again, mostly from the cache. Once the plan exists, a
 * change to an essential (date, city, a Guest count, the budget) leaves the
 * stored Brief alone and goes to `proposeEssentialChange`, which sends it as a
 * Proposal (S14); other fields still apply directly.
 */
export const editField = mutation({
  args: { eventId: v.id("events"), change: briefChangeValidator },
  returns: v.null(),
  handler: async (ctx, { eventId, change }) => {
    const { membership } = await requireAccess(ctx, eventId, "canvas.edit");
    const event = await loadEvent(ctx, eventId);
    if (event.brief === null) throw new ConvexError({ kind: "NoBriefYet" });
    const actor = member(membership._id);
    const rows = await functionRows(ctx, eventId);
    const planned =
      event.briefState === "planning" || event.briefState === "planned";

    // A Function whose date or Guests are the Brief's own: its edit is the Brief's.
    const own = (key: string | null, field: "date" | "guests") => {
      if (key === null) return true;
      const row = rows.find((r) => r.key === key);
      if (!row) throw new ConvexError({ kind: "NotFound", what: "function" });
      const { functions } = assumeFunctionDetails({
        ...event.brief!.extraction,
        eventType: event.eventType,
        functionKeys: rows.map((r) => r.key),
        children: null,
        today: istDay(Date.now()),
      });
      return !(
        functions.find((f) => f.key === key)?.assumed.includes(field) ?? true
      );
    };
    let essential: EssentialChange | null = null;
    if (change.field === "date")
      essential = { field: "date", date: change.date };
    if (change.field === "city")
      essential = { field: "city", city: change.city.trim() };
    if (change.field === "budget")
      essential = { field: "budget", budget: change.budget };
    if (change.field === "guests") {
      essential = {
        field: "guests",
        functionKey: own(change.functionKey, "guests")
          ? null
          : change.functionKey,
        guests: change.guests,
      };
    }
    if (
      change.field === "functionDate" &&
      change.date.kind === "day" &&
      own(change.functionKey, "date")
    ) {
      essential = { field: "date", date: change.date };
    }
    if (planned && essential !== null && ESSENTIALS.has(essential.field)) {
      await proposeEssentialChange(ctx, eventId, essential);
      return null;
    }
    if (planned && change.field === "functionDate") {
      throw new ConvexError({
        kind: "AfterThePlan",
        message: "Change the Function on the Timeline instead.",
      });
    }

    const extraction = { ...event.brief.extraction };
    let assumptions = [...event.brief.assumptions];
    const drop = (...fields: string[]) => {
      assumptions = assumptions.filter((a) => !fields.includes(a.field));
    };
    let functionPatch: {
      row: Doc<"eventFunctions">;
      patch: Partial<Doc<"eventFunctions">>;
    } | null = null;

    if (essential?.field === "date") {
      extraction.date = essential.date;
      drop("date");
    } else if (essential?.field === "city") {
      if (essential.city.length === 0 || essential.city.length > 80) {
        throw new ConvexError({
          kind: "BadAnswer",
          message: "Type the city's name.",
        });
      }
      extraction.city = essential.city;
    } else if (essential?.field === "budget") {
      positiveWhole(essential.budget, "rupees");
      extraction.budget = essential.budget;
      drop("budget");
    } else if (essential?.field === "guests") {
      positiveWhole(essential.guests, "Guests");
      if (essential.functionKey === null) {
        extraction.guests = essential.guests;
        drop("guests");
      } else {
        const row = rows.find((r) => r.key === essential.functionKey)!;
        functionPatch = {
          row,
          patch: {
            guests: essential.guests,
            assumed: row.assumed.filter((f) => f !== "guests"),
          },
        };
      }
    } else if (change.field === "functionDate") {
      const row = rows.find((r) => r.key === change.functionKey);
      if (!row) throw new ConvexError({ kind: "NotFound", what: "function" });
      functionPatch = {
        row,
        patch: {
          date: change.date,
          assumed: row.assumed.filter((f) => f !== "date"),
        },
      };
    } else if (change.field === "tradition") {
      extraction.tradition = change.tradition.trim() || null;
    } else if (change.field === "honoree") {
      extraction.honoree = change.honoree;
    } else if (change.field === "communityKind") {
      extraction.communityKind = change.communityKind.trim() || null;
    } else if (change.field === "households") {
      if (change.households !== null)
        positiveWhole(change.households, "households");
      extraction.households = change.households;
      drop("households");
    } else if (change.field === "assumptionConfirmed") {
      // One tap confirms an Assumption: it stops being listed as assumed. A
      // Function's date or Guests stop being assumed on the Function itself.
      const fn = change.assumption.match(/^function\.([^.]+)\.(date|guests)$/);
      if (fn) {
        const row = rows.find((r) => r.key === fn[1]);
        if (!row) throw new ConvexError({ kind: "NotFound", what: "function" });
        functionPatch = {
          row,
          patch: { assumed: row.assumed.filter((f) => f !== fn[2]) },
        };
      } else if (change.assumption === "guests") {
        drop(change.assumption);
      } else {
        throw new ConvexError({
          kind: "BadAnswer",
          message: "That Assumption is settled by the first plan.",
        });
      }
    } else if (change.field === "styleWords") {
      const words = change.styleWords
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, 6);
      if (words.some((w) => w.length > 40)) {
        throw new ConvexError({
          kind: "BadAnswer",
          message: "Keep each style word short.",
        });
      }
      await memberWrite(ctx, {
        table: "events",
        id: eventId,
        actor,
        groupLabel: "The Theme",
        patch: { theme: { ...event.theme, styleWords: words } },
      });
      return null;
    }

    if (functionPatch !== null) {
      await memberWrite(ctx, {
        table: "eventFunctions",
        id: functionPatch.row._id,
        actor,
        groupLabel: "The Brief",
        patch: functionPatch.patch,
      });
    }
    await saveBrief(ctx, event, actor, { extraction, assumptions });
    if (event.briefState === "summary") {
      await syncFunctions(ctx, eventId, actor);
      await startBudgetCheck(ctx, eventId);
    } else if (event.briefState === "intake") {
      await advance(ctx, eventId, actor);
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// The Budget check

const planLinesValidator = v.object({
  functions: v.array(
    v.object({
      key: v.string(),
      guests: v.number(),
      budgetEntries: v.array(draftBudgetLineValidator),
    }),
  ),
  eventWide: v.array(draftBudgetLineValidator),
});

const budgetInputValidator = v.object({
  city: v.string(),
  tier: cityTierValidator,
  eventType: eventTypeValidator,
  lines: planLinesValidator,
  /** null when "Help me set one" leaves it to the typical Estimate. */
  budget: v.union(v.number(), v.null()),
  households: v.union(v.number(), v.null()),
  contingencyShare: v.number(),
  communityKind: v.union(v.string(), v.null()),
  fingerprint: v.string(),
});

async function budgetInputOf(ctx: QueryCtx, eventId: Id<"events">) {
  const event = await ctx.db.get("events", eventId);
  if (event === null || event.brief === null || event.city === null)
    return null;
  const rows = await functionRows(ctx, eventId);
  const lines = briefLines({
    eventType: event.eventType,
    tradition: event.tradition,
    functions: rows
      .filter((row) => row.date !== null && row.guests !== null)
      .map((row) => ({
        key: row.key,
        name: row.name,
        date: row.date!,
        guests: row.guests!,
        assumed: row.assumed as ("date" | "guests")[],
      })),
    assumptions: event.brief.assumptions,
    guests: event.brief.extraction.guests ?? 0,
  });
  const budget = has(event.brief.assumptions, "budget")
    ? null
    : event.budgetTotal;
  const input = {
    city: event.city.name,
    tier: event.city.tier,
    eventType: event.eventType,
    lines,
    budget,
    households: event.households,
    contingencyShare: event.contingencyShare,
    communityKind: event.communityKind,
  };
  return { ...input, fingerprint: JSON.stringify(input) };
}

export const budgetInput = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.union(budgetInputValidator, v.null()),
  handler: async (ctx, { eventId }) => await budgetInputOf(ctx, eventId),
});

/**
 * The Budget check (IMPLEMENTATION_PLAN.md section 4.14): builds the Brief's
 * budget lines, prices them through the estimate cascade (whose research
 * fills the cache that S14's first plan reads; past the research time limit
 * the unfinished lines fall through to the table) and stores the
 * `BudgetCheck` from `pricePlan`. Tests pass `stubEstimateDeps`.
 */
export async function runBudgetCheck(
  ctx: EstimateCtx,
  eventId: Id<"events">,
  deps?: Partial<EstimateDeps>,
): Promise<void> {
  const input = await ctx.runQuery(internal.brief.budgetInput, { eventId });
  if (input === null) return;
  const flat = planLines(input.lines);
  const ranges = await estimateLines(
    ctx,
    {
      eventId,
      city: input.city,
      tier: input.tier,
      eventType: input.eventType,
      lines: flat,
    },
    deps,
  );
  let budget = input.budget;
  let setBudget: number | null = null;
  if (budget === null) {
    // "Help me set one": the typical Estimate, to the nearest ₹1,000.
    const probe = pricePlan(input.lines, ranges, {
      budget: 0,
      contingencyShare: input.contingencyShare,
    });
    budget = setBudget = Math.round(probe.budgetCheck.typical / 1000) * 1000;
  }
  const priced = pricePlan(input.lines, ranges, {
    budget,
    contingencyShare: input.contingencyShare,
    households: input.households,
    city: input.city,
  });
  await ctx.runMutation(internal.brief.storeBudgetCheck, {
    eventId,
    fingerprint: input.fingerprint,
    budgetCheck: priced.budgetCheck,
    setBudget,
    researched: ranges.filter((r) => r?.basis.kind === "researched").length,
    lines: flat.length,
  });
}

export const checkBudget = internalAction({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    await runBudgetCheck(ctx, eventId);
    return null;
  },
});

/**
 * Stores a finished check, unless the Brief changed while it ran (a newer
 * check is on its way), and posts the Brief summary the first time. The
 * summary card's ID records what the figures rest on ("researched/lines"),
 * which the card words as its basis line.
 */
export const storeBudgetCheck = internalMutation({
  args: {
    eventId: v.id("events"),
    fingerprint: v.string(),
    budgetCheck: budgetCheckValidator,
    setBudget: v.union(v.number(), v.null()),
    researched: v.number(),
    lines: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await budgetInputOf(ctx, args.eventId);
    if (current === null || current.fingerprint !== args.fingerprint)
      return null;
    // Derived from the Brief, like the check itself: set directly.
    await ctx.db.patch("events", args.eventId, {
      budgetCheck: args.budgetCheck,
      ...(args.setBudget !== null ? { budgetTotal: args.setBudget } : {}),
    });
    const basis = `${args.researched}/${args.lines}`;
    const card = await latestCard(ctx, args.eventId, "briefSummary");
    if (card === null) {
      await postCard(
        ctx,
        args.eventId,
        { kind: "briefSummary", id: basis },
        "",
      );
    } else if (card.card?.id !== basis) {
      await ctx.db.patch("chatAnnotations", card._id, {
        card: { kind: "briefSummary", id: basis },
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// The city's centre (Geoapify)

const GEOCODE_TIMEOUT_MS = 5000;

/**
 * The city's centre from Geoapify, server side only, or null on any failure:
 * the map then centres on the Vendors instead. The key never leaves this
 * function, not even in a log line.
 */
export async function geocodeCity(
  city: string,
  opts: { apiKey: string | undefined; fetch?: typeof globalThis.fetch },
): Promise<{ lat: number; lng: number } | null> {
  if (!opts.apiKey) return null;
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", city);
  url.searchParams.set("type", "city");
  url.searchParams.set("filter", "countrycode:in");
  url.searchParams.set("limit", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", opts.apiKey);
  try {
    const response = await (opts.fetch ?? fetch)(url.toString(), {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Geoapify couldn't find ${city}: HTTP ${response.status}`);
      return null;
    }
    const body = (await response.json()) as {
      results?: { lat?: unknown; lon?: unknown }[];
    };
    const first = body.results?.[0];
    if (typeof first?.lat !== "number" || typeof first.lon !== "number")
      return null;
    return { lat: first.lat, lng: first.lon };
  } catch (error) {
    // The error's name only: its message could carry the request URL, and so the key.
    console.warn(
      `Geoapify didn't answer for ${city} (${error instanceof Error ? error.name : "unknown"})`,
    );
    return null;
  }
}

export const locateCity = internalAction({
  args: { eventId: v.id("events"), city: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, city }) => {
    const centre = await geocodeCity(city, { apiKey: env.GEOAPIFY_API_KEY });
    if (centre !== null) {
      await ctx.runMutation(internal.brief.setCityCentre, {
        eventId,
        city,
        centre,
      });
    }
    return null;
  },
});

export const setCityCentre = internalMutation({
  args: {
    eventId: v.id("events"),
    city: v.string(),
    centre: v.object({ lat: v.number(), lng: v.number() }),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, city, centre }) => {
    const event = await ctx.db.get("events", eventId);
    if (event?.city?.name !== city) return null;
    // Map plumbing, not Canvas content: set directly, like the thread ID.
    await ctx.db.patch("events", eventId, { city: { ...event.city, centre } });
    return null;
  },
});

// ---------------------------------------------------------------------------
// The summary

const chipQuestionValidator = v.object({
  id: questionIdValidator,
  number: v.number(),
  prompt: v.string(),
  chips: v.array(v.object({ value: v.string(), label: v.string() })),
  multi: v.boolean(),
  typeOwn: v.union(
    v.object({
      label: v.string(),
      input: v.union(
        v.literal("text"),
        v.literal("count"),
        v.literal("amount"),
        v.literal("date"),
        v.literal("month"),
      ),
    }),
    v.null(),
  ),
});

const summaryValidator = v.object({
  briefState: schema.tables.events.validator.fields.briefState,
  eventType: eventTypeValidator,
  canEdit: v.boolean(),
  /** "text" while the Brief waits for the Member's own words; a question's ID while it waits for a chip. */
  pendingQuestion: v.union(v.string(), v.null()),
  question: v.union(chipQuestionValidator, v.null()),
  extraction: v.union(briefExtractionValidator, v.null()),
  city: v.union(v.object({ name: v.string(), tier: v.string() }), v.null()),
  date: v.union(briefDateValidator, v.null()),
  dateText: v.union(v.string(), v.null()),
  guests: v.union(v.number(), v.null()),
  budget: v.union(v.number(), v.null()),
  budgetAssumed: v.boolean(),
  tradition: v.union(v.string(), v.null()),
  honoree: v.union(honoreeValidator, v.null()),
  communityKind: v.union(v.string(), v.null()),
  households: v.union(v.number(), v.null()),
  styleWords: v.array(v.string()),
  functions: v.array(
    v.object({
      key: v.string(),
      name: v.string(),
      date: v.union(functionDateValidator, v.null()),
      dateText: v.union(v.string(), v.null()),
      guests: v.union(v.number(), v.null()),
      assumed: v.array(v.string()),
    }),
  ),
  assumptions: v.array(
    v.object({
      field: v.string(),
      label: v.string(),
      value: v.string(),
      reason: v.string(),
    }),
  ),
  checking: v.boolean(),
  budgetCheck: v.union(
    v.object({
      ...budgetCheckValidator.fields,
      flag: v.union(v.string(), v.null()),
      raiseTo: v.union(v.number(), v.null()),
      raiseLabel: v.union(v.string(), v.null()),
      basis: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  canPlanAnyway: v.boolean(),
});

/**
 * Everything the Brief cards show: the question being asked, every field of
 * the Brief summary with its Assumptions, and the Budget check with its flag
 * and basis line. Viewers can read it; only Members can change it.
 */
export const summary = query({
  args: { eventId: v.id("events") },
  returns: v.union(summaryValidator, v.null()),
  handler: async (ctx, { eventId }) => {
    let membership: Doc<"memberships">;
    try {
      ({ membership } = await requireAccess(ctx, eventId, "canvas.view"));
    } catch (error) {
      if (error instanceof AccessDenied) return null;
      throw error;
    }
    const event = await loadEvent(ctx, eventId);
    const rows = await functionRows(ctx, eventId);
    const brief = event.brief;

    let pendingQuestion: string | null = null;
    let question: ChipQuestion | null = null;
    if (event.briefState === "intake") {
      if (brief === null) pendingQuestion = "text";
      else {
        const card = await latestCard(ctx, eventId, "briefChips");
        if (card !== null && card.card?.id !== "opening") {
          const state = stateOf(event, rows);
          // The question as it was asked: its festival dates are those of the day it was posted.
          question = nextQuestion(
            state.extraction,
            state.progress,
            istDay(card._creationTime),
          );
          pendingQuestion = question?.id ?? null;
        }
      }
    }

    const summaryCard = await latestCard(ctx, eventId, "briefSummary");
    const [researched, lines] = (summaryCard?.card?.id ?? "")
      .split("/")
      .map(Number);
    const stored = event.budgetCheck;
    const budget = event.budgetTotal;
    const budgetCheck =
      stored === null || budget === null
        ? null
        : {
            ...stored,
            flag: budgetFlag({
              minimum: stored.minimum,
              budget,
              city: event.city?.name ?? null,
              eventType: event.eventType,
              communityKind: event.communityKind,
            }),
            raiseTo:
              budget < stored.minimum ? raiseBudgetTo(stored.minimum) : null,
            raiseLabel:
              budget < stored.minimum ? aboutAmount(stored.minimum) : null,
            basis:
              lines !== undefined && Number.isFinite(lines) && lines! > 0
                ? basisLine({ researched: researched ?? 0, lines: lines! })
                : null,
          };

    return {
      briefState: event.briefState,
      eventType: event.eventType,
      canEdit: can(membership.role, "canvas.edit"),
      pendingQuestion,
      question,
      extraction: brief?.extraction ?? null,
      city: event.city
        ? { name: event.city.name, tier: event.city.tier }
        : null,
      date: brief?.extraction.date ?? null,
      dateText: brief?.extraction.date
        ? formatBriefDate(brief.extraction.date)
        : null,
      guests: brief?.extraction.guests ?? null,
      budget,
      budgetAssumed: brief !== null && has(brief.assumptions, "budget"),
      tradition: event.tradition,
      honoree: event.honoree,
      communityKind: event.communityKind,
      households: event.households,
      styleWords: event.theme.styleWords,
      functions: rows.map((row) => ({
        key: row.key,
        name: row.name,
        date: row.date,
        dateText: row.date ? formatFunctionDate(row.date) : null,
        guests: row.guests,
        assumed: row.assumed,
      })),
      assumptions: (brief?.assumptions ?? []).map((a) => ({
        ...a,
        label: assumptionLabel(a.field),
      })),
      checking: event.briefState === "summary" && stored === null,
      budgetCheck,
      canPlanAnyway: budgetCheck?.band === "belowMinimum",
    };
  },
});
