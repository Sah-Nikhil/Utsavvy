import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { actorValidator } from "../lib/types/actors";
import {
  briefValidator,
  cityTierValidator,
  eventTypeValidator,
  functionDateValidator,
  honoreeValidator,
  themeValidator,
} from "../lib/types/brief";
import {
  commentTargetValidator,
  entryValidator,
  frameValidator,
  itemValidator,
  sectionKindValidator,
  selectionTargetValidator,
} from "../lib/types/canvas";
import {
  budgetCheckValidator,
  listedPriceUnitValidator,
  quoteUnitValidator,
} from "../lib/types/estimates";
import {
  changeOpValidator,
  historyDocIdValidator,
  historyTableValidator,
} from "../lib/types/history";
import {
  proposalOriginValidator,
  proposedChangeValidator,
} from "../lib/types/proposals";
import {
  inviteRoleValidator,
  membershipStatusValidator,
  roleValidator,
} from "../lib/types/roles";

/**
 * Every v1 table from IMPLEMENTATION_PLAN.md sections 5.1 to 5.5. Tables with a
 * `version` are versioned: every write through `convex/lib/write.ts` bumps it.
 * Every table with an `eventId` is reached only through `requireAccess`.
 */
export default defineSchema({
  // 5.1 People and Events -----------------------------------------------------

  users: defineTable({
    /** Clerk's user ID (the JWT subject). Seed personas use "seed:<name>", which can never sign in. */
    clerkId: v.string(),
    name: v.string(),
    /** Lowercase. */
    email: v.string(),
    imageUrl: v.union(v.string(), v.null()),
    mobilePointing: v.union(v.literal("jump"), v.literal("sheet"), v.null()),
    /** X4. */
    keepDontReplyOn: v.boolean(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  events: defineTable({
    name: v.string(),
    eventType: eventTypeValidator,
    ownerLabel: v.union(v.literal("owner"), v.literal("host")),
    city: v.union(
      v.object({
        name: v.string(),
        tier: cityTierValidator,
        centre: v.union(
          v.object({ lat: v.number(), lng: v.number() }),
          v.null(),
        ),
      }),
      v.null(),
    ),
    tradition: v.union(v.string(), v.null()),
    communityKind: v.union(v.string(), v.null()),
    honoree: v.union(honoreeValidator, v.null()),
    households: v.union(v.number(), v.null()),
    budgetTotal: v.union(v.number(), v.null()),
    /** 0.10 unless Members change it. */
    contingencyShare: v.number(),
    theme: themeValidator,
    briefState: v.union(
      v.literal("intake"),
      v.literal("summary"),
      v.literal("planning"),
      v.literal("planned"),
    ),
    brief: v.union(briefValidator, v.null()),
    budgetCheck: v.union(budgetCheckValidator, v.null()),
    uploadRightsOn: v.boolean(),
    defaults: v.object({
      view: v.union(v.literal("canvas"), v.literal("compact")),
      compactGrouping: v.union(v.literal("kind"), v.literal("function")),
      mobilePointing: v.union(v.literal("jump"), v.literal("sheet")),
    }),
    startingSectionRenameBlocked: v.boolean(),
    memberLinkToken: v.string(),
    viewerLinkToken: v.string(),
    agentThreadId: v.union(v.string(), v.null()),
    demoKey: v.union(v.string(), v.null()),
    createdAt: v.number(),
    version: v.number(),
  })
    .index("by_memberLinkToken", ["memberLinkToken"])
    .index("by_viewerLinkToken", ["viewerLinkToken"])
    .index("by_demoKey", ["demoKey"]),

  /** Personal view state: written directly, not versioned, no history (section 4.4). */
  viewPrefs: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    /** null follows the Event default. */
    grouping: v.union(v.literal("kind"), v.literal("function"), v.null()),
    /** Item IDs in the person's order, per group key. */
    order: v.array(
      v.object({ group: v.string(), itemIds: v.array(v.id("items")) }),
    ),
    collapsed: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_event_user", ["eventId", "userId"]),

  memberships: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    role: roleValidator,
    status: membershipStatusValidator,
    blocked: v.boolean(),
    displayName: v.string(),
    joinedAt: v.number(),
    endedAt: v.union(v.number(), v.null()),
  })
    // Kept beside by_event_user for its join order (_creationTime), as section 5.1 lists it.
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes
    .index("by_event", ["eventId"])
    .index("by_user", ["userId"])
    .index("by_event_user", ["eventId", "userId"]),

  /** Built in X5; defined now because the 25-person cap counts pending invites. */
  emailInvites: defineTable({
    eventId: v.id("events"),
    email: v.string(),
    role: inviteRoleValidator,
    invitedBy: v.id("memberships"),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_email", ["email"]),

  /** Named eventFunctions because "functions" means something else in Convex. */
  eventFunctions: defineTable({
    eventId: v.id("events"),
    key: v.string(),
    name: v.string(),
    date: v.union(functionDateValidator, v.null()),
    guests: v.union(v.number(), v.null()),
    /** Names of fields still assumed. */
    assumed: v.array(v.string()),
    order: v.number(),
    version: v.number(),
  }).index("by_event", ["eventId"]),

  // 5.2 The Canvas ------------------------------------------------------------

  sections: defineTable({
    eventId: v.id("events"),
    kind: sectionKindValidator,
    name: v.string(),
    frame: frameValidator,
    order: v.number(),
    version: v.number(),
    deletedAt: v.union(v.number(), v.null()),
  }).index("by_event", ["eventId"]),

  items: defineTable(itemValidator)
    // Kept beside by_event_kind for creation order, as section 5.2 lists it.
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes
    .index("by_event", ["eventId"])
    .index("by_event_kind", ["eventId", "kind"])
    .index("by_section", ["sectionId"]),

  entries: defineTable(entryValidator)
    .index("by_item", ["itemId"])
    .index("by_event_kind", ["eventId", "kind"]),

  comments: defineTable({
    eventId: v.id("events"),
    /** The Item the target sits on (an Entry's own Item), for the by_item index. */
    itemId: v.id("items"),
    target: commentTargetValidator,
    /** null for the first Comment in a thread. */
    rootId: v.union(v.id("comments"), v.null()),
    author: v.union(
      v.object({
        kind: v.literal("member"),
        membershipId: v.id("memberships"),
      }),
      v.object({
        kind: v.literal("assistant"),
        runId: v.id("runs"),
        forMembershipId: v.id("memberships"),
      }),
    ),
    body: v.string(),
    resolved: v.boolean(),
    createdAt: v.number(),
    editedAt: v.union(v.number(), v.null()),
  })
    .index("by_event", ["eventId"])
    .index("by_item", ["itemId"])
    .index("by_root", ["rootId"]),

  /** The Assistant's pointing. Everyone sees it; only the asker's view pans. */
  highlights: defineTable({
    eventId: v.id("events"),
    runId: v.id("runs"),
    forMembershipId: v.id("memberships"),
    targets: v.array(selectionTargetValidator),
    expiresAt: v.number(),
  }).index("by_event", ["eventId"]),

  // 5.3 Vendors: the shared layer (ADR 0008) ---------------------------------
  // Optional fields match seed/jaipur-vendors.json (D2), which leaves out what a site doesn't state.

  vendors: defineTable({
    /** Unique: the own site's domain, or instagram.com/<handle>. */
    domain: v.string(),
    name: v.string(),
    category: v.union(
      v.literal("venue"),
      v.literal("caterer"),
      v.literal("decorator"),
      v.literal("photographer"),
    ),
    /** null for an Instagram-only Vendor. */
    website: v.union(v.string(), v.null()),
    /** The Instagram profile, for an Instagram-only Vendor only. */
    profileUrl: v.optional(v.string()),
    address: v.optional(
      v.object({ line: v.string(), locality: v.string(), city: v.string() }),
    ),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    /** Guests; `min` only when the site states one. */
    capacity: v.optional(
      v.object({ min: v.optional(v.number()), max: v.number() }),
    ),
    areaServed: v.optional(v.string()),
    /** The Assistant's own words. */
    summary: v.string(),
    marker: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
        confidence: v.number(),
        matchType: v.string(),
        approximate: v.boolean(),
        provider: v.string(),
        attribution: v.string(),
      }),
    ),
    /** One entry per filled field. */
    provenance: v.array(
      v.object({
        field: v.string(),
        kind: v.union(
          v.literal("ownSite"),
          v.literal("instagramProfileHumanChecked"),
        ),
        url: v.string(),
        /** The exact, quote-checked sentence; null for instagramProfileHumanChecked. */
        sentence: v.union(v.string(), v.null()),
        /** ISO day seen or checked. */
        seenAt: v.string(),
        /** "Sah-Nikhil" for instagramProfileHumanChecked, otherwise null. */
        confirmedBy: v.union(v.literal("Sah-Nikhil"), v.null()),
      }),
    ),
    factsSeenAt: v.string(),
    source: v.union(
      v.literal("starterSet"),
      v.literal("discovery"),
      v.literal("pastedUrl"),
    ),
    version: v.number(),
  })
    .index("by_domain", ["domain"])
    .index("by_city_category", ["address.city", "category"]),

  /** Never overwritten; a refresh adds rows. */
  listedPrices: defineTable({
    vendorId: v.id("vendors"),
    sourceUrl: v.string(),
    sentence: v.string(),
    /** ISO day. */
    seenAt: v.string(),
    comparable: v.boolean(),
    amount: v.optional(v.object({ min: v.number(), max: v.number() })),
    unit: v.optional(listedPriceUnitValidator),
    qualifier: v.optional(
      v.union(v.literal("exact"), v.literal("approx"), v.literal("starting")),
    ),
    diet: v.optional(
      v.union(v.literal("veg"), v.literal("non-veg"), v.literal("either")),
    ),
    guestRange: v.optional(v.object({ min: v.number(), max: v.number() })),
    inclusionsNote: v.optional(v.string()),
    text: v.string(),
    supersededAt: v.union(v.number(), v.null()),
  }).index("by_vendor", ["vendorId"]),

  // 5.3 Vendors: private to one Event ----------------------------------------

  /** One per Shortlisted Vendor and checklist Entry pair. */
  vendorLinks: defineTable({
    eventId: v.id("events"),
    shortlistItemId: v.id("items"),
    checklistEntryId: v.id("entries"),
    status: v.union(
      v.literal("considering"),
      v.literal("contacted"),
      v.literal("quoted"),
      v.literal("booked"),
      v.literal("dropped"),
    ),
    version: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_item", ["shortlistItemId"])
    .index("by_entry", ["checklistEntryId"]),

  /** The newest per link is current. Never pooled. Versioned so Restore can track it. */
  quotes: defineTable({
    eventId: v.id("events"),
    linkId: v.id("vendorLinks"),
    amount: v.number(),
    unit: quoteUnitValidator,
    functionKeys: v.array(v.string()),
    guests: v.union(v.number(), v.null()),
    receivedAt: v.union(v.number(), v.null()),
    note: v.union(v.string(), v.null()),
    fileId: v.union(v.id("_storage"), v.null()),
    source: v.union(v.literal("form"), v.literal("chatPaste")),
    createdBy: actorValidator,
    createdAt: v.number(),
    version: v.number(),
  })
    .index("by_link", ["linkId"])
    .index("by_event", ["eventId"]),

  // 5.4 Chat, runs and Proposals ---------------------------------------------
  // Message text and streaming live in the Agent component (@convex-dev/agent), one thread per Event.

  /** Our metadata on top of the Agent's messages. */
  chatAnnotations: defineTable({
    eventId: v.id("events"),
    /** The Agent component's message ID. */
    messageId: v.string(),
    authorMembershipId: v.union(v.id("memberships"), v.null()),
    dontReply: v.boolean(),
    mentions: v.array(v.id("memberships")),
    pointing: v.array(selectionTargetValidator),
    card: v.union(
      v.object({
        kind: v.union(
          v.literal("proposal"),
          v.literal("stockStrip"),
          v.literal("vendorCards"),
          v.literal("nudge"),
          v.literal("briefChips"),
          v.literal("briefSummary"),
          v.literal("planProgress"),
          v.literal("citations"),
          v.literal("system"),
        ),
        /** The card's own record, such as a Proposal ID, when it has one. */
        id: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
  })
    .index("by_event", ["eventId"])
    .index("by_message", ["messageId"]),

  /** One running per Event. */
  runs: defineTable({
    eventId: v.id("events"),
    requestedBy: v.id("memberships"),
    source: v.union(
      v.literal("chat"),
      v.literal("comment"),
      v.literal("nudge"),
      v.literal("brief"),
    ),
    messageId: v.union(v.string(), v.null()),
    commentId: v.union(v.id("comments"), v.null()),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("stopping"),
      v.literal("done"),
      v.literal("stopped"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    stoppedBy: v.union(v.id("memberships"), v.null()),
    model: v.string(),
    createdAt: v.number(),
    startedAt: v.union(v.number(), v.null()),
    endedAt: v.union(v.number(), v.null()),
  })
    .index("by_event_status", ["eventId", "status"])
    .index("by_event_created", ["eventId", "createdAt"]),

  /** Idempotency: `key` is `runId:toolCallId` (see convex/lib/idempotency.ts). */
  toolCalls: defineTable({
    key: v.string(),
    result: v.any(),
    at: v.number(),
  }).index("by_key", ["key"]),

  /** Stored apart from the changes it applies (ADR 0009). */
  proposals: defineTable({
    eventId: v.id("events"),
    /** null for a Proposal from a Brief edit. */
    runId: v.union(v.id("runs"), v.null()),
    requestedBy: v.id("memberships"),
    origin: proposalOriginValidator,
    summary: v.string(),
    changes: v.array(proposedChangeValidator),
    status: v.union(
      v.literal("open"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("replaced"),
      v.literal("outOfDate"),
      v.literal("expired"),
    ),
    decidedBy: v.union(v.id("memberships"), v.null()),
    decidedAt: v.union(v.number(), v.null()),
    replacedBy: v.union(v.id("proposals"), v.null()),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_event_status", ["eventId", "status"]),

  /** At most one per trigger per target per IST day. */
  nudges: defineTable({
    eventId: v.id("events"),
    trigger: v.union(
      v.literal("budgetOver"),
      v.literal("dueSoon"),
      v.literal("newInspiration"),
    ),
    targetId: v.string(),
    /** IST day, "YYYY-MM-DD" (convex/lib/time.ts). */
    dayIst: v.string(),
    messageId: v.union(v.string(), v.null()),
  }).index("by_event_trigger_target_day", [
    "eventId",
    "trigger",
    "targetId",
    "dayIst",
  ]),

  /** The edit history. People changes are rows too. */
  changes: defineTable({
    eventId: v.id("events"),
    at: v.number(),
    actor: actorValidator,
    /** The run or Proposal the change belongs to; null for a Member's own edit. */
    groupKey: v.union(v.string(), v.null()),
    groupLabel: v.union(v.string(), v.null()),
    fromComment: v.boolean(),
    table: v.union(historyTableValidator, v.literal("memberships")),
    docId: v.union(historyDocIdValidator, v.id("memberships")),
    op: changeOpValidator,
    before: v.any(),
    after: v.any(),
    undoneBy: v.union(v.id("changes"), v.null()),
  })
    .index("by_event_at", ["eventId", "at"])
    .index("by_doc", ["docId"])
    .index("by_group", ["groupKey"]),

  // 5.5 Caches ----------------------------------------------------------------

  /**
   * App-wide researched ranges (ADR 0013). No Event data, so no eventId and no
   * requireAccess; only internal functions read or write it. A newer row for
   * the same key wins, and a read ignores expired rows.
   */
  estimateCache: defineTable({
    /** The city name, lowercased and trimmed. */
    cityKey: v.string(),
    category: v.string(),
    unit: v.string(),
    unitLow: v.number(),
    unitHigh: v.number(),
    sourceUrls: v.array(v.string()),
    reasoning: v.string(),
    searchedAt: v.number(),
    model: v.string(),
    expiresAt: v.number(),
  }).index("by_city_category_unit", ["cityKey", "category", "unit"]),
});
