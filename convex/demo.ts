import { createThread, listMessages, saveMessage } from "@convex-dev/agent";
import { Presence } from "@convex-dev/presence";
import {
  paginationOptsValidator,
  type WithoutSystemFields,
} from "convex/server";
import { v } from "convex/values";
import { addDays } from "../lib/brief/dates";
import { assumeFunctionDetails } from "../lib/brief/functions";
import { vibeTheme } from "../lib/brief/vibeSets";
import { STARTING_SECTIONS } from "../lib/canvas/starting";
import {
  findLibraryPhoto,
  type LibraryPhoto,
} from "../lib/inspirations/library";
import {
  type LineEstimate,
  lineRange,
  referenceTableBasis,
  tableRange,
} from "../lib/pricing";
import type { Actor, AssistantActor, MemberActor } from "../lib/types/actors";
import type { BriefFunction } from "../lib/brief/functions";
import type { SectionKind } from "../lib/types/canvas";
import type { ChangeOp, HistoryTable } from "../lib/types/history";
import { SOFT_DELETE_TABLES } from "../lib/types/history";
import type { PricedEstimate } from "../lib/types";
import type { ToolResult } from "./assistant/tools/core";
import {
  ADITI_NOTE,
  CATERING_THREAD,
  DECORATOR_QUOTE,
  DEMO_BRIEF,
  DEMO_EVENT,
  DEMO_FUNCTION_KEYS,
  DEMO_JUDGES,
  DEMO_KEY,
  DEMO_PERSONAS,
  DEMO_PLAN_DRAFT,
  DEMO_SHORTLIST,
  type DemoRole,
  HALDI_PHOTOS,
  HALDI_PHOTOS_LABEL,
  PAPA_VENUE_COMMENT,
  PLAN_THE_SANGEET,
  type PersonaKey,
  personaClerkId,
  ROHAN_CATERING_NOTE,
  SANGEET_CHANGE,
  SANGEET_GUESTS_PROPOSAL,
  SUGGESTIONS_ADDED,
  SUGGESTIONS_DISMISSED,
  VIBE_PICK_PHOTOS,
} from "../seed/demo/meera-weds-rohan";
import starterSet from "../seed/jaipur-vendors.json";
import { components, internal } from "./_generated/api";
import type { DataModel, Doc, Id, TableNames } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  query,
} from "./_generated/server";
import { ASSISTANT_NAME } from "./chat";
import { placeNewItem } from "./canvas";
import { nextOrder } from "./entries";
import { STARTING_ITEMS } from "./events";
import { INSPIRATION_CARD_SIZE } from "./inspirations";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { MODELS, STUB_MODEL } from "./lib/models";
import { istDay } from "./lib/time";
import { newInviteToken, peopleSnapshot } from "./people";
import {
  lineLabel,
  type PlanInput,
  planLinesOf,
  pricePlanDraft,
  type PricedPlanDraft,
  toFirstPlanDraft,
} from "./plan";
import { loadStarterSetRows, SHORTLISTED_CARD_SIZE } from "./vendors";

// S19a (the demo Event's seed and reset) owns this file.

/*
 * The demo Event, "Meera weds Rohan" (IMPLEMENTATION_PLAN.md sections 9.1 and
 * 9.2). `internal.demo.reset` deletes the demo Event's private data, found by
 * its `demoKey`, and rebuilds it from `seed/demo/meera-weds-rohan.ts`: the
 * first-brief worked example 1 plan priced on the reference-table path, the
 * people with the three judge accounts in their roles, the Chat, Comments, one
 * accepted Proposal and the history. It runs nightly at 03:00 IST
 * (`convex/crons.ts`) and on demand with `bunx convex run demo:reset`.
 *
 * Every seed row goes in through `seedInsert`: a plain `ctx.db.insert`, so a
 * reset writes no history beyond the seeded `changes` rows and runs no
 * post-write hook (section 4.4). It schedules no app work, posts no Nudge and
 * marks no passage.
 * Other Events and the shared Vendor rows are never touched.
 */

type EventTable = {
  [K in TableNames]: Doc<K> extends { eventId: Id<"events"> } ? K : never;
}[TableNames];

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** The most rows of one table the reset reads for one Event. */
export const MAX_ROWS = 8000;

const demoEventIds = new WeakMap<MutationCtx, Id<"events">>();

async function findDemoEvent(ctx: MutationCtx): Promise<Doc<"events"> | null> {
  return await ctx.db
    .query("events")
    .withIndex("by_demoKey", (q) => q.eq("demoKey", DEMO_KEY))
    .unique();
}

/**
 * Inserts one seed row of the demo Event (section 4.4): `ctx.db.insert` and
 * nothing else, so no `changes` row is added and no post-write hook runs.
 * Throws unless `demoEventId` is the Event found by the demo's `demoKey` and
 * the row's `eventId` is that Event. Called only from `internal.demo.reset`.
 */
export async function seedInsert<T extends EventTable>(
  ctx: MutationCtx,
  demoEventId: Id<"events">,
  table: T,
  row: WithoutSystemFields<DataModel[T]["document"]>,
): Promise<Id<T>> {
  let found = demoEventIds.get(ctx);
  if (found === undefined) {
    found = (await findDemoEvent(ctx))?._id;
    if (found !== undefined) demoEventIds.set(ctx, found);
  }
  if (found === undefined || found !== demoEventId) {
    throw new Error(
      "seedInsert writes only to the demo Event, the one found by its demoKey.",
    );
  }
  if ((row as { eventId?: unknown }).eventId !== demoEventId) {
    throw new Error(
      `seedInsert refused a ${table} row that isn't the demo Event's.`,
    );
  }
  return await ctx.db.insert(table, row as never);
}

// ---------------------------------------------------------------------------
// Clearing the demo Event

/**
 * Deletes every private row of the demo Event; the Event row itself stays.
 * Returns how many rows it deleted. Each table is read up to `MAX_ROWS`; a
 * table that reaches it throws, so the mutation rolls back and the reset fails
 * loudly instead of leaving rows behind (review of #119, L2).
 */
