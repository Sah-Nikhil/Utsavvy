import {
  APICallError,
  LoadAPIKeyError,
  NoSuchModelError,
  RetryError,
  StreamProviderError,
} from "ai";
import { env } from "../_generated/server";

/**
 * Model names (ADR 0003, IMPLEMENTATION_PLAN.md section 4.5). The default,
 * helper and fallback models are Convex environment variables, so the default
 * can switch without a deploy.
 */
export const MODELS = {
  default: "claude-sonnet-5-5",
  helper: "claude-haiku-5-5",
  fallback: "gemini-3.8-flash",
} as const;

/** The model the Assistant answers with: `DEFAULT_MODEL`, else `claude-sonnet-5-5`. */
export function defaultModel(): string {
  return env.DEFAULT_MODEL || MODELS.default;
}

/** The helper model for descriptions and extraction: `HELPER_MODEL`, else `claude-haiku-5-5`. */
export function helperModel(): string {
  return env.HELPER_MODEL ?? MODELS.helper;
}

/** The automatic fallback model: `FALLBACK_MODEL`, else `gemini-3.8-flash`. */
export function fallbackModel(): string {
  return readFallbackModel(env);
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

/** A model name such as `claude-sonnet-5-5` or `gemini-3.8-flash`. */
export type ModelId = string;

/** Which configured model a call starts from. */
export type ModelKind = "assistant" | "helper";

/**
 * The environment variables the fallback chain reads. Pass `env` from
 * `./_generated/server` in production; tests pass a plain object.
 */
export type ModelEnv = {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
  readonly DEFAULT_MODEL?: string | undefined;
  readonly HELPER_MODEL?: string | undefined;
  readonly FALLBACK_MODEL?: string | undefined;
};

function readFallbackModel(source: ModelEnv): ModelId {
  return source.FALLBACK_MODEL || MODELS.fallback;
}

/** Whether the app itself holds a key for this model's provider. */
function hasAppKey(model: ModelId, source: ModelEnv): boolean {
  if (isClaude(model)) return Boolean(source.ANTHROPIC_API_KEY);
  if (model.startsWith("gemini-"))
    return Boolean(source.GOOGLE_GENERATIVE_AI_API_KEY);
  return false;
}

/**
 * The models to try, in order, for one call (IMPLEMENTATION_PLAN.md section
 * 4.5, "Model failure"):
 *
 * 1. the Event key's model, if the Event has a key (ADR 0004); it runs on
 *    that key, so it is never skipped;
 * 2. `DEFAULT_MODEL` (`kind: "assistant"`) or `HELPER_MODEL` (`kind: "helper"`),
 *    Claude unless changed;
 * 3. `FALLBACK_MODEL`, `gemini-3.8-flash` unless changed.
 *
 * Steps 2 and 3 are skipped when the app has no key for their provider, and
 * each model appears once. With no Event key and neither `ANTHROPIC_API_KEY`
 * nor `GOOGLE_GENERATIVE_AI_API_KEY`, nothing can answer, so this throws.
 *
 * @example modelChain("assistant", env, eventKey?.model)
 */
export function modelChain(
  kind: ModelKind,
  source: ModelEnv,
  eventKeyModel?: ModelId,
): ModelId[] {
  const configured =
    kind === "assistant"
      ? source.DEFAULT_MODEL || MODELS.default
      : source.HELPER_MODEL || MODELS.helper;
  const chain: ModelId[] = [];
  if (eventKeyModel) chain.push(eventKeyModel);
  for (const model of [configured, readFallbackModel(source)]) {
    if (hasAppKey(model, source) && !chain.includes(model)) chain.push(model);
  }
  if (chain.length === 0) {
    throw new Error(
      "No model is configured: set ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY on the Convex deployment.",
    );
  }
  return chain;
}

/** HTTP statuses that mean "this provider can't answer right now", not "the request is wrong". */
function isFallbackStatus(status: number): boolean {
  return (
    status === 401 || // authentication
    status === 402 || // payment required
    status === 403 || // permission, often billing or region
    status === 404 || // missing model
    status === 408 || // timeout
    status === 429 || // rate limit or quota, after the SDK's retries
    status >= 500 // outage, including Anthropic's 529 overloaded
  );
}

/** A 400 that is really about money, such as Anthropic's "credit balance is too low". */
const BILLING_MESSAGE =
  /credit balance|billing|insufficient (?:credit|funds|quota)|purchase credits/i;

/**
 * Whether a failed model call should move on to the next model in the chain.
 *
 * True for authentication, credit or billing, rate-limit (once the AI SDK's
 * own retries are spent), timeout, overload, 5xx, network and missing-model
 * errors, and for a missing API key. False for bad requests, schema or
 * tool-call validation errors, refusals, a stop by the Member (`AbortError`)
 * and anything unrecognised, because another model would fail the same way
 * or the Member asked to stop.
 *
 * Reads the AI SDK 7 error types: `APICallError` (status code, message and
 * response body), `StreamProviderError` (an error part in a stream),
 * `RetryError` (unwrapped to its last error), `LoadAPIKeyError` and
 * `NoSuchModelError`.
 */
export function isFallbackError(error: unknown): boolean {
  if (RetryError.isInstance(error)) {
    return error.reason !== "abort" && isFallbackError(error.lastError);
  }
  if (LoadAPIKeyError.isInstance(error) || NoSuchModelError.isInstance(error))
    return true;
  if (APICallError.isInstance(error) || StreamProviderError.isInstance(error)) {
    const status = error.statusCode;
    if (status === undefined) return error.isRetryable; // network failure
    if (isFallbackStatus(status)) return true;
    const body = APICallError.isInstance(error)
      ? (error.responseBody ?? "")
      : "";
    return status === 400 && BILLING_MESSAGE.test(`${error.message} ${body}`);
  }
  return error instanceof Error && error.name === "TimeoutError";
}

/**
 * Runs `call` with each model in `chain` until one succeeds, moving on only
 * when {@link isFallbackError} says the failure is the provider's, not the
 * request's. Returns the result and the model that produced it, so the Chat
 * can show which model answered. Rethrows the last error when every model
 * fails, and any non-fallback error at once.
 *
 * For one-shot calls (`generateText`, the helper jobs, S3's knowledge call).
 * A streamed reply (S5) uses {@link modelChain} and {@link isFallbackError}
 * itself and retries only while nothing has streamed yet.
 *
 * @example
 * const { result, model } = await withModelFallback(
 *   modelChain("helper", env),
 *   (model) => generateText({ model: languageModel(model), prompt }),
 * );
 */
export async function withModelFallback<T>(
  chain: readonly ModelId[],
  call: (model: ModelId) => Promise<T>,
): Promise<{ result: T; model: ModelId }> {
  if (chain.length === 0)
    throw new Error("withModelFallback: the model chain is empty.");
  let lastError: unknown;
  for (const model of chain) {
    try {
      return { result: await call(model), model };
    } catch (error) {
      if (!isFallbackError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Whether a Claude call can be made at all. S3's Estimate research checks it
 * and goes straight to the reference table when Claude isn't configured,
 * instead of waiting out its 20-second limit.
 */
export function claudeReachable(source: ModelEnv): boolean {
  return Boolean(source.ANTHROPIC_API_KEY);
}
