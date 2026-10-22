import {
  APICallError,
  LoadAPIKeyError,
  RetryError,
  TypeValidationError,
} from "ai";
import { describe, expect, it } from "vitest";
import {
  claudeReachable,
  isFallbackError,
  modelChain,
  withModelFallback,
  type ModelEnv,
} from "./models";

const bothKeys: ModelEnv = {
  ANTHROPIC_API_KEY: "test-anthropic",
  GOOGLE_GENERATIVE_AI_API_KEY: "test-google",
};

function apiError(
  statusCode: number | undefined,
  message: string,
  isRetryable = false,
) {
  return new APICallError({
    message,
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify({ type: "error", error: { message } }),
    isRetryable,
  });
}

const unauthorized = apiError(401, "invalid x-api-key");
const noCredit = apiError(
  400,
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
);
const overloaded = apiError(529, "Overloaded", true);
const schemaError = apiError(
  400,
  "tools.0.input_schema: JSON schema is invalid",
);

describe("modelChain", () => {
  it("starts at gemini-3.8-flash when there is no ANTHROPIC_API_KEY", () => {
    expect(
      modelChain("assistant", { GOOGLE_GENERATIVE_AI_API_KEY: "g" }),
    ).toEqual(["gemini-3.8-flash"]);
    expect(modelChain("helper", { GOOGLE_GENERATIVE_AI_API_KEY: "g" })).toEqual(
      ["gemini-3.8-flash"],
    );
  });

  it("puts Claude first and Gemini after it when both keys are set", () => {
    expect(modelChain("assistant", bothKeys)).toEqual([
      "claude-sonnet-5-5",
      "gemini-3.8-flash",
    ]);
    expect(modelChain("helper", bothKeys)).toEqual([
      "claude-haiku-5-5",
      "gemini-3.8-flash",
    ]);
  });

  it("leads with the Event key's model, then the default model, then the fallback", () => {
    expect(modelChain("assistant", bothKeys, "claude-haiku-5-5")).toEqual([
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
      "gemini-3.8-flash",
    ]);
  });

  it("keeps the Event key's model even when the app has no key for its provider", () => {
    expect(
      modelChain("assistant", { ANTHROPIC_API_KEY: "a" }, "gemini-3.8-flash"),
    ).toEqual(["gemini-3.8-flash", "claude-sonnet-5-5"]);
  });

  it("follows DEFAULT_MODEL, HELPER_MODEL and FALLBACK_MODEL and lists each model once", () => {
    const env: ModelEnv = { ...bothKeys, DEFAULT_MODEL: "gemini-3.8-flash" };
    expect(modelChain("assistant", env)).toEqual(["gemini-3.8-flash"]);
    expect(
      modelChain("helper", {
        ...bothKeys,
        HELPER_MODEL: "claude-sonnet-5-5",
        FALLBACK_MODEL: "",
      }),
    ).toEqual(["claude-sonnet-5-5", "gemini-3.8-flash"]);
  });

  it("skips Gemini when only the Anthropic key is set", () => {
    expect(modelChain("assistant", { ANTHROPIC_API_KEY: "a" })).toEqual([
      "claude-sonnet-5-5",
    ]);
  });

  it("throws a configuration error when neither key is set", () => {
    expect(() => modelChain("assistant", {})).toThrow(
      /ANTHROPIC_API_KEY.*GOOGLE_GENERATIVE_AI_API_KEY/,
    );
  });
});

