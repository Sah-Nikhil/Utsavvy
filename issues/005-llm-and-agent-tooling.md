---
id: 5
title: Which LLM and agent tooling should the Assistant run on?
labels: [wayfinder:research]
status: closed
assignee: Sah-Nikhil
parent: 1
blocked_by: []
---

## Question

Which model or models and which agent framework should the Assistant run on, given that it talks in a shared Chat and changes a shared Canvas through tools?

Cover:

- Current Gemini, Claude and OpenAI models as of October 2026: tool-calling reliability, structured output against a JSON schema, streaming, latency, cost, free usage (for example the Gemini API free tier through Google AI Studio), image understanding, image generation, and grounding (Google Search, Google Maps).
- Agent frameworks: Vercel AI SDK, Google's Agent Development Kit, the Convex Agent component, LangGraph and similar. Which fits an agent that many Members talk to in one Chat, whose reply streams to all of them, and which edits Canvas items through tools.
- Prompt injection: Members' messages, shared posts and fetched web pages can carry instructions. Practical mitigations for a small build.
- A rough cost estimate for development plus a judged demo.

End with a recommendation.

Findings: branch `research/llm-agent`, file `research/llm-agent.md`.

## Comments

### 2026-10-21 Sah-Nikhil (resolution)

Findings: branch `research/llm-agent` (commit `05e7a30`), file `research/llm-agent.md`.

- **Recommended model: `gemini-3.8-flash`** ($0.75 / $3.75 per 1M tokens, introductory until 2026-12-31) for the Assistant: image understanding, tool calling, structured output, streaming and optional Google Search / Google Maps grounding. `gemini-3.5-flash-lite` only for narrow extraction or summaries, after a quality check. Claude Sonnet 5.5 and `gpt-6.1-sol` cost about 2.7x more; Haiku 5.5 and `gpt-6-luna` are cheaper but untested on this workload.
- **Free tier caveats**: the Gemini API free tier covers text and image input, but **not** Search or Maps grounding and not image generation (`gemini-nano-banana-2.1` is paid only, about $0.034 per 1K image). Free-tier rate limits are per project and only visible in AI Studio, so check them before relying on them. Paid grounding includes 5,000 queries a month, then $14 per 1,000.
- **Framework: Vercel AI SDK 7** (needs Node 22+ and ESM; confirm with bun). If Convex is chosen, the **Convex Agent component** wraps it with persisted threads and a stream every Member subscribes to (`useUIMessages`), unlike `useChat`, which only updates the sender's tab. Google ADK (TypeScript) and LangGraph add orchestration this product doesn't need.
- **Shared Chat contract**: one Assistant run at a time per Event (a second Member's question queues); every Canvas write goes through server-checked, idempotent mutations with item versions; tool results return item IDs so the Assistant can point back at them. First plan is generated against an explicit JSON schema and applied through the same mutations.
- **Prompt injection**: treat shared posts, fetched pages, image text and Chat history as data with source and author; keep a small allowlist of tools; require a Member's confirmation for deletions, budget total changes and large shifts; never expose sending messages, payments or arbitrary URL fetching as tools.
- **Cost**: about $25 for 2,000 Assistant turns plus 200 generated images on `gemini-3.8-flash`, before hosting. Keep seeded Vendors and Inspirations ready in case quotas run out during the demo, and run 20 to 30 scripted test cases before switching models.

Input to [Which stack do we build on?](./010-stack-choice.md) and [How does the Assistant behave when several Members share a Chat and Canvas?](./007-assistant-behavior-in-shared-event.md).
