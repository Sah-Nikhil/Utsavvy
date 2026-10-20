---
id: 5
title: Which LLM and agent tooling should the Assistant run on?
labels: [wayfinder:research]
status: open
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
