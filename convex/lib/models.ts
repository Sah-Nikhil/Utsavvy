import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  APICallError,
  LoadAPIKeyError,
  NoSuchModelError,
  RetryError,
  simulateReadableStream,
  StreamProviderError,
  type LanguageModel,
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
  return env.HELPER_MODEL || MODELS.helper;
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
 * On the stub (`DEFAULT_MODEL` starting with `stub-utsavvy`, see
 * {@link isStubSetting}) the chain is the stub alone for every kind of call,
 * with or without keys, so a preview never calls a real model.
 *
 * @example modelChain("assistant", env, eventKey?.model)
 */
export function modelChain(
  kind: ModelKind,
  source: ModelEnv,
  eventKeyModel?: ModelId,
): ModelId[] {
  if (isStubSetting(source)) return stubChain(source);
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
 *   (model) => generateText({ model: languageModel(model, env), prompt }),
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
  // Never on the stub: previews don't spend web searches.
  return Boolean(source.ANTHROPIC_API_KEY) && !isStubSetting(source);
}

// ---------------------------------------------------------------------------
// The stub models (#87, L8): previews, e2e and tests, with no network and no
// credits. Every model call that resolves its models through `modelChain` and
// `languageModel` honours them: the Chat, helper jobs, structured output and
// S3's knowledge call. Estimate research stays off (`claudeReachable`).

/** An AI SDK 7 language model object (derived so we don't import @ai-sdk/provider). */
export type ModelV4 = Extract<LanguageModel, { specificationVersion: "v4" }>;
/** The options one model call receives. */
export type ModelCallOptions = Parameters<ModelV4["doStream"]>[0];
type StreamPart =
  Awaited<ReturnType<ModelV4["doStream"]>>["stream"] extends ReadableStream<
    infer P
  >
    ? P
    : never;

/**
 * `DEFAULT_MODEL=stub-utsavvy`: every call answers from the stub. Convex
 * preview deployments have it as a project default (section 4.11), so no
 * preview ever calls a real model.
 */
export const STUB_MODEL = "stub-utsavvy";
/** `DEFAULT_MODEL=stub-utsavvy-fallback`: a stub "Claude" fails before its first token and a stub "Gemini" answers. */
export const STUB_FALLBACK_MODEL = "stub-utsavvy-fallback";
const STUB_PREFIX = "stub-utsavvy";

/** The stub's text reply. */
export const STUB_REPLY =
  "Namaste! This is Utsavvy's test model, so no real model was called and this reply costs nothing. In a real Event I would read your Canvas, plan with you and point at what I changed.";

/** Whether this deployment runs on the stub: `DEFAULT_MODEL` starts with `stub-utsavvy`. Never on otherwise. */
export function isStubSetting(source: ModelEnv): boolean {
  return (source.DEFAULT_MODEL ?? "").startsWith(STUB_PREFIX);
}

function stubChain(source: ModelEnv): ModelId[] {
  return source.DEFAULT_MODEL === STUB_FALLBACK_MODEL
    ? ["stub-claude", "stub-gemini"]
    : [STUB_MODEL];
}

/** The last calls the stub models received, newest last, for tests. */
export const stubCalls: ModelCallOptions[] = [];
let stubCallTotal = 0;

/** How many calls the stub models have received in all; it never caps. */
export function stubCallCount(): number {
  return stubCallTotal;
}

function recordStubCall(options: ModelCallOptions) {
  stubCallTotal += 1;
  stubCalls.push(options);
  if (stubCalls.length > 20) stubCalls.shift();
}

/**
 * The stub's pace: 250 ms a word, about 8 seconds for the whole reply, so a
 * browser test can reload mid-reply or press Stop. Unit tests make it short
 * with {@link setStubChunkDelayMs}.
 */
const STUB_CHUNK_DELAY_MS = 250;
let stubChunkDelay = STUB_CHUNK_DELAY_MS;

/** For tests: the stub's delay between words; `undefined` restores 250 ms. */
export function setStubChunkDelayMs(ms: number | undefined): void {
  stubChunkDelay = ms ?? STUB_CHUNK_DELAY_MS;
}

type StubObject = {
  /** Matches the structured output's name, e.g. `Output.object({ name: "BriefExtraction" })`. */
  name?: string;
  /** Matches when the prompt contains this phrase. */
  promptIncludes?: string;
  object: unknown;
};
const stubObjects: StubObject[] = [];

