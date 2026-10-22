import agent from "@convex-dev/agent/convex.config";
import presence from "@convex-dev/presence/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * The app's components and its typed environment variables
 * (IMPLEMENTATION_PLAN.md section 4.11). Read them with `env` from
 * `./_generated/server`, not `process.env`. All are optional so a fresh
 * preview deployment starts without them; code that needs one refuses clearly.
 */
const app = defineApp({
  env: {
    /** Default model, `claude-sonnet-5-5`; switch to `gemini-3.8-flash` without a deploy. */
    DEFAULT_MODEL: v.optional(v.string()),
    /** Helper model, `claude-haiku-5-5`. */
    HELPER_MODEL: v.optional(v.string()),
    ANTHROPIC_API_KEY: v.optional(v.string()),
    GOOGLE_GENERATIVE_AI_API_KEY: v.optional(v.string()),
    GEOAPIFY_API_KEY: v.optional(v.string()),
    /** Clerk user IDs the demo reset gives their roles (S19a). */
    DEMO_JUDGE_OWNER_ID: v.optional(v.string()),
    DEMO_JUDGE_MEMBER_ID: v.optional(v.string()),
    DEMO_JUDGE_VIEWER_ID: v.optional(v.string()),
  },
});

/** The Assistant's threads, messages and streaming (one thread per Event). */
app.use(agent);
/** Presence dots, with the Event as the room. */
app.use(presence);

export default app;
