/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assistant_agent from "../assistant/agent.js";
import type * as assistant_amounts from "../assistant/amounts.js";
import type * as assistant_instructions from "../assistant/instructions.js";
import type * as assistant_outside from "../assistant/outside.js";
import type * as assistant_tools_core from "../assistant/tools/core.js";
import type * as assistant_tools_images from "../assistant/tools/images.js";
import type * as assistant_tools_index from "../assistant/tools/index.js";
import type * as assistant_tools_propose from "../assistant/tools/propose.js";
import type * as assistant_tools_quotes from "../assistant/tools/quotes.js";
import type * as assistant_tools_vendors from "../assistant/tools/vendors.js";
import type * as brief from "../brief.js";
import type * as canvas from "../canvas.js";
import type * as chat from "../chat.js";
import type * as commentAsks from "../commentAsks.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as entries from "../entries.js";
import type * as estimates from "../estimates.js";
import type * as events from "../events.js";
import type * as googlePlaces from "../googlePlaces.js";
import type * as history from "../history.js";
import type * as inspirations from "../inspirations.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_hooks from "../lib/hooks.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_proposalOps from "../lib/proposalOps.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_toolStub from "../lib/toolStub.js";
import type * as lib_vendors from "../lib/vendors.js";
import type * as lib_write from "../lib/write.js";
import type * as map from "../map.js";
import type * as notes from "../notes.js";
import type * as nudges from "../nudges.js";
import type * as people from "../people.js";
import type * as plan from "../plan.js";
import type * as planEssentials from "../planEssentials.js";
import type * as proposals from "../proposals.js";
import type * as quotes from "../quotes.js";
import type * as references from "../references.js";
import type * as runs from "../runs.js";
import type * as suggestions from "../suggestions.js";
import type * as users from "../users.js";
import type * as vendors from "../vendors.js";
import type * as vibePick from "../vibePick.js";
import type * as viewPrefs from "../viewPrefs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "assistant/agent": typeof assistant_agent;
  "assistant/amounts": typeof assistant_amounts;
  "assistant/instructions": typeof assistant_instructions;
  "assistant/outside": typeof assistant_outside;
  "assistant/tools/core": typeof assistant_tools_core;
  "assistant/tools/images": typeof assistant_tools_images;
  "assistant/tools/index": typeof assistant_tools_index;
  "assistant/tools/propose": typeof assistant_tools_propose;
  "assistant/tools/quotes": typeof assistant_tools_quotes;
  "assistant/tools/vendors": typeof assistant_tools_vendors;
  brief: typeof brief;
  canvas: typeof canvas;
  chat: typeof chat;
  commentAsks: typeof commentAsks;
  comments: typeof comments;
  crons: typeof crons;
  demo: typeof demo;
  entries: typeof entries;
  estimates: typeof estimates;
  events: typeof events;
  googlePlaces: typeof googlePlaces;
  history: typeof history;
  inspirations: typeof inspirations;
  "lib/access": typeof lib_access;
  "lib/errors": typeof lib_errors;
  "lib/hooks": typeof lib_hooks;
  "lib/idempotency": typeof lib_idempotency;
  "lib/models": typeof lib_models;
  "lib/proposalOps": typeof lib_proposalOps;
  "lib/settings": typeof lib_settings;
  "lib/time": typeof lib_time;
  "lib/toolStub": typeof lib_toolStub;
  "lib/vendors": typeof lib_vendors;
  "lib/write": typeof lib_write;
  map: typeof map;
  notes: typeof notes;
  nudges: typeof nudges;
  people: typeof people;
  plan: typeof plan;
  planEssentials: typeof planEssentials;
  proposals: typeof proposals;
  quotes: typeof quotes;
  references: typeof references;
  runs: typeof runs;
  suggestions: typeof suggestions;
  users: typeof users;
  vendors: typeof vendors;
  vibePick: typeof vibePick;
  viewPrefs: typeof viewPrefs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