describe("isFallbackError", () => {
  it("falls back on a 401, a credit-balance 400 and a 529 from Claude", () => {
    expect(isFallbackError(unauthorized)).toBe(true);
    expect(isFallbackError(noCredit)).toBe(true);
    expect(isFallbackError(overloaded)).toBe(true);
  });

  it("falls back on 403, missing model, timeout, 5xx and network errors", () => {
    expect(isFallbackError(apiError(403, "permission denied"))).toBe(true);
    expect(
      isFallbackError(apiError(404, "model: claude-sonnet-5-5 not found")),
    ).toBe(true);
    expect(isFallbackError(apiError(408, "Request timeout", true))).toBe(true);
    expect(isFallbackError(apiError(500, "Internal server error", true))).toBe(
      true,
    );
    expect(isFallbackError(apiError(503, "Service unavailable", true))).toBe(
      true,
    );
    expect(
      isFallbackError(
        apiError(undefined, "Cannot connect to API: ECONNRESET", true),
      ),
    ).toBe(true);
    expect(isFallbackError(new DOMException("timed out", "TimeoutError"))).toBe(
      true,
    );
  });

  it("falls back on a missing API key", () => {
    expect(
      isFallbackError(
        new LoadAPIKeyError({ message: "Anthropic API key is missing." }),
      ),
    ).toBe(true);
  });

  it("falls back on a rate limit once the SDK's own retries are spent", () => {
    const rateLimited = apiError(429, "rate_limit_error", true);
    const retried = new RetryError({
      message: "Failed after 3 attempts.",
      reason: "maxRetriesExceeded",
      errors: [rateLimited, rateLimited, rateLimited],
    });
    expect(isFallbackError(retried)).toBe(true);
  });

  it("doesn't fall back on a 400 schema error, a type validation error or an abort", () => {
    expect(isFallbackError(schemaError)).toBe(false);
    expect(isFallbackError(apiError(413, "request_too_large"))).toBe(false);
    expect(
      isFallbackError(
        new TypeValidationError({ value: {}, cause: new Error("bad") }),
      ),
    ).toBe(false);
    expect(isFallbackError(new DOMException("stopped", "AbortError"))).toBe(
      false,
    );
    expect(
      isFallbackError(
        new RetryError({
          message: "aborted",
          reason: "abort",
          errors: [overloaded],
        }),
      ),
    ).toBe(false);
    expect(isFallbackError(new Error("refused"))).toBe(false);
  });
});

describe("withModelFallback", () => {
  const chain = ["claude-sonnet-5-5", "gemini-3.8-flash"];

  it.each([
    ["a 401", unauthorized],
    ["a credit-balance 400", noCredit],
    ["a 529", overloaded],
  ])(
    "moves the call to Gemini after %s from Claude",
    async (_name, claudeError) => {
      const tried: string[] = [];
      const outcome = await withModelFallback(chain, async (model) => {
        tried.push(model);
        if (model === "claude-sonnet-5-5") throw claudeError;
        return `answer from ${model}`;
      });
      expect(outcome).toEqual({
        result: "answer from gemini-3.8-flash",
        model: "gemini-3.8-flash",
      });
      expect(tried).toEqual(chain);
    },
  );

  it("returns the first model's answer without trying the rest", async () => {
    const tried: string[] = [];
    const outcome = await withModelFallback(chain, async (model) => {
      tried.push(model);
      return 42;
    });
    expect(outcome).toEqual({ result: 42, model: "claude-sonnet-5-5" });
    expect(tried).toEqual(["claude-sonnet-5-5"]);
  });

  it("doesn't fall back on a 400 schema error", async () => {
    const tried: string[] = [];
    await expect(
      withModelFallback(chain, async (model) => {
        tried.push(model);
        throw schemaError;
      }),
    ).rejects.toBe(schemaError);
    expect(tried).toEqual(["claude-sonnet-5-5"]);
  });

  it("rethrows the last error when every provider fails", async () => {
    const geminiDown = apiError(503, "The model is overloaded.", true);
    await expect(
      withModelFallback(chain, async (model) => {
        throw model === "gemini-3.8-flash" ? geminiDown : overloaded;
      }),
    ).rejects.toBe(geminiDown);
  });

  it("walks an Event key's model, then the default, then the fallback", async () => {
    const tried: string[] = [];
    const eventKeyChain = modelChain("assistant", bothKeys, "claude-haiku-5-5");
    const outcome = await withModelFallback(eventKeyChain, async (model) => {
      tried.push(model);
      if (model === "claude-haiku-5-5") throw unauthorized;
      if (model === "claude-sonnet-5-5") throw noCredit;
      return "ok";
    });
    expect(tried).toEqual([
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
      "gemini-3.8-flash",
    ]);
    expect(outcome.model).toBe("gemini-3.8-flash");
  });

  it("refuses an empty chain", async () => {
    await expect(withModelFallback([], async () => "never")).rejects.toThrow(
      /empty/,
    );
  });
});

describe("claudeReachable", () => {
  it("is true only when the Anthropic key is set", () => {
    expect(claudeReachable(bothKeys)).toBe(true);
    expect(claudeReachable({ GOOGLE_GENERATIVE_AI_API_KEY: "g" })).toBe(false);
    expect(claudeReachable({ ANTHROPIC_API_KEY: "" })).toBe(false);
  });
});
