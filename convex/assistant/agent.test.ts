import { mockModel } from "@convex-dev/agent";
import { APICallError, simulateReadableStream, streamText } from "ai";
import { describe, expect, it } from "vitest";
import {
  assistantChain,
  chainedModel,
  labelled,
  STUB_FALLBACK_MODEL,
  STUB_MODEL,
  type ChainLink,
} from "./agent";

// The automatic fallback for a streamed reply (ADR 0003, section 4.5 "Model
// failure"): a model that fails before its first token hands the reply to the
// next one; after a token there is no retry; a Member's Stop never falls back.

type Model = ChainLink["model"];
type CallOptions = Parameters<Model["doStream"]>[0];
type Part =
  Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<
    infer P
  >
    ? P
    : never;

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function apiError(statusCode: number, message: string) {
  return new APICallError({
    message,
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode >= 500,
  });
}

function textParts(text: string): Part[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    ...text.split(" ").map((word, i): Part => ({
      type: "text-delta",
      id: "t",
      delta: (i ? " " : "") + word,
    })),
    { type: "text-end", id: "t" },
    {
      type: "finish",
      usage,
      finishReason: { unified: "stop", raw: "stop" },
    },
  ];
}

/** A model whose stream is exactly `parts`; records the options it was called with. */
function streaming(id: string, parts: Part[], calls: CallOptions[] = []) {
  const model = mockModel({
    modelId: id,
    doGenerate: () => Promise.reject(new Error("not used")),
    doStream: async (options) => {
      calls.push(options);
      return { stream: simulateReadableStream({ chunks: parts }) };
    },
  }) as Model;
  return { id, model };
}

function rejecting(id: string, error: unknown) {
  const model = mockModel({
    modelId: id,
    doGenerate: () => Promise.reject(error),
    doStream: () => Promise.reject(error),
  }) as Model;
  return { id, model };
}

async function reply(links: ChainLink[], abortSignal?: AbortSignal) {
  const answered: string[] = [];
  const result = streamText({
    model: chainedModel(links, (id) => {
      answered.push(id);
    }),
    prompt: "Plan the sangeet",
    maxRetries: 0,
    abortSignal,
  });
  let text = "";
  let error: unknown = null;
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") text += part.text;
    if (part.type === "error") error = part.error;
  }
  return { text, error, answered };
}

describe("chainedModel", () => {
  it("answers on the first model when it works", async () => {
    const { text, answered } = await reply([
      streaming("claude-sonnet-5-5", textParts("Namaste Rohan")),
      streaming("gemini-3.8-flash", textParts("Hello from Gemini")),
    ]);
    expect(text).toBe("Namaste Rohan");
    expect(answered).toEqual(["claude-sonnet-5-5"]);
  });

  it("moves to Gemini when Claude has no credit, before any token", async () => {
    const { text, answered } = await reply([
      rejecting(
        "claude-sonnet-5-5",
        apiError(
          400,
          "Your credit balance is too low to access the Anthropic API.",
        ),
      ),
      streaming("gemini-3.8-flash", textParts("Hello from Gemini")),
    ]);
    expect(text).toBe("Hello from Gemini");
    expect(answered).toEqual(["gemini-3.8-flash"]);
  });

  it("moves on when the stream's first part is an overloaded error", async () => {
    const { text, answered } = await reply([
      streaming("claude-sonnet-5-5", [
        { type: "stream-start", warnings: [] },
        {
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        },
      ]),
      streaming("gemini-3.8-flash", textParts("Hello from Gemini")),
    ]);
    expect(text).toBe("Hello from Gemini");
    expect(answered).toEqual(["gemini-3.8-flash"]);
  });

  it("doesn't retry once a token has streamed", async () => {
    const gemini: CallOptions[] = [];
    const { text, error, answered } = await reply([
      streaming("claude-sonnet-5-5", [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Namaste" },
        {
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        },
      ]),
      streaming("gemini-3.8-flash", textParts("Hello from Gemini"), gemini),
    ]);
    expect(text).toBe("Namaste");
    expect(error).not.toBeNull();
    expect(answered).toEqual(["claude-sonnet-5-5"]);
    expect(gemini).toHaveLength(0);
  });

  it("doesn't fall back on a bad request", async () => {
    const gemini: CallOptions[] = [];
    const { error } = await reply([
      rejecting(
        "claude-sonnet-5-5",
        apiError(400, "tools.0.input_schema: JSON schema is invalid"),
      ),
      streaming("gemini-3.8-flash", textParts("Hello"), gemini),
    ]);
    expect(error).toBeInstanceOf(APICallError);
    expect(gemini).toHaveLength(0);
  });

  it("never falls back when the Member stops the reply", async () => {
    const gemini: CallOptions[] = [];
    const abort = new AbortController();
    abort.abort(new DOMException("Stopped by a Member", "AbortError"));
    const { text } = await reply(
      [
        rejecting(
          "claude-sonnet-5-5",
          new DOMException("Stopped by a Member", "AbortError"),
        ),
        streaming("gemini-3.8-flash", textParts("Hello"), gemini),
      ],
      abort.signal,
    );
    expect(text).toBe("");
    expect(gemini).toHaveLength(0);
  });

  it("gives Gemini no Anthropic web search tool", async () => {
    const gemini: CallOptions[] = [];
    const result = streamText({
      model: chainedModel(
        [
          rejecting("claude-sonnet-5-5", apiError(529, "Overloaded")),
          streaming("gemini-3.8-flash", textParts("Hello"), gemini),
        ],
        () => {},
      ),
      prompt: "Per-plate prices in Pune?",
      maxRetries: 0,
      tools: {
        webSearch: {
          type: "provider",
          id: "anthropic.web_search_20250305",
          args: { maxUses: 3 },
          inputSchema: { jsonSchema: {} } as never,
        } as never,
      },
    });
    await result.consumeStream();
    expect(gemini[0]?.tools ?? []).toEqual([]);
  });
});

describe("assistantChain", () => {
  it("uses the stub when DEFAULT_MODEL names it, with no key at all", () => {
    expect(
      assistantChain({ DEFAULT_MODEL: STUB_MODEL }).map((link) => link.id),
    ).toEqual([STUB_MODEL]);
  });

  it("can stage a failing Claude and an answering Gemini for the browser check", async () => {
    const links = assistantChain({ DEFAULT_MODEL: STUB_FALLBACK_MODEL });
    expect(links.map((link) => link.id)).toEqual([
      "stub-claude",
      "stub-gemini",
    ]);
  });

  it("is Claude then Gemini with both keys", () => {
    expect(
      assistantChain({
        ANTHROPIC_API_KEY: "a",
        GOOGLE_GENERATIVE_AI_API_KEY: "g",
      }).map((link) => link.id),
    ).toEqual(["claude-sonnet-5-5", "gemini-3.8-flash"]);
  });
});

describe("labelled", () => {
  const rohan = {
    messageId: "m1",
    authorName: "Rohan",
    dontReply: false,
    pointing: [],
  };

  it("names the author", () => {
    expect(labelled("Plan the sangeet", rohan)).toBe(
      "[Rohan]: Plan the sangeet",
    );
  });

  it("marks a Don't-reply message as background", () => {
    expect(
      labelled("Mom says absolutely no DJ", { ...rohan, dontReply: true }),
    ).toBe("[Rohan, Don't reply]: Mom says absolutely no DJ");
  });
});
