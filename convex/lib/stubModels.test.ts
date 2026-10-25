import { generateText, Output, streamText } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  claudeReachable,
  clearStubObjects,
  isStubSetting,
  languageModel,
  modelChain,
  registerStubObject,
  setStubChunkDelayMs,
  STUB_FALLBACK_MODEL,
  STUB_MODEL,
  STUB_REPLY,
  withModelFallback,
  type ModelEnv,
} from "./models";

// L8 (#87): the stub model lives with the model chain, so every model call on
// a preview (the Chat, helper jobs, structured output, S3's knowledge call)
// answers from it and no preview ever calls a real model.

const stub: ModelEnv = { DEFAULT_MODEL: STUB_MODEL };
const stubWithKeys: ModelEnv = {
  DEFAULT_MODEL: STUB_MODEL,
  ANTHROPIC_API_KEY: "test-anthropic",
  GOOGLE_GENERATIVE_AI_API_KEY: "test-google",
};

afterEach(() => {
  clearStubObjects();
  setStubChunkDelayMs(undefined);
});

describe("isStubSetting", () => {
  it("is on only when DEFAULT_MODEL starts with stub-utsavvy", () => {
    expect(isStubSetting(stub)).toBe(true);
    expect(isStubSetting({ DEFAULT_MODEL: STUB_FALLBACK_MODEL })).toBe(true);
    expect(isStubSetting({})).toBe(false);
    expect(isStubSetting({ DEFAULT_MODEL: "claude-sonnet-5-5" })).toBe(false);
    expect(isStubSetting({ DEFAULT_MODEL: "my-stub-utsavvy" })).toBe(false);
    expect(isStubSetting({ HELPER_MODEL: STUB_MODEL })).toBe(false);
  });
});

describe("modelChain on the stub", () => {
  it("yields the stub for every kind of call, with no real key", () => {
    expect(modelChain("assistant", stub)).toEqual([STUB_MODEL]);
    expect(modelChain("helper", stub)).toEqual([STUB_MODEL]);
  });

  it("yields the stub even when real keys and an Event key exist", () => {
    expect(modelChain("assistant", stubWithKeys, "claude-haiku-5-5")).toEqual([
      STUB_MODEL,
    ]);
  });

  it("stages a failing Claude and an answering Gemini with stub-utsavvy-fallback", () => {
    const fallback = { DEFAULT_MODEL: STUB_FALLBACK_MODEL };
    expect(modelChain("assistant", fallback)).toEqual([
      "stub-claude",
      "stub-gemini",
    ]);
    expect(modelChain("helper", fallback)).toEqual([
      "stub-claude",
      "stub-gemini",
    ]);
  });

  it("keeps Estimate research off: Claude is never reachable on the stub", () => {
    expect(claudeReachable(stubWithKeys)).toBe(false);
  });
});

describe("one-shot calls on the stub", () => {
  it("answers a helper job's text call with the stub reply", async () => {
    const { result, model } = await withModelFallback(
      modelChain("helper", stub),
      (id) =>
        generateText({ model: languageModel(id, stub), prompt: "Summarise" }),
    );
    expect(model).toBe(STUB_MODEL);
    expect(result.text).toBe(STUB_REPLY);
  });

  it("falls back from the failing stub Claude to the stub Gemini", async () => {
    const fallback = { DEFAULT_MODEL: STUB_FALLBACK_MODEL };
    const { model } = await withModelFallback(
      modelChain("helper", fallback),
      (id) =>
        generateText({
          model: languageModel(id, fallback),
          prompt: "Summarise",
          maxRetries: 0,
        }),
    );
    expect(model).toBe("stub-gemini");
  });

  it("streams the stub reply", async () => {
    setStubChunkDelayMs(0);
    const result = streamText({
      model: languageModel(STUB_MODEL, stub),
      prompt: "Plan the sangeet",
    });
    expect(await result.text).toBe(STUB_REPLY);
  });
});

describe("structured output on the stub", () => {
  const briefSchema = z.object({
    eventType: z.enum(["wedding", "birthday", "community"]).nullable(),
    city: z.string().nullable(),
    guests: z.number().nullable(),
    functions: z.array(z.string()),
    hasDecorPreference: z.boolean(),
    budget: z.object({ total: z.number().nullable() }),
  });

  it("returns a schema-valid empty object when nothing is registered", async () => {
    const result = await generateText({
      model: languageModel(STUB_MODEL, stub),
      prompt: "We are planning a wedding in Jaipur",
      output: Output.object({ schema: briefSchema, name: "BriefExtraction" }),
    });
    expect(result.output).toEqual({
      eventType: null,
      city: null,
      guests: null,
      functions: [],
      hasDecorPreference: false,
      budget: { total: null },
    });
  });

  it("returns the canned object registered for the output's name", async () => {
    const jaipur = {
      eventType: "wedding" as const,
      city: "Jaipur",
      guests: 300,
      functions: ["mehendi", "sangeet", "wedding"],
      hasDecorPreference: true,
      budget: { total: 2_500_000 },
    };
    registerStubObject({ name: "BriefExtraction", object: jaipur });
    const result = await generateText({
      model: languageModel(STUB_MODEL, stub),
      prompt: "We are planning a wedding in Jaipur",
      output: Output.object({ schema: briefSchema, name: "BriefExtraction" }),
    });
    expect(result.output).toEqual(jaipur);
  });

  it("can pick a canned object by a phrase in the prompt", async () => {
    const pune = {
      eventType: "community" as const,
      city: "Pune",
      guests: null,
      functions: ["daily aarti"],
      hasDecorPreference: false,
      budget: { total: 240_000 },
    };
    registerStubObject({ promptIncludes: "Ganesh utsav", object: pune });
    const result = await generateText({
      model: languageModel(STUB_MODEL, stub),
      prompt: "Our society's Ganesh utsav in Pune, 240 households",
      output: Output.object({ schema: briefSchema }),
    });
    expect(result.output).toEqual(pune);
  });

  it("streams structured output too", async () => {
    const result = streamText({
      model: languageModel(STUB_MODEL, stub),
      prompt: "We are planning a wedding in Jaipur",
      output: Output.object({ schema: briefSchema }),
    });
    expect(await result.output).toMatchObject({ functions: [] });
  });
});
