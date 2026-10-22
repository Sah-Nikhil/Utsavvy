import { env } from "../_generated/server";

/**
 * Model names (ADR 0003, IMPLEMENTATION_PLAN.md section 4.5). The default and
 * helper models are Convex environment variables, so the default can switch to
 * the fallback without a deploy.
 */
export const MODELS = {
  default: "claude-sonnet-5-5",
  helper: "claude-haiku-5-5",
  fallback: "gemini-3.8-flash",
} as const;

/** The model the Assistant answers with: `DEFAULT_MODEL`, else `claude-sonnet-5-5`. */
export function defaultModel(): string {
  return env.DEFAULT_MODEL ?? MODELS.default;
}

/** The helper model for descriptions and extraction: `HELPER_MODEL`, else `claude-haiku-5-5`. */
export function helperModel(): string {
  return env.HELPER_MODEL ?? MODELS.helper;
}

/** Chat web search and Estimate research run only when the model is Claude. */
export function isClaude(model: string): boolean {
  return model.startsWith("claude-");
}

/** Event key models per provider, fixed (ADR 0004; X3a fills its own list). */
export const EVENT_KEY_MODELS = {
  anthropic: ["claude-sonnet-5-5", "claude-haiku-5-5"],
  google: ["gemini-3.8-flash"],
  openai: [],
} as const satisfies Record<string, readonly string[]>;

/** Image models, only with a capable Event key (X3b). */
export const IMAGE_MODELS = [
  "gemini-nano-banana-2.1",
  "gpt-image-2.5-flare",
] as const;