/**
 * Registers a canned structured-output object for the stub, picked by the
 * output's name or a phrase in the prompt; the newest match wins. Without a
 * match the stub returns the schema's emptiest valid object (nulls, empty
 * arrays and strings, false, 0, the first enum value). S11 registers its
 * `BriefExtraction` examples here so previews walk the first Brief.
 */
export function registerStubObject(entry: StubObject): void {
  stubObjects.unshift(entry);
}

/** For tests: forget every registered canned object. */
export function clearStubObjects(): void {
  stubObjects.length = 0;
}

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  default?: unknown;
};

/** The emptiest value that satisfies a JSON schema. */
function emptyFromSchema(schema: JsonSchema | undefined): unknown {
  if (schema === undefined) return null;
  if (schema.const !== undefined) return schema.const;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length)
    return schema.enum.includes(null) ? null : schema.enum[0];
  const options = schema.anyOf ?? schema.oneOf;
  if (options?.length) {
    const nullable = options.find((option) => option.type === "null");
    return nullable ? null : emptyFromSchema(options[0]);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("null")) return null;
  switch (types[0]) {
    case "object":
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, value]) => [
          key,
          emptyFromSchema(value),
        ]),
      );
    case "array":
      return [];
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

function promptText(options: ModelCallOptions): string {
  return options.prompt
    .flatMap((message) =>
      typeof message.content === "string"
        ? [message.content]
        : message.content.map((part) =>
            part.type === "text" ? part.text : "",
          ),
    )
    .join("\n");
}

/** The stub's answer to one call: canned JSON for structured output, else the reply. */
function stubText(options: ModelCallOptions): string {
  const format = options.responseFormat;
  if (format?.type !== "json") return STUB_REPLY;
  const prompt = promptText(options);
  const match = stubObjects.find(
    (entry) =>
      (entry.name !== undefined && entry.name === format.name) ||
      (entry.promptIncludes !== undefined &&
        prompt.includes(entry.promptIncludes)),
  );
  return JSON.stringify(
    match ? match.object : emptyFromSchema(format.schema as JsonSchema),
  );
}

const STUB_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const STUB_FINISH = { unified: "stop", raw: "stop" } as const;

function answeringStub(modelId: ModelId): ModelV4 {
  return {
    specificationVersion: "v4",
    provider: "stub",
    modelId,
    supportedUrls: {},
    async doGenerate(options) {
      recordStubCall(options);
      return {
        content: [{ type: "text", text: stubText(options) }],
        finishReason: STUB_FINISH,
        usage: STUB_USAGE,
        warnings: [],
      };
    },
    async doStream(options) {
      recordStubCall(options);
      const text = stubText(options);
      // The reply streams word by word; structured output arrives at once.
      const words =
        options.responseFormat?.type === "json"
          ? [text]
          : text.split(" ").map((word, i) => (i ? ` ${word}` : word));
      const parts: StreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "stub" },
        ...words.map((delta): StreamPart => ({
          type: "text-delta",
          id: "stub",
          delta,
        })),
        { type: "text-end", id: "stub" },
        { type: "finish", usage: STUB_USAGE, finishReason: STUB_FINISH },
      ];
      return {
        stream: simulateReadableStream({
          chunks: parts,
          chunkDelayInMs: stubChunkDelay,
        }),
      };
    },
  };
}

/** A stub that fails like Anthropic's 529 "Overloaded" before answering anything. */
function failingStub(modelId: ModelId): ModelV4 {
  const overloaded = () =>
    new APICallError({
      message: "Overloaded",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 529,
      isRetryable: true,
    });
  return {
    specificationVersion: "v4",
    provider: "stub",
    modelId,
    supportedUrls: {},
    doGenerate: async (options) => {
      recordStubCall(options);
      throw overloaded();
    },
    doStream: async (options) => {
      recordStubCall(options);
      throw overloaded();
    },
  };
}

/**
 * The AI SDK model for a name from {@link modelChain}: a stub, or Claude or
 * Gemini on the app's own key. `fetch` is for tests of the real providers.
 */
export function languageModel(
  id: ModelId,
  source: ModelEnv,
  options: { fetch?: typeof globalThis.fetch } = {},
): ModelV4 {
  if (id === "stub-claude") return failingStub(id);
  if (id === STUB_MODEL || id === "stub-gemini") return answeringStub(id);
  if (isClaude(id)) {
    return createAnthropic({
      apiKey: source.ANTHROPIC_API_KEY,
      fetch: options.fetch,
    })(id);
  }
  return createGoogleGenerativeAI({
    apiKey: source.GOOGLE_GENERATIVE_AI_API_KEY,
    fetch: options.fetch,
  })(id) as ModelV4;
}
