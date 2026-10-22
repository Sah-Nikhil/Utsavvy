/**
 * Tunable thresholds and limits in one place. Changing one is a contract
 * change, not a slice's own edit.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** When a direct Assistant change must become a Proposal instead (IMPLEMENTATION_PLAN.md section 6). */
export const PROPOSAL_THRESHOLDS = {
  /** Shifting more than this share of the Budget total. */
  budgetShiftShare: 0.1,
  /** Touching more than this many Entries or Items. */
  maxDirectTouches: 5,
} as const;

/** An open Proposal expires this long after it was posted (S10). */
export const PROPOSAL_EXPIRY_MS = 24 * HOUR_MS;

/** Any Member may stop a reply after this long; the asker can stop it at once (S5). */
export const STOP_BY_ANYONE_AFTER_MS = 30 * 1000;

/** The Assistant's pointing highlight lasts this long (S7). */
export const HIGHLIGHT_TTL_MS = 30 * 1000;

/** Generated images and Remixes per Event per IST day (X3b). */
export const IMAGE_GENERATIONS_PER_DAY = 20;

/** Discovery runs per Event per IST day (X1). */
export const DISCOVERY_RUNS_PER_DAY = 10;

/** Stored files are purged this long after their Inspiration was deleted (S13). */
export const DELETED_FILE_PURGE_AFTER_MS = 30 * DAY_MS;

/** A geocoded Marker below this confidence shows as approximate (docs/design/vendors.md). */
export const MARKER_APPROXIMATE_BELOW_CONFIDENCE = 0.8;

/** The estimate cascade's limits (section 4.14, ADR 0013); tuned with the scripted cases. */
export const ESTIMATE_LIMITS = {
  /** Web searches per call of `estimateLines`. */
  maxSearchesPerCall: 8,
  /** After this, unfinished lines fall through to the reference table. */
  researchTimeLimitMs: 20 * 1000,
  /** How long an `estimateCache` row stays fresh. */
  cacheTtlMs: 24 * HOUR_MS,
} as const;

/** Chat web search: at most this many searches per reply, Claude only (section 4.5). */
export const CHAT_WEB_SEARCHES_PER_REPLY = 3;

/** People per Event, pending email invites included (docs/design/roles.md). */
export const MAX_PEOPLE_PER_EVENT = 25;

/** The Contingency's default share of the rest of the Budget. */
export const DEFAULT_CONTINGENCY_SHARE = 0.1;