async function clearEvent(
  ctx: MutationCtx,
  event: Doc<"events">,
): Promise<number> {
  const eventId = event._id;
  let deleted = 0;
  const bounded = <R>(table: TableNames, rows: R[]): R[] => {
    if (rows.length >= MAX_ROWS) {
      throw new Error(
        `The demo Event has ${MAX_ROWS} or more ${table} rows, more than one reset clears, so nothing was reset.`,
      );
    }
    return rows;
  };
  const drop = async <T extends TableNames>(
    table: T,
    rows: readonly Doc<T>[],
  ) => {
    bounded(table, [...rows]);
    for (const row of rows) await ctx.db.delete(table, row._id);
    deleted += rows.length;
  };
  // A stored file goes only if it still exists, so a file already gone never
  // fails the reset.
  const deleteFile = async (fileId: Id<"_storage">) => {
    if ((await ctx.db.system.get("_storage", fileId)) !== null) {
      await ctx.storage.delete(fileId);
    }
  };

  // An uploaded Inspiration's file goes with it, by the purge's rule
  // (`purgeDeletedFiles` in convex/inspirations.ts): only when this Item
  // claimed the file, so a file another Inspiration uses stays.
  const items = bounded(
    "items",
    await ctx.db
      .query("items")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  for (const item of items) {
    if (item.kind !== "inspiration" || item.data.source.kind !== "upload")
      continue;
    const fileId = item.data.source.fileId;
    const claims = await ctx.db
      .query("uploadClaims")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .take(10);
    if (claims.some((c) => c.itemId === item._id)) await deleteFile(fileId);
    await drop(
      "uploadClaims",
      claims.filter((c) => c.eventId === eventId),
    );
  }
  await drop("items", items);

  const runs = bounded(
    "runs",
    await ctx.db
      .query("runs")
      .withIndex("by_event_status", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  for (const run of runs) {
    // Idempotency keys are "runId:toolCallId".
    const keys = await ctx.db
      .query("toolCalls")
      .withIndex("by_key", (q) =>
        q.gte("key", `${run._id}:`).lt("key", `${run._id};`),
      )
      .take(MAX_ROWS);
    await drop("toolCalls", keys);
  }
  await drop("runs", runs);

  // A pasted Quote's screenshot goes with its Quote.
  const quotes = bounded(
    "quotes",
    await ctx.db
      .query("quotes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  for (const quote of quotes) {
    if (quote.fileId !== null) await deleteFile(quote.fileId);
  }
  await drop("quotes", quotes);

  await drop(
    "memberships",
    await ctx.db
      .query("memberships")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "inviteLinks",
    await ctx.db
      .query("inviteLinks")
      .withIndex("by_event_role", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "viewPrefs",
    await ctx.db
      .query("viewPrefs")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "emailInvites",
    await ctx.db
      .query("emailInvites")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "eventFunctions",
    await ctx.db
      .query("eventFunctions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "sections",
    await ctx.db
      .query("sections")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "entries",
    await ctx.db
      .query("entries")
      .withIndex("by_event_kind", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "comments",
    await ctx.db
      .query("comments")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "highlights",
    await ctx.db
      .query("highlights")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "vendorLinks",
    await ctx.db
      .query("vendorLinks")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "chatAnnotations",
    await ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "proposals",
    await ctx.db
      .query("proposals")
      .withIndex("by_event_status", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  await drop(
    "nudges",
    await ctx.db
      .query("nudges")
      .withIndex("by_event_trigger_target_day", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );
  // Includes the change rows of this Event's Marker drags; the shared
  // `vendors` rows themselves are never touched.
  await drop(
    "changes",
    await ctx.db
      .query("changes")
      .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
      .take(MAX_ROWS),
  );

  // The Canvas room (@convex-dev/presence, keyed by the Event's ID) lists
  // people by membership. Those memberships are gone now, and a room still
  // listing one makes `canvas:list` refuse everyone (S19b, issue #53).
  await new Presence(components.presence).removeRoom(ctx, eventId);

  // The component pages through a long thread with its own scheduled
  // deletions; the app schedules nothing.
  if (event.agentThreadId !== null) {
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: event.agentThreadId,
    });
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Writing the seed, with its history

type GroupOptions = {
  groupKey?: string | null;
  groupLabel?: string | null;
  fromComment?: boolean;
};

function isSoftDelete(table: HistoryTable): boolean {
  return (SOFT_DELETE_TABLES as readonly string[]).includes(table);
}

/**
 * Writes the demo's rows in the order the story happened, each with the
 * `changes` row the app's own write would have left, so the history panel and
 * Restore read them like any other. Every row goes through `seedInsert`, and
 * updates are plain patches: no post-write hook ever runs. Times count back
 * from the reset, so the history reads as the last few days.
 */
class Seeder {
  private clock: number;
  /** Rows written through `insert`, for the reset's log line. */
  inserted = 0;

  constructor(
    readonly ctx: MutationCtx,
    readonly eventId: Id<"events">,
    readonly now: number,
  ) {
    this.clock = now - 5 * DAY_MS;
  }

  /** Moves the clock to a moment `daysAgo` days (plus `hours`) before the reset. */
  at(daysAgo: number, hours = 0) {
    this.clock = this.now - daysAgo * DAY_MS + hours * HOUR_MS;
  }

  /** The next moment on the story's clock, a second after the last. */
  tick(): number {
    this.clock += 1000;
    return this.clock;
  }

  insert<T extends EventTable>(
    table: T,
    row: WithoutSystemFields<DataModel[T]["document"]>,
  ): Promise<Id<T>> {
    this.inserted++;
    return seedInsert(this.ctx, this.eventId, table, row);
  }

  private async record(args: {
    table: HistoryTable;
    docId: Id<HistoryTable>;
    op: ChangeOp;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    actor: Actor;
    options: GroupOptions;
  }) {
    await this.insert("changes", {
      eventId: this.eventId,
      at: this.tick(),
      actor: args.actor,
      groupKey: args.options.groupKey ?? null,
      groupLabel: args.options.groupLabel ?? null,
      fromComment: args.options.fromComment ?? false,
      table: args.table,
      docId: args.docId,
      op: args.op,
      before: args.before,
      after: args.after,
      undoneBy: null,
    });
  }

  /** A new row at version 1, with its "create" change. */
  async create<T extends HistoryTable & EventTable>(
    table: T,
    value: Omit<
      WithoutSystemFields<DataModel[T]["document"]>,
      "version" | "deletedAt"
    >,
    actor: Actor,
    options: GroupOptions = {},
  ): Promise<Id<T>> {
    const row = {
      ...(value as Record<string, unknown>),
      version: 1,
      ...(isSoftDelete(table) ? { deletedAt: null } : {}),
    } as unknown as WithoutSystemFields<DataModel[T]["document"]>;
    const id = await this.insert(table, row);
    const after = (await this.ctx.db.get(table, id)) as Record<string, unknown>;
    await this.record({
      table,
      docId: id as Id<HistoryTable>,
      op: "create",
      before: null,
      after,
      actor,
      options,
    });
    return id;
  }

  /** An edit of a demo row, with its "update" change. */
  async update<T extends HistoryTable>(
    table: T,
    id: Id<T>,
    patch: Partial<WithoutSystemFields<DataModel[T]["document"]>>,
    actor: Actor,
    options: GroupOptions = {},
  ): Promise<void> {
    const before = (await this.ctx.db.get(table, id)) as
      (Record<string, unknown> & { version: number }) | null;
    const owner = table === "events" ? before?._id : before?.eventId;
    if (before === null || owner !== this.eventId) {
      throw new Error(`The demo seed can only edit the demo Event's rows.`);
    }
    await this.ctx.db.patch(table, id, {
      ...patch,
      version: before.version + 1,
    } as never);
    const after = (await this.ctx.db.get(table, id)) as Record<string, unknown>;
    await this.record({
      table,
      docId: id as Id<HistoryTable>,
      op: "update",
      before,
      after,
      actor,
      options,
    });
  }

  /** A people change (someone left or was removed), as S1 records it. */
  async people(
    membershipId: Id<"memberships">,
    actor: MemberActor,
    before: Doc<"memberships">,
    after: Doc<"memberships">,
  ) {
    await this.insert("changes", {
      eventId: this.eventId,
      at: this.tick(),
      actor,
      groupKey: null,
      groupLabel: null,
      fromComment: false,
      table: "memberships",
      docId: membershipId,
      op: "people",
      before: peopleSnapshot(before),
      after: peopleSnapshot(after),
      undoneBy: null,
    });
  }
}

// ---------------------------------------------------------------------------
// People

type People = {
  /** By persona key, and by judge name. */
  byKey: Map<string, Id<"memberships">>;
  /** The Owner: judge-owner, or Meera when that setting is missing. */
  host: Id<"memberships">;
};

async function userFor(
  ctx: MutationCtx,
  clerkId: string,
  name: string,
): Promise<Doc<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (existing !== null) return existing;
  // A judge's row is made ahead of their first sign-in, which links it by
  // Clerk ID (`requireIdentity`); a persona's "seed:" ID never signs in.
  const id = await ctx.db.insert("users", {
    clerkId,
    name,
    email: "",
    imageUrl: null,
    mobilePointing: null,
    keepDontReplyOn: false,
  });
  return (await ctx.db.get("users", id))!;
}

/**
 * Whether this is a local backend: `CONVEX_CLOUD_URL` on 127.0.0.1 or
 * localhost, or not set at all (convex-test). Any cloud deployment, dev,
 * preview or production, is not.
 */
function isLocalDeployment(): boolean {
  const url = env.CONVEX_CLOUD_URL;
  if (!url) return true;
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

async function seedPeople(seed: Seeder): Promise<People> {
  const { ctx } = seed;
  const byKey = new Map<string, Id<"memberships">>();
  const join = async (
    user: Doc<"users">,
    key: string,
    displayName: string,
    role: DemoRole,
  ) => {
    const id = await seed.insert("memberships", {
      eventId: seed.eventId,
      userId: user._id,
      role,
      status: "active",
      blocked: false,
      displayName,
      joinedAt: seed.tick(),
      endedAt: null,
    });
    byKey.set(key, id);
    return id;
  };

  seed.at(5);
  for (const judge of DEMO_JUDGES) {
    const clerkId = env[judge.env];
    if (!clerkId) {
      // Without judge-owner the demo Event has no Owner, which production
      // must never quietly have; a local backend can do without.
      if (judge.role === "owner" && !isLocalDeployment()) {
        throw new Error(
          `${judge.env} isn't set on this deployment, so the demo Event would have no Owner. Set it before resetting.`,
        );
      }
      console.warn(
        `${judge.env} isn't set, so ${judge.name} isn't in the demo Event.`,
      );
      continue;
    }
    const user = await userFor(ctx, clerkId, judge.name);
    // Always "judge-member" and so on, never the Clerk name, so the history
    // reads as the demo script says ("Utsavvy for judge-member") and resets
    // either side of a judge's first sign-in agree.
    await join(user, judge.name, judge.name, judge.role);
  }
  for (const persona of DEMO_PERSONAS) {
    const user = await userFor(ctx, personaClerkId(persona.key), persona.name);
    await join(user, persona.key, persona.name, persona.role);
  }
  const host = byKey.get("judge-owner") ?? byKey.get("meera")!;
  return { byKey, host };
}

/** Aditi left and Kabir was removed and blocked, each a people change. */
async function endMemberships(seed: Seeder, people: People) {
  const { ctx } = seed;
  const aditi = people.byKey.get("aditi")!;
  const kabir = people.byKey.get("kabir")!;
  const meera = people.byKey.get("meera")!;

  seed.at(3, 2);
  const aditiBefore = (await ctx.db.get("memberships", aditi))!;
  await ctx.db.patch("memberships", aditi, {
    status: "left",
    endedAt: seed.tick(),
  });
  await seed.people(
    aditi,
    { kind: "member", membershipId: aditi },
    aditiBefore,
    (await ctx.db.get("memberships", aditi))!,
  );

  seed.at(1, 4);
  const kabirBefore = (await ctx.db.get("memberships", kabir))!;
  await ctx.db.patch("memberships", kabir, {
    status: "removed",
    blocked: true,
    endedAt: seed.tick(),
  });
  await seed.people(
    kabir,
    { kind: "member", membershipId: meera },
    kabirBefore,
    (await ctx.db.get("memberships", kabir))!,
  );
}

// ---------------------------------------------------------------------------
// The Canvas and the plan

const member = (membershipId: Id<"memberships">): MemberActor => ({
  kind: "member",
  membershipId,
});

async function seedCanvas(
  seed: Seeder,
  people: People,
): Promise<Record<"budget" | "timeline" | "checklist", Id<"items">>> {
  const actor = member(people.host);
  seed.at(5);
  const sections = new Map<SectionKind, Id<"sections">>();
  for (const section of STARTING_SECTIONS) {
    const id = await seed.create(
      "sections",
      {
        eventId: seed.eventId,
        kind: section.kind,
        name: section.name,
        frame: section.frame,
        order: section.order,
      },
      actor,
    );
    sections.set(section.kind, id);
  }
  const ids = {} as Record<"budget" | "timeline" | "checklist", Id<"items">>;
  for (const item of STARTING_ITEMS) {
    ids[item.kind] = await seed.create(
      "items",
      {
        eventId: seed.eventId,
        sectionId: sections.get(item.section)!,
        kind: item.kind,
        position: item.position,
        size: item.size,
        functionKey: null,
        data: { note: null },
        createdBy: actor,
      },
      actor,
    );
  }
  return ids;
}

async function addLibraryPhoto(
  seed: Seeder,
  photo: LibraryPhoto,
  by: Id<"memberships">,
  functionKey: string | null,
  group: GroupOptions,
) {
  const { sectionId, position } = await placeNewItem(seed.ctx, {
    eventId: seed.eventId,
    kind: "inspiration",
    size: INSPIRATION_CARD_SIZE,
  });
  await seed.create(
    "items",
    {
      eventId: seed.eventId,
      sectionId,
      kind: "inspiration",
      position,
      size: INSPIRATION_CARD_SIZE,
      functionKey,
      createdBy: member(by),
      data: {
        source: {
          kind: "pexels",
          pexelsId: photo.pexelsId,
          localPath: photo.localPath,
          photographer: photo.photographer,
          photographerUrl: photo.photographerUrl,
          pageUrl: photo.pageUrl,
          alt: photo.alt,
          tags: photo.tags,
        },
        addedBy: by,
        memberNote: null,
        seen: {
          description: photo.alt,
          palette: photo.palette,
          decorKeywords: photo.tags,
        },
      },
    },
    member(by),
    group,
  );
}

function libraryPhoto(pexelsId: number): LibraryPhoto {
  const photo = findLibraryPhoto(pexelsId);
  if (photo === null)
    throw new Error(`The stock library has no photo ${pexelsId}.`);
  return photo;
}

/** The vibe pick: Meera's three photos, and the Theme they gave the Event. */
async function seedVibePick(seed: Seeder, people: People) {
  const meera = people.byKey.get("meera")!;
  seed.at(5, 1);
  const photos = VIBE_PICK_PHOTOS.map(libraryPhoto);
  for (const photo of photos) {
    await addLibraryPhoto(seed, photo, meera, null, {
      groupLabel: "The vibe pick",
    });
  }
  const picked = vibeTheme(
    { palette: [], styleWords: [], decorKeywords: [] },
    photos,
  );
  await seed.update(
    "events",
    seed.eventId,
    {
      theme: {
        palette: picked.palette,
        styleWords: [...DEMO_EVENT.styleWords],
        decorKeywords: [...DEMO_EVENT.decorKeywords],
      },
    },
    member(meera),
    { groupLabel: "The vibe pick" },
  );
}

/** The reference-table range for each line: no research, no model call. */
function tableRanges(
  lines: readonly { category: string; unit: string }[],
): (LineEstimate | null)[] {
  const tier = DEMO_EVENT.city.tier;
  return lines.map(({ category, unit }) => {
    const range = tableRange(category, unit, tier);
    return range
      ? { unit, ...range, basis: referenceTableBasis({ unit, ...range, tier }) }
      : null;
  });
}

/** A checklist category booked by a deadline named for another category (as S14). */
const CHECKLIST_LEADS: Record<string, string> = {
  mehendi_artists: "book_makeup_mehendi",
};

type Plan = {
  priced: PricedPlanDraft;
  /** The budget Entries in `planLines` order. */
  budgetIds: Id<"entries">[];
  contingencyId: Id<"entries">;
  sangeetCateringIndex: number;
};

/**
 * The first plan, written as S14's `applyPlan` writes it, for Meera: budget
 * lines, Contingency, the Budget note, deadlines, run sheets, the 14-line
 * Vendor checklist and the 7 Suggestions, all in one history group.
 */
async function seedFirstPlan(
  seed: Seeder,
  people: People,
  items: Record<"budget" | "timeline" | "checklist", Id<"items">>,
  briefFunctions: BriefFunction[],
): Promise<Plan> {
  const { ctx, eventId } = seed;
  const meera = people.byKey.get("meera")!;
  seed.at(5, 2);
  const runId = await seed.insert("runs", {
    eventId,
    requestedBy: meera,
    source: "brief",
    messageId: null,
    commentId: null,
    status: "done",
    stoppedBy: null,
    model: MODELS.default,
    createdAt: seed.tick(),
    startedAt: seed.tick(),
    endedAt: seed.tick() + 60_000,
  });
  const event = (await ctx.db.get("events", eventId))!;
  const input: PlanInput = {
    eventId,
    runId,
    requestedBy: meera,
    event: {
      name: event.name,
      eventType: event.eventType,
      city: { name: DEMO_EVENT.city.name, tier: DEMO_EVENT.city.tier },
      tradition: event.tradition,
      communityKind: null,
      honoree: null,
      households: null,
      budget: DEMO_EVENT.budgetTotal,
      contingencyShare: DEMO_EVENT.contingencyShare,
      theme: event.theme,
      notes: DEMO_BRIEF.notes,
      assumptions: event.brief?.assumptions ?? [],
    },
    functions: briefFunctions,
  };
  const draft = toFirstPlanDraft(DEMO_PLAN_DRAFT, briefFunctions);
  const priced = pricePlanDraft(
    input,
    draft,
    tableRanges(planLinesOf(draft)),
    istDay(seed.now),
  );

  const actor: AssistantActor = {
    kind: "assistant",
    forMembershipId: meera,
    runId,
    proposalId: null,
    acceptedBy: null,
  };
  const group = { groupKey: runId, groupLabel: "The first plan" };

  // Budget lines, then the Contingency (and Unallocated, if any).
  const lines = [
    ...draft.functions.flatMap((fn) =>
      fn.budgetEntries.map((l) => ({
        functionKey: fn.key as string | null,
        l,
      })),
    ),
    ...draft.eventWide.map((l) => ({ functionKey: null, l })),
  ];
  const budgetIds: Id<"entries">[] = [];
  for (const [i, { functionKey, l }] of lines.entries()) {
    budgetIds.push(
      await seed.create(
        "entries",
        {
          eventId,
          itemId: items.budget,
          order: i,
          functionKey,
          kind: "budget",
          fields: {
            label: lineLabel(l.category),
            category: l.category,
            quantity: l.quantity,
            unit: l.unit,
            estimate: priced.lineEstimates[i] ?? null,
            plannedAmount: null,
            role: "line",
            belowUsualRange: priced.belowUsualRange,
            editedByMember: false,
          },
          assumed: priced.lineAssumed[i] ? ["quantity"] : [],
          createdBy: actor,
        },
        actor,
        group,
      ),
    );
  }
  const extra: ["contingency" | "unallocated", string, number][] = [
    ["contingency", "Contingency", priced.budgetCheck.contingency],
  ];
  if (priced.budgetCheck.unallocated > 0)
    extra.push(["unallocated", "Unallocated", priced.budgetCheck.unallocated]);
  const extraIds: Id<"entries">[] = [];
  for (const [j, [role, label, amount]] of extra.entries()) {
    extraIds.push(
      await seed.create(
        "entries",
        {
          eventId,
          itemId: items.budget,
          order: lines.length + j,
          functionKey: null,
          kind: "budget",
          fields: {
            label,
            category: null,
            quantity: 1,
            unit: "per_event",
            estimate: null,
            plannedAmount: amount,
            role,
            belowUsualRange: false,
            editedByMember: false,
          },
          assumed: [],
          createdBy: actor,
        },
        actor,
        group,
      ),
    );
  }
  if (priced.note !== null) {
    await seed.update(
      "items",
      items.budget,
      { data: { note: priced.note } },
      actor,
      group,
    );
  }

  // Deadlines, then each Function's run sheet.
  const deadlineIds: Id<"entries">[] = [];
  for (const [i, d] of draft.deadlines.entries()) {
    const due = priced.deadlines[i]!;
    deadlineIds.push(
      await seed.create(
        "entries",
        {
          eventId,
          itemId: items.timeline,
          order: i,
          functionKey: d.functionKey,
          kind: "timeline",
          fields: {
            title: d.title,
            date: due.date,
            time: null,
            leadKey: d.leadKey,
            priority: due.priority,
            late: due.late,
            note: due.note,
            vendorCategory: d.vendorCategory,
            done: false,
          },
          assumed: [],
          createdBy: actor,
        },
        actor,
        group,
      ),
    );
  }
  let order = draft.deadlines.length;
  for (const fn of draft.functions) {
    for (const row of fn.runSheet) {
      await seed.create(
        "entries",
        {
          eventId,
          itemId: items.timeline,
          order: order++,
          functionKey: fn.key,
          kind: "timeline",
          fields: {
            title: row.label,
            date: null,
            time: row.time,
            leadKey: null,
            priority: null,
            late: false,
            note: null,
            vendorCategory: null,
            done: false,
          },
          assumed: ["time"],
          createdBy: actor,
        },
        actor,
        group,
      );
    }
  }

  // The Vendor checklist, linked to its deadline and budget lines.
  const refs = new Map<string, number[]>();
  let index = 0;
  for (const fn of draft.functions) {
    for (const l of fn.budgetEntries) {
      const key = `${fn.key}:${l.category}`;
      refs.set(key, [...(refs.get(key) ?? []), index++]);
    }
  }
  for (const l of draft.eventWide) {
    const key = `event:${l.category}`;
    refs.set(key, [...(refs.get(key) ?? []), index++]);
  }
  for (const [i, c] of draft.vendorChecklist.entries()) {
    const deadline = draft.deadlines.findIndex(
      (d) =>
        d.vendorCategory === c.category ||
        CHECKLIST_LEADS[c.category] === d.leadKey,
    );
    const budgetEntryIds = [
      ...new Set(
        c.budgetEntryRefs.flatMap((ref) =>
          (refs.get(ref) ?? []).map((k) => budgetIds[k]!),
        ),
      ),
    ];
    await seed.create(
      "entries",
      {
        eventId,
        itemId: items.checklist,
        order: i,
        functionKey: c.functionKeys.length === 1 ? c.functionKeys[0]! : null,
        kind: "checklist",
        fields: {
          vendorCategory: c.category,
          freeLabel: null,
          functionKeys: c.functionKeys,
          bookByEntryId: deadline < 0 ? null : deadlineIds[deadline]!,
          budgetEntryIds,
        },
        assumed: [],
        createdBy: actor,
      },
      actor,
      group,
    );
  }

  // Suggestions, in free space in Money and dates.
  const size = { w: 300, h: 220 };
  for (const [i, idea] of draft.suggestions.entries()) {
    const { sectionId, position } = await placeNewItem(ctx, {
      eventId,
      kind: "suggestion",
      size,
    });
    await seed.create(
      "items",
      {
        eventId,
        sectionId,
        position,
        size,
        functionKey: idea.functionKey,
        kind: "suggestion",
        data: {
          title: idea.title,
          body: idea.body,
          costCategory: idea.costCategory,
          quantity: idea.costCategory === null ? null : (idea.quantity ?? 1),
          estimate: priced.suggestionEstimates[i] ?? null,
          status: "open",
        },
        createdBy: actor,
      },
      actor,
      group,
    );
  }

  // The plan's own Assumptions join the Brief's; the Event is planned.
  const brief = event.brief!;
  await seed.update(
    "events",
    eventId,
    {
      brief: {
        ...brief,
        assumptions: [
          ...brief.assumptions,
          ...draft.assumptions.filter(
            (a) => !brief.assumptions.some((b) => b.field === a.field),
          ),
        ],
      },
      briefState: "planned",
      budgetCheck: priced.budgetCheck,
    },
    actor,
    group,
  );

  const sangeetCateringIndex = lines.findIndex(
    ({ functionKey, l }) =>
      functionKey === SANGEET_CHANGE.functionKey &&
      l.category === SANGEET_CHANGE.cateringCategory,
  );
  return {
    priced,
    budgetIds,
    contingencyId: extraIds[0]!,
    sangeetCateringIndex,
  };
}

async function suggestionByTitle(
  seed: Seeder,
  title: string,
): Promise<Extract<Doc<"items">, { kind: "suggestion" }>> {
  const items = await seed.ctx.db
    .query("items")
    .withIndex("by_event_kind", (q) =>
      q.eq("eventId", seed.eventId).eq("kind", "suggestion"),
    )
    .take(50);
  const found = items.find(
    (i) => i.kind === "suggestion" && i.data.title === title,
  );
  if (found?.kind !== "suggestion") throw new Error(`No Suggestion "${title}"`);
  return found;
}

/** Two Suggestions added to the plan (as S4's "Add to plan") and one dismissed. */
async function seedSuggestionChoices(
  seed: Seeder,
  people: People,
  timelineId: Id<"items">,
) {
  seed.at(3);
  for (const { title, by } of SUGGESTIONS_ADDED) {
    const item = await suggestionByTitle(seed, title);
    const actor = member(people.byKey.get(by)!);
    await seed.create(
      "entries",
      {
        eventId: seed.eventId,
        itemId: timelineId,
        order: await nextOrder(seed.ctx, timelineId),
        functionKey: item.functionKey,
        kind: "timeline",
        fields: {
          title: item.data.title,
          date: null,
          time: null,
          leadKey: null,
          priority: null,
          late: false,
          note: "Added from a Suggestion",
          vendorCategory: null,
          done: false,
        },
        assumed: [],
        createdBy: actor,
      },
      actor,
    );
    await seed.update(
      "items",
      item._id,
      { data: { ...item.data, status: "added" } },
      actor,
    );
  }
  for (const { title, by } of SUGGESTIONS_DISMISSED) {
    const item = await suggestionByTitle(seed, title);
    await seed.update(
      "items",
      item._id,
      { data: { ...item.data, status: "dismissed" } },
      member(people.byKey.get(by)!),
    );
  }
}

/** Rohan's two haldi photos and Aditi's Note, before she left. */
async function seedMemberAdds(seed: Seeder, people: People) {
  const rohan = people.byKey.get("rohan")!;
  const aditi = people.byKey.get("aditi")!;
  seed.at(4);
  for (const pexelsId of HALDI_PHOTOS) {
    await addLibraryPhoto(
      seed,
      libraryPhoto(pexelsId),
      rohan,
      "haldi",
      // A seed-only key, the same on every reset, so the history shows the
      // two photos as one group.
      { groupKey: `${DEMO_KEY}:haldi-photos`, groupLabel: HALDI_PHOTOS_LABEL },
    );
  }
  seed.at(4, 3);
  const size = { w: 300, h: 200 };
  const { sectionId, position } = await placeNewItem(seed.ctx, {
    eventId: seed.eventId,
    kind: "note",
    size,
  });
  await seed.create(
    "items",
    {
      eventId: seed.eventId,
      sectionId,
      kind: "note",
      position,
      size,
      functionKey: "mehendi",
      createdBy: member(aditi),
      data: { text: ADITI_NOTE, citations: [] },
    },
    member(aditi),
  );
}

// ---------------------------------------------------------------------------
// The Chat, the Assistant's later work and the accepted Proposal

async function postMember(
  seed: Seeder,
  threadId: string,
  author: Id<"memberships">,
  text: string,
  dontReply: boolean,
): Promise<string> {
  const { messageId } = await saveMessage(seed.ctx, components.agent, {
    threadId,
    userId: author,
    prompt: text,
  });
  await seed.insert("chatAnnotations", {
    eventId: seed.eventId,
    messageId,
    authorMembershipId: author,
    dontReply,
    mentions: [],
    pointing: [],
    card: null,
  });
  return messageId;
}

/**
 * A seeded Utsavvy reply in its request's turn. A plain reply has no
 * annotation, like a real model reply; one with a card (the Proposal) gets
 * the annotation that shows its card. Either way the model reads it later as
 * text it didn't write: a seeded message has no `finishReason`, so the
 * Assistant's context marks it as not its own words (the fail-closed rule of
 * #117), which is right for text no model generated.
 */
async function postReply(
  seed: Seeder,
  threadId: string,
  promptMessageId: string,
  text: string,
  card: Doc<"chatAnnotations">["card"],
) {
  const { messageId } = await saveMessage(seed.ctx, components.agent, {
    threadId,
    agentName: ASSISTANT_NAME,
    message: { role: "assistant", content: text },
    promptMessageId,
  });
  if (card === null) return;
  await seed.insert("chatAnnotations", {
    eventId: seed.eventId,
    messageId,
    authorMembershipId: null,
    dontReply: false,
    mentions: [],
    pointing: [],
    card,
  });
}

async function doneRun(
  seed: Seeder,
  requestedBy: Id<"memberships">,
  messageId: string,
): Promise<Id<"runs">> {
  const createdAt = seed.tick();
  return await seed.insert("runs", {
    eventId: seed.eventId,
    requestedBy,
    source: "chat",
    messageId,
    commentId: null,
    status: "done",
    stoppedBy: null,
    model: MODELS.default,
    createdAt,
    startedAt: createdAt + 500,
    endedAt: createdAt + 20_000,
  });
}

async function timelineEntries(seed: Seeder, timelineId: Id<"items">) {
  return (
    await seed.ctx.db
      .query("entries")
      .withIndex("by_item", (q) => q.eq("itemId", timelineId))
      .take(500)
  ).filter(
    (e): e is Extract<Doc<"entries">, { kind: "timeline" }> =>
      e.kind === "timeline",
  );
}

/** "Utsavvy for Meera: Plan the sangeet (8 changes)". */
async function seedPlanTheSangeet(
  seed: Seeder,
  people: People,
  threadId: string,
  timelineId: Id<"items">,
) {
  const meera = people.byKey.get("meera")!;
  seed.at(2);
  const messageId = await postMember(
    seed,
    threadId,
    meera,
    PLAN_THE_SANGEET.request,
    false,
  );
  const runId = await doneRun(seed, meera, messageId);
  await postReply(seed, threadId, messageId, PLAN_THE_SANGEET.reply, null);

  const actor: AssistantActor = {
    kind: "assistant",
    forMembershipId: meera,
    runId,
    proposalId: null,
    acceptedBy: null,
  };
  const group = { groupKey: runId, groupLabel: PLAN_THE_SANGEET.label };
  const sangeet = (await timelineEntries(seed, timelineId)).filter(
    (e) => e.functionKey === "sangeet" && e.fields.time !== null,
  );
  for (const { time, title } of PLAN_THE_SANGEET.updates) {
    const row = sangeet.find((e) => e.fields.time === time)!;
    await seed.update(
      "entries",
      row._id,
      { fields: { ...row.fields, title } },
      actor,
      group,
    );
  }
  const runSheetRow = (title: string, time: string) => ({
    title,
    date: null,
    time,
    leadKey: null,
    priority: null,
    late: false,
    note: null,
    vendorCategory: null,
    done: false,
  });
  for (const { time, title } of PLAN_THE_SANGEET.creates) {
    await seed.create(
      "entries",
      {
        eventId: seed.eventId,
        itemId: timelineId,
        order: await nextOrder(seed.ctx, timelineId),
        functionKey: "sangeet",
        kind: "timeline",
        fields: runSheetRow(title, time),
        assumed: ["time"],
        createdBy: actor,
      },
      actor,
      group,
    );
  }
  const { deadline } = PLAN_THE_SANGEET;
  await seed.create(
    "entries",
    {
      eventId: seed.eventId,
      itemId: timelineId,
      order: await nextOrder(seed.ctx, timelineId),
      functionKey: "sangeet",
      kind: "timeline",
      fields: {
        ...runSheetRow(deadline.title, ""),
        time: null,
        date: addDays(istDay(seed.now), deadline.inDays),
        priority: deadline.priority,
        vendorCategory: deadline.vendorCategory,
      },
      assumed: [],
      createdBy: actor,
    },
    actor,
    group,
  );
}

/**
 * The one change from the worked example (section 9.1): Rohan's request for
 * 300 sangeet Guests arrives as a Proposal Meera accepts, then Rohan sets the
 * catering line to ₹2,45,000 and the Contingency takes the difference, so the
 * Event total stays exactly the budget.
 */
async function seedSangeetChange(
  seed: Seeder,
  people: People,
  threadId: string,
  plan: Plan,
  items: Record<"budget" | "timeline" | "checklist", Id<"items">>,
) {
  const { ctx, eventId } = seed;
  const rohan = people.byKey.get("rohan")!;
  const meera = people.byKey.get("meera")!;

  seed.at(1);
  const messageId = await postMember(
    seed,
    threadId,
    rohan,
    SANGEET_GUESTS_PROPOSAL.request,
    false,
  );
  const runId = await doneRun(seed, rohan, messageId);
  const event = (await ctx.db.get("events", eventId))!;
  const createdAt = seed.tick();
  const proposalId = await seed.insert("proposals", {
    eventId,
    runId,
    requestedBy: rohan,
    origin: { kind: "chat" },
    summary: SANGEET_GUESTS_PROPOSAL.summary,
    changes: [
      {
        op: "changeEssential",
        table: "events",
        docId: eventId,
        expectedVersion: event.version,
        guards: [],
        values: {
          field: "guests",
          functionKey: SANGEET_CHANGE.functionKey,
          guests: SANGEET_CHANGE.guests,
        },
      },
    ],
    status: "accepted",
    decidedBy: meera,
    decidedAt: createdAt + 30 * 60 * 1000,
    replacedBy: null,
    expiresAt: createdAt + DAY_MS,
    createdAt,
  });
  await postReply(seed, threadId, messageId, SANGEET_GUESTS_PROPOSAL.reply, {
    kind: "proposal",
    id: proposalId,
  });

  // Meera accepts: the sangeet's Guests and its catering line's plates.
  seed.at(1, 0.5);
  const accepted: AssistantActor = {
    kind: "assistant",
    forMembershipId: rohan,
    runId: null,
    proposalId,
    acceptedBy: meera,
  };
  const group = { groupKey: proposalId };
  const sangeet = (
    await ctx.db
      .query("eventFunctions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(50)
  ).find((fn) => fn.key === SANGEET_CHANGE.functionKey)!;
  await seed.update(
    "eventFunctions",
    sangeet._id,
    {
      guests: SANGEET_CHANGE.guests,
      assumed: sangeet.assumed.filter((field) => field !== "guests"),
    },
    accepted,
    group,
  );

  const cateringId = plan.budgetIds[plan.sangeetCateringIndex]!;
  const catering = (await ctx.db.get("entries", cateringId))!;
  if (catering.kind !== "budget" || catering.fields.estimate === null)
    throw new Error("The sangeet catering line has no Estimate");
  const was = catering.fields.estimate;
  const plates = SANGEET_CHANGE.guests;
  // Same price per plate, now for 300 plates.
  const perPlate = was.amount / catering.fields.quantity;
  const estimate: PricedEstimate = {
    ...was,
    ...lineRange(was.basis, plates),
    amount: perPlate * plates,
  };
  await seed.update(
    "entries",
    cateringId,
    { fields: { ...catering.fields, quantity: plates, estimate }, assumed: [] },
    accepted,
    group,
  );

  // Rohan's own edits: the line's amount, and the Contingency takes the rest.
  seed.at(1, 2);
  const rohanActor = member(rohan);
  const fresh = (await ctx.db.get("entries", cateringId))!;
  if (fresh.kind !== "budget") throw new Error("Not a budget Entry");
  await seed.update(
    "entries",
    cateringId,
    {
      fields: {
        ...fresh.fields,
        plannedAmount: SANGEET_CHANGE.cateringAmount,
        editedByMember: true,
      },
    },
    rohanActor,
  );
  const others = (
    await ctx.db
      .query("entries")
      .withIndex("by_item", (q) => q.eq("itemId", items.budget))
      .take(500)
  ).reduce((sum, e) => {
    if (e.kind !== "budget" || e.deletedAt !== null) return sum;
    if (e.fields.role === "contingency") return sum;
    return sum + (e.fields.plannedAmount ?? e.fields.estimate?.amount ?? 0);
  }, 0);
  const contingency = (await ctx.db.get("entries", plan.contingencyId))!;
  if (contingency.kind !== "budget") throw new Error("Not a budget Entry");
  await seed.update(
    "entries",
    plan.contingencyId,
    {
      fields: {
        ...contingency.fields,
        plannedAmount: DEMO_EVENT.budgetTotal - others,
        editedByMember: true,
      },
    },
    rohanActor,
  );
  await postMember(seed, threadId, rohan, ROHAN_CATERING_NOTE, true);

  // A two-Comment thread on the catering line.
  seed.at(1, 3);
  let rootId: Id<"comments"> | null = null;
  for (const { by, body } of CATERING_THREAD) {
    const createdAt = seed.tick();
    const id: Id<"comments"> = await seed.insert("comments", {
      eventId,
      itemId: items.budget,
      target: { kind: "entry", itemId: items.budget, entryId: cateringId },
      rootId,
      author: {
        kind: "member",
        membershipId: people.byKey.get(by as PersonaKey)!,
      },
      body,
      resolved: false,
      createdAt,
      editedAt: null,
    });
    rootId = rootId ?? id;
  }
}

// ---------------------------------------------------------------------------
// Vendors (S9)

/** The starter Vendor of a category at its place in `seed/jaipur-vendors.json`. */
async function starterVendor(
  ctx: MutationCtx,
  category: Doc<"vendors">["category"],
  nth: number,
): Promise<Doc<"vendors">> {
  const domain = (starterSet as { domain: string; category: string }[]).filter(
    (vendor) => vendor.category === category,
  )[nth]?.domain;
  const vendor =
    domain === undefined
      ? null
      : await ctx.db
          .query("vendors")
          .withIndex("by_domain", (q) => q.eq("domain", domain))
          .unique();
  if (vendor === null)
    throw new Error(`The starter set has no ${category} number ${nth + 1}.`);
  return vendor;
}

/**
 * The Vendor part of the seed (section 9.1): make sure the 16 starter Vendors
 * exist through S9's `loadStarterSetRows` (the body of
 * `internal.vendors.loadStarterSet`, which inserts only a missing Vendor and
 * never rewrites a row, so a Marker a Member moved from any Event stays
 * moved), then shortlist 5 of them with mixed statuses, one Quote on the
 * decorator and Papa's Comment on the first Venue's card. Every demo row goes
 * in through the Seeder, with history like a Member's own shortlisting: the
 * Item and its link at Considering, then the status change, and Booked ticks
 * the checklist Entry's Timeline deadline as `api.vendors.setLinkStatus` does.
 */
async function seedVendors(
  seed: Seeder,
  people: People,
  items: Record<"budget" | "timeline" | "checklist", Id<"items">>,
): Promise<void> {
  const { inserted, pricesAdded } = await loadStarterSetRows(seed.ctx);
  if (inserted > 0 || pricesAdded > 0)
    console.log(
      `Demo reset: added ${inserted} starter Vendors and ${pricesAdded} Listed prices.`,
    );

  const checklist = (
    await seed.ctx.db
      .query("entries")
      .withIndex("by_item", (q) => q.eq("itemId", items.checklist))
      .take(MAX_ROWS)
  ).filter(
    (row): row is Extract<Doc<"entries">, { kind: "checklist" }> =>
      row.kind === "checklist" && row.deletedAt === null,
  );

  seed.at(3);
  const links = new Map<string, Id<"vendorLinks">>();
  let firstVenue: Id<"items"> | null = null;
  for (const pick of DEMO_SHORTLIST) {
    const vendor = await starterVendor(seed.ctx, pick.category, pick.nth);
    const entry = checklist.find(
      (e) =>
        e.fields.vendorCategory === pick.category &&
        (pick.functionKey === null ||
          e.fields.functionKeys.includes(pick.functionKey)),
    );
    if (entry === undefined)
      throw new Error(`The demo checklist has no ${pick.category} Entry.`);
    const actor = member(people.byKey.get(pick.by)!);
    const { sectionId, position } = await placeNewItem(seed.ctx, {
      eventId: seed.eventId,
      kind: "shortlistedVendor",
      size: SHORTLISTED_CARD_SIZE,
    });
    const itemId = await seed.create(
      "items",
      {
        eventId: seed.eventId,
        sectionId,
        kind: "shortlistedVendor",
        position,
        size: SHORTLISTED_CARD_SIZE,
        functionKey: null,
        data: { vendorId: vendor._id },
        createdBy: actor,
      },
      actor,
    );
    const linkId = await seed.create(
      "vendorLinks",
      {
        eventId: seed.eventId,
        shortlistItemId: itemId,
        checklistEntryId: entry._id,
        status: "considering",
      },
      actor,
    );
    if (pick.status !== "considering")
      await seed.update("vendorLinks", linkId, { status: pick.status }, actor);
    if (pick.status === "booked" && entry.fields.bookByEntryId !== null) {
      const deadline = await seed.ctx.db.get(
        "entries",
        entry.fields.bookByEntryId,
      );
      if (deadline?.kind === "timeline" && !deadline.fields.done)
        await seed.update(
          "entries",
          deadline._id,
          { fields: { ...deadline.fields, done: true } },
          actor,
        );
    }
    links.set(pick.category, linkId);
    if (pick.category === "venue") firstVenue ??= itemId;
  }

  // The decorator's Quote, a day before the reset.
  seed.at(1, 1);
  const quoteBy = member(people.byKey.get(DECORATOR_QUOTE.by)!);
  const receivedAt = seed.tick();
  await seed.create(
    "quotes",
    {
      eventId: seed.eventId,
      linkId: links.get("decorator")!,
      amount: DECORATOR_QUOTE.amount,
      unit: DECORATOR_QUOTE.unit,
      functionKeys: [...DECORATOR_QUOTE.functionKeys],
      guests: null,
      receivedAt,
      note: DECORATOR_QUOTE.note,
      fileId: null,
      source: "form",
      createdBy: quoteBy,
      createdAt: seed.tick(),
    },
    quoteBy,
  );

  // Papa's Comment on the first Venue's card.
  seed.at(1, 4);
  await seed.insert("comments", {
    eventId: seed.eventId,
    itemId: firstVenue!,
    target: { kind: "item", itemId: firstVenue! },
    rootId: null,
    author: { kind: "member", membershipId: people.byKey.get("papa")! },
    body: PAPA_VENUE_COMMENT,
    resolved: false,
    createdAt: seed.tick(),
    editedAt: null,
  });
}

// ---------------------------------------------------------------------------
// The reset

/** Midnight IST at the start of a timestamp's IST day. */
function startOfIstDay(timestamp: number): number {
  return Date.parse(`${istDay(timestamp)}T00:00:00+05:30`);
}

async function resetDemo(ctx: MutationCtx): Promise<void> {
  // The seed's clock counts back from the start of today in IST, so every
  // reset on the same day writes the same Event, timestamps included.
  const now = startOfIstDay(Date.now());
  const existing = await findDemoEvent(ctx);
  const deleted = existing === null ? 0 : await clearEvent(ctx, existing);

  const threadId = await createThread(ctx, components.agent, {
    title: DEMO_EVENT.name,
  });
  const { functions: briefFunctions, assumptions } = assumeFunctionDetails({
    eventType: "wedding",
    date: DEMO_BRIEF.date,
    guests: DEMO_BRIEF.guests,
    tradition: DEMO_BRIEF.tradition,
    honoree: null,
    communityKind: null,
    functionKeys: [...DEMO_FUNCTION_KEYS],
    children: null,
    today: istDay(now),
  });
  const fields: WithoutSystemFields<Doc<"events">> = {
    name: DEMO_EVENT.name,
    eventType: "wedding",
    ownerLabel: DEMO_EVENT.ownerLabel,
    city: {
      name: DEMO_EVENT.city.name,
      tier: DEMO_EVENT.city.tier,
      centre: { ...DEMO_EVENT.city.centre },
    },
    tradition: DEMO_EVENT.tradition,
    communityKind: null,
    honoree: null,
    households: null,
    budgetTotal: DEMO_EVENT.budgetTotal,
    contingencyShare: DEMO_EVENT.contingencyShare,
    theme: { palette: [], styleWords: [], decorKeywords: [] },
    briefState: "summary",
    brief: { extraction: DEMO_BRIEF, assumptions },
    budgetCheck: null,
    uploadRightsOn: false,
    defaults: {
      view: "canvas",
      compactGrouping: "kind",
      mobilePointing: "jump",
    },
    startingSectionRenameBlocked: false,
    agentThreadId: threadId,
    demoKey: DEMO_KEY,
    createdAt: now - 5 * DAY_MS,
    version: 1,
  };
  let eventId: Id<"events">;
  if (existing === null) {
    eventId = await ctx.db.insert("events", fields);
  } else {
    eventId = existing._id;
    await ctx.db.replace("events", eventId, fields);
  }

  const seed = new Seeder(ctx, eventId, now);
  const people = await seedPeople(seed);
  for (const role of ["member", "viewer"] as const) {
    await seed.insert("inviteLinks", {
      eventId,
      role,
      token: newInviteToken(),
      createdBy: people.host,
      createdAt: seed.tick(),
    });
  }
  for (const [order, fn] of briefFunctions.entries()) {
    await seed.insert("eventFunctions", {
      eventId,
      key: fn.key,
      name: fn.name,
      date: fn.date,
      guests: fn.guests,
      assumed: [...fn.assumed],
      order,
      version: 1,
    });
  }

  const items = await seedCanvas(seed, people);
  await seedVibePick(seed, people);
  const plan = await seedFirstPlan(seed, people, items, briefFunctions);
  await seedMemberAdds(seed, people);
  await seedSuggestionChoices(seed, people, items.timeline);
  await seedPlanTheSangeet(seed, people, threadId, items.timeline);
  await seedSangeetChange(seed, people, threadId, plan, items);
  await seedVendors(seed, people, items);
  await endMemberships(seed, people);
  console.log(
    `Demo reset: deleted ${deleted} rows, inserted ${seed.inserted} rows (Agent messages and new users not counted).`,
  );
}

/** Resets the demo Event, daily at 03:00 IST and with `bunx convex run demo:reset`. */
export const reset = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await resetDemo(ctx);
    return null;
  },
});

/**
 * Whether an Event is the seeded demo Event, for its banner. False for anyone
 * who can't see the Event and for a string that isn't an Event ID.
 */
export const isDemo = query({
  args: { eventId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) return false;
    try {
      await requireAccess(ctx, eventId, "canvas.view");
    } catch (error) {
      if (error instanceof AccessDenied) return false;
      throw error;
    }
    const event = await ctx.db.get("events", eventId);
    return event !== null && event.demoKey === DEMO_KEY;
  },
});

// ---------------------------------------------------------------------------
// Local browser checks only (S19b, e2e/demo-path.spec.ts)

function refuseOutsideLocal() {
  const url = env.CONVEX_CLOUD_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Only for a local Convex deployment");
  }
}

const SCHEDULED_PAGE = 200;

/** Whether a scheduled call is `internal.nudges.check` and hasn't finished. */
function isPendingNudgeCheck(
  call: { name: string; args: unknown[]; state: { kind: string } },
  eventId: Id<"events">,
): boolean {
  if (!/^nudges(\.js)?:check$/.test(call.name)) return false;
  if (call.state.kind !== "pending" && call.state.kind !== "inProgress")
    return false;
  const [args] = call.args as [{ eventId?: string } | undefined];
  return args?.eventId === eventId;
}

/** The demo Event's ID, Nudges and Chat, oldest message first. */
export const demoStateForLocalCheck = internalQuery({
  args: {},
  returns: v.object({
    eventId: v.id("events"),
    nudges: v.number(),
    chat: v.array(v.object({ role: v.string(), text: v.string() })),
  }),
  handler: async (ctx) => {
    refuseOutsideLocal();
    const event = await ctx.db
      .query("events")
      .withIndex("by_demoKey", (q) => q.eq("demoKey", DEMO_KEY))
      .unique();
    if (event === null || event.agentThreadId === null)
      throw new Error("Run demo:reset first");
    const nudges = await ctx.db
      .query("nudges")
      .withIndex("by_event_trigger_target_day", (q) =>
        q.eq("eventId", event._id),
      )
      .take(MAX_ROWS);
    const { page } = await listMessages(ctx, components.agent, {
      threadId: event.agentThreadId,
      paginationOpts: { cursor: null, numItems: 100 },
    });
    return {
      eventId: event._id,
      nudges: nudges.length,
      chat: page
        .map((m) => ({ role: m.message?.role ?? "", text: m.text ?? "" }))
        .reverse(),
    };
  },
});

/** One page of scheduled calls: how many are the Event's unfinished Nudge checks. */
export const pendingNudgeChecksPageForLocalCheck = internalQuery({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    pending: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { eventId, paginationOpts }) => {
    refuseOutsideLocal();
    const result = await ctx.db.system
      .query("_scheduled_functions")
      .paginate(paginationOpts);
    return {
      pending: result.page.filter((call) => isPendingNudgeCheck(call, eventId))
        .length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * What the demo Event holds straight after a reset, for the demo-path browser
 * test (issue #53): its unfinished `internal.nudges.check` calls, counted
 * over every scheduled call a page at a time, its Nudges, and its Chat oldest
 * first. Refuses anything but a local deployment.
 */
export const afterResetForLocalCheck = internalAction({
  args: {},
  returns: v.object({
    eventId: v.id("events"),
    pendingNudgeChecks: v.number(),
    nudges: v.number(),
    chat: v.array(v.object({ role: v.string(), text: v.string() })),
  }),
  handler: async (
    ctx,
  ): Promise<{
    eventId: Id<"events">;
    pendingNudgeChecks: number;
    nudges: number;
    chat: { role: string; text: string }[];
  }> => {
    refuseOutsideLocal();
    const state: {
      eventId: Id<"events">;
      nudges: number;
      chat: { role: string; text: string }[];
    } = await ctx.runQuery(internal.demo.demoStateForLocalCheck, {});
    let pendingNudgeChecks = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: { pending: number; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(internal.demo.pendingNudgeChecksPageForLocalCheck, {
          eventId: state.eventId,
          paginationOpts: { cursor, numItems: SCHEDULED_PAGE },
        });
      pendingNudgeChecks += page.pending;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return { ...state, pendingNudgeChecks };
  },
});

/**
 * The 1:05 beat's cuts without a chat model: the stub answers "Suggest cuts"
 * with text only, so this answers the Member's latest Nudge request through
 * the real `propose` path. The cuts take Outfits and Invitations to their
 * Estimates' low end (₹42,000 freed), which brings the Budget back within its
 * ₹25,00,000 after the ₹2.85L Quote, and leaves the decor alone, as Meera
 * asked on the catering line. Refuses anything but a local deployment.
 */
export const cutsForLocalCheck = internalMutation({
  args: { email: v.string() },
  returns: v.object({ proposalId: v.id("proposals") }),
  handler: async (ctx, { email }): Promise<{ proposalId: Id<"proposals"> }> => {
    refuseOutsideLocal();
    const event = await findDemoEvent(ctx);
    if (event === null) throw new Error("Run demo:reset first");
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .first();
    const membership =
      user &&
      (await ctx.db
        .query("memberships")
        .withIndex("by_event_user", (q) =>
          q.eq("eventId", event._id).eq("userId", user._id),
        )
        .unique());
    if (!membership) throw new Error(`${email} is not in the demo Event`);
    const asked = (
      await ctx.db
        .query("runs")
        .withIndex("by_event_created", (q) => q.eq("eventId", event._id))
        .order("desc")
        .take(20)
    ).find((r) => r.source === "nudge" && r.requestedBy === membership._id);
    if (asked === undefined)
      throw new Error('Tap "Suggest cuts" on the Nudge first');

    const budget = (
      await ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", event._id).eq("kind", "budget"),
        )
        .take(5)
    ).find((item) => item.deletedAt === null);
    if (!budget) throw new Error("The demo Event has no Budget");
    const lines = await ctx.db
      .query("entries")
      .withIndex("by_item", (q) => q.eq("itemId", budget._id))
      .take(500);
    const cut = (label: string) => {
      const line = lines.find(
        (e) =>
          e.kind === "budget" &&
          e.deletedAt === null &&
          e.fields.label === label,
      );
      if (!line) throw new Error(`No ${label} line on the demo Budget`);
      return {
        op: "updateEntry" as const,
        entryId: line._id,
        expectedVersion: line.version,
        patch: {
          kind: "budget" as const,
          amount: { estimateLow: true as const },
        },
      };
    };

    const runId = await ctx.db.insert("runs", {
      eventId: event._id,
      requestedBy: membership._id,
      source: "nudge",
      // The stub has already answered the Nudge's request; a run on that
      // message would fold the card into its reply, so this one stands alone.
      messageId: null,
      commentId: null,
      status: "running",
      stoppedBy: null,
      model: STUB_MODEL,
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: null,
    });
    const result: ToolResult = await ctx.runMutation(
      internal.proposals.proposeForRun,
      {
        runId,
        eventId: event._id,
        forMembershipId: membership._id,
        toolCallId: "check_cuts",
        summary:
          "Bring Outfits and Invitations to the low end of their Estimates",
        replaces: null,
        changes: [cut("Outfits"), cut("Invitations")],
      },
    );
    await ctx.db.patch("runs", runId, { status: "done", endedAt: Date.now() });
    if (!result.ok) throw new Error(result.message);
    return { proposalId: result.proposalId as Id<"proposals"> };
  },
});
